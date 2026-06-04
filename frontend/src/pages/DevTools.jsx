import React, { useState, useRef } from 'react';
import { API_BASE } from '../api.js';

export default function DevTools({ token, getHeaders }) {
  const [activeTab, setActiveTab] = useState('sql');
  const [sqlQuery, setSqlQuery] = useState('SELECT COUNT(*) FROM contacts;');
  const [sqlRows, setSqlRows] = useState([]);
  const [sqlError, setSqlError] = useState('');
  const [sqlLoading, setSqlLoading] = useState(false);

  const [apiEndpoint, setApiEndpoint] = useState('/api/status');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiBody, setApiBody] = useState('');
  const [apiResult, setApiResult] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);

  const [telemetry, setTelemetry] = useState(null);
  const [telLoading, setTelLoading] = useState(false);

  const runSQL = async () => {
    setSqlLoading(true); setSqlError(''); setSqlRows([]);
    try {
      const res = await fetch(`${API_BASE}/api/admin/sql-sandbox`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ query: sqlQuery })
      });
      const d = await res.json();
      if (res.ok) setSqlRows(d.rows || []);
      else setSqlError(d.detail || 'Query failed');
    } catch (e) { setSqlError(String(e)); }
    finally { setSqlLoading(false); }
  };

  const runAPI = async () => {
    setApiLoading(true); setApiResult(null);
    try {
      const opts = { method: apiMethod, headers: getHeaders() };
      if (apiMethod !== 'GET' && apiBody) opts.body = apiBody;
      const res = await fetch(`${API_BASE}${apiEndpoint}`, opts);
      const d = await res.json();
      setApiResult({ status: res.status, ok: res.ok, data: d });
    } catch (e) { setApiResult({ status: 0, ok: false, data: { error: String(e) } }); }
    finally { setApiLoading(false); }
  };

  const fetchTelemetry = async () => {
    setTelLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/telemetry`, { headers: getHeaders() });
      if (res.ok) setTelemetry(await res.json());
    } catch (e) {}
    finally { setTelLoading(false); }
  };

  const TABS = [
    { id: 'sql', label: '🗄️ SQL Sandbox' },
    { id: 'api', label: '⚡ API Tester' },
    { id: 'telemetry', label: '📊 Telemetry' },
  ];

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🛠️ Dev Tools</h1>
          <p className="page-subtitle">SQL sandbox, raw API tester, and system telemetry</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* SQL Sandbox */}
      {activeTab === 'sql' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">🗄️ SQL Query Sandbox</span></div>
            <div className="card-body">
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                ⚠️ Read-only queries recommended. Avoid destructive operations.
              </div>
              <textarea
                className="glass-input"
                style={{ fontFamily: 'monospace', fontSize: '0.85rem', minHeight: 120, marginBottom: 12 }}
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                placeholder="Enter SQL query..."
              />
              <button className="btn btn-primary" onClick={runSQL} disabled={sqlLoading || !sqlQuery}>
                {sqlLoading ? '⏳ Running...' : '▶ Execute Query'}
              </button>
            </div>
          </div>
          {sqlError && <div className="alert alert-danger">{sqlError}</div>}
          {sqlRows.length > 0 && (
            <div className="glass-card">
              <div className="card-header"><span className="card-title">Results ({sqlRows.length} rows)</span></div>
              <div className="card-body">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>{Object.keys(sqlRows[0] || {}).map(k => <th key={k}>{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sqlRows.slice(0, 200).map((row, i) => (
                        <tr key={i}>{Object.values(row).map((v, j) => <td key={j} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{String(v ?? '')}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* API Tester */}
      {activeTab === 'api' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">⚡ Raw API Tester</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-row">
                <select className="glass-input" style={{ maxWidth: 100 }} value={apiMethod} onChange={e => setApiMethod(e.target.value)}>
                  {['GET', 'POST', 'PUT', 'DELETE'].map(m => <option key={m}>{m}</option>)}
                </select>
                <input className="glass-input" placeholder="/api/status" value={apiEndpoint} onChange={e => setApiEndpoint(e.target.value)} />
                <button className="btn btn-primary" onClick={runAPI} disabled={apiLoading}>{apiLoading ? '⏳' : '▶ Send'}</button>
              </div>
              {apiMethod !== 'GET' && (
                <textarea
                  className="glass-input"
                  style={{ fontFamily: 'monospace', fontSize: '0.83rem', minHeight: 80 }}
                  placeholder='{"key": "value"}'
                  value={apiBody}
                  onChange={e => setApiBody(e.target.value)}
                />
              )}
            </div>
          </div>
          {apiResult && (
            <div className="glass-card">
              <div className="card-header">
                <span className="card-title">Response</span>
                <span className={`badge ${apiResult.ok ? 'badge-success' : 'badge-danger'}`}>HTTP {apiResult.status}</span>
              </div>
              <div className="card-body">
                <pre style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 400, overflowY: 'auto' }}>
                  {JSON.stringify(apiResult.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Telemetry */}
      {activeTab === 'telemetry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <button className="btn btn-primary" onClick={fetchTelemetry} disabled={telLoading} style={{ alignSelf: 'flex-start' }}>
            {telLoading ? '⏳ Loading...' : '🔄 Fetch Telemetry'}
          </button>
          {telemetry && (
            <div className="stats-grid">
              {Object.entries(telemetry).map(([k, v]) => (
                <div key={k} className="stat-card">
                  <div className="stat-card-label">{k.replace(/_/g, ' ')}</div>
                  <div className="stat-card-value" style={{ fontSize: '1.4rem' }}>
                    {typeof v === 'number' ? v.toLocaleString() : String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {telemetry && (
            <div className="glass-card">
              <div className="card-header"><span className="card-title">Raw Telemetry JSON</span></div>
              <div className="card-body">
                <pre style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto' }}>
                  {JSON.stringify(telemetry, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
