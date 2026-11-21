// Members live in a private Google Sheet. The server signs in to Google as a
// "service account" (a robot user that only sees sheets you share with it),
// so no member data ever touches the browser's storage or a public service.
//
// Config (environment variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   client_email from the service account's JSON key
//   GOOGLE_PRIVATE_KEY             private_key from the same JSON key (keep the \n escapes)
//   GOOGLE_SHEET_ID                the spreadsheet's id, or its full link
//
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.

import { createSign } from 'node:crypto';
import { HEADERS, SHEET_NAME, memberToRow, rowToMember } from '../../src/lib/backup/rows.js';
import { nextMemberId, normalizePhone, validateMember } from '../../src/lib/members.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const LAST_COLUMN = String.fromCharCode(64 + HEADERS.length); // "I"
const RANGE = `${SHEET_NAME}!A:${LAST_COLUMN}`;

export class SheetsError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code; // 'not-configured' | 'forbidden' | 'not-found' | 'busy' | 'failed'
    this.status = status;
  }
}

// ---- config --------------------------------------------------------------

/** Accepts a bare id or a docs.google.com/spreadsheets/d/<id>/... link. */
export function parseSheetId(input) {
  const s = String(input || '').trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}

/** Env vars often hold the key wrapped in quotes with literal "\n" in place of line breaks. */
export function normalizePrivateKey(raw) {
  return String(raw || '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\n/g, '\n');
}

export function readSheetConfig(env = process.env) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const key = normalizePrivateKey(env.GOOGLE_PRIVATE_KEY);
  const sheetId = parseSheetId(env.GOOGLE_SHEET_ID);
  if (!email || !key.includes('PRIVATE KEY') || !sheetId) return { ok: false };
  return { ok: true, email, key, sheetId };
}

// ---- Google sign-in (service account JWT) --------------------------------

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export function signJwt({ email, key }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
  return `${unsigned}.${signature}`;
}

// ---- the store -----------------------------------------------------------

function friendlyError(status, body, config) {
  const detail = body?.error?.message || '';
  if (status === 403) {
    return new SheetsError('forbidden',
      `Google refused access. Share the sheet with ${config.email} and give it Editor access.`, 502);
  }
  if (status === 404) {
    return new SheetsError('not-found', 'Google Sheet not found. Check GOOGLE_SHEET_ID.', 502);
  }
  if (status === 429) {
    return new SheetsError('busy', 'Google is rate-limiting requests. Wait a few seconds and try again.', 503);
  }
  return new SheetsError('failed', `Google Sheets error (${status})${detail ? `: ${detail}` : ''}`, 502);
}

