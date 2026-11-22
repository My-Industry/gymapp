// GET    /api/members          -> { members }
// POST   /api/members          body { members: [...] }  -> { members, skipped }
// PUT    /api/members          body { member }          -> { members }   (edit one member)
// DELETE /api/members          body { id }              -> { members }
// Every call needs a signed-in session. Data lives in the Google Sheet (see _lib/sheets.js).

import { getSession, readBody, sendJson } from './_lib/auth.js';
import { SheetsError, cleanIncoming, cleanUpdate, getStore } from './_lib/sheets.js';

export default async function handler(req, res) {
  if (!getSession(req)) return sendJson(res, 401, { error: 'Please sign in again.' });

  try {
    const store = getStore();

    if (req.method === 'GET') {
      const members = await store.list();
      // First open of a new month (or after a long break): create the month tab(s). A failure here
      // must not stop the member list from loading.
      let warning;
      try {
        await store.ensureMonths(members);
      } catch (err) {
        console.error(`Monthly tab check failed: ${err.message}`);
        warning = `Couldn't create this month's record: ${err.message}`;
      }
      return sendJson(res, 200, { members, ...(warning && { warning }) });
    }

    if (req.method === 'POST') {
      const { members, error } = cleanIncoming(readBody(req).members);
      if (error) return sendJson(res, 400, { error });
      return sendJson(res, 200, await store.add(members));
    }

    if (req.method === 'PUT') {
      const { member, error } = cleanUpdate(readBody(req).member);
      if (error) return sendJson(res, 400, { error });
      return sendJson(res, 200, await store.update(member));
    }

    if (req.method === 'DELETE') {
      const id = String(readBody(req).id || '').trim();
      if (!id) return sendJson(res, 400, { error: 'Missing member id.' });
      return sendJson(res, 200, await store.remove(id));
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof SheetsError) {
      if (err.code !== 'not-configured') console.error(err.message);
      return sendJson(res, err.status, { error: err.message, code: err.code });
    }
    console.error(err);
    return sendJson(res, 500, { error: 'Server error' });
  }
}
