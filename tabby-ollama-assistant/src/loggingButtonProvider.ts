import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService, NotificationsService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

import { LoggingService } from './services/logging.service'

/** @hidden */
@Injectable()
export class LoggingButtonProvider extends ToolbarButtonProvider {
    constructor (
        private app: AppService,
        private logging: LoggingService,
        private notifications: NotificationsService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        const tab = this.activeTerminalTab
        const logging = tab?.session ? this.logging.isLogging(tab.session) : false
        return [{
            icon: require('./icons/log.svg'),
            title: logging ? 'セッションログの保存を停止' : 'セッションログの保存を開始',
            weight: 6,
            click: (): void => this.toggle(),
        }]
    }

    private get activeTerminalTab (): BaseTerminalTabComponent<any> | null {
        return this.app.activeTab instanceof BaseTerminalTabComponent ? this.app.activeTab : null
    }

    private toggle (): void {
        const tab = this.activeTerminalTab
        if (!tab?.session) {
            this.notifications.error('ログを保存する端末タブを選択してください。')
            return
        }
        if (this.logging.isLogging(tab.session)) {
            this.logging.stop(tab.session)
            this.notifications.info('セッションログの保存を停止しました。')
        } else {
            const logPath = this.logging.start(tab.session, tab.title)
            this.notifications.info(`ログを保存しています: ${logPath}`)
        }
    }
}
