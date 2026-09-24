import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { BaseSession } from 'tabby-terminal'

import { OllamaAssistantMacro } from '../config'

function generateId (): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Resolves once a session's output has gone quiet for `idleMs`, or after `maxMs`
 * regardless, as a safety net for commands that never produce a recognizable prompt.
 */
export function waitForSessionIdle (session: BaseSession, idleMs = 400, maxMs = 15000): Promise<void> {
    return new Promise(resolve => {
        let idleTimer: ReturnType<typeof setTimeout> | undefined = undefined
        let sub: { unsubscribe: () => void } | undefined = undefined
        let maxTimer: ReturnType<typeof setTimeout> | undefined = undefined

        const finish = (): void => {
            sub?.unsubscribe()
            clearTimeout(idleTimer)
            clearTimeout(maxTimer)
            resolve()
        }

        const resetIdleTimer = (): void => {
            clearTimeout(idleTimer)
            idleTimer = setTimeout(finish, idleMs)
        }

        sub = session.output$.subscribe(() => resetIdleTimer())
        maxTimer = setTimeout(finish, maxMs)
        resetIdleTimer()
    })
}

export interface MacroRunResult {
    command: string
    output: string
}

@Injectable({ providedIn: 'root' })
export class MacrosService {
    constructor (private config: ConfigService) { }

    list (): OllamaAssistantMacro[] {
        return this.config.store.ollamaAssistant.macros ?? []
    }

    save (macro: Partial<OllamaAssistantMacro> & { name: string, commands: string[] }): void {
        const macros: OllamaAssistantMacro[] = this.config.store.ollamaAssistant.macros ?? []
        const id = macro.id ?? generateId()
        const next = macros.filter(m => m.id !== id)
        next.push({ id, name: macro.name, commands: macro.commands })
        this.config.store.ollamaAssistant.macros = next
        this.config.save()
    }

    delete (id: string): void {
        const macros: OllamaAssistantMacro[] = this.config.store.ollamaAssistant.macros ?? []
        this.config.store.ollamaAssistant.macros = macros.filter(m => m.id !== id)
        this.config.save()
    }

    /**
     * Runs a macro's commands in order against an already-open terminal session,
     * typing each command as if the user had entered it and waiting for the
     * session's output to go quiet before sending the next one.
     */
    async run (
        commands: string[],
        session: BaseSession,
        onCommandOutput: (result: MacroRunResult) => void,
    ): Promise<void> {
        for (const command of commands) {
            let output = ''
            const sub = session.output$.subscribe(chunk => { output += chunk })
            session.feedFromTerminal(Buffer.from(command + '\n'))
            await waitForSessionIdle(session)
            sub.unsubscribe()
            onCommandOutput({ command, output })
        }
    }
}