/** `fetchImpl` is injectable so the logic can be tested without the network. */
export function createSheetStore(config, fetchImpl = fetch) {
  let token = null; // { value, expiresAt }

  async function getToken() {
    if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signJwt(config),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new SheetsError('failed',
        `Could not sign in to Google (${body.error_description || body.error || res.status}). Check the service account email and key.`);
    }
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
    return token.value;
  }

  async function call(path, init = {}) {
    const res = await fetchImpl(`${API}/${config.sheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw friendlyError(res.status, body, config);
    return body;
  }

  /** The tab's numeric id, creating the tab if it doesn't exist yet. */
  async function tabId() {
    const meta = await call('?fields=sheets.properties(sheetId,title)');
    const found = (meta.sheets || []).find((s) => s.properties?.title === SHEET_NAME);
    if (found) return found.properties.sheetId;
    const made = await call(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
    });
    return made.replies[0].addSheet.properties.sheetId;
  }

  /** Every non-empty row of the tab; row 1 is the header when it looks like one. */
  async function readRows() {
    let body;
    try {
      body = await call(`/values/${encodeURIComponent(RANGE)}?valueRenderOption=FORMATTED_VALUE`);
    } catch (err) {
      // 400 "Unable to parse range" = the Members tab doesn't exist yet.
      if (err.code === 'failed' && /parse range/i.test(err.message)) {
        await tabId();
        return { rows: [], hasHeader: false };
      }
      throw err;
    }
    const rows = body.values || [];
    return { rows, hasHeader: String(rows[0]?.[0] ?? '').trim() === HEADERS[0] };
  }

  function parseMembers({ rows, hasHeader }) {
    return rows.slice(hasHeader ? 1 : 0).map(rowToMember).filter(Boolean);
  }

  return {
    async list() {
      return parseMembers(await readRows());
    },

    /**
     * Adds members that were already validated. Phones that are already in the
     * sheet are skipped; an id that is already taken is replaced with a fresh one
     * (another device may have added a member in the meantime).
     * Returns { members: <whole list>, skipped: [{ name, phone, reason }] }.
     */
    async add(incoming) {
      const state = await readRows();
      const existing = parseMembers(state);
      const phones = new Set(existing.map((m) => m.phone));
      const ids = new Set(existing.map((m) => m.id));
      const written = [];
      const skipped = [];

      for (const m of incoming) {
        if (phones.has(m.phone)) {
          skipped.push({ name: m.name, phone: m.phone, reason: 'Phone already registered' });
          continue;
        }
        const member = ids.has(m.id) ? { ...m, id: nextMemberId([...existing, ...written]) } : m;
        written.push(member);
        phones.add(member.phone);
        ids.add(member.id);
      }

      if (written.length) {
        const values = written.map(memberToRow);
        await call(`/values/${encodeURIComponent(RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: 'POST',
          body: JSON.stringify({ values: state.rows.length ? values : [HEADERS, ...values] }),
        });
      }
      return { members: [...existing, ...written], skipped };
    },

    /** Deletes the member's row. Returns { members: <remaining list> }. */
    async remove(id) {
      const state = await readRows();
      const start = state.hasHeader ? 1 : 0;
      const at = state.rows.findIndex((row, i) => i >= start && String(row[0] ?? '').trim() === id);
      if (at !== -1) {
        await call(':batchUpdate', {
          method: 'POST',
          body: JSON.stringify({
            requests: [{
              deleteDimension: {
                range: { sheetId: await tabId(), dimension: 'ROWS', startIndex: at, endIndex: at + 1 },
              },
            }],
          }),
        });
        state.rows.splice(at, 1);
      }
      return { members: parseMembers(state) };
    },
  };
}

let shared = null;
/** One store per server instance so the Google token is reused between requests. */
export function getStore(env = process.env) {
  const config = readSheetConfig(env);
  if (!config.ok) {
    throw new SheetsError('not-configured',
      'Google Sheet storage is not set up. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID (see README).', 503);
  }
  const fingerprint = `${config.email}|${config.sheetId}|${config.key.length}`;
  if (!shared || shared.fingerprint !== fingerprint) shared = { fingerprint, store: createSheetStore(config) };
  return shared.store;
}

// ---- request validation --------------------------------------------------

export const MAX_BATCH = 1000;
const ID_RULE = /^GYM-\d{1,9}$/;

/**
 * Re-checks members sent by the browser (never trust the client). Returns
 * { members } with cleaned values, or { error }.
 */
export function cleanIncoming(list) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'No members to save.' };
  if (list.length > MAX_BATCH) return { error: `Too many members at once (max ${MAX_BATCH}).` };
  const members = [];
  for (const raw of list) {
    const { errors, member } = validateMember(raw || {}, []);
    if (errors.length) return { error: `${String(raw?.name || 'A member')}: ${errors[0]}` };
    if (!ID_RULE.test(String(raw.id))) return { error: 'A member has an invalid id.' };
    const createdAt = String(raw.createdAt || new Date().toISOString());
    members.push({ ...member, phone: normalizePhone(member.phone), id: String(raw.id), createdAt });
  }
  return { members };
}
