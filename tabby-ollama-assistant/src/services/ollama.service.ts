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
        const response = await this.fetchOllama(`${endpoint}/api/tags`)
        if (!response.ok) {
            throw new Error(`Ollamaからエラーが返されました (HTTP ${response.status})`)
        }
        const data = await response.json()
        return (data.models ?? []).map((m: any) => m.name)
    }

    /** Wraps fetch() so a connection failure (Ollama not running, wrong endpoint, etc.)
     * gives a clear Japanese message instead of a raw "Failed to fetch". */
    private async fetchOllama (url: string, init?: RequestInit): Promise<Response> {
        try {
            return await fetch(url, init)
        } catch {
            throw new Error(`Ollama (${url}) に接続できませんでした。Ollamaが起動しているか、エンドポイントの設定を確認してください。`)
        }
    }

    /**
     * Streams a chat completion, invoking onChunk for every partial piece of the
     * assistant's reply. Resolves with the full accumulated text once done.
     */
    async chat (messages: ChatMessage[], onChunk: (text: string) => void): Promise<string> {
        const endpoint = normalizeEndpoint(this.settings.endpoint)
        if (!endpoint) {
            throw new Error('Ollamaのエンドポイントが設定されていません。設定画面で指定してください。')
        }
        if (!this.settings.model) {
            throw new Error('Ollamaのモデルが選択されていません。設定画面で選択してください。')
        }

        const allMessages: ChatMessage[] = this.settings.systemPrompt
            ? [{ role: 'system', content: this.settings.systemPrompt }, ...messages]
            : messages

        const response = await this.fetchOllama(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.settings.model,
                messages: allMessages,
                stream: true,
            }),
        })

        if (!response.ok || !response.body) {
            throw new Error(`Ollamaからエラーが返されました (HTTP ${response.status})`)
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
                let parsed: any = null
                try {
                    parsed = JSON.parse(line)
                } catch {
                    // 途切れた/壊れた1行は無視して継続する(ストリーミング全体を失わせない)
                    continue
                }
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
