import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService } from 'tabby-core'

import { FileTransferTabComponent } from './components/fileTransferTab.component'

/** @hidden */
@Injectable()
export class FileTransferButtonProvider extends ToolbarButtonProvider {
    constructor (private app: AppService) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/transfer.svg'),
            title: 'ファイル転送',
            weight: 4,
            click: (): void => this.open(),
        }]
    }

    open (): void {
        const tab = this.app.tabs.find(t => t instanceof FileTransferTabComponent)
        if (tab) {
            this.app.selectTab(tab)
        } else {
            this.app.openNewTabRaw({ type: FileTransferTabComponent })
        }
    }
}
