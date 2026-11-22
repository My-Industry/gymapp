import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PACKAGE_NAMES, PLAN_NAMES, STATUS_FILTERS, compareIds, formatDate, formatPhone, isListedMember,
  matchesFilters, memberStatus, todayISO, whatsappLink,
} from '../lib/members.js';
import MemberEditForm from './MemberEditForm.jsx';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </svg>
  );
}

const NO_FILTERS = { status: 'all', gymPackage: 'all', plan: 'all' };

export default function MemberList({ members, onDelete, onUpdate, onShowHistory, onAddClick }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const activeFilters = Object.keys(NO_FILTERS).filter((k) => filters[k] !== 'all').length;
  const setFilter = (field) => (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));

  // Close the filter panel on an outside click or Escape.
  useEffect(() => {
    if (!filterOpen) return undefined;
    const onDown = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const openMember = (id) => { setSelectedId(id); setEditing(false); setJustSaved(false); };
  const backToList = () => { setSelectedId(null); setEditing(false); setJustSaved(false); };
  const today = todayISO();
  // Plans that ran out in an earlier month drop off this page (they stay in Monthly records).
  const listed = useMemo(() => members.filter((m) => isListedMember(m, today)), [members, today]);
  const hiddenCount = members.length - listed.length;

  const withStatus = useMemo(
    () => listed.map((m) => ({ ...m, status: memberStatus(m, today) })),
    [listed, today],
  );
  const statusCounts = useMemo(() => ({
    all: withStatus.length,
    active: withStatus.filter((m) => m.status.key !== 'expired').length,
    expiring: withStatus.filter((m) => m.status.key === 'expiring').length,
    expired: withStatus.filter((m) => m.status.key === 'expired').length,
  }), [withStatus]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return withStatus
      .filter((m) =>
        (!q ||
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (digits.length >= 3 && m.phone.includes(digits))) &&
        matchesFilters(m, m.status.key, filters))
      .sort((a, b) => compareIds(b.id, a.id));
  }, [withStatus, query, filters]);

  if (members.length === 0) {
    return (
      <section className="card empty">
        <h2>No members yet</h2>
        <p>Register your first member, or import your existing list from Excel.</p>
        <button className="primary" onClick={onAddClick}>Add member</button>
      </section>
    );
  }

  const selected = selectedId ? members.find((m) => m.id === selectedId) : null;
  if (selected) {
    const m = { ...selected, status: memberStatus(selected, today) };
    const confirmDelete = () => {
      if (window.confirm(`Delete ${m.name} (${m.id})? This can't be undone.`)) {
        onDelete(m.id);
        backToList();
      }
    };
    const save = async (updated) => {
      await onUpdate(updated);
      setEditing(false);
      setJustSaved(true);
    };

    return (
      <section className="card member-detail">
        <button className="link back" onClick={backToList}>← Back to members</button>
        <div className="detail-head">
          <div>
            <h2>{m.name}</h2>
            <span className="mono muted">{m.id}</span>
          </div>
          <span className={`badge ${m.status.key}`}>{m.status.label}</span>
        </div>

        {justSaved && !editing && <div className="alert success">Changes saved.</div>}

        {editing ? (
          <MemberEditForm
            member={selected}
            members={members}
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
        <dl className="facts">
          <dt>Phone</dt><dd className="mono">{formatPhone(m.phone)}</dd>
          <dt>Package</dt><dd>{m.gymPackage || '—'}</dd>
          <dt>Duration</dt><dd>{m.plan}</dd>
          <dt>Fee</dt><dd>{inr.format(m.fee)}</dd>
          <dt>Start date</dt><dd>{formatDate(m.startDate)}</dd>
          <dt>Expiry date</dt><dd>{formatDate(m.expiryDate)}</dd>
          <dt>WhatsApp messages</dt><dd>{m.whatsappConsent ? 'Agreed' : 'Not agreed'}</dd>
          {m.createdAt && <><dt>Registered on</dt><dd>{formatDate(String(m.createdAt).slice(0, 10))}</dd></>}
        </dl>

        <div className="form-actions">
          <button className="primary" onClick={() => { setEditing(true); setJustSaved(false); }}>
            Upgrade plan / Edit details
          </button>
          <button className="secondary" onClick={() => onShowHistory(m.id)}>History</button>
          <button className="secondary danger-btn" onClick={confirmDelete}>Delete member</button>
        </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="list-head">
        <h2>Members</h2>
        <div className="search-row" ref={filterRef}>
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone or ID"
          />
          <button
            type="button"
            className={`filter-btn${activeFilters ? ' on' : ''}`}
            onClick={() => setFilterOpen((o) => !o)}
            aria-label="Filter members"
            aria-expanded={filterOpen}
            title="Filter members"
          >
            <FilterIcon />
            {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
          </button>

          {filterOpen && (
            <div className="filter-panel" role="dialog" aria-label="Filter members">
              <label>
                Status
                <select value={filters.status} onChange={setFilter('status')}>
                  {STATUS_FILTERS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label} ({statusCounts[s.key]})</option>
                  ))}
                </select>
              </label>
              <label>
                Package
                <select value={filters.gymPackage} onChange={setFilter('gymPackage')}>
                  <option value="all">All packages</option>
                  {PACKAGE_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label>
                Duration
                <select value={filters.plan} onChange={setFilter('plan')}>
                  <option value="all">All durations</option>
                  {PLAN_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="other">Other (e.g. 2 Months)</option>
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="secondary small" onClick={() => setFilters(NO_FILTERS)} disabled={!activeFilters}>
                  Clear filters
                </button>
                <button type="button" className="primary small" onClick={() => setFilterOpen(false)}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeFilters > 0 && (
        <p className="muted filter-summary">
          Showing {rows.length} of {listed.length} members.{' '}
          <button type="button" className="link" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
        </p>
      )}

      <div className="table-wrap">
        <table className="member-table">
          <thead>
            <tr>
              <th className="m-notify-h"><span className="sr-only">Notify</span></th>
              <th>ID</th><th>Name</th><th>Package</th><th>Expiry</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.id}
                className="clickable"
                tabIndex={0}
                onClick={() => openMember(m.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMember(m.id); }
                }}
                aria-label={`View details for ${m.name}`}
              >
                <td className="m-notify">
                  {m.status.key === 'expired' && whatsappLink(m.phone) && (
                    <a
                      className="wa-btn"
                      href={whatsappLink(m.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Notify ${m.name} on WhatsApp`}
                      aria-label={`Notify ${m.name} on WhatsApp`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <WhatsAppIcon />
                    </a>
                  )}
                </td>
                <td className="mono m-id">{m.id}</td>
                <td className="m-name">{m.name}</td>
                <td className="m-package">{m.gymPackage || '—'}</td>
                <td className="m-expiry">{formatDate(m.expiryDate)}</td>
                <td className="m-status"><span className={`badge ${m.status.key}`}>{m.status.label}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted center">
                  {query || activeFilters
                    ? 'No members match your search or filters.'
                    : 'No current members. Everyone’s plan has expired.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <p className="muted hidden-note">
          {hiddenCount} member{hiddenCount === 1 ? '' : 's'} whose plan expired in an earlier month
          {hiddenCount === 1 ? ' is' : ' are'} not listed here. You can still find them under Monthly records.
        </p>
      )}
    </section>
  );
}
