// code: 'reconnect' -> the sign-in expired, the admin must click Reconnect
//       'access'    -> signed in, but the sheet/file is missing or not allowed
//       'failed'    -> anything else (network, server error)
export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

/** Turns an HTTP error response from Google or Microsoft into a BackupError. */
export async function errorFromResponse(res, what) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.error_description || '';
  } catch { /* not JSON */ }

  if (res.status === 401) return new BackupError('reconnect', 'Your sign-in expired. Please reconnect.');
  if (res.status === 403 || res.status === 404) {
    return new BackupError('access', `Can't access ${what}. It may have been deleted, or this account no longer has permission.`);
  }
  return new BackupError('failed', `Couldn't reach ${what} (${res.status})${detail ? `: ${detail}` : ''}`);
}
