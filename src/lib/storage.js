// Members are stored in a private Google Sheet, reached through the signed-in
// /api/members endpoint. The browser keeps nothing except the one-time
// "legacy" copy from the old localStorage version (see loadLegacyMembers).

export class StorageError extends Error {
  constructor(message, { code = 'failed', unauthorized = false } = {}) {
    super(message);
    this.code = code;
    this.unauthorized = unauthorized;
  }
}

async function call(method, body, url = '/api/members') {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new StorageError("Can't reach the server. Check your connection.", { code: 'offline' });
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    throw new StorageError(data.error || `Request failed (${res.status}).`, {
      code: data.code || 'failed',
      unauthorized: res.status === 401,
    });
  }
  return data;
}

/** All members, from the sheet. Returns { members, warning? }. */
export async function loadMembers() {
  return call('GET');
}

/** The monthly records, newest month first: { months: [{ month: "Nov-2026", rows: [...] }] }. */
export async function loadHistory() {
  return call('GET', undefined, '/api/history');
}

/** Saves new members. Returns { members: <whole list>, skipped: [...] }. */
export async function addMembers(list) {
  return call('POST', { members: list });
}

/** Saves changes to one member (matched by id). Returns { members: <whole list> }. */
export async function updateMember(member) {
  return call('PUT', { member });
}

/** Deletes one member. Returns { members: <remaining list> }. */
export async function deleteMember(id) {
  return call('DELETE', { id });
}

// ---- members saved by the old localStorage version -------------------------

const LEGACY_KEY = 'gym-manager.members.v1';

export function loadLegacyMembers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLegacyMembers() {
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
}

// ---- the Google Sheet this gym connected (Profile -> Google Sheets) ----------

/** { connected, serviceEmail?, sheetLink?, sheetId? } - never includes the private key. */
export async function getConnection() {
  return call('GET', undefined, '/api/connection');
}

/** Tests the details against Google, then saves them. Returns { connected, ..., title }. */
export async function connectSheet({ serviceEmail, privateKey, sheetLink }) {
  return call('POST', { serviceEmail, privateKey, sheetLink }, '/api/connection');
}

export async function disconnectSheet() {
  return call('DELETE', undefined, '/api/connection');
}
