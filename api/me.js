import { sendJson } from './_lib/auth.js';
import { getSession } from './_lib/users.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const session = await getSession(req);
  return session ? sendJson(res, 200, session) : sendJson(res, 401, { user: null });
}
