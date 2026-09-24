import { ConfigProvider } from 'tabby-core'

export const DEFAULT_SYSTEM_PROMPT = [
    'You are an assistant that helps configure and operate Ubuntu servers over SSH.',
    '',
    'Rules for explanations (most important):',
    '- Be concise. Skip preamble, background and repetition; state only the key points in 2-3 lines.',
    '- Use short bullet points even for multi-step instructions.',
    '- Only mention risk/rationale briefly when a command has an important caveat.',
    '',
    'Rules when a command should actually be run on the server:',
    '- Briefly say in one line what the command is for.',
    '- Present commands in a ```bash code block (one command per line, no comments).',
    '- You cannot execute commands yourself. The code block will only run after the user reviews and confirms it in the app. Never act as if it has already run.',
    '- If you suggest something destructive or irreversible (rm -rf, dd, mkfs, disabling systemd units, partitioning, etc.), state the risk in one line.',
    '- Mention explicitly in the command when sudo is required.',
].join('\n')

export interface OllamaAssistantMacro {
    id: string
    name: string
    commands: string[]
}

export interface OllamaAssistantConfig {
    endpoint: string
    model: string
    systemPrompt: string
    macros: OllamaAssistantMacro[]
}

/** @hidden */
export class OllamaAssistantConfigProvider extends ConfigProvider {
    defaults = {
        ollamaAssistant: {
            endpoint: 'http://localhost:11434',
            model: '',
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            macros: [],
        },
    }

    platformDefaults = {}
}
