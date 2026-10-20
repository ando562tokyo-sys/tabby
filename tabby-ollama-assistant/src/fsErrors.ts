function errorCode (error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined
}

function errorMessage (error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}

/** Friendlier Japanese messages for the local fs error codes users actually hit. */
export function describeFsError (error: unknown): string {
    const code = errorCode(error)
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
    return (code && messages[code]) ?? errorMessage(error)
}

export function wrapFsError (operation: string, targetPath: string, error: unknown): Error {
    return new Error(`${operation}に失敗しました (${targetPath}): ${describeFsError(error)}`)
}

/** Wraps a remote SFTP operation's error with context; the underlying message vocabulary
 * depends on the SSH backend/server, so unlike wrapFsError this can't map specific codes,
 * but the operation + path prefix still gives the user something actionable. */
export function wrapRemoteError (operation: string, targetPath: string, error: unknown): Error {
    return new Error(`${operation}に失敗しました (${targetPath}): ${errorMessage(error)}`)
}
