import { Component, ElementRef, Injector, Input, ViewChild } from '@angular/core'
import { AppService, BaseTabComponent, GetRecoveryTokenOptions, NotificationsService, Profile, RecoveryToken } from 'tabby-core'
import { BaseSession, BaseTerminalTabComponent } from 'tabby-terminal'
import { SSHTabComponent } from 'tabby-ssh'

import { OllamaService, ChatMessage } from '../services/ollama.service'
import { MacrosService, waitForSessionIdle } from '../services/macros.service'
import { ServerNotesService } from '../services/serverNotes.service'
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
    /** Shown on a 'system' detection notice to let the user send the text to the AI anyway. */
    showAskAiButton?: boolean
}

const COMMAND_BLOCK_RE = /```(?:bash|sh)?\n([\s\S]*?)```/g

/**
 * Splits text into alternating plain-text segments and ```bash/```sh command
 * blocks. Used both for the AI's own replies and for text the user pastes in
 * directly (e.g. instructions copied from a conversation with another AI),
 * so pasted commands get the same editable/dangerous-command/run UI.
 */
function parseMessage (text: string, role: DisplayMessage['role']): DisplayMessage {
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
    return { role, textSegments, blocks }
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
    multiServerMode = false
    multiServerTargets = new Set<BaseTerminalTabComponent<any>>()

    notesOpen = false
    noteDraft = ''

    @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLElement>

    constructor (
        injector: Injector,
        private app: AppService,
        private ollama: OllamaService,
        public macros: MacrosService,
        private notifications: NotificationsService,
        private serverNotes: ServerNotesService,
    ) {
        super(injector)
        this.setTitle('AIアシスタント')
    }

    get targetTabs (): BaseTerminalTabComponent<any>[] {
        return this.app.tabs.filter(
            (t): t is BaseTerminalTabComponent<any> => t instanceof BaseTerminalTabComponent && !!(t as any).session,
        )
    }

    /** Only SSH tabs carry a saved profile that notes can be attached to. */
    get targetProfile (): Profile | null {
        return this.targetTab instanceof SSHTabComponent ? this.targetTab.profile : null
    }

    toggleNotes (): void {
        this.notesOpen = !this.notesOpen
        if (this.notesOpen) {
            this.noteDraft = this.targetProfile ? this.serverNotes.get(this.targetProfile.id) : ''
        }
    }

    saveNoteDraft (): void {
        if (this.targetProfile) {
            this.serverNotes.set(this.targetProfile.id, this.noteDraft)
        }
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
        const parsedInput = parseMessage(text, 'user')
        this.messages.push(parsedInput)
        this.history.push({ role: 'user', content: text })
        this.scrollToBottom()

        if (parsedInput.blocks.length > 0) {
            // 他所でAIに相談して得たコマンド入りの指示をそのまま貼り付けた場合は、
            // Ollamaに聞き直さずそのままコマンド候補として表示する。
            this.messages.push({
                role: 'system',
                textSegments: ['コードブロックを検出したため、AIには送らずコマンドの候補として表示しました。'],
                blocks: [],
                showAskAiButton: true,
            })
            this.scrollToBottom()
            return
        }

        await this.askAi()
    }

    async askAiAnyway (notice: DisplayMessage): Promise<void> {
        notice.showAskAiButton = false
        await this.askAi()
    }

    private async askAi (): Promise<void> {
        this.sending = true
        this.pendingReplyText = ''
        try {
            const full = await this.ollama.chat(this.history, chunk => {
                this.pendingReplyText += chunk
                this.scrollToBottom()
            })
            this.history.push({ role: 'assistant', content: full })
            this.messages.push(parseMessage(full, 'assistant'))
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

    get canRunMacro (): boolean {
        return this.multiServerMode ? this.multiServerTargets.size > 0 : this.targetTabs.length > 0
    }

    isMultiServerTarget (tab: BaseTerminalTabComponent<any>): boolean {
        return this.multiServerTargets.has(tab)
    }

    toggleMultiServerTarget (tab: BaseTerminalTabComponent<any>): void {
        if (this.multiServerTargets.has(tab)) {
            this.multiServerTargets.delete(tab)
        } else {
            this.multiServerTargets.add(tab)
        }
    }

    async runMacro (macro: OllamaAssistantMacro): Promise<void> {
        if (this.multiServerMode) {
            await this.runMacroOnSelectedServers(macro)
            return
        }
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

    private async runMacroOnSelectedServers (macro: OllamaAssistantMacro): Promise<void> {
        const tabs = [...this.multiServerTargets].filter(t => this.targetTabs.includes(t) && !!t.session)
        if (tabs.length === 0) {
            this.notifications.error('マクロを実行するサーバーを選択してください。')
            return
        }

        const resultsByTab = new Map<BaseTerminalTabComponent<any>, { command: string, output: string, timedOut: boolean }[]>()
        const sessionToTab = new Map<BaseSession, BaseTerminalTabComponent<any>>()
        for (const tab of tabs) {
            resultsByTab.set(tab, [])
            sessionToTab.set(tab.session!, tab)
        }

        this.messages.push({
            role: 'system',
            textSegments: [`マクロ「${macro.name}」を${tabs.length}台のサーバーに同時実行しています...`],
            blocks: [],
        })
        this.scrollToBottom()

        await this.macros.runOnMultiple(macro.commands, tabs.map(t => t.session!), (session, result) => {
            const tab = sessionToTab.get(session)
            if (tab) {
                resultsByTab.get(tab)?.push(result)
            }
            this.scrollToBottom()
        })

        this.shareMultiServerResultsWithChat(resultsByTab)
    }

    private shareMultiServerResultsWithChat (
        resultsByTab: Map<BaseTerminalTabComponent<any>, { command: string, output: string, timedOut: boolean }[]>,
    ): void {
        const sections = [...resultsByTab.entries()].map(([tab, results]) => {
            const body = results
                .map(r => {
                    let line = `$ ${r.command}\n${r.output.trim()}`
                    if (r.timedOut) {
                        line += '\n(出力が一定時間止まらなかったため待機を打ち切りました。コマンドがまだ実行中の可能性があります)'
                    }
                    return line
                })
                .join('\n\n')
            return `[${tab.title}]\n${body}`
        }).join('\n\n')

        const text = `[複数サーバーでのコマンド実行結果]\n${sections}`
        this.history.push({ role: 'user', content: text })
        this.messages.push({
            role: 'system',
            textSegments: [`${resultsByTab.size}台のサーバーでマクロを実行しました。結果について質問できます。`],
            blocks: [],
        })
        this.scrollToBottom()
    }
}
