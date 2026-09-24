import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService, TranslateService } from 'tabby-core'

import { OllamaChatTabComponent } from './components/chatTab.component'

/** @hidden */
@Injectable()
export class OllamaAssistantButtonProvider extends ToolbarButtonProvider {
    constructor (
        private app: AppService,
        private translate: TranslateService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/chat.svg'),
            title: this.translate.instant('AI Assistant'),
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
