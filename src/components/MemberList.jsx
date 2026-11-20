import { useMemo, useState } from 'react';
import { formatDate, formatPhone, memberStatus, todayISO } from '../lib/members.js';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function MemberList({ members, onDelete, onAddClick }) {
  const [query, setQuery] = useState('');
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

  const confirmDelete = (m) => {
    if (window.confirm(`Delete ${m.name} (${m.id})? This can't be undone.`)) onDelete(m.id);
  };

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
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Phone</th><th>Plan</th><th className="num">Fee</th>
              <th>Start</th><th>Expiry</th><th>Status</th><th title="WhatsApp consent">WA</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="mono">{m.id}</td>
                <td>{m.name}</td>
                <td className="mono">{formatPhone(m.phone)}</td>
                <td>{m.plan}</td>
                <td className="num">{inr.format(m.fee)}</td>
                <td>{formatDate(m.startDate)}</td>
                <td>{formatDate(m.expiryDate)}</td>
                <td><span className={`badge ${m.status.key}`}>{m.status.label}</span></td>
                <td>{m.whatsappConsent ? '✓' : '—'}</td>
                <td><button className="link danger" onClick={() => confirmDelete(m)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="muted center">No members match “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
