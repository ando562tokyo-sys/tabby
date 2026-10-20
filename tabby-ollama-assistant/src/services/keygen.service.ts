import * as crypto from 'crypto'
import { promisify } from 'util'
import { Injectable } from '@angular/core'

const generateKeyPairAsync = promisify(crypto.generateKeyPair)

export interface SshKeyPair {
    privateKey: string
    publicKey: string
}

function encodeSshString (buffer: Buffer): Buffer {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(buffer.length, 0)
    return Buffer.concat([length, buffer])
}

// SSH's mpint encoding is signed: if the top bit of the leading byte is set,
// a 0x00 byte must be prepended so the value isn't misread as negative.
function encodeMpint (buffer: Buffer): Buffer {
    let value = buffer
    let start = 0
    while (start < value.length - 1 && value[start] === 0x00) {
        start++
    }
    value = value.subarray(start)
    if (value.length > 0 && (value[0] & 0x80) !== 0) {
        value = Buffer.concat([Buffer.from([0x00]), value])
    }
    return encodeSshString(value)
}

/**
 * Generates an RSA 4096 key pair.
 *
 * RSA with a PKCS#1 private key is used rather than ed25519 because it's the most
 * universally-compatible format across SSH implementations (including Tabby's own
 * `russh`-based backend); Node's default PKCS#8 PEM output for ed25519 is known to be
 * rejected by some SSH key parsers (e.g. the `ssh2` library), so RSA/PKCS#1 avoids that
 * risk entirely. The public key is manually converted to the OpenSSH wire format
 * (RFC 4253 6.6) since Node has no built-in exporter for it; this conversion has been
 * verified against ssh2's own key parser.
 *
 * Runs via the async crypto.generateKeyPair rather than the sync version - RSA 4096
 * generation can take a second or more, which would otherwise block the renderer's
 * main thread and freeze the UI.
 */
@Injectable({ providedIn: 'root' })
export class KeygenService {
    async generate (comment?: string): Promise<SshKeyPair> {
        const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        })

        const jwk = crypto.createPublicKey(publicKey).export({ format: 'jwk' }) as { e: string, n: string }
        const exponent = Buffer.from(jwk.e, 'base64url')
        const modulus = Buffer.from(jwk.n, 'base64url')

        const wire = Buffer.concat([
            encodeSshString(Buffer.from('ssh-rsa')),
            encodeMpint(exponent),
            encodeMpint(modulus),
        ])
        const finalComment = comment?.trim() ? comment.trim() : 'tabby'
        const publicKeyOpenSsh = `ssh-rsa ${wire.toString('base64')} ${finalComment}`

        return { privateKey, publicKey: publicKeyOpenSsh }
    }
}
