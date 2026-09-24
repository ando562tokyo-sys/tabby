import { Injectable } from '@angular/core'
import { TranslateService } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { OllamaSettingsTabComponent } from './components/settingsTab.component'

/** @hidden */
@Injectable()
export class OllamaAssistantSettingsTabProvider extends SettingsTabProvider {
    id = 'ollama-assistant'
    icon = 'robot'
    title = this.translate.instant('AI Assistant')

    constructor (private translate: TranslateService) { super() }

    getComponentType (): any {
        return OllamaSettingsTabComponent
    }
}
