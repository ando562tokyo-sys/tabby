import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

import TabbyCorePlugin, { ToolbarButtonProvider, ConfigProvider, TabRecoveryProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { OllamaChatTabComponent } from './components/chatTab.component'
import { OllamaSettingsTabComponent } from './components/settingsTab.component'
import { FileTransferTabComponent } from './components/fileTransferTab.component'
import { OllamaAssistantButtonProvider } from './buttonProvider'
import { LoggingButtonProvider } from './loggingButtonProvider'
import { FileTransferButtonProvider } from './fileTransferButtonProvider'
import { BroadcastButtonProvider } from './broadcastButtonProvider'
import { OllamaAssistantSettingsTabProvider } from './settings'
import { OllamaAssistantConfigProvider } from './config'
import { ChatRecoveryProvider } from './recoveryProvider'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCorePlugin,
    ],
    declarations: [
        OllamaChatTabComponent,
        OllamaSettingsTabComponent,
        FileTransferTabComponent,
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: OllamaAssistantButtonProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: LoggingButtonProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: FileTransferButtonProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: BroadcastButtonProvider, multi: true },
        { provide: SettingsTabProvider, useClass: OllamaAssistantSettingsTabProvider, multi: true },
        { provide: ConfigProvider, useClass: OllamaAssistantConfigProvider, multi: true },
        { provide: TabRecoveryProvider, useClass: ChatRecoveryProvider, multi: true },
    ],
})
export default class OllamaAssistantModule { } // eslint-disable-line @typescript-eslint/no-extraneous-class
