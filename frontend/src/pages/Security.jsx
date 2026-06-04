import React, { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

export default function Security({ token, getHeaders }) {
  const [pwdForm, setPwdForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [pwdStatus, setPwdStatus] = useState('');
  const [threats, setThreats] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  const fetchThreats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/threat-radar`, { headers: getHeaders() });
      if (res.ok) setThreats(await res.json());
    } catch (e) {}
  };

  useEffect(() => { fetchThreats(); }, [token]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPwd !== pwdForm.confirm) { setPwdStatus('New passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/change-password`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ current_password: pwdForm.current, new_password: pwdForm.newPwd })
      });
      const d = await res.json();
      setPwdStatus(res.ok ? '✅ Password updated successfully!' : `❌ ${d.detail || 'Failed.'}`);
      if (res.ok) setPwdForm({ current: '', newPwd: '', confirm: '' });
    } catch (e) { setPwdStatus('❌ Network error.'); }
    finally { setLoading(false); }
  };

  const handleEmergencyLock = async () => {
    if (!window.confirm('Emergency lock will disconnect the bot and block all AI responses. Continue?')) return;
    setLockLoading(true);
    try {
      await fetch(`${API_BASE}/api/admin/emergency-lock`, { method: 'POST', headers: getHeaders() });
      alert('🔒 Emergency lock activated.');
    } catch (e) {}
    finally { setLockLoading(false); }
  };

  const handleClearThreats = async () => {
    await fetch(`${API_BASE}/api/admin/threat-radar`, { method: 'DELETE', headers: getHeaders() });
    setThreats([]);
  };

  const sevColor = { high: '#f87171', medium: '#fbbf24', low: '#60a5fa' };

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔒 Security & Access</h1>
          <p className="page-subtitle">Credential management, threat radar, and emergency controls</p>
        </div>
        <button className="btn btn-danger btn-lg" onClick={handleEmergencyLock} disabled={lockLoading}>
          {lockLoading ? '⏳' : '🚨'} Emergency Lock
        </button>
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Change Password */}
        <div className="glass-card">
          <div className="card-header">
            <span className="card-title">🔑 Change Manager Password</span>
          </div>
          <div className="card-body">
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="password" className="glass-input" placeholder="Current Password"
                value={pwdForm.current} onChange={e => setPwdForm(p => ({ ...p, current: e.target.value }))} required
              />
              <input
                type="password" className="glass-input" placeholder="New Password"
                value={pwdForm.newPwd} onChange={e => setPwdForm(p => ({ ...p, newPwd: e.target.value }))} required
              />
              <input
                type="password" className="glass-input" placeholder="Confirm New Password"
                value={pwdForm.confirm} onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value }))} required
              />
              {pwdStatus && (
                <div className={`alert ${pwdStatus.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>
                  {pwdStatus}
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? '⏳ Saving...' : '💾 Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* Emergency Controls */}
        <div className="glass-card">
          <div className="card-header">
            <span className="card-title">🚨 Emergency Controls</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="alert alert-warning">
              ⚠️ These actions immediately affect the live bot. Use only in emergency situations.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: '🔒 Emergency Lock — Freeze all AI', action: handleEmergencyLock, variant: 'btn-danger' },
              ].map((a, i) => (
                <button key={i} className={`btn ${a.variant}`} onClick={a.action}>
                  {a.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Emergency lock disables AI responses and queues all incoming messages for manual review.
            </div>
          </div>
        </div>

        {/* Threat Radar */}
        <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <span className="card-title">🎯 Threat Radar</span>
            <button className="btn btn-secondary btn-sm" onClick={handleClearThreats}>Clear All</button>
          </div>
          <div className="card-body">
            {threats.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <p className="empty-state-title">No active threats detected</p>
                <p className="empty-state-desc">The AI is monitoring all incoming messages for suspicious activity.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Threat Type</th>
                      <th>Severity</th>
                      <th>Message</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threats.map((t, i) => (
                      <tr key={i}>
                        <td>{t.contact_name || t.contact_id}</td>
                        <td>{t.threat_type}</td>
                        <td>
                          <span className="badge" style={{ color: sevColor[t.severity] || '#94a3b8', background: 'rgba(255,255,255,0.05)', border: `1px solid ${sevColor[t.severity] || '#94a3b8'}40` }}>
                            {t.severity?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.message}
                        </td>
                        <td>{t.timestamp ? t.timestamp.substring(0, 16).replace('T', ' ') : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
