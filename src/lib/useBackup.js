import { useCallback, useEffect, useRef, useState } from 'react';
import { CLIENT_IDS } from './backup/config.js';
import { loadBackupSettings, saveBackupSettings, EMPTY_SETTINGS } from './backup/settings.js';
import { runBackup, connectGoogle, connectMicrosoft, disconnect } from './backup/engine.js';

const DEBOUNCE_MS = 1500;

// status: 'off' (nothing connected) | 'idle' | 'syncing' | 'ok' | 'reconnect' | 'error'
export default function useBackup(members) {
  const [settings, setSettings] = useState(loadBackupSettings);
  const [status, setStatus] = useState(() => (loadBackupSettings().provider ? 'idle' : 'off'));
  const [error, setError] = useState('');

  const membersRef = useRef(members);
  membersRef.current = members;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastSeen = useRef(members);
  const latestRun = useRef(0);

  const update = useCallback((next) => {
    settingsRef.current = next;
    setSettings(next);
    saveBackupSettings(next);
  }, []);

  const backupNow = useCallback(async ({ interactive = false } = {}) => {
    const current = settingsRef.current;
    if (!current.provider) return false;
    const run = ++latestRun.current;
    setStatus('syncing');
    setError('');
    try {
      // Always back up the newest members, even if more changes arrive mid-way.
      const result = await runBackup({ settings: current, members: membersRef.current, clientIds: CLIENT_IDS, interactive });
      if (run !== latestRun.current) return true; // a newer backup superseded this one
      const next = { ...settingsRef.current, lastBackupAt: new Date().toISOString() };
      if (result.webUrl && next.microsoft) next.microsoft = { ...next.microsoft, webUrl: result.webUrl };
      update(next);
      setStatus('ok');
      return true;
    } catch (err) {
      if (run !== latestRun.current) return false;
      setStatus(err.code === 'reconnect' ? 'reconnect' : 'error');
      setError(err.message || 'Backup failed.');
      return false;
    }
  }, [update]);

  // Back up shortly after the members change (not on first load).
  useEffect(() => {
    if (lastSeen.current === members) return undefined; // first load (also safe under StrictMode)
    lastSeen.current = members;
    if (!settingsRef.current.provider) return undefined;
    const timer = setTimeout(() => backupNow(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [members, backupNow]);

  /** Returns { ok } | { needsConfirm, message } | { error }. Call from a click. */
  const connect = useCallback(async (provider, { input, confirmed }) => {
    setError('');
    try {
      const args = { members: membersRef.current, confirmed };
      const result = provider === 'google'
        ? await connectGoogle({ ...args, clientId: CLIENT_IDS.google, sheetInput: input })
        : await connectMicrosoft({ ...args, clientId: CLIENT_IDS.microsoft, pathInput: input });
      if (result.needsConfirm) return result;
      update(result.settings);
      setStatus('ok');
      return { ok: true };
    } catch (err) {
      return { error: err.message || 'Could not connect.' };
    }
  }, [update]);

  const disconnectBackup = useCallback(async () => {
    const current = settingsRef.current;
    latestRun.current++;
    await disconnect(current, CLIENT_IDS);
    update({ ...EMPTY_SETTINGS });
    setStatus('off');
    setError('');
  }, [update]);

  return { settings, status, error, backupNow, connect, disconnect: disconnectBackup, clientIds: CLIENT_IDS };
}
