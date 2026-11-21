import { useMemo, useState } from 'react';
import { formatDate, formatPhone, memberStatus, todayISO } from '../lib/members.js';
import MemberEditForm from './MemberEditForm.jsx';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function MemberList({ members, onDelete, onUpdate, onAddClick }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const openMember = (id) => { setSelectedId(id); setEditing(false); setJustSaved(false); };
  const backToList = () => { setSelectedId(null); setEditing(false); setJustSaved(false); };
  const today = todayISO();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return members
      .filter((m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (digits.length >= 3 && m.phone.includes(digits)))
      .map((m) => ({ ...m, status: memberStatus(m, today) }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [members, query, today]);

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
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone or ID"
        />
      </div>

      <div className="table-wrap">
        <table className="member-table">
          <thead>
            <tr>
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
                <td className="mono m-id">{m.id}</td>
                <td className="m-name">{m.name}</td>
                <td className="m-package">{m.gymPackage || '—'}</td>
                <td className="m-expiry">{formatDate(m.expiryDate)}</td>
                <td className="m-status"><span className={`badge ${m.status.key}`}>{m.status.label}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="muted center">No members match “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
