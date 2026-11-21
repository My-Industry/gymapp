import { useState } from 'react';
import { prepareImport, TEMPLATE_ROWS, formatDate, formatPhone } from '../lib/members.js';

// SheetJS is loaded only when this screen is used, keeping the main bundle small.
const loadXLSX = () => import('xlsx');

export default function BulkImport({ members, onImport, onDone }) {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    XLSX.writeFile(wb, 'members-template.xlsx');
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError('');
    setBusy(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // raw: true keeps phone numbers as digits and dates as Excel serials
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (rows.length === 0) setError('That sheet has no rows under the header.');
      else setResult(prepareImport(rows, members));
    } catch {
      setError('Could not read that file. Please upload an .xlsx, .xls or .csv file.');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    setBusy(true);
    setError('');
    try {
      await onImport(result.ready); // saves to the Google Sheet
      onDone();
    } catch (err) {
      setError(err.message || "Couldn't save the members. Please try again.");
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Import existing members</h2>
      <p className="muted">
        The first sheet is read. Columns needed: <b>Name</b>, <b>Phone</b>, <b>Plan</b> (Monthly, Quarterly…), <b>Fee</b>, <b>Start Date</b>,
        and optionally <b>Package</b> (Basic Gym or Gym + Cardio; blank means Basic Gym) and <b>WhatsApp Consent</b> (Yes/No). Dates can be DD/MM/YYYY or real Excel dates.
      </p>

      <div className="import-actions">
        <label className="primary file-btn">
          {busy ? 'Reading…' : 'Choose Excel file'}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} hidden />
        </label>
        <button className="secondary" onClick={downloadTemplate}>Download template</button>
        {fileName && <span className="muted">{fileName}</span>}
      </div>

      {error && <div className="alert error">{error}</div>}

      {result && (
        <>
          <div className="summary">
            <div className="stat good"><b>{result.ready.length}</b> ready to import</div>
            <div className="stat warn"><b>{result.duplicates.length}</b> duplicate phone{result.duplicates.length === 1 ? '' : 's'} skipped</div>
            <div className="stat bad"><b>{result.invalid.length}</b> row{result.invalid.length === 1 ? '' : 's'} with errors</div>
          </div>

          {result.invalid.length > 0 && (
            <details open>
              <summary>Rows with errors (fix them in Excel and re-upload, or import the rest now)</summary>
              <table className="compact">
                <thead><tr><th>Row</th><th>Name</th><th>Problem</th></tr></thead>
                <tbody>
                  {result.invalid.map((r) => (
                    <tr key={r.rowNumber}><td>{r.rowNumber}</td><td>{r.name || '—'}</td><td>{r.errors.join('; ')}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {result.duplicates.length > 0 && (
            <details>
              <summary>Duplicate phone numbers</summary>
              <table className="compact">
                <thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>Already used by</th></tr></thead>
                <tbody>
                  {result.duplicates.map((d) => (
                    <tr key={d.rowNumber}><td>{d.rowNumber}</td><td>{d.name}</td><td>{formatPhone(d.phone)}</td><td>{d.matches}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {result.ready.length > 0 && (
            <details>
              <summary>Preview of members to import</summary>
              <table className="compact">
                <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Package</th><th>Plan</th><th>Start</th><th>Expiry</th><th>WA</th></tr></thead>
                <tbody>
                  {result.ready.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.id}</td><td>{m.name}</td><td className="mono">{formatPhone(m.phone)}</td>
                      <td>{m.gymPackage}</td><td>{m.plan}</td><td>{formatDate(m.startDate)}</td><td>{formatDate(m.expiryDate)}</td>
                      <td>{m.whatsappConsent ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <button className="primary" disabled={result.ready.length === 0 || busy} onClick={confirmImport}>
            {busy
              ? 'Saving to Google Sheet…'
              : `Import ${result.ready.length} member${result.ready.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </section>
  );
}
