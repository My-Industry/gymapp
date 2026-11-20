import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { hashPassword, normalizeUsername, parseUsers, readBody, sendJson } from './_lib/auth.js';
import { validateNewUser, addUserToEnvText, isLocalRequest } from './_lib/signup.js';

// AUTH_ENV_FILE is only set by the local dev server (vite.config.js). When it
// is set and the request comes from this machine, the account is saved to
// .env.local. On Vercel it is never set, so the entry is just returned.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { username, password } = readBody(req);
  const problem = validateNewUser(username, password);
  if (problem) return sendJson(res, 400, { error: problem });

  const name = normalizeUsername(username);
  if (parseUsers(process.env.AUTH_USERS).has(name)) {
    return sendJson(res, 409, { error: 'That username is already taken.' });
  }

  const hash = hashPassword(password);
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
