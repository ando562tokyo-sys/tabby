import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { Injectable } from '@angular/core'

export interface LocalFile {
    name: string
    fullPath: string
    isDirectory: boolean
    size: number
}

function describeFsError (error: any): string {
    const code = error?.code
    const messages: Record<string, string | undefined> = {
        EACCES: '権限がありません(パーミッションエラー)',
        EPERM: '操作が許可されていません(権限不足の可能性があります)',
        ENOENT: 'ファイルまたはフォルダが見つかりません',
        EEXIST: '同名のファイル/フォルダが既に存在します',
        ENOTEMPTY: 'フォルダが空ではないため削除できません',
        EISDIR: 'フォルダに対してファイル操作を行おうとしました',
        ENOTDIR: 'フォルダではないパスに対してフォルダ操作を行おうとしました',
        ENOSPC: 'ディスクの空き容量が不足しています',
    }
    return messages[code] ?? (error?.message ?? String(error))
}

function wrapFsError (operation: string, targetPath: string, error: any): Error {
    return new Error(`${operation}に失敗しました (${targetPath}): ${describeFsError(error)}`)
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
