import { Injectable } from '@angular/core'
import { NewTabParameters, RecoveryToken, TabRecoveryProvider } from 'tabby-core'

import { OllamaChatTabComponent } from './components/chatTab.component'

/** @hidden */
@Injectable()
export class ChatRecoveryProvider extends TabRecoveryProvider<OllamaChatTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'ollama-assistant:chat'
    }

    async recover (recoveryToken: RecoveryToken): Promise<NewTabParameters<OllamaChatTabComponent>> {
        return {
            type: OllamaChatTabComponent,
            inputs: {
                savedMessages: recoveryToken.messages ?? [],
                savedHistory: recoveryToken.history ?? [],
            },
        }
    }
}
