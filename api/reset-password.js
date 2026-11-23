// POST /api/reset-password { token, password }
// Sets a new password using the one-time link from the reset email.

import { hashPassword, readBody, sendJson } from './_lib/auth.js';
import { getAccountStore } from './_lib/accounts.js';
import { MAX_PASSWORD, MIN_PASSWORD } from './_lib/signup.js';
import { hashToken } from './_lib/resetToken.js';

const BAD_LINK = 'This reset link is invalid or has expired. Please request a new one.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const accounts = getAccountStore();
  if (!accounts) return sendJson(res, 503, { error: "Password reset isn't available on this server yet." });

  const { token, password } = readBody(req);
  const pw = String(password ?? '');
  if (pw.length < MIN_PASSWORD) return sendJson(res, 400, { error: `Password must be at least ${MIN_PASSWORD} characters.` });
  if (pw.length > MAX_PASSWORD) return sendJson(res, 400, { error: 'Password is too long.' });
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return sendJson(res, 400, { error: BAD_LINK });

  try {
    const reset = await accounts.findReset(hashToken(token));
    if (!reset) return sendJson(res, 400, { error: BAD_LINK });
    await accounts.markResetUsed(reset); // first, so the link can't be used twice
    await accounts.setPassword(reset.username, hashPassword(pw));
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    if (err.code === 'not-found-account') return sendJson(res, 400, { error: BAD_LINK });
    console.error(err.message);
    return sendJson(res, 503, { error: "Couldn't change the password right now. Please try again in a moment." });
  }
}
