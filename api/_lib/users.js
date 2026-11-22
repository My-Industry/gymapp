// Who is who: accounts come from AUTH_USERS (environment) and, when GOOGLE_SHEET_ID_server
// is set, from the accounts sheet. These checks are async because the sheet is a network call.
//
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.

import {
  COOKIE_NAME, burnTime, normalizeUsername, parseCookies, readConfig, roleOf, verifyPassword, verifyToken,
} from './auth.js';
import { getAccountStore } from './accounts.js';

/**
 * Checks a username and password. Returns { user, role }, or null when they are wrong.
 * Throws if the accounts sheet can't be reached. Accounts in AUTH_USERS win over the sheet.
 */
export async function authenticate(env, username, password) {
  const config = readConfig(env);
  const name = normalizeUsername(username);
  const pw = String(password ?? '');

  const envHash = config.users?.get(name);
  if (envHash) return verifyPassword(pw, envHash) ? { user: name, role: roleOf(config, name) } : null;

  const store = getAccountStore(env);
  const account = store ? await store.findByUsername(name) : null;
  if (!account) {
    burnTime(pw); // a wrong username takes as long as a wrong password
    return null;
  }
  return verifyPassword(pw, account.hash) ? { user: name, role: account.role } : null;
}

/** { user, role } for this request, or null. Removing an account signs that person out. */
export async function getSession(req, env = process.env) {
  const config = readConfig(env);
  if (!config.ok) return null;
  const user = verifyToken(parseCookies(req.headers?.cookie)[COOKIE_NAME], config.secret);
  if (!user) return null;
  if (config.users.has(user)) return { user, role: roleOf(config, user) };

  const store = getAccountStore(env);
  if (!store) return null;
  try {
    const account = await store.findByUsername(user);
    return account ? { user, role: account.role } : null;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}
