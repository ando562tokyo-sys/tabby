import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, NotificationsService } from 'tabby-core'
import { MultifocusService } from 'tabby-terminal'

/**
 * A visible on/off toggle for Tabby's own MultifocusService (which already
 * broadcasts keystrokes from the focused terminal to every other open
 * terminal tab) - previously only reachable via a hotkey with no persistent
 * UI affordance to turn it back off.
 */
@Injectable()
export class BroadcastButtonProvider extends ToolbarButtonProvider {
    private active = false

    constructor (
        private multifocus: MultifocusService,
        private notifications: NotificationsService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/broadcast.svg'),
            title: this.active
                ? '入力の複製をオフにする'
                : '入力の複製をオンにする(どれかの端末タブへの入力が、開いている他の端末タブすべてに複製されます)',
            weight: 7,
            click: (): void => this.toggle(),
        }]
    }

    private toggle (): void {
        if (this.active) {
            this.multifocus.cancel()
            this.active = false
            this.notifications.info('入力の複製をオフにしました。')
        } else {
            this.multifocus.focusAllTabs()
            this.active = true
            this.notifications.info('入力の複製をオンにしました。いずれかの端末タブに入力すると、開いている他の端末タブすべてに同じ入力が送られます。もう一度このボタンを押すと解除されます。')
        }
    }
}
