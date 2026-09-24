import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService, TranslateService, NotificationsService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

import { LoggingService } from './services/logging.service'

/** @hidden */
@Injectable()
export class LoggingButtonProvider extends ToolbarButtonProvider {
    constructor (
        private app: AppService,
        private logging: LoggingService,
        private notifications: NotificationsService,
        private translate: TranslateService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        const tab = this.activeTerminalTab
        const logging = tab?.session ? this.logging.isLogging(tab.session) : false
        return [{
            icon: require('./icons/log.svg'),
            title: this.translate.instant(logging ? 'Stop session logging' : 'Start session logging'),
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
            this.notifications.error('Focus a terminal tab first.')
            return
        }
        if (this.logging.isLogging(tab.session)) {
            this.logging.stop(tab.session)
            this.notifications.info('Session logging stopped.')
        } else {
            const logPath = this.logging.start(tab.session, tab.title)
            this.notifications.info(`Logging to ${logPath}`)
        }
    }
}
