import { useCallback, useEffect, useRef, useState } from 'react';
import MemberForm from './components/MemberForm.jsx';
import MemberList from './components/MemberList.jsx';
import Settings from './components/Settings.jsx';
import ProfileMenu from './components/ProfileMenu.jsx';
import ReleaseNotes from './components/ReleaseNotes.jsx';
import UserIcon from './components/UserIcon.jsx';
import { VERSION } from './lib/version.js';
import BackupChip from './components/BackupChip.jsx';
import MonthlyRecords from './components/MonthlyRecords.jsx';
import MemberHistory from './components/MemberHistory.jsx';
import AboutPage from './components/AboutPage.jsx';
import CampaignsPage from './components/CampaignsPage.jsx';
import AttendancePage from './components/AttendancePage.jsx';
import SheetGuidePage from './components/SheetGuidePage.jsx';
import useBackup from './lib/useBackup.js';
import {
  loadMembers, addMembers, updateMember, deleteMember, loadLegacyMembers, clearLegacyMembers,
} from './lib/storage.js';

const TABS = [
  { key: 'members', label: 'Members', menuLabel: 'Members' },
  { key: 'add', label: 'Add member', menuLabel: 'Add Member' },
  { key: 'history', label: 'Monthly records', menuLabel: 'Monthly Records' },
  { key: 'attendance', label: 'Attendance', menuLabel: 'Attendance', tag: 'Beta' },
  { key: 'campaigns', label: 'Campaigns', menuLabel: 'Campaigns', tag: 'Soon' },
];

