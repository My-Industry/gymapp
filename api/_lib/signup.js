// Helpers for creating accounts. Accounts live in the AUTH_USERS environment
// variable, so "saving" one means editing .env.local (local dev only). On
// Vercel nothing can be saved at runtime — the entry is handed back to be
// pasted into the Vercel environment variables.

import { randomBytes } from 'node:crypto';
import { normalizeUsername, parseUsers } from './auth.js';
import { MAX_PASSWORD, MIN_PASSWORD, passwordProblem } from '../../src/lib/password.js';

export { MAX_PASSWORD, MIN_PASSWORD };
export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Returns an error message, or '' if the details are fine. */
export function validateNewUser(username, password) {
  const name = normalizeUsername(username);
  if (!USERNAME_RULE.test(name)) {
    return 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.';
  }
  return passwordProblem(password); // at least 8 characters, upper and lower case, a special character
}

export function newSecret() {
  return randomBytes(48).toString('base64url');
}

function readValue(text, key) {
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : '';
}

function setValue(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, () => line);
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
}

/**
 * Adds "name:hash" to AUTH_USERS inside the text of an env file, and makes
 * sure AUTH_SECRET exists. Returns { text, users, secret } or { duplicate: true }.
 */
export function addUserToEnvText(text, name, hash, makeSecret = newSecret) {
  const current = readValue(text, 'AUTH_USERS');
  if (parseUsers(current).has(name)) return { duplicate: true };
  const users = current ? `${current},${name}:${hash}` : `${name}:${hash}`;

  let secret = readValue(text, 'AUTH_SECRET');
  let out = setValue(text, 'AUTH_USERS', users);
  if (secret.length < 32) {
    secret = makeSecret();
    out = setValue(out, 'AUTH_SECRET', secret);
  }
  return { text: out, users, secret };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function isLocalRequest(req) {
  return LOOPBACK.has(req.socket?.remoteAddress);
}

/** Cleans an email address. Returns { email } (lower-case) or { error }. */
export function validateEmail(input) {
  const email = String(input ?? '').trim().toLowerCase();
  if (!email) return { error: 'Email address is required.' };
  if (email.length > 254 || !/^[^\s@,:;<>"()]+@[^\s@,:;<>"()]+\.[^\s@,:;<>"()]{2,}$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  return { email };
}
