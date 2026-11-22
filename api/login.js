import {
  readConfig, createToken, sessionCookie, isSecureRequest, readBody, sendJson,
} from './_lib/auth.js';
import { authenticate } from './_lib/users.js';

const FAIL_DELAY_MS = 500; // slows down password guessing

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const config = readConfig();
  if (!config.ok) {
    return sendJson(res, 500, { error: 'Login is not set up on the server yet (AUTH_SECRET, plus AUTH_USERS or GOOGLE_SHEET_ID_server).' });
  }

  const { username, password } = readBody(req);
  let session;
  try {
    session = await authenticate(process.env, username, password);
  } catch (err) {
    console.error(err.message);
    return sendJson(res, 503, { error: "Can't reach the accounts sheet right now. Please try again in a moment." });
  }
  if (!session) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return sendJson(res, 401, { error: 'Incorrect username or password.' });
  }

  res.setHeader('Set-Cookie', sessionCookie(createToken(session.user, config.secret), { secure: isSecureRequest(req) }));
  return sendJson(res, 200, session);
}
