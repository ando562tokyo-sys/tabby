import { Component } from '@angular/core'
import { ConfigService, NotificationsService, PlatformService } from 'tabby-core'

import { OllamaService } from '../services/ollama.service'
import { KeygenService } from '../services/keygen.service'
import { DEFAULT_SYSTEM_PROMPT } from '../config'

@Component({
    templateUrl: './settingsTab.component.pug',
})
export class OllamaSettingsTabComponent {
    models: string[] = []
    loadingModels = false

    keygenComment = ''
    generatedPrivateKey = ''
    generatedPublicKey = ''

    constructor (
        public config: ConfigService,
        private ollama: OllamaService,
        private keygen: KeygenService,
        private notifications: NotificationsService,
        private platform: PlatformService,
    ) { }

    async refreshModels (): Promise<void> {
        this.loadingModels = true
        try {
            this.models = await this.ollama.listModels()
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        } finally {
            this.loadingModels = false
        }
    }

    resetSystemPrompt (): void {
        this.config.store.ollamaAssistant.systemPrompt = DEFAULT_SYSTEM_PROMPT
        this.config.save()
    }

    generateKeyPair (): void {
        if (this.generatedPrivateKey && !window.confirm('既に生成した鍵が表示されています。新しい鍵ペアを生成すると表示が上書きされます。よろしいですか?')) {
            return
        }
        const pair = this.keygen.generate(this.keygenComment)
        this.generatedPrivateKey = pair.privateKey
        this.generatedPublicKey = pair.publicKey
    }

    copyToClipboard (text: string): void {
        this.platform.setClipboard({ text })
        this.notifications.info('クリップボードにコピーしました。')
    }

    async savePrivateKey (): Promise<void> {
        if (!this.generatedPrivateKey) {
            return
        }
        const buffer = Buffer.from(this.generatedPrivateKey, 'utf-8')
        const transfer = await this.platform.startDownload('id_rsa', 0o600, buffer.length)
        if (!transfer) {
            return
        }
        await transfer.write(buffer)
        transfer.close()
        this.notifications.info('秘密鍵を保存しました。')
    }
}
