import { formatDate, formatPhone } from '../lib/members.js';

export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

// The table of monthly records. Each row needs `month` set; showMonth adds a Month column.
export default function HistoryTable({ rows, showMonth, emptyText = 'No records match.' }) {
  return (
    <div className="table-wrap">
      <table className="history-table">
        <thead>
          <tr>
            {showMonth && <th>Month</th>}
            <th>ID</th><th>Name</th><th>Package</th><th>Duration</th>
            <th>Start</th><th>Expiry</th><th className="num">Fee paid</th><th>Tag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.month}-${r.id}`}>
              {showMonth && <td>{r.month}</td>}
              <td className="mono">{r.id}</td>
              <td>{r.name}<div className="muted small-text mono">{formatPhone(r.phone)}</div></td>
              <td>
                {r.gymPackage || '—'}
                {r.upgradedFrom && <div className="muted small-text">from {r.upgradedFrom}</div>}
              </td>
              <td>{r.plan}</td>
              <td>{formatDate(r.startDate)}</td>
              <td>
                {formatDate(r.expiryDate)}
                {r.status === 'Expired' && <div className="muted small-text">Expired</div>}
              </td>
              <td className="num">{r.fee ? inr.format(r.fee) : '—'}</td>
              <td><span className={`badge tag-${String(r.tag).toLowerCase()}`}>{r.tag}</span></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={showMonth ? 9 : 8} className="muted center">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
