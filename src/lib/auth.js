// Talks to the serverless /api functions. The password is only ever checked
// on the server; the browser just holds an httpOnly cookie it can't read.

async function call(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, data };
}

/** Returns { user, role } for the signed-in person, or null. Throws if the server can't be reached. */
export async function fetchSession() {
  const { status, data } = await call('/api/me');
  if (status === 200 && data.user) return { user: data.user, role: data.role || 'staff' };
  if (status === 401) return null;
  throw new Error('Could not check your session.');
}

/** Returns { user, role } on success or { error } with a message to show. */
export async function login(username, password) {
  try {
    const { status, data } = await call('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (status === 200 && data.user) return { user: data.user, role: data.role || 'staff' };
    return { error: data.error || 'Could not sign in. Please try again.' };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}

/** Returns { user, saved, entry } on success or { error }.
 *  saved=true  -> account was written to .env.local (local dev), can sign in now.
 *  saved=false -> deployed site: `entry` must be added to AUTH_USERS in Vercel. */
export async function signup(username, password) {
  try {
    const { status, data } = await call('/api/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if ((status === 200 || status === 201) && data.entry) {
      return { user: data.user, saved: !!data.saved, entry: data.entry };
    }
    return { error: data.error || 'Could not create the account. Please try again.', entry: data.entry };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}

export async function logout() {
  try { await call('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
}
