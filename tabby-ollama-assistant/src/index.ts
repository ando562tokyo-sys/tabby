import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

import TabbyCorePlugin, { ToolbarButtonProvider, ConfigProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { OllamaChatTabComponent } from './components/chatTab.component'
import { OllamaSettingsTabComponent } from './components/settingsTab.component'
import { OllamaAssistantButtonProvider } from './buttonProvider'
import { LoggingButtonProvider } from './loggingButtonProvider'
import { OllamaAssistantSettingsTabProvider } from './settings'
import { OllamaAssistantConfigProvider } from './config'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCorePlugin,
    ],
    declarations: [
        OllamaChatTabComponent,
        OllamaSettingsTabComponent,
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: OllamaAssistantButtonProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: LoggingButtonProvider, multi: true },
        { provide: SettingsTabProvider, useClass: OllamaAssistantSettingsTabProvider, multi: true },
        { provide: ConfigProvider, useClass: OllamaAssistantConfigProvider, multi: true },
    ],
})
export default class OllamaAssistantModule { } // eslint-disable-line @typescript-eslint/no-extraneous-class
