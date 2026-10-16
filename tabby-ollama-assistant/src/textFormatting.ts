function escapeHtml (text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/**
 * Minimal, safe Markdown-ish rendering for assistant replies: inline code, bold,
 * and `- `/`* ` bullet lists. Deliberately does not touch ```code blocks``` (those
 * are extracted separately as runnable command blocks before this ever sees them).
 * Output is plain `<strong>`/`<code>`/`<ul><li>` markup, which Angular's default
 * `innerHTML` sanitizer allows through untouched.
 */
export function formatAssistantText (text: string): string {
    const lines = text.split('\n')
    const htmlLines: string[] = []
    let inList = false

    for (const rawLine of lines) {
        const line = escapeHtml(rawLine)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

        const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(rawLine)
        if (bulletMatch) {
            if (!inList) {
                htmlLines.push('<ul>')
                inList = true
            }
            const bulletContent = escapeHtml(bulletMatch[1])
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            htmlLines.push(`<li>${bulletContent}</li>`)
            continue
        }

        if (inList) {
            htmlLines.push('</ul>')
            inList = false
        }
        htmlLines.push(line.length ? `<div>${line}</div>` : '<br>')
    }

    if (inList) {
        htmlLines.push('</ul>')
    }

    return htmlLines.join('')
}
