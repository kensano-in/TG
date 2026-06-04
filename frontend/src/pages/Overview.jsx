import { useState, useEffect, useRef } from 'react';
import { API_BASE, apiFetch } from '../api.js';

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function WeeklyChart({ data }) {
  const max = Math.max(...data, 1);
  const W = 560, H = 180, pad = { top: 16, right: 16, bottom: 32, left: 40 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const pts = data.map((v, i) => ({
    x: pad.left + (i / (data.length - 1)) * cw,
    y: pad.top + ch - (v / max) * ch,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fillD = `${pathD} L ${pts[pts.length - 1].x} ${pad.top + ch} L ${pts[0].x} ${pad.top + ch} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: pad.top + ch - t * ch,
    label: Math.round(t * max),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={W - pad.right} y1={t.y} y2={t.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={pad.left - 6} y={t.y + 4} fill="#64748b" fontSize="10" textAnchor="end">{t.label}</text>
        </g>
      ))}
      {WEEK_DAYS.map((d, i) => {
        const x = pad.left + (i / (WEEK_DAYS.length - 1)) * cw;
        return (
          <text key={d} x={x} y={H - 6} fill="#64748b" fontSize="10" textAnchor="middle">{d}</text>
        );
      })}
      <path d={fillD} fill="url(#chartGrad)" />
      <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#8b5cf6" stroke="#05060f" strokeWidth="2" />
      ))}
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
      <div style={{
        width: 36, height: 36, border: '3px solid rgba(139,92,246,0.2)',
        borderTop: '3px solid #8b5cf6', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
    </div>
  );
}

export default function Overview({ token, getHeaders }) {
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, a, l] = await Promise.all([
        fetch(`${API_BASE}/api/status`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/analytics`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/logs?limit=5`, { headers: getHeaders() }).then(r => r.json()),
      ]);
      setStatus(s);
      setAnalytics(a);
      setLogs(Array.isArray(l) ? l : l.logs || []);
    } catch (e) {
      setError('Failed to load dashboard data. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const doAction = async (endpoint, label) => {
    setActionLoading(label);
    setActionMsg('');
    try {
      const r = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST', headers: getHeaders()
      });
      const d = await r.json();
      setActionMsg(d.message || d.status || 'Done');
    } catch {
      setActionMsg('Action failed');
    } finally {
      setActionLoading('');
      setTimeout(() => setActionMsg(''), 4000);
    }
  };

  const stats = analytics || {};
  const weekData = stats.weekly_traffic || [12, 28, 18, 45, 32, 60, 41];

  const sessions = [
    { name: '@CatVos', role: 'Bot Account', key: 'catvos' },
    { name: '@Shinichirofr', role: 'Owner Account', key: 'owner' },
  ];

  const logLevelColor = (lvl) => {
    if (!lvl) return '#94a3b8';
    const l = lvl.toLowerCase();
    if (l === 'error' || l === 'critical') return '#ef4444';
    if (l === 'warning' || l === 'warn') return '#f59e0b';
    if (l === 'success') return '#10b981';
    return '#8b5cf6';
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <h1 className="page-title">Command Center</h1>
        <p className="page-subtitle">Real-time overview of your Telegram automation ecosystem</p>
      </div>

      {loading && <Spinner />}
      {error && <div className="alert-danger" style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444' }}>{error}</div>}

      {!loading && (
        <>
          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16, marginBottom: 24
          }}>
            {[
              { label: 'Total Messages', value: stats.total_messages ?? stats.messages ?? '—', icon: '💬', color: '#8b5cf6' },
              { label: 'AI Handled', value: stats.ai_handled ?? stats.ai_responses ?? '—', icon: '🤖', color: '#06b6d4' },
              { label: 'Contacts', value: stats.total_contacts ?? stats.contacts ?? '—', icon: '👥', color: '#10b981' },
              { label: 'Critical Alerts', value: stats.critical_alerts ?? stats.alerts ?? '0', icon: '🚨', color: '#ef4444' },
            ].map((s) => (
              <div key={s.label} className="glass-card" style={{
                padding: '20px 22px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(13,17,38,0.55)',
                backdropFilter: 'blur(16px)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{s.icon}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc', fontFamily: 'Outfit, sans-serif', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Main Grid: Chart + Sessions + Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, marginBottom: 20 }}>

            {/* Weekly Traffic Chart */}
            <div className="glass-card" style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)', padding: '22px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 15 }}>Weekly Traffic</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>Messages this week</div>
                </div>
                <span style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>Live</span>
              </div>
              <WeeklyChart data={weekData} />
            </div>

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* System Status */}
              <div className="glass-card" style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)', padding: '20px 22px' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 14, marginBottom: 14 }}>Session Status</div>
                {sessions.map((sess) => {
                  const active = status?.[sess.key]?.connected ?? status?.[`${sess.key}_connected`] ?? (status?.sessions?.[sess.key]?.connected) ?? false;
                  return (
                    <div key={sess.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>{sess.name}</div>
                        <div style={{ color: '#64748b', fontSize: 11 }}>{sess.role}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 9, height: 9, borderRadius: '50%',
                          background: active ? '#10b981' : '#ef4444',
                          boxShadow: active ? '0 0 8px #10b981' : '0 0 8px #ef4444',
                          animation: active ? 'pulse 2s infinite' : 'none'
                        }} />
                        <span style={{ fontSize: 11, color: active ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {active ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>AI Mode</span>
                  <span style={{ color: '#8b5cf6', fontSize: 12, fontWeight: 600 }}>{status?.ai_enabled ? 'Active' : 'Paused'}</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="glass-card" style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)', padding: '20px 22px' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 14, marginBottom: 14 }}>Quick Actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Start Bot', endpoint: '/api/admin/start', color: '#10b981', icon: '▶' },
                    { label: 'Stop Bot', endpoint: '/api/admin/stop', color: '#ef4444', icon: '⏹' },
                    { label: 'Takeover', endpoint: '/api/admin/takeover', color: '#f59e0b', icon: '🎮' },
                    { label: 'Briefing', endpoint: '/api/admin/briefing', color: '#06b6d4', icon: '📋' },
                  ].map((a) => (
                    <button
                      key={a.label}
                      disabled={!!actionLoading}
                      onClick={() => doAction(a.endpoint, a.label)}
                      style={{
                        minHeight: 44, padding: '8px 10px', borderRadius: 10,
                        border: `1px solid ${a.color}33`,
                        background: `${a.color}12`,
                        color: a.color, fontWeight: 600, fontSize: 12,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        transition: 'all 0.2s', opacity: actionLoading === a.label ? 0.7 : 1,
                      }}
                    >
                      <span>{a.icon}</span>
                      {actionLoading === a.label ? '...' : a.label}
                    </button>
                  ))}
                </div>
                {actionMsg && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 12 }}>
                    {actionMsg}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="glass-card" style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)', padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 15 }}>Recent Activity</div>
              <button onClick={fetchAll} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>Refresh</button>
            </div>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', padding: '24px 0' }}>No recent activity</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {logs.map((log, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
                    borderRadius: 8, background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                  }}>
                    <div style={{
                      minWidth: 8, height: 8, borderRadius: '50%', marginTop: 5,
                      background: logLevelColor(log.level)
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#f8fafc', fontSize: 13 }}>{log.message || log.msg || JSON.stringify(log)}</div>
                      <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''} {log.level && <span style={{ color: logLevelColor(log.level), fontWeight: 600 }}>{log.level.toUpperCase()}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
