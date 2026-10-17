import { Component } from '@angular/core'
import { ConfigService, NotificationsService, PlatformService, Profile, ProfilesService } from 'tabby-core'

import { OllamaService } from '../services/ollama.service'
import { KeygenService } from '../services/keygen.service'
import { ServerNotesService } from '../services/serverNotes.service'
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

    sshProfiles: Profile[] = []
    selectedProfileId = ''
    noteText = ''

    constructor (
        public config: ConfigService,
        private ollama: OllamaService,
        private keygen: KeygenService,
        private notifications: NotificationsService,
        private platform: PlatformService,
        private profiles: ProfilesService,
        private serverNotes: ServerNotesService,
    ) { }

    async ngOnInit (): Promise<void> {
        const all = await this.profiles.getProfiles()
        this.sshProfiles = all.filter(p => p.type === 'ssh') as Profile[]
    }

    onProfileSelected (): void {
        this.noteText = this.selectedProfileId ? this.serverNotes.get(this.selectedProfileId) : ''
    }

    saveNote (): void {
        if (!this.selectedProfileId) {
            return
        }
        this.serverNotes.set(this.selectedProfileId, this.noteText)
        this.notifications.info('メモを保存しました。')
    }

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
