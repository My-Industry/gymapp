import { useCallback, useEffect, useRef, useState } from 'react';
import MemberForm from './components/MemberForm.jsx';
import MemberList from './components/MemberList.jsx';
import BulkImport from './components/BulkImport.jsx';
import Settings from './components/Settings.jsx';
import BackupChip from './components/BackupChip.jsx';
import useBackup from './lib/useBackup.js';
import {
  loadMembers, addMembers, deleteMember, loadLegacyMembers, clearLegacyMembers,
} from './lib/storage.js';

const TABS = [
  { key: 'members', label: 'Members' },
  { key: 'add', label: 'Add member' },
  { key: 'import', label: 'Import from Excel' },
];

export default function GymApp({ user, role, onLogout }) {
  const [members, setMembers] = useState([]);
  const [load, setLoad] = useState({ status: 'loading', error: '' }); // 'loading' | 'ready' | 'error'
  const [actionError, setActionError] = useState('');
  const [legacy, setLegacy] = useState([]); // members found only in this browser (old version)
  const [migrating, setMigrating] = useState(false);
  const [tab, setTab] = useState('members');
  const backup = useBackup(members);
  const isAdmin = role === 'admin';
  const ready = load.status === 'ready';

  // Changes to the sheet run one at a time so their answers can't arrive out of order.
  const queue = useRef(Promise.resolve());
  const enqueue = (task) => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => {});
    return run;
  };

  const logoutRef = useRef(onLogout);
  logoutRef.current = onLogout;

  const refresh = useCallback(() => {
    setLoad({ status: 'loading', error: '' });
    loadMembers()
      .then((list) => {
        setMembers(list);
        setLoad({ status: 'ready', error: '' });
        const phones = new Set(list.map((m) => m.phone));
        setLegacy(loadLegacyMembers().filter((m) => m?.phone && !phones.has(m.phone)));
      })
      .catch((err) => {
        if (err.unauthorized) { logoutRef.current(); return; }
        setLoad({ status: 'error', error: err.message });
      });
  }, []);

  useEffect(refresh, [refresh]);

  /** Runs a sheet change; on a sign-out or failure rethrows a readable error. */
  const run = (task) => enqueue(async () => {
    setActionError('');
    try {
      return await task();
    } catch (err) {
      if (err.unauthorized) onLogout();
      throw err;
    }
  });

  const addMember = (member) => run(async () => {
    const { members: list, skipped } = await addMembers([member]);
    setMembers(list);
    if (skipped.length) throw new Error(`${skipped[0].name}: ${skipped[0].reason}.`);
    return list.find((m) => m.phone === member.phone) || member;
  });

  const addMany = (batch) => run(async () => {
    const { members: list, skipped } = await addMembers(batch);
    setMembers(list);
    return { saved: batch.length - skipped.length, skipped };
  });

  const removeMember = (id) => {
    run(async () => setMembers((await deleteMember(id)).members))
      .catch((err) => setActionError(`Couldn't delete: ${err.message}`));
  };

  const uploadLegacy = () => {
    setMigrating(true);
    run(async () => {
      const { members: list } = await addMembers(legacy);
      setMembers(list);
      clearLegacyMembers();
      setLegacy([]);
    })
      .catch((err) => setActionError(`Couldn't upload the old members: ${err.message}`))
      .finally(() => setMigrating(false));
  };

  const dismissLegacy = () => {
    if (window.confirm('Forget the members saved only in this browser? They will not be uploaded.')) {
      clearLegacyMembers();
      setLegacy([]);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>🏋️</span>
          <div>
            <h1>Gym Manager</h1>
            <p>{ready ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Google Sheet'}</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <BackupChip backup={backup} />
          <button
            className={tab === 'settings' ? 'user-icon active' : 'user-icon'}
            title={`Profile — ${user}${isAdmin ? ' (admin)' : ''}`}
            aria-label={`Profile (signed in as ${user}${isAdmin ? ', admin' : ''})`}
            onClick={() => setTab('settings')}
            disabled={!isAdmin}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
          </button>
          <button className="secondary small" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      {load.status === 'error' && (
        <div className="alert error">
          Couldn't load members from Google Sheets. {load.error}{' '}
          <button className="secondary small" onClick={refresh}>Try again</button>
        </div>
      )}
      {actionError && <div className="alert error">{actionError}</div>}
      {ready && legacy.length > 0 && (
        <div className="alert success">
          {legacy.length} member{legacy.length === 1 ? ' is' : 's are'} saved only in this browser (from the old version).{' '}
          <button className="primary small" onClick={uploadLegacy} disabled={migrating}>
            {migrating ? 'Uploading…' : 'Upload to the sheet'}
          </button>{' '}
          <button className="secondary small" onClick={dismissLegacy} disabled={migrating}>Discard</button>
        </div>
      )}

      <main>
        {load.status === 'loading' && <p className="muted">Loading members…</p>}
        {ready && tab === 'members' && (
          <MemberList members={members} onDelete={removeMember} onAddClick={() => setTab('add')} />
        )}
        {ready && tab === 'add' && <MemberForm members={members} onAdd={addMember} />}
        {ready && tab === 'import' && (
          <BulkImport members={members} onImport={addMany} onDone={() => setTab('members')} />
        )}
        {tab === 'settings' && isAdmin && <Settings backup={backup} memberCount={members.length} />}
      </main>
    </div>
  );
}
