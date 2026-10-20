import * as fs from 'fs/promises'
import * as path from 'path'
import { FileDownload, FileUpload } from 'tabby-core'

import { wrapFsError } from './fsErrors'

/**
 * Minimal Node `fs`-backed implementations of Tabby's FileUpload/FileDownload so a
 * specific local path (picked in our own local pane, not via a save/open dialog) can
 * be fed directly into SFTPSession.upload()/download() for the WinSCP-style transfer
 * buttons. Modeled on tabby-electron's own ElectronFileUpload/ElectronFileDownload.
 */
export class LocalFileUpload extends FileUpload {
    private size = 0
    private mode = 0
    private file!: fs.FileHandle
    private buffer = new Uint8Array(256 * 1024)

    constructor (private filePath: string) {
        super()
    }

    async open (): Promise<void> {
        try {
            const stat = await fs.stat(this.filePath)
            this.size = stat.size
            this.mode = stat.mode
            this.setTotalSize(this.size)
            this.file = await fs.open(this.filePath, 'r')
        } catch (error) {
            throw wrapFsError('アップロード', this.filePath, error)
        }
    }

    getName (): string {
        return path.basename(this.filePath)
    }

    getMode (): number {
        return this.mode
    }

    getSize (): number {
        return this.size
    }

    async read (): Promise<Uint8Array> {
        try {
            const result = await this.file.read(this.buffer, 0, this.buffer.length, null)
            this.increaseProgress(result.bytesRead)
            if (this.getCompletedBytes() >= this.getSize()) {
                this.setCompleted(true)
            }
            return this.buffer.slice(0, result.bytesRead)
        } catch (error) {
            throw wrapFsError('アップロード', this.filePath, error)
        }
    }

    close (): void {
        this.file.close()
    }
}

export class LocalFileDownload extends FileDownload {
    private file!: fs.FileHandle

    constructor (private filePath: string, private mode: number, private size: number) {
        super()
        this.setTotalSize(size)
    }

    async open (): Promise<void> {
        try {
            this.file = await fs.open(this.filePath, 'w', this.mode || 0o644)
        } catch (error) {
            throw wrapFsError('ダウンロード', this.filePath, error)
        }
    }

    getName (): string {
        return path.basename(this.filePath)
    }

    getSize (): number {
        return this.size
    }

    async write (buffer: Uint8Array): Promise<void> {
        try {
            let pos = 0
            while (pos < buffer.length) {
                const result = await this.file.write(buffer, pos, buffer.length - pos, null)
                this.increaseProgress(result.bytesWritten)
                pos += result.bytesWritten
            }
            if (this.getCompletedBytes() >= this.getSize()) {
                this.setCompleted(true)
            }
        } catch (error) {
            throw wrapFsError('ダウンロード', this.filePath, error)
        }
    }

    close (): void {
        this.file.close()
    }
}
