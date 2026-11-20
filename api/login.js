import {
  readConfig, checkLogin, createToken, sessionCookie, isSecureRequest, readBody, sendJson, roleOf,
} from './_lib/auth.js';

const FAIL_DELAY_MS = 500; // slows down password guessing

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const config = readConfig();
  if (!config.ok) {
    return sendJson(res, 500, { error: 'Login is not set up on the server yet (AUTH_SECRET / AUTH_USERS).' });
  }

  const { username, password } = readBody(req);
  const user = checkLogin(config, username, password);
  if (!user) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return sendJson(res, 401, { error: 'Incorrect username or password.' });
  }

  res.setHeader('Set-Cookie', sessionCookie(createToken(user, config.secret), { secure: isSecureRequest(req) }));
  return sendJson(res, 200, { user, role: roleOf(config, user) });
}
