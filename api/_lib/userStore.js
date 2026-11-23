// Picks the Google Sheet that holds THIS person's members: the sheet they connected in Profile
// (their own service account + sheet link, saved in the Accounts tab), or, when they haven't
// connected one, the default sheet from the server's environment variables.
//
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.

import { getAccountStore } from './accounts.js';
import { decryptSecret, boxSecret } from './secretBox.js';
import { SheetsError, createSheetStore, getStore, parseSheetId } from './sheets.js';

const MAX_STORES = 50;
const stores = new Map(); // fingerprint -> store, so a gym's Google token is reused between requests

export async function storeFor(session, env = process.env) {
  const accounts = getAccountStore(env);
  const account = accounts && session?.user ? await accounts.findByUsername(session.user) : null;

  if (account?.keyEnc && account.serviceEmail && account.sheetLink) {
    const key = decryptSecret(account.keyEnc, boxSecret(env));
    const sheetId = parseSheetId(account.sheetLink);
    if (!key || !sheetId) {
      throw new SheetsError('failed',
        "Your saved Google connection can't be read. Open Profile and connect your sheet again.", 502);
    }
    const fingerprint = `${account.username}|${account.serviceEmail}|${sheetId}|${account.keyEnc.slice(-16)}`;
    if (!stores.has(fingerprint)) {
      if (stores.size >= MAX_STORES) stores.clear();
      stores.set(fingerprint, createSheetStore({ ok: true, email: account.serviceEmail, key, sheetId }));
    }
    return stores.get(fingerprint);
  }
  return getStore(env);
}
