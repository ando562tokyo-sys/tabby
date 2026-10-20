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
 * The resolved value is `true` if it was cut off by `maxMs` rather than going idle
 * normally, meaning the command may still be running on the server.
 *
 * Known limitation: this is a timing heuristic, not a real "command finished" signal
 * (SSH has no generic way to know that without a shell-specific prompt/marker
 * protocol). A command whose own output pauses for longer than `idleMs` mid-run (e.g.
 * a slow progress indicator) can be mistaken for finished, and the next command in a
 * macro would then be sent while it's still running. `idleMs` is set generously to
 * make this rare for typical sysadmin commands, but it is not eliminated.
 */
export function waitForSessionIdle (session: BaseSession, idleMs = 800, maxMs = 20000): Promise<boolean> {
    return new Promise(resolve => {
        let idleTimer: ReturnType<typeof setTimeout> | undefined = undefined
        let sub: { unsubscribe: () => void } | undefined = undefined
        let maxTimer: ReturnType<typeof setTimeout> | undefined = undefined

        const finish = (timedOut: boolean): void => {
            sub?.unsubscribe()
            clearTimeout(idleTimer)
            clearTimeout(maxTimer)
            resolve(timedOut)
        }

        const resetIdleTimer = (): void => {
            clearTimeout(idleTimer)
            idleTimer = setTimeout(() => finish(false), idleMs)
        }

        sub = session.output$.subscribe(() => resetIdleTimer())
        maxTimer = setTimeout(() => finish(true), maxMs)
        resetIdleTimer()
    })
}

export interface MacroRunResult {
    command: string
    output: string
    timedOut: boolean
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
     * session's output to go quiet before sending the next one. A command that
     * errors out (e.g. the session was disconnected mid-run) is reported as a
     * result rather than thrown, and stops the remaining commands in this session
     * only - it never propagates to abort other sessions in runOnMultiple.
     */
    async run (
        commands: string[],
        session: BaseSession,
        onCommandOutput: (result: MacroRunResult) => void,
    ): Promise<void> {
        for (const command of commands) {
            let output = ''
            let sub: { unsubscribe: () => void } | undefined = undefined
            try {
                sub = session.output$.subscribe(chunk => { output += chunk })
                session.feedFromTerminal(Buffer.from(command + '\n'))
                const timedOut = await waitForSessionIdle(session)
                onCommandOutput({ command, output, timedOut })
            } catch (error) {
                onCommandOutput({
                    command,
                    output: `${output}\n[エラー] ${error.message ?? String(error)}`,
                    timedOut: false,
                })
                break
            } finally {
                sub?.unsubscribe()
            }
        }
    }

    /**
     * Runs the same command sequence against several sessions at once (one server's
     * commands don't wait on another's), for applying the same macro to a fleet of
     * servers in one click. Uses allSettled (on top of run()'s own per-command error
     * handling) so a problem on one server can never swallow the results already
     * captured from the others.
     */
    async runOnMultiple (
        commands: string[],
        sessions: BaseSession[],
        onCommandOutput: (session: BaseSession, result: MacroRunResult) => void,
    ): Promise<void> {
        await Promise.allSettled(sessions.map(session => this.run(commands, session, result => onCommandOutput(session, result))))
    }
}
