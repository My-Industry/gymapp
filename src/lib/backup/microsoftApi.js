// OneDrive (Microsoft Graph) calls. The backup is a single .xlsx file that is
// replaced on every backup. `fetchImpl` is injectable for tests.
import { SHEET_NAME, membersToRows } from './rows.js';
import { BackupError, errorFromResponse } from './errors.js';

const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/root:';
export const DEFAULT_PATH = 'Gym Manager/Members.xlsx';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Cleans what the admin typed. Returns { path } or { error }. */
export function normalizeOneDrivePath(input) {
  let p = String(input ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return { error: 'Enter a file name, e.g. Gym Manager/Members.xlsx' };
  if (!/\.xlsx$/i.test(p)) p += '.xlsx';
  const parts = p.split('/');
  if (parts.some((s) => !s.trim() || s === '.' || s === '..')) return { error: 'That file path is not valid.' };
  if (parts.some((s) => /["*:<>?|]/.test(s) || /[. ]$/.test(s))) {
    return { error: 'File and folder names can\'t contain " * : < > ? | or end with a dot or space.' };
  }
  return { path: parts.join('/') };
}

export function itemUrl(path, suffix = '') {
  return `${GRAPH}/${path.split('/').map(encodeURIComponent).join('/')}${suffix}`;
}

async function send(url, token, options, fetchImpl = fetch) {
  try {
    return await fetchImpl(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  } catch {
    throw new BackupError('failed', "Couldn't reach OneDrive. Check your internet connection.");
  }
}

/** The file's info, or null when nothing exists at that path. */
export async function getFile(token, path, fetchImpl) {
  const res = await send(itemUrl(path), token, {}, fetchImpl);
  if (res.status === 404) return null;
  if (!res.ok) throw await errorFromResponse(res, 'the OneDrive file');
  const item = await res.json();
  return { webUrl: item.webUrl };
}

/** Builds the .xlsx bytes for a list of members (SheetJS is loaded on demand). */
export async function buildWorkbookBytes(members) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(membersToRows(members));
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/** Creates or replaces the file. Returns { webUrl }. */
export async function uploadMembers(token, path, members, fetchImpl) {
  const bytes = await buildWorkbookBytes(members);
  const res = await send(itemUrl(path, ':/content'), token, {
    method: 'PUT',
    headers: { 'Content-Type': XLSX_TYPE },
    body: bytes,
  }, fetchImpl);
  if (!res.ok) throw await errorFromResponse(res, 'the OneDrive file');
  const item = await res.json();
  return { webUrl: item.webUrl };
}
