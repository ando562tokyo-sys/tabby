import { Component, ElementRef, Injector, Input, ViewChild } from '@angular/core'
import { AppService, BaseTabComponent, GetRecoveryTokenOptions, NotificationsService, RecoveryToken } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

import { OllamaService, ChatMessage } from '../services/ollama.service'
import { MacrosService, waitForSessionIdle } from '../services/macros.service'
import { OllamaAssistantMacro } from '../config'
import { isDangerousCommand } from '../dangerousCommands'
import { formatAssistantText } from '../textFormatting'

export interface CommandBlock {
    /** Editable text shown in the textarea; split into individual commands when run. */
    editedText: string
    phase: 'proposal' | 'running' | 'done' | 'dismissed'
    results: { command: string, output: string, timedOut: boolean }[]
}

export interface DisplayMessage {
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
        blocks.push({ editedText: match[1].trim(), phase: 'proposal', results: [] })
        lastIndex = COMMAND_BLOCK_RE.lastIndex
    }
    textSegments.push(text.slice(lastIndex).trim())
    return { role: 'assistant', textSegments, blocks }
}

function commandsOf (block: CommandBlock): string[] {
    return block.editedText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
}

@Component({
    selector: 'ollama-chat-tab',
    templateUrl: './chatTab.component.pug',
    styleUrls: ['./chatTab.component.scss'],
})
export class OllamaChatTabComponent extends BaseTabComponent {
    @Input() savedMessages: DisplayMessage[] = []
    @Input() savedHistory: ChatMessage[] = []

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

    @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLElement>

    constructor (
        injector: Injector,
        private app: AppService,
        private ollama: OllamaService,
        public macros: MacrosService,
        private notifications: NotificationsService,
    ) {
        super(injector)
        this.setTitle('AIアシスタント')
    }

    get targetTabs (): BaseTerminalTabComponent<any>[] {
        return this.app.tabs.filter(
            (t): t is BaseTerminalTabComponent<any> => t instanceof BaseTerminalTabComponent && !!(t as any).session,
        )
    }

    ngOnInit (): void {
        this.messages = this.savedMessages.length ? this.savedMessages : []
        this.history = this.savedHistory.length ? this.savedHistory : []
        if (!this.targetTab) {
            this.targetTab = this.targetTabs[0] ?? null
        }
    }

    async getRecoveryToken (options?: GetRecoveryTokenOptions): Promise<RecoveryToken | null> {
        const token = await super.getRecoveryToken(options)
        return {
            ...token,
            type: 'ollama-assistant:chat',
            messages: this.messages,
            history: this.history,
        }
    }

    formatAssistantText (text: string): string {
        return formatAssistantText(text)
    }

    dangerousCommandsOf (block: CommandBlock): string[] {
        return commandsOf(block).filter(c => isDangerousCommand(c))
    }

    onInputKeydown (event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            this.send()
        }
    }

    private scrollToBottom (): void {
        setTimeout(() => {
            const el = this.messagesContainer?.nativeElement
            if (el) {
                el.scrollTop = el.scrollHeight
            }
        })
    }

    async send (): Promise<void> {
        const text = this.input.trim()
        if (!text || this.sending) {
            return
        }
        this.input = ''
        this.messages.push({ role: 'user', textSegments: [text], blocks: [] })
        this.history.push({ role: 'user', content: text })
        this.scrollToBottom()

        this.sending = true
        this.pendingReplyText = ''
        try {
            const full = await this.ollama.chat(this.history, chunk => {
                this.pendingReplyText += chunk
                this.scrollToBottom()
            })
            this.history.push({ role: 'assistant', content: full })
            this.messages.push(parseReply(full))
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        } finally {
            this.pendingReplyText = null
            this.sending = false
            this.scrollToBottom()
        }
    }

    dismissBlock (block: CommandBlock): void {
        block.phase = 'dismissed'
    }

    /** Resolves the currently selected target tab, clearing it if it's been closed. */
    private resolveTargetSession () {
        if (this.targetTab && !this.targetTabs.includes(this.targetTab)) {
            this.targetTab = null
            this.notifications.error('選択していた対象タブは閉じられています。対象タブを選び直してください。')
            return null
        }
        if (!this.targetTab?.session) {
            this.notifications.error('コマンドを実行する対象タブを選択してください。')
            return null
        }
        return this.targetTab.session
    }

    async runBlock (block: CommandBlock): Promise<void> {
        const session = this.resolveTargetSession()
        if (!session) {
            return
        }
        const commands = commandsOf(block)
        block.phase = 'running'
        block.results = []
        for (const command of commands) {
            let output = ''
            const sub = session.output$.subscribe(chunk => { output += chunk })
            session.feedFromTerminal(Buffer.from(command + '\n'))
            const timedOut = await waitForSessionIdle(session)
            sub.unsubscribe()
            block.results.push({ command, output, timedOut })
            this.scrollToBottom()
        }
        block.phase = 'done'
        this.shareResultsWithChat(block.results)
    }

    private shareResultsWithChat (results: { command: string, output: string, timedOut: boolean }[]): void {
        const summary = results
            .map(r => {
                let line = `$ ${r.command}\n${r.output.trim()}`
                if (r.timedOut) {
                    line += '\n(出力が一定時間止まらなかったため待機を打ち切りました。コマンドがまだ実行中の可能性があります)'
                }
                return line
            })
            .join('\n\n')
        const text = `[コマンド実行結果]\n${summary}`
        this.history.push({ role: 'user', content: text })
        this.messages.push({
            role: 'system',
            textSegments: [`${results.length}件のコマンドを実行しました。結果について質問できます。`],
            blocks: [],
        })
        this.scrollToBottom()
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
        const session = this.resolveTargetSession()
        if (!session) {
            return
        }
        const results: { command: string, output: string, timedOut: boolean }[] = []
        this.messages.push({
            role: 'system',
            textSegments: [`マクロ「${macro.name}」を実行しています...`],
            blocks: [],
        })
        this.scrollToBottom()
        await this.macros.run(macro.commands, session, result => {
            results.push(result)
            this.scrollToBottom()
        })
        this.shareResultsWithChat(results)
    }
}
