import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'

/**
 * Per-SSH-profile free-text notes (a lightweight runbook: "what this server is
 * for", "commands to remember", etc.), keyed by profile id and stored in our own
 * config rather than touching Tabby's own profile storage.
 */
@Injectable({ providedIn: 'root' })
export class ServerNotesService {
    constructor (private config: ConfigService) { }

    get (profileId: string): string {
        return this.config.store.ollamaAssistant.serverNotes[profileId] ?? ''
    }

    has (profileId: string): boolean {
        return !!this.get(profileId)
    }

    set (profileId: string, text: string): void {
        const current: Record<string, string> = this.config.store.ollamaAssistant.serverNotes ?? {}
        const notes = Object.fromEntries(Object.entries(current).filter(([key]) => key !== profileId))
        const trimmed = text.trim()
        if (trimmed) {
            notes[profileId] = trimmed
        }
        this.config.store.ollamaAssistant.serverNotes = notes
        this.config.save()
    }
}
