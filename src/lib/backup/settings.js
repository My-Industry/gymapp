// Which sheet this browser backs up to. Kept in this browser's localStorage
// (only ids and links — no passwords or tokens).

const KEY = 'gym-manager.backup.v1';

export const EMPTY_SETTINGS = Object.freeze({
  provider: null, // 'google' | 'microsoft' | null
  google: null, // { spreadsheetId, url, title }
  microsoft: null, // { path, webUrl, account }
  lastBackupAt: null, // ISO time of the last successful backup
});

function store(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

export function loadBackupSettings(storage) {
  try {
    const raw = store(storage)?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_SETTINGS };
    const provider = parsed.provider === 'google' && parsed.google?.spreadsheetId ? 'google'
      : parsed.provider === 'microsoft' && parsed.microsoft?.path ? 'microsoft'
        : null;
    return {
      provider,
      google: parsed.google ?? null,
      microsoft: parsed.microsoft ?? null,
      lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function saveBackupSettings(settings, storage) {
  try {
    store(storage)?.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
