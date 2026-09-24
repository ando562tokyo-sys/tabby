import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

function normalizeEndpoint (endpoint: string): string {
    return (endpoint || '').trim().replace(/\/+$/, '')
}

@Injectable({ providedIn: 'root' })
export class OllamaService {
    constructor (private config: ConfigService) { }

    private get settings () {
        return this.config.store.ollamaAssistant
    }

    async listModels (): Promise<string[]> {
        const endpoint = normalizeEndpoint(this.settings.endpoint)
        const response = await fetch(`${endpoint}/api/tags`)
        if (!response.ok) {
            throw new Error(`Ollama returned HTTP ${response.status}`)
        }
        const data = await response.json()
        return (data.models ?? []).map((m: any) => m.name)
    }

    /**
     * Streams a chat completion, invoking onChunk for every partial piece of the
     * assistant's reply. Resolves with the full accumulated text once done.
     */
    async chat (messages: ChatMessage[], onChunk: (text: string) => void): Promise<string> {
        const endpoint = normalizeEndpoint(this.settings.endpoint)
        if (!endpoint) {
            throw new Error('Ollama endpoint is not configured.')
        }
        if (!this.settings.model) {
            throw new Error('No Ollama model selected in Settings.')
        }

        const allMessages: ChatMessage[] = this.settings.systemPrompt
            ? [{ role: 'system', content: this.settings.systemPrompt }, ...messages]
            : messages

        const response = await fetch(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.settings.model,
                messages: allMessages,
                stream: true,
            }),
        })

        if (!response.ok || !response.body) {
            throw new Error(`Ollama returned HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let full = ''

        for (;;) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.trim()) {
                    continue
                }
                const parsed = JSON.parse(line)
                if (parsed.message?.content) {
                    full += parsed.message.content
                    onChunk(parsed.message.content)
                }
                if (parsed.error) {
                    throw new Error(parsed.error)
                }
            }
        }

        return full
    }
}
