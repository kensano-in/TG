import React, { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

export default function Network({ token, getHeaders }) {
  const [activeTab, setActiveTab] = useState('proxies');
  const [proxies, setProxies] = useState([]);
  const [proxyForm, setProxyForm] = useState({ type: 'socks5', addr: '', port: '', username: '', password: '' });
  const [proxyStatus, setProxyStatus] = useState('');
  const [proxySaving, setProxySaving] = useState(false);

  const [webhooks, setWebhooks] = useState([]);
  const [webhookForm, setWebhookForm] = useState({ url: '', secret_token: '', events: '*' });
  const [webhookStatus, setWebhookStatus] = useState('');

  const [syncRules, setSyncRules] = useState([]);
  const [syncForm, setSyncForm] = useState({ source_chat_id: '', target_chat_id: '', keywords: '*', enabled: 1 });
  const [syncStatus, setSyncStatus] = useState('');

  const [joinedChats, setJoinedChats] = useState([]);
  const [gcLink, setGcLink] = useState('');
  const [gcStatus, setGcStatus] = useState('');
  const [gcLoading, setGcLoading] = useState(false);

  const fetchAll = async () => {
    try {
      const [p, w, s, g] = await Promise.allSettled([
        fetch(`${API_BASE}/api/proxies`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/webhooks`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/sync-rules`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/joined-chats`, { headers: getHeaders() }).then(r => r.json()),
      ]);
      if (p.status === 'fulfilled') setProxies(Array.isArray(p.value) ? p.value : []);
      if (w.status === 'fulfilled') setWebhooks(Array.isArray(w.value) ? w.value : []);
      if (s.status === 'fulfilled') setSyncRules(Array.isArray(s.value) ? s.value : []);
      if (g.status === 'fulfilled') setJoinedChats(Array.isArray(g.value) ? g.value : []);
    } catch (e) {}
  };

  useEffect(() => { fetchAll(); }, [token]);

  const saveProxy = async () => {
    setProxySaving(true); setProxyStatus('');
    try {
      const res = await fetch(`${API_BASE}/api/proxies`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify(proxyForm)
      });
      setProxyStatus(res.ok ? '✅ Proxy saved!' : '❌ Failed to save proxy');
      if (res.ok) { setProxyForm({ type: 'socks5', addr: '', port: '', username: '', password: '' }); fetchAll(); }
    } catch { setProxyStatus('❌ Network error'); }
    finally { setProxySaving(false); }
  };

  const deleteProxy = async (id) => {
    await fetch(`${API_BASE}/api/proxies/${id}`, { method: 'DELETE', headers: getHeaders() });
    fetchAll();
  };

  const saveWebhook = async () => {
    const res = await fetch(`${API_BASE}/api/webhooks`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(webhookForm)
    });
    setWebhookStatus(res.ok ? '✅ Webhook registered!' : '❌ Failed');
    if (res.ok) { setWebhookForm({ url: '', secret_token: '', events: '*' }); fetchAll(); }
  };

  const saveSyncRule = async () => {
    const res = await fetch(`${API_BASE}/api/sync-rules`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(syncForm)
    });
    setSyncStatus(res.ok ? '✅ Sync rule created!' : '❌ Failed');
    if (res.ok) { setSyncForm({ source_chat_id: '', target_chat_id: '', keywords: '*', enabled: 1 }); fetchAll(); }
  };

  const joinChat = async () => {
    setGcLoading(true); setGcStatus('');
    const res = await fetch(`${API_BASE}/api/join-chat`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ link: gcLink })
    });
    setGcStatus(res.ok ? '✅ Joined successfully!' : '❌ Failed to join');
    if (res.ok) { setGcLink(''); fetchAll(); }
    setGcLoading(false);
  };

  const TABS = [
    { id: 'proxies', label: '🌐 Proxies' },
    { id: 'webhooks', label: '🔗 Webhooks' },
    { id: 'sync', label: '🔄 Auto Forwarder' },
    { id: 'chats', label: '💬 Group Chats' },
  ];

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🌐 Network & Integrations</h1>
          <p className="page-subtitle">Proxies, webhooks, auto-forwarder, and group chat management</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* Proxies */}
      {activeTab === 'proxies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">➕ Add Proxy</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-row">
                <select className="glass-input" value={proxyForm.type} onChange={e => setProxyForm(p => ({ ...p, type: e.target.value }))}>
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                  <option value="mtproto">MTProto</option>
                </select>
                <input className="glass-input" placeholder="IP Address" value={proxyForm.addr} onChange={e => setProxyForm(p => ({ ...p, addr: e.target.value }))} />
                <input className="glass-input" placeholder="Port" value={proxyForm.port} onChange={e => setProxyForm(p => ({ ...p, port: e.target.value }))} style={{ maxWidth: 100 }} />
              </div>
              <div className="input-row">
                <input className="glass-input" placeholder="Username (optional)" value={proxyForm.username} onChange={e => setProxyForm(p => ({ ...p, username: e.target.value }))} />
                <input className="glass-input" placeholder="Password (optional)" type="password" value={proxyForm.password} onChange={e => setProxyForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              {proxyStatus && <div className={`alert ${proxyStatus.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>{proxyStatus}</div>}
              <button className="btn btn-primary" onClick={saveProxy} disabled={proxySaving}>{proxySaving ? '⏳ Saving...' : '💾 Add Proxy'}</button>
            </div>
          </div>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">🌐 Active Proxies ({proxies.length})</span></div>
            <div className="card-body">
              {proxies.length === 0 ? <div className="empty-state"><div className="empty-state-icon">🌐</div><p className="empty-state-desc">No proxies configured</p></div>
              : <div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Address</th><th>Port</th><th>Actions</th></tr></thead><tbody>
                {proxies.map((p, i) => <tr key={i}><td><span className="badge badge-info">{p.type?.toUpperCase()}</span></td><td>{p.addr}</td><td>{p.port}</td><td><button className="btn btn-danger btn-sm" onClick={() => deleteProxy(p.id)}>Delete</button></td></tr>)}
              </tbody></table></div>}
            </div>
          </div>
        </div>
      )}

      {/* Webhooks */}
      {activeTab === 'webhooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">🔗 Register Webhook</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="glass-input" placeholder="Endpoint URL (https://...)" value={webhookForm.url} onChange={e => setWebhookForm(p => ({ ...p, url: e.target.value }))} />
              <input className="glass-input" placeholder="Secret Token" value={webhookForm.secret_token} onChange={e => setWebhookForm(p => ({ ...p, secret_token: e.target.value }))} />
              <input className="glass-input" placeholder="Events (* for all, comma-separated)" value={webhookForm.events} onChange={e => setWebhookForm(p => ({ ...p, events: e.target.value }))} />
              {webhookStatus && <div className={`alert ${webhookStatus.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>{webhookStatus}</div>}
              <button className="btn btn-primary" onClick={saveWebhook}>🔗 Register Webhook</button>
            </div>
          </div>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">Registered Webhooks ({webhooks.length})</span></div>
            <div className="card-body">
              {webhooks.length === 0 ? <div className="empty-state"><div className="empty-state-icon">🔗</div><p className="empty-state-desc">No webhooks registered</p></div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{webhooks.map((w, i) => <div key={i} className="glass-card" style={{ padding: '12px 16px' }}><div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{w.url}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Events: {w.events}</div></div>)}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Sync / Auto Forwarder */}
      {activeTab === 'sync' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">🔄 Add Sync Rule</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-row">
                <input className="glass-input" placeholder="Source Chat ID" value={syncForm.source_chat_id} onChange={e => setSyncForm(p => ({ ...p, source_chat_id: e.target.value }))} />
                <input className="glass-input" placeholder="Target Chat ID" value={syncForm.target_chat_id} onChange={e => setSyncForm(p => ({ ...p, target_chat_id: e.target.value }))} />
              </div>
              <input className="glass-input" placeholder="Keywords (* for all)" value={syncForm.keywords} onChange={e => setSyncForm(p => ({ ...p, keywords: e.target.value }))} />
              {syncStatus && <div className={`alert ${syncStatus.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>{syncStatus}</div>}
              <button className="btn btn-primary" onClick={saveSyncRule}>🔄 Create Sync Rule</button>
            </div>
          </div>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">Active Sync Rules ({syncRules.length})</span></div>
            <div className="card-body">
              {syncRules.length === 0 ? <div className="empty-state"><div className="empty-state-icon">🔄</div><p className="empty-state-desc">No sync rules configured</p></div>
              : <div className="table-wrap"><table className="data-table"><thead><tr><th>Source</th><th>Target</th><th>Keywords</th><th>Status</th></tr></thead><tbody>
                {syncRules.map((s, i) => <tr key={i}><td><code>{s.source_chat_id}</code></td><td><code>{s.target_chat_id}</code></td><td>{s.keywords}</td><td><span className={`badge ${s.enabled ? 'badge-success' : 'badge-muted'}`}>{s.enabled ? 'Active' : 'Paused'}</span></td></tr>)}
              </tbody></table></div>}
            </div>
          </div>
        </div>
      )}

      {/* Group Chats */}
      {activeTab === 'chats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">💬 Join Group / Channel</span></div>
            <div className="card-body" style={{ display: 'flex', gap: 10 }}>
              <input className="glass-input" placeholder="Invite link or @username" value={gcLink} onChange={e => setGcLink(e.target.value)} />
              <button className="btn btn-primary" onClick={joinChat} disabled={gcLoading || !gcLink}>{gcLoading ? '⏳' : '➕ Join'}</button>
            </div>
            {gcStatus && <div className={`alert ${gcStatus.startsWith('✅') ? 'alert-success' : 'alert-danger'}`} style={{ margin: '0 16px 16px' }}>{gcStatus}</div>}
          </div>
          <div className="glass-card">
            <div className="card-header"><span className="card-title">Joined Chats ({joinedChats.length})</span></div>
            <div className="card-body">
              {joinedChats.length === 0 ? <div className="empty-state"><div className="empty-state-icon">💬</div><p className="empty-state-desc">No joined chats tracked</p></div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {joinedChats.map((c, i) => <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.title || c.username}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {c.id} · {c.type}</div>
                </div>)}
              </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
