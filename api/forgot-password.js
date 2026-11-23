// POST /api/forgot-password { email }
// Creates a one-time reset link (valid 1 hour) and hands it to the mailer. The answer is always the
// same, whether or not the email has an account, so this can't be used to find out who is registered.

import { randomBytes } from 'node:crypto';
import { readBody, sendJson } from './_lib/auth.js';
import { getAccountStore } from './_lib/accounts.js';
import { validateEmail } from './_lib/signup.js';
import { sendPasswordResetEmail } from './_lib/mailer.js';
import { RESET_MINUTES, hashToken, resetLink } from './_lib/resetToken.js';

const REPEAT_WAIT_MS = 60_000; // ignore a second request from the same account within a minute
const SAME_ANSWER = { ok: true, message: "If that email has an account, we've sent a link to reset the password." };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const accounts = getAccountStore();
  if (!accounts) {
    return sendJson(res, 503, { error: "Password reset isn't available on this server yet." });
  }
  const mail = validateEmail(readBody(req).email);
  if (mail.error) return sendJson(res, 400, { error: mail.error });

  try {
    const account = await accounts.findByEmail(mail.email);
    if (account && !(await accounts.hasRecentReset(account.username, REPEAT_WAIT_MS))) {
      const token = randomBytes(32).toString('base64url');
      await accounts.createReset({
        username: account.username,
        tokenHash: hashToken(token),
        expiresAt: Date.now() + RESET_MINUTES * 60_000,
      });
      await sendPasswordResetEmail({ to: account.email, username: account.username, link: resetLink(token, process.env, req) });
    }
  } catch (err) {
    console.error(err.message);
    return sendJson(res, 503, { error: "Couldn't process that right now. Please try again in a moment." });
  }
  return sendJson(res, 200, SAME_ANSWER);
}
