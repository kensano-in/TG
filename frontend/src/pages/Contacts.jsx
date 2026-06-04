import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../api.js';

const CATEGORIES = ['All', 'Client', 'VIP', 'Family', 'Friend', 'Muted'];
const SORTS = ['Recent', 'Name', 'Priority'];

const CATEGORY_COLORS = {
  Client: { bg: 'rgba(6,182,212,0.15)', color: '#06b6d4' },
  VIP: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  Family: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  Friend: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' },
  Muted: { bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
};

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

function CategoryBadge({ cat }) {
  const style = CATEGORY_COLORS[cat] || { bg: 'rgba(255,255,255,0.08)', color: '#94a3b8' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: style.bg, color: style.color, letterSpacing: 0.5
    }}>{cat}</span>
  );
}

export default function Contacts({ token, getHeaders }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('Recent');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetchContacts();
  }, []);

  useEffect(() => {
    if (selected) {
      fetchHistory(selected.id);
      setEditCat(selected.category || '');
      setEditPriority(selected.priority || '');
    }
  }, [selected]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const fetchContacts = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/contacts`, { headers: getHeaders() });
      const d = await r.json();
      setContacts(Array.isArray(d) ? d : d.contacts || []);
    } catch {
      setError('Failed to load contacts.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (id) => {
    setHistoryLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/contacts/${id}/history`, { headers: getHeaders() });
      const d = await r.json();
      setHistory(Array.isArray(d) ? d : d.messages || d.history || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !selected) return;
    setSendLoading(true);
    setSendMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/contacts/${selected.id}/message`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ message }),
      });
      const d = await r.json();
      setSendMsg(d.message || 'Message sent!');
      setMessage('');
      setTimeout(() => fetchHistory(selected.id), 500);
    } catch {
      setSendMsg('Failed to send message.');
    } finally {
      setSendLoading(false);
      setTimeout(() => setSendMsg(''), 4000);
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    setEditLoading(true);
    try {
      await fetch(`${API_BASE}/api/contacts/${selected.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ category: editCat, priority: editPriority }),
      });
      setContacts(prev => prev.map(c => c.id === selected.id ? { ...c, category: editCat, priority: editPriority } : c));
      setSelected(prev => ({ ...prev, category: editCat, priority: editPriority }));
    } catch {}
    setEditLoading(false);
  };

  const filtered = contacts
    .filter(c => filter === 'All' || (c.category || '').toLowerCase() === filter.toLowerCase())
    .filter(c => {
      const q = search.toLowerCase();
      return !q || (c.name || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === 'Name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'Priority') return (b.priority || 0) - (a.priority || 0);
      return new Date(b.last_seen || b.updated_at || 0) - new Date(a.last_seen || a.updated_at || 0);
    });

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', height: '100%' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Contacts</h1>
        <p className="page-subtitle">Manage your CRM — contacts, conversations, categories</p>
      </div>

      {error && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, minHeight: 600 }}>

        {/* LEFT: Contact List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Search */}
          <input
            className="glass-input"
            placeholder="🔍  Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, width: '100%', boxSizing: 'border-box' }}
          />

          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setFilter(cat)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: filter === cat ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.08)',
                background: filter === cat ? 'rgba(139,92,246,0.2)' : 'transparent',
                color: filter === cat ? '#8b5cf6' : '#64748b',
                minHeight: 32, transition: 'all 0.15s',
              }}>{cat}</button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>Sort:</span>
            {SORTS.map(s => (
              <button key={s} onClick={() => setSort(s)} style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: sort === s ? '1px solid rgba(6,182,212,0.5)' : '1px solid rgba(255,255,255,0.06)',
                background: sort === s ? 'rgba(6,182,212,0.1)' : 'transparent',
                color: sort === s ? '#06b6d4' : '#475569',
                minHeight: 28, transition: 'all 0.15s',
              }}>{s}</button>
            ))}
          </div>

          {/* Contact List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 580 }}>
            {loading ? <Spinner /> : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', padding: 24, fontSize: 13 }}>No contacts found</div>
            ) : filtered.map(c => (
              <div key={c.id} onClick={() => setSelected(c)} style={{
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: selected?.id === c.id ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                background: selected?.id === c.id ? 'rgba(139,92,246,0.12)' : 'rgba(13,17,38,0.45)',
                backdropFilter: 'blur(12px)',
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>{c.name || c.username || `Contact ${c.id}`}</span>
                  {c.category && <CategoryBadge cat={c.category} />}
                </div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  {c.username && `@${c.username}`} {c.last_message && `· ${c.last_message.substring(0, 30)}...`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Chat History + Editor */}
        {!selected ? (
          <div style={{
            borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(13,17,38,0.45)', backdropFilter: 'blur(16px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12
          }}>
            <span style={{ fontSize: 40 }}>👤</span>
            <span style={{ color: '#475569', fontSize: 14 }}>Select a contact to view history</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact Header */}
            <div style={{
              borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)',
              padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>{selected.name || selected.username}</h3>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                    {selected.username && `@${selected.username}`}
                    {selected.phone && ` · ${selected.phone}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={editCat}
                    onChange={e => setEditCat(e.target.value)}
                    className="glass-input"
                    style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 12 }}
                  >
                    <option value="">Category</option>
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    className="glass-input"
                    placeholder="Priority (1-10)"
                    value={editPriority}
                    onChange={e => setEditPriority(e.target.value)}
                    style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 12, width: 120 }}
                  />
                  <button onClick={saveEdit} disabled={editLoading} style={{
                    minHeight: 36, padding: '0 14px', borderRadius: 8,
                    background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)',
                    color: '#8b5cf6', fontWeight: 600, fontSize: 12, cursor: 'pointer'
                  }}>{editLoading ? '...' : 'Save'}</button>
                </div>
              </div>
            </div>

            {/* Chat History */}
            <div style={{
              flex: 1, borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(13,17,38,0.45)', backdropFilter: 'blur(16px)',
              padding: '16px 20px', overflowY: 'auto', maxHeight: 400,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13, marginBottom: 8 }}>Chat History</div>
              {historyLoading ? <Spinner /> : history.length === 0 ? (
                <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>No messages yet</div>
              ) : history.map((msg, i) => {
                const isMe = msg.direction === 'out' || msg.from_me || msg.sender === 'bot';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '72%', padding: '9px 13px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: isMe ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)',
                      border: isMe ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                      color: '#f8fafc', fontSize: 13, lineHeight: 1.5,
                    }}>
                      <div>{msg.text || msg.message || msg.content}</div>
                      <div style={{ fontSize: 10, color: '#475569', marginTop: 4, textAlign: 'right' }}>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        {msg.ai_generated && <span style={{ color: '#8b5cf6', marginLeft: 4 }}>🤖</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Message Composer */}
            <div style={{
              borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)',
              padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <textarea
                  className="glass-input"
                  placeholder="Type a message..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage(); }}
                  rows={2}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, resize: 'none',
                    fontSize: 13, minHeight: 44, lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sendLoading || !message.trim()}
                  style={{
                    minHeight: 44, padding: '0 20px', borderRadius: 10,
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    border: 'none', color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: sendLoading || !message.trim() ? 'not-allowed' : 'pointer',
                    opacity: sendLoading || !message.trim() ? 0.6 : 1,
                    transition: 'all 0.2s',
                  }}
                >{sendLoading ? '...' : 'Send'}</button>
              </div>
              {sendMsg && (
                <div style={{ marginTop: 8, fontSize: 12, color: sendMsg.includes('fail') ? '#ef4444' : '#10b981' }}>{sendMsg}</div>
              )}
              <div style={{ fontSize: 10, color: '#475569', marginTop: 6 }}>Ctrl+Enter to send</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
