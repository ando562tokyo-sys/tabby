import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'

import { OllamaSettingsTabComponent } from './components/settingsTab.component'

/** @hidden */
@Injectable()
export class OllamaAssistantSettingsTabProvider extends SettingsTabProvider {
    id = 'ollama-assistant'
    icon = 'robot'
    title = 'AIアシスタント'

    getComponentType (): any {
        return OllamaSettingsTabComponent
    }
}
