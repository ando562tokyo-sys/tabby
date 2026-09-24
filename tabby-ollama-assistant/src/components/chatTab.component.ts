import { Component, Injector } from '@angular/core'
import { AppService, BaseTabComponent, NotificationsService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

import { OllamaService, ChatMessage } from '../services/ollama.service'
import { MacrosService, waitForSessionIdle } from '../services/macros.service'
import { OllamaAssistantMacro } from '../config'

interface CommandBlock {
    commands: string[]
    status: 'idle' | 'running' | 'done'
    results: { command: string, output: string }[]
}

interface DisplayMessage {
    role: 'user' | 'assistant' | 'system'
    /** Text segments interleaved with command blocks: text[0], block[0], text[1], block[1], ... */
    textSegments: string[]
    blocks: CommandBlock[]
}

const COMMAND_BLOCK_RE = /```(?:bash|sh)?\n([\s\S]*?)```/g

function parseReply (text: string): DisplayMessage {
    const textSegments: string[] = []
    const blocks: CommandBlock[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null = null
    COMMAND_BLOCK_RE.lastIndex = 0
    while ((match = COMMAND_BLOCK_RE.exec(text))) {
        textSegments.push(text.slice(lastIndex, match.index).trim())
        const commands = match[1]
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
        blocks.push({ commands, status: 'idle', results: [] })
        lastIndex = COMMAND_BLOCK_RE.lastIndex
    }
    textSegments.push(text.slice(lastIndex).trim())
    return { role: 'assistant', textSegments, blocks }
}

@Component({
    selector: 'ollama-chat-tab',
    templateUrl: './chatTab.component.pug',
    styleUrls: ['./chatTab.component.scss'],
})
export class OllamaChatTabComponent extends BaseTabComponent {
    messages: DisplayMessage[] = []
    history: ChatMessage[] = []
    input = ''
    sending = false
    pendingReplyText: string | null = null
    targetTab: BaseTerminalTabComponent<any> | null = null

    showMacros = false
    editingMacro: OllamaAssistantMacro | null = null
    macroFormName = ''
    macroFormCommands = ''

    constructor (
        injector: Injector,
        private app: AppService,
        private ollama: OllamaService,
        public macros: MacrosService,
        private notifications: NotificationsService,
    ) {
        super(injector)
        this.setTitle('AI Assistant')
    }

    get targetTabs (): BaseTerminalTabComponent<any>[] {
        return this.app.tabs.filter(
            (t): t is BaseTerminalTabComponent<any> => t instanceof BaseTerminalTabComponent && !!(t as any).session,
        )
    }

    ngOnInit (): void {
        if (!this.targetTab) {
            this.targetTab = this.targetTabs[0] ?? null
        }
    }

    onInputKeydown (event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            this.send()
        }
    }

    async send (): Promise<void> {
        const text = this.input.trim()
        if (!text || this.sending) {
            return
        }
        this.input = ''
        this.messages.push({ role: 'user', textSegments: [text], blocks: [] })
        this.history.push({ role: 'user', content: text })

        this.sending = true
        this.pendingReplyText = ''
        try {
            const full = await this.ollama.chat(this.history, chunk => {
                this.pendingReplyText += chunk
            })
            this.history.push({ role: 'assistant', content: full })
            this.messages.push(parseReply(full))
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        } finally {
            this.pendingReplyText = null
            this.sending = false
        }
    }

    async runBlock (message: DisplayMessage, block: CommandBlock): Promise<void> {
        const tab = this.targetTab
        if (!tab?.session) {
            this.notifications.error('Select a target terminal tab first.')
            return
        }
        const session = tab.session
        block.status = 'running'
        block.results = []
        for (const command of block.commands) {
            let output = ''
            const sub = session.output$.subscribe(chunk => { output += chunk })
            session.feedFromTerminal(Buffer.from(command + '\n'))
            await waitForSessionIdle(session)
            sub.unsubscribe()
            block.results.push({ command, output })
        }
        block.status = 'done'
        this.shareResultsWithChat(block)
    }

    private shareResultsWithChat (block: CommandBlock): void {
        const summary = block.results
            .map(r => `$ ${r.command}\n${r.output.trim()}`)
            .join('\n\n')
        const text = `[Command results]\n${summary}`
        this.history.push({ role: 'user', content: text })
        this.messages.push({ role: 'system', textSegments: [`Ran ${block.results.length} command(s). You can ask about the results.`], blocks: [] })
    }

    // --- Macros ---------------------------------------------------------

    openMacroForm (macro: OllamaAssistantMacro | null): void {
        this.editingMacro = macro
        this.macroFormName = macro?.name ?? ''
        this.macroFormCommands = macro?.commands.join('\n') ?? ''
        this.showMacros = true
    }

    saveMacro (): void {
        const commands = this.macroFormCommands
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean)
        if (!this.macroFormName.trim() || commands.length === 0) {
            return
        }
        this.macros.save({
            id: this.editingMacro?.id,
            name: this.macroFormName.trim(),
            commands,
        })
        this.editingMacro = null
        this.macroFormName = ''
        this.macroFormCommands = ''
    }

    deleteMacro (macro: OllamaAssistantMacro): void {
        this.macros.delete(macro.id)
    }

    async runMacro (macro: OllamaAssistantMacro): Promise<void> {
        const tab = this.targetTab
        if (!tab?.session) {
            this.notifications.error('Select a target terminal tab first.')
            return
        }
        const session = tab.session
        const block: CommandBlock = { commands: macro.commands, status: 'running', results: [] }
        this.messages.push({ role: 'system', textSegments: [`Running macro "${macro.name}"...`], blocks: [block] })
        await this.macros.run(macro.commands, session, result => block.results.push(result))
        block.status = 'done'
        this.shareResultsWithChat(block)
    }
}
