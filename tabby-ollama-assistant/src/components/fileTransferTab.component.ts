import * as path from 'path'
import { Component, Injector } from '@angular/core'
import { AppService, BaseTabComponent, NotificationsService, Profile } from 'tabby-core'
import { SFTPFile, SFTPSession, SSHTabComponent } from 'tabby-ssh'

import { LocalFile, LocalFilesService } from '../services/localFiles.service'
import { ServerNotesService } from '../services/serverNotes.service'
import { LocalFileDownload, LocalFileUpload } from '../localFileTransfer'

interface TransferProgress {
    id: number
    label: string
}

function joinRemotePath (base: string, name: string): string {
    return path.posix.join(base || '/', name)
}

@Component({
    selector: 'file-transfer-tab',
    templateUrl: './fileTransferTab.component.pug',
    styleUrls: ['./fileTransferTab.component.scss'],
})
export class FileTransferTabComponent extends BaseTabComponent {
    targetTab: SSHTabComponent | null = null
    sftp: SFTPSession | null = null
    connecting = false

    localPath = ''
    localParent: string | null = null
    localEntries: LocalFile[] = []
    selectedLocalName: string | null = null

    remotePath = ''
    remoteParent: string | null = null
    remoteEntries: SFTPFile[] = []
    selectedRemoteName: string | null = null

    transfers: TransferProgress[] = []
    private nextTransferId = 1

    notesOpen = false
    noteDraft = ''

    constructor (
        injector: Injector,
        private app: AppService,
        private localFiles: LocalFilesService,
        private notifications: NotificationsService,
        private serverNotes: ServerNotesService,
    ) {
        super(injector)
        this.setTitle('ファイル転送')
    }

    get targetTabs (): SSHTabComponent[] {
        return this.app.tabs.filter((t): t is SSHTabComponent => t instanceof SSHTabComponent && !!t.sshSession)
    }

    get targetProfile (): Profile | null {
        return this.targetTab?.profile ?? null
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

    async ngOnInit (): Promise<void> {
        await this.loadLocalDir(this.localFiles.homeDir())
        if (!this.targetTab) {
            this.targetTab = this.targetTabs[0] ?? null
        }
        if (this.targetTab) {
            await this.onTargetTabChange()
        }
    }

    async onTargetTabChange (): Promise<void> {
        this.sftp = null
        this.remoteEntries = []
        if (this.targetTab && !this.targetTabs.includes(this.targetTab)) {
            this.targetTab = null
        }
        if (!this.targetTab?.sshSession) {
            return
        }
        this.connecting = true
        try {
            this.sftp = await this.targetTab.sshSession.openSFTP()
            await this.loadRemoteDir('/')
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        } finally {
            this.connecting = false
        }
    }

    // --- Local pane -------------------------------------------------------

    async loadLocalDir (dirPath: string): Promise<void> {
        try {
            const result = await this.localFiles.list(dirPath)
            this.localPath = result.path
            this.localParent = result.parent
            this.localEntries = result.entries
            this.selectedLocalName = null
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        }
    }

    onLocalEntryOpen (entry: LocalFile): void {
        if (entry.isDirectory) {
            this.loadLocalDir(entry.fullPath)
        }
    }

    async localMkdir (): Promise<void> {
        const name = window.prompt('新しいフォルダ名を入力してください。')
        if (!name) {
            return
        }
        try {
            await this.localFiles.mkdir(this.localPath, name)
            await this.loadLocalDir(this.localPath)
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        }
    }

    async localDelete (): Promise<void> {
        const entry = this.localEntries.find(e => e.name === this.selectedLocalName)
        if (!entry) {
            this.notifications.error('削除する項目を選択してください。')
            return
        }
        if (!window.confirm(`「${entry.name}」を削除しますか?`)) {
            return
        }
        try {
            await this.localFiles.delete(entry.fullPath, entry.isDirectory)
            await this.loadLocalDir(this.localPath)
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        }
    }

    // --- Remote pane --------------------------------------------------------

    async loadRemoteDir (newPath: string): Promise<void> {
        if (!this.sftp) {
            return
        }
        try {
            const entries = await this.sftp.readdir(newPath)
            entries.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1
                }
                return a.name.localeCompare(b.name)
            })
            this.remotePath = newPath
            this.remoteParent = newPath === '/' ? null : path.posix.dirname(newPath)
            this.remoteEntries = entries
            this.selectedRemoteName = null
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        }
    }

    onRemoteEntryOpen (entry: SFTPFile): void {
        if (entry.isDirectory) {
            this.loadRemoteDir(entry.fullPath)
        }
    }

    async remoteMkdir (): Promise<void> {
        if (!this.sftp) {
            return
        }
        const name = window.prompt('新しいフォルダ名を入力してください。')
        if (!name) {
            return
        }
        try {
            await this.sftp.mkdir(joinRemotePath(this.remotePath, name))
            await this.loadRemoteDir(this.remotePath)
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        }
    }

    async remoteDelete (): Promise<void> {
        if (!this.sftp) {
            return
        }
        const entry = this.remoteEntries.find(e => e.name === this.selectedRemoteName)
        if (!entry) {
            this.notifications.error('削除する項目を選択してください。')
            return
        }
        if (!window.confirm(`「${entry.name}」を削除しますか?`)) {
            return
        }
        try {
            if (entry.isDirectory) {
                await this.sftp.rmdir(entry.fullPath)
            } else {
                await this.sftp.unlink(entry.fullPath)
            }
            await this.loadRemoteDir(this.remotePath)
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        }
    }

    // --- Transfers ------------------------------------------------------

    private beginTransfer (label: string): number {
        const id = this.nextTransferId++
        this.transfers.push({ id, label })
        return id
    }

    private endTransfer (id: number): void {
        this.transfers = this.transfers.filter(t => t.id !== id)
    }

    async uploadSelected (): Promise<void> {
        if (!this.sftp) {
            this.notifications.error('対象サーバーを選択してください。')
            return
        }
        const entry = this.localEntries.find(e => e.name === this.selectedLocalName)
        if (!entry || entry.isDirectory) {
            this.notifications.error('アップロードするファイルを選択してください(フォルダの転送には未対応です)。')
            return
        }
        const transferId = this.beginTransfer(`アップロード: ${entry.name}`)
        try {
            const upload = new LocalFileUpload(entry.fullPath)
            await upload.open()
            await this.sftp.upload(joinRemotePath(this.remotePath, entry.name), upload)
            await this.loadRemoteDir(this.remotePath)
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        } finally {
            this.endTransfer(transferId)
        }
    }

    async downloadSelected (): Promise<void> {
        if (!this.sftp) {
            this.notifications.error('対象サーバーを選択してください。')
            return
        }
        const entry = this.remoteEntries.find(e => e.name === this.selectedRemoteName)
        if (!entry || entry.isDirectory) {
            this.notifications.error('ダウンロードするファイルを選択してください(フォルダの転送には未対応です)。')
            return
        }
        const transferId = this.beginTransfer(`ダウンロード: ${entry.name}`)
        try {
            const localTargetPath = path.join(this.localPath, entry.name)
            const download = new LocalFileDownload(localTargetPath, entry.mode, entry.size)
            await download.open()
            await this.sftp.download(entry.fullPath, download)
            await this.loadLocalDir(this.localPath)
        } catch (error) {
            this.notifications.error(error.message ?? String(error))
        } finally {
            this.endTransfer(transferId)
        }
    }

    formatBytes (bytes: number): string {
        if (!bytes || bytes <= 0) {
            return '0 B'
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        let value = bytes
        let unitIndex = 0
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024
            unitIndex += 1
        }
        return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
    }
}
