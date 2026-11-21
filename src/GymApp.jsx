import { useCallback, useEffect, useRef, useState } from 'react';
import MemberForm from './components/MemberForm.jsx';
import MemberList from './components/MemberList.jsx';
import BulkImport from './components/BulkImport.jsx';
import Settings from './components/Settings.jsx';
import BackupChip from './components/BackupChip.jsx';
import useBackup from './lib/useBackup.js';
import {
  loadMembers, addMembers, updateMember, deleteMember, loadLegacyMembers, clearLegacyMembers,
} from './lib/storage.js';

const TABS = [
  { key: 'members', label: 'Members', menuLabel: 'Members' },
  { key: 'add', label: 'Add member', menuLabel: 'Add Member' },
  { key: 'import', label: 'Import from Excel', menuLabel: 'Import Data' },
];

function UserIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export default function GymApp({ user, role, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const topbarRef = useRef(null);
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

  // Close the phone menu on an outside tap or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (e) => {
      if (topbarRef.current && !topbarRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const goTo = (key) => { setTab(key); setMenuOpen(false); };

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

  const editMember = (member) => run(async () => {
    const { members: list } = await updateMember(member);
    setMembers(list);
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
      <header className="topbar" ref={topbarRef}>
        {/* Phone layout: menu button, app name in the centre, dropdown with everything else. */}
        <div className="mobile-bar">
          <button
            className="menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen
                ? <path d="M6 6l12 12M18 6L6 18" />
                : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
          <span className="mobile-title">Gym Manager</span>
          <span className="menu-spacer" aria-hidden />
        </div>
        {menuOpen && (
          <div className="mobile-menu" id="mobile-menu">
            <button
              className={tab === 'settings' ? 'menu-item profile active' : 'menu-item profile'}
              onClick={() => goTo('settings')}
              disabled={!isAdmin}
            >
              <span className="avatar"><UserIcon /></span>
              <span className="profile-name">
                <b>{user}</b>
                {isAdmin && <small>Admin · Profile</small>}
              </span>
            </button>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'menu-item active' : 'menu-item'}
                onClick={() => goTo(t.key)}
              >
                {t.menuLabel}
              </button>
            ))}
            <div className="menu-foot">
              <BackupChip backup={backup} />
              <button className="secondary small" onClick={onLogout}>Sign out</button>
            </div>
          </div>
        )}

        <div className="brand desktop-only">
          <span className="logo" aria-hidden>🏋️</span>
          <div>
            <h1>Gym Manager</h1>
            <p>{ready ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Google Sheet'}</p>
          </div>
        </div>
        <nav className="tabs desktop-only">
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
        <div className="userbox desktop-only">
          <BackupChip backup={backup} />
          <button
            className={tab === 'settings' ? 'user-icon active' : 'user-icon'}
            title={`Profile — ${user}${isAdmin ? ' (admin)' : ''}`}
            aria-label={`Profile (signed in as ${user}${isAdmin ? ', admin' : ''})`}
            onClick={() => setTab('settings')}
            disabled={!isAdmin}
          >
            <UserIcon />
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
          <MemberList members={members} onDelete={removeMember} onUpdate={editMember} onAddClick={() => setTab('add')} />
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
