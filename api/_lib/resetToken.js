// Helpers for password-reset links. Files/folders starting with "_" inside /api are NOT exposed as endpoints.
import { createHash } from 'node:crypto';

export const RESET_MINUTES = 60;

/** Only this hash is stored in the sheet, never the token that goes in the email. */
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** The site's address for links in emails. Built from APP_URL, never from the request's Host header (that could be
 *  forged to point the link at someone else's site). Only on your own machine does it fall back to localhost. */
export function appBaseUrl(env = process.env, req = {}) {
  return String(env.APP_URL || '').trim().replace(/\/+$/, '')
    || (env.AUTH_ENV_FILE && req.headers?.host ? `http://${req.headers.host}` : '');
}

/** The reset link in the email. */
export function resetLink(token, env = process.env, req = {}) {
  const base = appBaseUrl(env, req);
  return base ? `${base}/?reset=${token}` : null;
}
