import { getSession, sendJson } from './_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const session = getSession(req);
  return session ? sendJson(res, 200, session) : sendJson(res, 401, { user: null });
}
