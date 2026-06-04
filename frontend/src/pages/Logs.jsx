import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../api.js';

export default function Logs({ token, getHeaders }) {
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const terminalRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/logs`, { headers: getHeaders() });
      if (res.ok) setLogs(await res.json());
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 3000);
    return () => clearInterval(intervalRef.current);
  }, [token]);

  useEffect(() => {
    if (logAutoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, logAutoScroll]);

  const clearLogs = async () => {
    setClearing(true);
    await fetch(`${API_BASE}/api/admin/clear-logs`, { method: 'DELETE', headers: getHeaders() });
    setClearConfirm(false); setClearing(false);
    fetchLogs();
  };

  const filtered = logs.filter(l => {
    if (logFilter !== 'ALL' && l.level !== logFilter) return false;
    if (logSearch && !l.message?.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const levelColor = { INFO: '#60a5fa', WARNING: '#fbbf24', ERROR: '#f87171' };

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">📋 System Logs</h1>
          <p className="page-subtitle">Real-time log terminal — auto-refreshes every 3 seconds</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setClearConfirm(true)}
          >🗑️ Clear Logs</button>
        </div>
      </div>

      {clearConfirm && (
        <div className="alert alert-danger mb-16" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1 }}>⚠️ This will permanently delete all system logs. Are you sure?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger btn-sm" onClick={clearLogs} disabled={clearing}>
              {clearing ? '...' : 'Yes, Clear'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setClearConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="card-header">
          <span className="card-title">🖥️ Live Log Terminal</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {['ALL', 'INFO', 'WARNING', 'ERROR'].map(lv => (
              <button
                key={lv}
                className={`btn btn-sm ${logFilter === lv ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setLogFilter(lv)}
              >{lv}</button>
            ))}
            <input
              className="glass-input"
              style={{ width: 160, minHeight: 32, padding: '4px 10px', fontSize: '0.8rem' }}
              placeholder="Search logs..."
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={logAutoScroll} onChange={e => setLogAutoScroll(e.target.checked)} />
              Auto-scroll
            </label>
          </div>
        </div>
        <div
          ref={terminalRef}
          className="log-terminal"
          style={{ maxHeight: '70vh', margin: 16 }}
        >
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              No log entries match current filter
            </div>
          ) : filtered.map((log, i) => (
            <div key={i} className="log-line">
              <span className="log-ts">{log.timestamp ? log.timestamp.substring(0, 19).replace('T', ' ') : ''}</span>
              <span style={{ color: levelColor[log.level] || '#94a3b8', fontWeight: 600, minWidth: 62 }}>[{log.level}]</span>
              <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{log.message}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 20px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)' }}>
          {filtered.length} entries · {logs.length} total · Auto-refresh: 3s
        </div>
      </div>
    </div>
  );
}
