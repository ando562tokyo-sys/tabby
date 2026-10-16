const DANGEROUS_PATTERNS: RegExp[] = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\b/, // rm -rf (any flag order)
    /\bmkfs(\.\w+)?\b/,
    /\bdd\s+.*\bof=\/dev\//,
    />\s*\/dev\/sd[a-z]\b/,
    /\bshutdown\b|\breboot\b|\bpoweroff\b|\bhalt\b/,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
    /\bchmod\s+(-R\s+)?777\b/,
    /\bchown\s+-R\s+/,
    /\bsystemctl\s+(disable|stop|mask)\b/,
    /\biptables\s+(-F|--flush)\b/,
    /\buserdel\b|\bgroupdel\b/,
    /\bkill\s+-9\s+1\b/,
    />\s*\/etc\/passwd\b|>\s*\/etc\/shadow\b/,
    /\bfdisk\b|\bparted\b/,
]

export function isDangerousCommand (command: string): boolean {
    return DANGEROUS_PATTERNS.some(re => re.test(command))
}
