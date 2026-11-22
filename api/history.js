// GET /api/history -> { months: [{ month: "Nov-2026", rows: [...] }, ...] }  (newest first)
// The monthly record tabs of the Google Sheet. Needs a signed-in session.

import { sendJson } from './_lib/auth.js';
import { getSession } from './_lib/users.js';
import { SheetsError } from './_lib/sheets.js';
import { storeFor } from './_lib/userStore.js';

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Please sign in again.' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    return sendJson(res, 200, await (await storeFor(session)).history());
  } catch (err) {
    if (err instanceof SheetsError) {
      if (err.code !== 'not-configured') console.error(err.message);
      return sendJson(res, err.status, { error: err.message, code: err.code });
    }
    console.error(err);
    return sendJson(res, 500, { error: 'Server error' });
  }
}
