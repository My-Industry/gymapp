// Encrypts small secrets (a gym's Google private key) before they are saved in the accounts sheet,
// so reading that sheet never reveals a working key. AES-256-GCM; the key comes from ENCRYPTION_KEY,
// or from AUTH_SECRET when that isn't set. Change either one and saved keys can no longer be read
// (people just connect again).
//
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const keyFor = (secret) => Buffer.from(hkdfSync('sha256', String(secret), 'gym-manager', 'secret-box-v1', 32));
const b64 = (buf) => Buffer.from(buf).toString('base64url');

/** The secret the box is locked with, or '' when the server has none. */
export const boxSecret = (env = process.env) => String(env.ENCRYPTION_KEY || env.AUTH_SECRET || '');

/** Returns "v1.<iv>.<tag>.<data>". */
export function encryptSecret(plain, secret) {
  if (String(secret || '').length < 16) throw new Error('No encryption secret is set on the server.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', b64(iv), b64(cipher.getAuthTag()), b64(data)].join('.');
}

/** The original text, or null if the box is damaged or the secret is different. */
export function decryptSecret(box, secret) {
  try {
    const [version, iv, tag, data] = String(box || '').split('.');
    if (version !== 'v1' || !iv || !tag || !data) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
