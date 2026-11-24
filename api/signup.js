import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { hashPassword, normalizeUsername, parseUsers, readBody, sendJson } from './_lib/auth.js';
import { validateNewUser, validateEmail, addUserToEnvText, isLocalRequest } from './_lib/signup.js';
import { getAccountStore } from './_lib/accounts.js';
import { sendWelcomeEmail } from './_lib/mailer.js';
import { appBaseUrl } from './_lib/resetToken.js';

// With GOOGLE_SHEET_ID_server set, new accounts are saved in that sheet (username, password hash,
// email) and work immediately, locally and on Vercel. Without it, the older way below is used.
//
// AUTH_ENV_FILE is only set by the local dev server (vite.config.js). When it
// is set and the request comes from this machine, the account is saved to
// .env.local. On Vercel it is never set, so the entry is just returned.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { username, password, email, acceptedTerms } = readBody(req);
  const problem = validateNewUser(username, password);
  if (problem) return sendJson(res, 400, { error: problem });
  if (acceptedTerms !== true) {
    return sendJson(res, 400, { error: 'Please accept the Terms and Conditions to create an account.' });
  }

  const name = normalizeUsername(username);
  if (parseUsers(process.env.AUTH_USERS).has(name)) {
    return sendJson(res, 409, { error: 'That username is already taken.' });
  }

  const hash = hashPassword(password);

  const accounts = getAccountStore();
  if (accounts) return signUpInSheet(req, res, accounts, { name, hash, email });

  const entry = `${name}:${hash}`;

  const file = process.env.AUTH_ENV_FILE;
  if (!file || !isLocalRequest(req)) {
    return sendJson(res, 200, { saved: false, user: name, entry });
  }

  try {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const result = addUserToEnvText(text, name, hash);
    if (result.duplicate) return sendJson(res, 409, { error: 'That username is already taken.' });
    writeFileSync(file, result.text);
    process.env.AUTH_USERS = result.users; // usable immediately, no restart
    process.env.AUTH_SECRET = result.secret;
    return sendJson(res, 201, { saved: true, user: name, entry });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: "Couldn't save to .env.local. Add this account manually instead.", entry });
  }
}

async function signUpInSheet(req, res, accounts, { name, hash, email }) {
  const mail = validateEmail(email);
  if (mail.error) return sendJson(res, 400, { error: mail.error });
  if (String(process.env.AUTH_SECRET || '').length < 32) {
    return sendJson(res, 500, { error: 'AUTH_SECRET is not set on the server, so nobody can sign in yet (see README).' });
  }
  try {
    // Everyone who signs up is the admin of their own account. Staff accounts will be added later
    // from an "Add staff" section, not from this page.
    await accounts.add({ username: name, hash, email: mail.email, role: 'admin' });
    // The account exists now, so a failed email must never fail the sign up. Awaited (not fire-and-forget)
    // because a serverless function can be stopped as soon as it has responded.
    try {
      await sendWelcomeEmail({ to: mail.email, username: name, appUrl: appBaseUrl(process.env, req) });
    } catch (err) {
      console.error(`Welcome email not sent: ${err.message}`);
    }
    return sendJson(res, 201, { saved: true, storage: 'sheet', user: name });
  } catch (err) {
    if (err.code === 'conflict') return sendJson(res, 409, { error: err.message });
    console.error(err.message);
    return sendJson(res, 503, { error: "Couldn't save the account to the accounts sheet. Please try again in a moment." });
  }
}
