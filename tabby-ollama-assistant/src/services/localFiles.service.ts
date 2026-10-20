import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { Injectable } from '@angular/core'

import { wrapFsError } from '../fsErrors'

export interface LocalFile {
    name: string
    fullPath: string
    isDirectory: boolean
    size: number
}

@Injectable({ providedIn: 'root' })
export class LocalFilesService {
    homeDir (): string {
        return os.homedir()
    }

    async list (dirPath: string): Promise<{ path: string, parent: string | null, entries: LocalFile[] }> {
        try {
            const resolved = path.resolve(dirPath)
            const names = await fs.readdir(resolved)
            const entries: LocalFile[] = []
            for (const name of names) {
                try {
                    const fullPath = path.join(resolved, name)
                    const stat = await fs.stat(fullPath)
                    entries.push({ name, fullPath, isDirectory: stat.isDirectory(), size: stat.size })
                } catch {
                    // アクセスできないファイル(権限不足・リンク切れ等)は一覧からスキップする
                }
            }
            entries.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1
                }
                return a.name.localeCompare(b.name)
            })
            const parent = path.dirname(resolved)
            return { path: resolved, parent: parent === resolved ? null : parent, entries }
        } catch (error) {
            throw wrapFsError('ローカルフォルダの読み込み', dirPath, error)
        }
    }

    async mkdir (dirPath: string, name: string): Promise<void> {
        try {
            await fs.mkdir(path.join(dirPath, name))
        } catch (error) {
            throw wrapFsError('ローカルフォルダの作成', path.join(dirPath, name), error)
        }
    }

    async delete (targetPath: string, isDirectory: boolean): Promise<void> {
        try {
            if (isDirectory) {
                await fs.rm(targetPath, { recursive: true })
            } else {
                await fs.unlink(targetPath)
            }
        } catch (error) {
            throw wrapFsError('ローカルの削除', targetPath, error)
        }
    }
}
