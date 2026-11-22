import { useEffect, useMemo, useRef, useState } from 'react';
import { loadHistory } from '../lib/storage.js';
import { formatDate } from '../lib/members.js';
import { memberHistory } from '../lib/monthly.js';
import HistoryTable, { inr } from './HistoryTable.jsx';

// One member's history: who they are, how many records, how much they paid, then every record.
export default function MemberHistory({ memberId, member, onBack, onAllRecords, onUnauthorized }) {
  const [state, setState] = useState({ status: 'loading', months: [], error: '' });

  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then(({ months }) => {
        if (!cancelled) setState({ status: 'ready', months, error: '' });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.unauthorized) { unauthorized.current?.(); return; }
        setState({ status: 'error', months: [], error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  const history = useMemo(() => memberHistory(state.months, memberId), [state.months, memberId]);

  // The members list knows the registration date; fall back to the first start date on record.
  const name = member?.name || history.name || memberId;
  const joined = member?.createdAt ? String(member.createdAt).slice(0, 10) : history.firstStart;

  return (
    <section className="card member-history">
      <button className="link back" onClick={onBack}>← Back to members</button>

      <div className="detail-head">
        <div>
          <h2>{name}</h2>
          <span className="mono muted">{memberId}</span>
        </div>
        <button className="secondary small" onClick={onAllRecords}>All monthly records</button>
      </div>

      <div className="summary member-summary">
        <div className="stat"><span className="stat-label">Joining date</span><b>{joined ? formatDate(joined) : '—'}</b></div>
        <div className="stat"><span className="stat-label">Records</span><b>{state.status === 'ready' ? history.count : '…'}</b></div>
        <div className="stat">
          <span className="stat-label">Total fees collected</span>
          <b>{state.status === 'ready' ? inr.format(history.fees) : '…'}</b>
        </div>
      </div>

      {state.status === 'loading' && <p className="muted">Loading records…</p>}
      {state.status === 'error' && <div className="alert error">Couldn't load the monthly records. {state.error}</div>}
      {state.status === 'ready' && (
        <HistoryTable
          rows={history.rows}
          showMonth
          emptyText="No monthly records for this member yet."
        />
      )}
    </section>
  );
}