export default function GymApp({ user, role, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false); // the release notes window
  const [connectOpen, setConnectOpen] = useState(false); // open Settings with the Google Sheet form already showing
  const [historySearch, setHistorySearch] = useState('');
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
  // The load problem banner belongs to the member pages, not to Profile or Connect.
  const showLoadProblem = !['settings', 'about', 'guide', 'campaigns', 'attendance'].includes(tab);

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
      .then(({ members: list, warning }) => {
        setMembers(list);
        setLoad({ status: 'ready', error: '' });
        if (warning) setActionError(warning);
        const phones = new Set(list.map((m) => m.phone));
        setLegacy(loadLegacyMembers().filter((m) => m?.phone && !phones.has(m.phone)));
      })
      .catch((err) => {
        if (err.unauthorized) { logoutRef.current(); return; }
        setLoad({ status: 'error', error: err.message, code: err.code });
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

  // Opening "Monthly records" from the menu starts fresh; from a member's card it is pre-searched for them.
  const goTo = (key) => {
    if (key === 'history') setHistorySearch('');
    setConnectOpen(false);
    setTab(key);
    setMenuOpen(false);
  };
  const showHistoryFor = (id) => { setHistorySearch(id); setTab('history'); };
  // The "How to connect your Google Sheet" tutorial; Back returns to the page it was opened from.
  const [guideFrom, setGuideFrom] = useState('settings');
  const openGuide = () => { setGuideFrom(tab === 'guide' ? guideFrom : tab); setTab('guide'); setMenuOpen(false); };

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
    const { members: list, skipped, warning } = await addMembers([member]);
    setMembers(list);
    if (warning) setActionError(warning);
    if (skipped.length) throw new Error(`${skipped[0].name}: ${skipped[0].reason}.`);
    return list.find((m) => m.phone === member.phone) || member;
  });

  const editMember = (member) => run(async () => {
    const { members: list, warning } = await updateMember(member);
    setMembers(list);
    if (warning) setActionError(warning);
  });

  const removeMember = (id) => {
    run(async () => {
      const { members: list, warning } = await deleteMember(id);
      setMembers(list);
      if (warning) setActionError(warning);
    })
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
            >
              <span className="avatar"><UserIcon /></span>
              <span className="profile-name">
                <b>{user}</b>
                <small>{isAdmin ? 'Admin' : 'Staff'} · Settings</small>
              </span>
            </button>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'menu-item active' : 'menu-item'}
                onClick={() => goTo(t.key)}
              >
                {t.menuLabel}
                {t.tag && <span className={`soon-badge tab-soon ${t.tag === 'Beta' ? 'beta-badge' : ''}`}>{t.tag}</span>}
              </button>
            ))}
            <button
              className={tab === 'about' ? 'menu-item active' : 'menu-item'}
              onClick={() => goTo('about')}
            >
              About Us
            </button>
            <div className="menu-foot">
              <button
                className="link version-btn"
                onClick={() => { setMenuOpen(false); setShowNotes(true); }}
                title="See release notes"
              >
                {VERSION}
              </button>
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
              onClick={() => goTo(t.key)}
            >
              {t.label}
              {t.tag && <span className={`soon-badge tab-soon ${t.tag === 'Beta' ? 'beta-badge' : ''}`}>{t.tag}</span>}
            </button>
          ))}
        </nav>
        <div className="userbox desktop-only">
          <BackupChip backup={backup} />
          <ProfileMenu
            user={user}
            isAdmin={isAdmin}
            active={tab === 'settings'}
            onSettings={() => goTo('settings')}
            onAbout={() => goTo('about')}
            onShowVersion={() => setShowNotes(true)}
            onLogout={onLogout}
          />
        </div>
      </header>
      {showNotes && <ReleaseNotes onClose={() => setShowNotes(false)} />}

      {showLoadProblem && load.status === 'error' && load.code === 'not-configured' && (
        isAdmin ? (
          <div className="card narrow connect-card">
            <h2>Connect your Google Sheet</h2>
            <p className="muted small-text">
              Your members can't load because no Google Sheet is connected yet. Connect your Google Sheet account here to get started.
            </p>
            <button className="primary" onClick={() => { setConnectOpen(true); setTab('settings'); }}>Connect</button>
            <div className="card-help">
              <button type="button" className="link" onClick={openGuide}>Need help?</button>
            </div>
          </div>
        ) : (
          <div className="alert error">
            No Google Sheet is connected yet. Ask an admin to connect one from Settings.
          </div>
        )
      )}
      {showLoadProblem && load.status === 'error' && load.code !== 'not-configured' && (
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
        {showLoadProblem && load.status === 'loading' && <p className="muted">Loading members…</p>}
        {ready && tab === 'members' && (
          <MemberList
            members={members}
            onDelete={removeMember}
            onUpdate={editMember}
            onShowHistory={showHistoryFor}
            onAddClick={() => setTab('add')}
          />
        )}
        {ready && tab === 'add' && <MemberForm members={members} onAdd={addMember} />}
        {tab === 'history' && (
          historySearch ? (
            <MemberHistory
              key={historySearch}
              memberId={historySearch}
              member={members.find((m) => m.id === historySearch)}
              onBack={() => goTo('members')}
              onAllRecords={() => goTo('history')}
              onUnauthorized={onLogout}
            />
          ) : (
            <MonthlyRecords onUnauthorized={onLogout} />
          )
        )}
        {tab === 'settings' && (
          <Settings
            user={user}
            isAdmin={isAdmin}
            backup={backup}
            memberCount={members.length}
            connectOpen={connectOpen}
            onConnectionChange={() => { refresh(); if (connectOpen) { setConnectOpen(false); setTab('members'); } }}
            onUnauthorized={onLogout}
            onHelp={openGuide}
          />
        )}
        {tab === 'guide' && (
          <SheetGuidePage
            onBack={() => setTab(guideFrom)}
            onConnect={() => { setConnectOpen(true); setTab('settings'); }}
            canConnect={isAdmin}
          />
        )}
        {tab === 'campaigns' && <CampaignsPage />}
        {tab === 'attendance' && <AttendancePage />}
        {tab === 'about' && <AboutPage onShowVersion={() => setShowNotes(true)} />}
      </main>
    </div>
  );
}
