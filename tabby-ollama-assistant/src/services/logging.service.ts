import * as fs from 'fs'
import * as path from 'path'
import * as electron from '@electron/remote'
import { Injectable } from '@angular/core'
import { Subscription } from 'rxjs'
import { BaseSession } from 'tabby-terminal'

interface ActiveLog {
    stream: fs.WriteStream
    path: string
    subscription: Subscription
}

@Injectable({ providedIn: 'root' })
export class LoggingService {
    private activeLogs = new Map<BaseSession, ActiveLog>()

    private getLogsDir (): string {
        return path.join(electron.app.getPath('userData'), 'session-logs')
    }

    isLogging (session: BaseSession): boolean {
        return this.activeLogs.has(session)
    }

    start (session: BaseSession, label: string): string {
        if (this.activeLogs.has(session)) {
            return this.activeLogs.get(session)!.path
        }
        const dir = this.getLogsDir()
        fs.mkdirSync(dir, { recursive: true })
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const safeLabel = (label || 'session').replace(/[\\/:*?"<>|]/g, '_')
        const logPath = path.join(dir, `${safeLabel}_${timestamp}.log`)
        const stream = fs.createWriteStream(logPath, { flags: 'a' })
        const subscription = new Subscription()
        subscription.add(session.binaryOutput$.subscribe(data => stream.write(data)))
        // 「停止」を押さずに端末タブを閉じても、ファイルハンドルとMapの参照が残り続け
        // リークしないよう、セッション破棄時に自動で後始末する。
        subscription.add(session.destroyed$.subscribe(() => this.stop(session)))
        this.activeLogs.set(session, { stream, path: logPath, subscription })
        return logPath
    }

    stop (session: BaseSession): void {
        const entry = this.activeLogs.get(session)
        if (!entry) {
            return
        }
        entry.subscription.unsubscribe()
        entry.stream.end()
        this.activeLogs.delete(session)
    }

    openLogsFolder (): void {
        const dir = this.getLogsDir()
        fs.mkdirSync(dir, { recursive: true })
        electron.shell.openPath(dir)
    }
}
