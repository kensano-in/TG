import { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

const RECIPIENT_OPTIONS = [
  { label: 'All Contacts', value: 'all' },
  { label: 'Clients', value: 'client' },
  { label: 'VIP', value: 'vip' },
  { label: 'Family', value: 'family' },
  { label: 'Friends', value: 'friend' },
  { label: 'Muted', value: 'muted' },
];

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
      <div style={{
        width: 30, height: 30, border: '3px solid rgba(139,92,246,0.2)',
        borderTop: '3px solid #8b5cf6', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
    </div>
  );
}

const cardStyle = {
  borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
  background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)',
  padding: '22px 24px', marginBottom: 20,
};
const labelStyle = { display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6 };
const inputStyle = { width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' };
const primaryBtnStyle = {
  minHeight: 44, padding: '0 22px', borderRadius: 10,
  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};

export default function Broadcast({ token, getHeaders }) {
  const [recipient, setRecipient] = useState('all');
  const [message, setMessage] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const [templates, setTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(true);
  const [newTplName, setNewTplName] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [tplMsg, setTplMsg] = useState('');

  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
    fetchHistory();
  }, []);

  const fetchTemplates = async () => {
    setTplLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/broadcast/templates`, { headers: getHeaders() });
      const d = await r.json();
      setTemplates(Array.isArray(d) ? d : d.templates || []);
    } catch { setTemplates([]); }
    finally { setTplLoading(false); }
  };

  const fetchHistory = async () => {
    setHistLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/broadcast/history`, { headers: getHeaders() });
      const d = await r.json();
      setHistory(Array.isArray(d) ? d : d.history || []);
    } catch { setHistory([]); }
    finally { setHistLoading(false); }
  };

  const sendBroadcast = async () => {
    if (!message.trim()) return;
    setSending(true); setSendResult('');
    try {
      const body = { message, recipient_type: recipient, dry_run: dryRun };
      if (schedule) body.scheduled_at = schedule;
      const r = await fetch(`${API_BASE}/api/admin/broadcast`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
      });
      const d = await r.json();
      setSendResult(d.message || `${dryRun ? 'Dry run' : 'Broadcast'} ${d.sent || 'sent'} to ${d.count || recipient} recipients.`);
      fetchHistory();
    } catch { setSendResult('Broadcast failed.'); }
    finally { setSending(false); setTimeout(() => setSendResult(''), 6000); }
  };

  const saveTemplate = async () => {
    if (!newTplName.trim() || !newTplBody.trim()) return;
    setTplMsg('');
    try {
      await fetch(`${API_BASE}/api/admin/broadcast/templates`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: newTplName, body: newTplBody }),
      });
      setNewTplName(''); setNewTplBody('');
      setTplMsg('Template saved!');
      fetchTemplates();
    } catch { setTplMsg('Failed to save template.'); }
    setTimeout(() => setTplMsg(''), 3000);
  };

  const deleteTemplate = async (id) => {
    try {
      await fetch(`${API_BASE}/api/admin/broadcast/templates/${id}`, {
        method: 'DELETE', headers: getHeaders(),
      });
      fetchTemplates();
    } catch {}
  };

  const estimatedCount = () => {
    if (recipient === 'all') return '∞';
    return RECIPIENT_OPTIONS.find(o => o.value === recipient)?.label || recipient;
  };

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="page-header" style={{ marginBottom: 28 }}>
        <h1 className="page-title">Broadcast</h1>
        <p className="page-subtitle">Send mass messages to segments of your contact list</p>
      </div>

      {/* Composer Card */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15, marginBottom: 20 }}>📣 New Broadcast</div>

        {/* Recipient Selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Recipients</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RECIPIENT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setRecipient(opt.value)} style={{
                minHeight: 44, padding: '0 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: recipient === opt.value ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.08)',
                background: recipient === opt.value ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                color: recipient === opt.value ? '#8b5cf6' : '#64748b',
                transition: 'all 0.15s',
              }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
            Selected segment: <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{estimatedCount()}</span>
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Message</label>
          <textarea
            className="glass-input"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Type your broadcast message here... Use {name} for personalization."
            rows={6}
            style={{ ...inputStyle, resize: 'vertical', padding: '12px 14px', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#475569', fontSize: 11 }}>Use &#123;name&#125; to personalize</span>
            <span style={{ color: '#475569', fontSize: 11 }}>{message.length} chars</span>
          </div>
        </div>

        {/* Options Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Schedule (optional)</label>
            <input
              type="datetime-local"
              className="glass-input"
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <label style={{ ...labelStyle, marginBottom: 10 }}>Dry Run Mode</label>
            <div
              onClick={() => setDryRun(!dryRun)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '10px 14px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
                minHeight: 44,
              }}
            >
              <div style={{
                width: 42, height: 24, borderRadius: 12, padding: 2,
                background: dryRun ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.2s',
                display: 'flex', alignItems: 'center',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  transform: dryRun ? 'translateX(18px)' : 'translateX(0)',
                  transition: 'transform 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </div>
              <span style={{ color: dryRun ? '#8b5cf6' : '#64748b', fontSize: 13, fontWeight: 600 }}>
                {dryRun ? 'Dry Run ON — Preview only' : 'Dry Run OFF — Will send for real'}
              </span>
            </div>
          </div>
        </div>

        {/* Send Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setMessage('')} style={{
            minHeight: 44, padding: '0 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#94a3b8', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>Clear</button>
          <button
            onClick={sendBroadcast}
            disabled={sending || !message.trim()}
            style={{
              ...primaryBtnStyle,
              opacity: sending || !message.trim() ? 0.6 : 1,
              background: dryRun ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            }}
          >
            {sending ? '⏳ Sending...' : dryRun ? '🧪 Run Dry Test' : '🚀 Send Broadcast'}
          </button>
        </div>

        {sendResult && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: sendResult.includes('fail') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            border: sendResult.includes('fail') ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
            color: sendResult.includes('fail') ? '#ef4444' : '#10b981', fontSize: 13,
          }}>{sendResult}</div>
        )}
      </div>

      {/* Templates */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15, marginBottom: 16 }}>📄 Message Templates</div>

        {tplLoading ? <Spinner /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 16 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.03)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>{t.name}</span>
                  <button onClick={() => deleteTemplate(t.id)} style={{
                    background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14
                  }}>✕</button>
                </div>
                <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>{(t.body || '').substring(0, 80)}{(t.body || '').length > 80 ? '...' : ''}</div>
                <button onClick={() => setMessage(t.body || '')} style={{
                  marginTop: 4, padding: '5px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#8b5cf6',
                }}>Use Template</button>
              </div>
            ))}
            {templates.length === 0 && (
              <div style={{ color: '#475569', fontSize: 13, gridColumn: '1 / -1', textAlign: 'center', padding: 16 }}>No templates yet</div>
            )}
          </div>
        )}

        {/* New Template */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>CREATE NEW TEMPLATE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', gap: 10, alignItems: 'flex-start' }}>
            <input className="glass-input" placeholder="Template name" value={newTplName}
              onChange={e => setNewTplName(e.target.value)} style={inputStyle} />
            <textarea className="glass-input" placeholder="Template message body..."
              value={newTplBody} onChange={e => setNewTplBody(e.target.value)} rows={2}
              style={{ ...inputStyle, padding: '10px 14px', resize: 'none' }} />
            <button onClick={saveTemplate} style={{ ...primaryBtnStyle, whiteSpace: 'nowrap' }}>+ Save</button>
          </div>
          {tplMsg && <div style={{ marginTop: 8, color: '#10b981', fontSize: 12 }}>{tplMsg}</div>}
        </div>
      </div>

      {/* History */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15, marginBottom: 16 }}>📊 Broadcast History</div>
        {histLoading ? <Spinner /> : history.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>No broadcasts yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Date', 'Recipients', 'Sent', 'Status', 'Message'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{h.created_at ? new Date(h.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#f8fafc' }}>{h.recipient_type || h.recipients || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#06b6d4', fontWeight: 600 }}>{h.sent_count ?? h.count ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: h.status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: h.status === 'completed' ? '#10b981' : '#f59e0b',
                      }}>{h.status || 'done'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: 200 }}>
                      {(h.message || '').substring(0, 50)}{(h.message || '').length > 50 ? '...' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
