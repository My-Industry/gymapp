// GET /api/history -> { months: [{ month: "Nov-2026", rows: [...] }, ...] }  (newest first)
// The monthly record tabs of the Google Sheet. Needs a signed-in session.

import { getSession, sendJson } from './_lib/auth.js';
import { SheetsError, getStore } from './_lib/sheets.js';

export default async function handler(req, res) {
  if (!getSession(req)) return sendJson(res, 401, { error: 'Please sign in again.' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    return sendJson(res, 200, await getStore().history());
  } catch (err) {
    if (err instanceof SheetsError) {
      if (err.code !== 'not-configured') console.error(err.message);
      return sendJson(res, err.status, { error: err.message, code: err.code });
    }
    console.error(err);
    return sendJson(res, 500, { error: 'Server error' });
  }
}
