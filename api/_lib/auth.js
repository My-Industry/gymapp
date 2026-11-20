// Server-side auth helpers shared by the /api functions.
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.
//
// Config (environment variables):
//   AUTH_SECRET  random string, 32+ chars, used to sign the session cookie
//   AUTH_USERS   comma-separated  username:passwordHash  pairs
//                (create each hash with:  npm run hash-password)

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const COOKIE_NAME = 'gym_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60; // 7 days

const KEY_LENGTH = 32;

// ---- passwords -----------------------------------------------------------

/** Returns "scrypt.<salt>.<key>" (base64url). No "$" in it, because .env files
 *  expand "$" — the old "scrypt$salt$key" form is still accepted when verifying. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, KEY_LENGTH);
  return `scrypt.${salt.toString('base64url')}.${key.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split(/[.$]/);
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    if (!salt.length || expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(String(password), salt, KEY_LENGTH);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Used when the username doesn't exist, so a wrong username and a wrong
// password take the same time (no hint about which usernames are valid).
let dummyHash;
function burnTime(password) {
  dummyHash ??= hashPassword('not-a-real-password');
  verifyPassword(password, dummyHash);
}

// ---- config --------------------------------------------------------------

/** Parses AUTH_USERS="owner:scrypt.salt.key,frontdesk:scrypt.salt.key" into a Map. */
export function parseUsers(raw) {
  const users = new Map();
  for (const entry of String(raw || '').split(',')) {
    const i = entry.indexOf(':');
    if (i < 1) continue;
    const name = normalizeUsername(entry.slice(0, i));
    const hash = entry.slice(i + 1).trim();
    if (name && hash) users.set(name, hash);
  }
  return users;
}

export function normalizeUsername(name) {
  return String(name || '').trim().toLowerCase();
}

/** Admins can open Settings. AUTH_ADMINS="owner,manager" lists them; when it is
 *  empty the first account in AUTH_USERS is the admin. */
export function parseAdmins(raw, users) {
  const named = String(raw || '').split(',').map(normalizeUsername).filter((n) => users.has(n));
  if (named.length) return new Set(named);
  const first = users.keys().next().value;
  return new Set(first ? [first] : []);
}

export function readConfig(env = process.env) {
  const secret = env.AUTH_SECRET || '';
  const users = parseUsers(env.AUTH_USERS);
  if (secret.length < 32 || users.size === 0) return { ok: false };
  return { ok: true, secret, users, admins: parseAdmins(env.AUTH_ADMINS, users) };
}

export function roleOf(config, username) {
  return config.admins.has(username) ? 'admin' : 'staff';
}

/** Checks credentials. Returns the canonical username, or null. */
export function checkLogin(config, username, password) {
  const name = normalizeUsername(username);
  const hash = config.users.get(name);
  if (!hash) {
    burnTime(String(password ?? ''));
    return null;
  }
  return verifyPassword(String(password ?? ''), hash) ? name : null;
}

// ---- session token -------------------------------------------------------

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createToken(username, secret, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Math.floor(now / 1000) + SESSION_SECONDS }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the username inside a valid, unexpired token — otherwise null. */
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const wanted = Buffer.from(sign(payload, secret));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.u !== 'string' || typeof data.exp !== 'number') return null;
    if (data.exp * 1000 <= now) return null;
    return data.u;
  } catch {
    return null;
  }
}

// ---- cookies & requests --------------------------------------------------

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function sessionCookie(token, { secure, maxAge = SESSION_SECONDS }) {
  const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie({ secure }) {
  return sessionCookie('', { secure, maxAge: 0 });
}

export function isSecureRequest(req) {
  return String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

/** { user, role } for this request, or null. Re-checks AUTH_USERS so removing
 *  a user from the env var signs them out on the next request. */
export function getSession(req, env = process.env) {
  const config = readConfig(env);
  if (!config.ok) return null;
  const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
  const user = verifyToken(token, config.secret);
  return user && config.users.has(user) ? { user, role: roleOf(config, user) } : null;
}

export function readBody(req) {
  const body = req.body;
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return {};
}

export function sendJson(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}
