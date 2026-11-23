// The Google Sheet a gym connects in Profile -> Google Sheets -> Connect.
//   GET    /api/connection  -> { connected, serviceEmail, sheetLink, sheetId }   (never the key)
//   POST   /api/connection  body { serviceEmail, privateKey, sheetLink }  -> { connected: true, ... }
//   DELETE /api/connection  -> { connected: false }
// Saved in the Accounts tab of the server sheet (GOOGLE_SHEET_ID_server); the private key is encrypted.
// Admins only.

import { createPrivateKey } from 'node:crypto';
import { readBody, sendJson } from './_lib/auth.js';
import { getAccountStore } from './_lib/accounts.js';
import { boxSecret, encryptSecret } from './_lib/secretBox.js';
import { createGoogleClient, normalizePrivateKey, parseSheetId } from './_lib/sheets.js';
import { getSession } from './_lib/users.js';

const SERVICE_EMAIL = /^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/i;

/** Signs in with the given key and reads the sheet. Returns its title. Replaceable in tests. */
export const hooks = {
  async checkSheet(config) {
    const meta = await createGoogleClient(config).call('?fields=properties.title');
    return meta.properties?.title || '';
  },
};

const view = (account) => {
  const connected = Boolean(account?.keyEnc && account.serviceEmail && account.sheetLink);
  return {
    connected,
    ...(connected && {
      serviceEmail: account.serviceEmail,
      sheetLink: account.sheetLink,
      sheetId: parseSheetId(account.sheetLink),
    }),
  };
};

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Please sign in again.' });
  if (session.role !== 'admin') return sendJson(res, 403, { error: 'Only an admin can connect a Google Sheet.' });

  const accounts = getAccountStore();
  if (!accounts) {
    return sendJson(res, 503, { error: 'The accounts sheet is not set up on the server yet (GOOGLE_SHEET_ID_server).' });
  }

  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, view(await accounts.findByUsername(session.user)));
    }

    if (req.method === 'DELETE') {
      await accounts.setConnection(session.user, null);
      return sendJson(res, 200, { connected: false });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const serviceEmail = String(body.serviceEmail ?? '').trim().toLowerCase();
      const privateKey = normalizePrivateKey(body.privateKey);
      const sheetLink = String(body.sheetLink ?? '').trim();
      const sheetId = parseSheetId(sheetLink);

      if (!SERVICE_EMAIL.test(serviceEmail)) {
        return sendJson(res, 400, { error: "That doesn't look like a service account email. It ends with .gserviceaccount.com." });
      }
      try {
        createPrivateKey(privateKey);
      } catch {
        return sendJson(res, 400, { error: "That private key isn't valid. Copy the whole private_key value, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----." });
      }
      if (!sheetId || sheetLink.length > 500) {
        return sendJson(res, 400, { error: 'Paste the link of your Google Sheet (or just its ID).' });
      }
      if (!boxSecret()) {
        return sendJson(res, 500, { error: 'AUTH_SECRET is not set on the server, so the key cannot be stored safely.' });
      }

      // Prove it works before saving: sign in to Google and open the sheet.
      let title;
      try {
        title = await hooks.checkSheet({ ok: true, email: serviceEmail, key: privateKey, sheetId });
      } catch (err) {
        return sendJson(res, 400, { error: err.message || "Couldn't open that sheet with those details." });
      }

      await accounts.setConnection(
        session.user,
        { serviceEmail, keyEnc: encryptSecret(privateKey, boxSecret()), sheetLink },
        { role: session.role },
      );
      return sendJson(res, 200, { ...view({ keyEnc: 'x', serviceEmail, sheetLink }), title });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err.message); // never log the request body: it holds the key
    return sendJson(res, 503, { error: "Couldn't reach the accounts sheet. Please try again in a moment." });
  }
}
