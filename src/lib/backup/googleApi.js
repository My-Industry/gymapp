// Google Sheets REST calls. `token` is an OAuth access token; `fetchImpl` is
// injectable so these can be tested without the network.
import { SHEET_NAME } from './rows.js';
import { BackupError, errorFromResponse } from './errors.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Accepts a full Google Sheets link or a bare spreadsheet id. */
export function parseSpreadsheetId(input) {
  const s = String(input ?? '').trim();
  const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

async function call(url, token, options = {}, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new BackupError('failed', "Couldn't reach Google. Check your internet connection.");
  }
  if (!res.ok) throw await errorFromResponse(res, 'the Google Sheet');
  return res.json();
}

/** Creates a new spreadsheet that already has the Members tab. */
export async function createSpreadsheet(token, title, fetchImpl) {
  const data = await call(BASE, token, {
    method: 'POST',
    body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: SHEET_NAME } }] }),
  }, fetchImpl);
  return { spreadsheetId: data.spreadsheetId, url: data.spreadsheetUrl, title: data.properties?.title ?? title };
}

/** Read-only check of an existing spreadsheet. */
export async function inspectSpreadsheet(token, spreadsheetId, fetchImpl) {
  const fields = 'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title';
  const data = await call(`${BASE}/${spreadsheetId}?fields=${encodeURIComponent(fields)}`, token, {}, fetchImpl);
  const tabs = (data.sheets ?? []).map((s) => s.properties?.title);
  return {
    spreadsheetId: data.spreadsheetId,
    url: data.spreadsheetUrl,
    title: data.properties?.title ?? '',
    tabExists: tabs.includes(SHEET_NAME),
  };
}

export async function addMembersTab(token, spreadsheetId, fetchImpl) {
  await call(`${BASE}/${spreadsheetId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
  }, fetchImpl);
}

/** Replaces everything on the Members tab with `rows`. */
export async function writeRows(token, spreadsheetId, rows, fetchImpl) {
  const id = encodeURIComponent(spreadsheetId);
  await call(`${BASE}/${id}/values/${encodeURIComponent(SHEET_NAME)}:clear`, token, { method: 'POST', body: '{}' }, fetchImpl);
  // RAW keeps phone numbers and dates exactly as text instead of letting Sheets guess.
  await call(
    `${BASE}/${id}/values/${encodeURIComponent(`${SHEET_NAME}!A1`)}?valueInputOption=RAW`,
    token,
    { method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: rows }) },
    fetchImpl,
  );
}
