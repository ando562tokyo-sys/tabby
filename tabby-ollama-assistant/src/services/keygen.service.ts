import * as crypto from 'crypto'
import { Injectable } from '@angular/core'

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
 * ssh2 (Tabby's SSH backend, via the `russh`/ssh2 stack) does not parse ed25519 keys in
 * Node's default PKCS#8 PEM output, so this generates a PKCS#1 RSA private key instead,
 * which is directly compatible. The public key is manually converted to the OpenSSH wire
 * format (RFC 4253 6.6) since Node has no built-in exporter for it.
 */
@Injectable({ providedIn: 'root' })
export class KeygenService {
    generate (comment?: string): SshKeyPair {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
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
