// Connects the pieces: sign in -> send the members to the chosen sheet/file.
import { membersToRows } from './rows.js';
import { BackupError } from './errors.js';
import { getGoogleToken, clearStoredGoogleToken, revokeGoogle } from './googleAuth.js';
import {
  parseSpreadsheetId, createSpreadsheet, inspectSpreadsheet, addMembersTab, writeRows,
} from './googleApi.js';
import { signInMicrosoft, getMicrosoftToken, signOutMicrosoft } from './microsoftAuth.js';
import { normalizeOneDrivePath, getFile, uploadMembers } from './microsoftApi.js';

/** Pushes `members` to whatever `settings` points at. Throws BackupError. */
export async function runBackup({ settings, members, clientIds, interactive = false }) {
  if (settings.provider === 'google') {
    const token = await getGoogleToken(clientIds.google, { interactive });
    try {
      await writeRows(token, settings.google.spreadsheetId, membersToRows(members));
    } catch (err) {
      if (err instanceof BackupError && err.code === 'reconnect') clearStoredGoogleToken();
      throw err;
    }
    return {};
  }
  if (settings.provider === 'microsoft') {
    const token = await getMicrosoftToken(clientIds.microsoft, { interactive });
    const { webUrl } = await uploadMembers(token, settings.microsoft.path, members);
    return { webUrl };
  }
  throw new BackupError('failed', 'No backup destination is connected.');
}

/**
 * First-time connection to Google. Call from a button click (opens a popup).
 *   sheetInput    "" -> create a new spreadsheet; otherwise a link/id of an existing one
 *   confirmed     true once the admin agreed to replace an existing "Members" tab
 * Returns { settings } on success or { needsConfirm: true, message } when the
 * admin must agree before data is overwritten.
 */
export async function connectGoogle({ clientId, sheetInput, confirmed, members }) {
  const token = await getGoogleToken(clientId, { interactive: true });
  let target;
  if (String(sheetInput ?? '').trim()) {
    const id = parseSpreadsheetId(sheetInput);
    if (!id) throw new BackupError('failed', "That doesn't look like a Google Sheets link.");
    const info = await inspectSpreadsheet(token, id);
    if (info.tabExists && !confirmed) {
      return {
        needsConfirm: true,
        message: `"${info.title}" already has a tab called "Members". Its contents will be replaced on every backup.`,
      };
    }
    if (!info.tabExists) await addMembersTab(token, id);
    target = { spreadsheetId: info.spreadsheetId, url: info.url, title: info.title };
  } else {
    target = await createSpreadsheet(token, 'Gym Manager Members');
  }
  await writeRows(token, target.spreadsheetId, membersToRows(members));
  return { settings: { provider: 'google', google: target, microsoft: null, lastBackupAt: new Date().toISOString() } };
}

/** First-time connection to OneDrive. Same return shape as connectGoogle. */
export async function connectMicrosoft({ clientId, pathInput, confirmed, members }) {
  const norm = normalizeOneDrivePath(pathInput);
  if (norm.error) throw new BackupError('failed', norm.error);
  const { token, account } = await signInMicrosoft(clientId);
  if (!confirmed && (await getFile(token, norm.path))) {
    return {
      needsConfirm: true,
      message: `A file already exists at "${norm.path}" in your OneDrive. It will be replaced on every backup.`,
    };
  }
  const { webUrl } = await uploadMembers(token, norm.path, members);
  return {
    settings: {
      provider: 'microsoft',
      google: null,
      microsoft: { path: norm.path, webUrl, account },
      lastBackupAt: new Date().toISOString(),
    },
  };
}

export async function disconnect(settings, clientIds) {
  if (settings.provider === 'google') await revokeGoogle();
  if (settings.provider === 'microsoft') await signOutMicrosoft(clientIds.microsoft);
}
