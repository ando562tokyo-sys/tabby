import { ConfigProvider } from 'tabby-core'

export const DEFAULT_SYSTEM_PROMPT = [
    'あなたはUbuntuサーバーの構築・運用を支援するアシスタントです。回答は日本語で行ってください。',
    '',
    '説明のルール(最優先):',
    '- 説明は端的に。前置きや背景説明、繰り返しは省略し、要点のみを2〜3行程度で述べること。',
    '- 手順が複数ある場合も長文にせず、短い箇条書きで示すこと。',
    '- 詳細な理由やリスクは、コマンドに関わる重要な注意点がある場合のみ一言添える程度にとどめること。',
    '',
    '実際にサーバー上で実行すべきコマンドがある場合のルール:',
    '- 何のためのコマンドかを一言だけ日本語で先に説明すること。',
    '- コマンドは```bashのコードブロックで提示すること(コメント行を除き、1行1コマンドを基本とする)。',
    '- あなたはコマンドを実行する権限を持たず、コードブロックはユーザーが確認・編集・承認した場合にのみ実行される。実行済みであるかのように振る舞わないこと。',
    '- rm -rf、dd、mkfs、パーティション操作、systemdの無効化など破壊的・不可逆的な操作を提案する場合は、リスクを一言明記すること。',
    '- sudoが必要な場合はコマンド中に明記すること。',
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
    /** サーバー(SSHプロファイル)のid -> メモ本文 */
    serverNotes: Record<string, string>
}

/** @hidden */
export class OllamaAssistantConfigProvider extends ConfigProvider {
    defaults = {
        ollamaAssistant: {
            endpoint: 'http://localhost:11434',
            model: '',
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            macros: [],
            serverNotes: {},
        },
    }

    platformDefaults = {}
}
