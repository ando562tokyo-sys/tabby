import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService } from 'tabby-core'

import { OllamaChatTabComponent } from './components/chatTab.component'

/** @hidden */
@Injectable()
export class OllamaAssistantButtonProvider extends ToolbarButtonProvider {
    constructor (private app: AppService) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/chat.svg'),
            title: 'AIアシスタント',
            weight: 5,
            click: (): void => this.open(),
        }]
    }

    open (): void {
        const tab = this.app.tabs.find(t => t instanceof OllamaChatTabComponent)
        if (tab) {
            this.app.selectTab(tab)
        } else {
            this.app.openNewTabRaw({ type: OllamaChatTabComponent })
        }
    }
}
