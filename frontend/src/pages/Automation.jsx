import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../api.js';

const TABS = ['Keyword Rules', 'Custom Commands', 'Q&A Library'];

const MATCH_MODES = ['contains', 'exact', 'startswith', 'regex'];
const ACTION_TYPES = ['reply', 'notify_owner', 'forward', 'ignore'];

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '28px' }}>
      <div style={{
        width: 28, height: 28, border: '3px solid rgba(139,92,246,0.2)',
        borderTop: '3px solid #8b5cf6', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
    </div>
  );
}

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4 }}>
      {TABS.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          flex: 1, minHeight: 42, padding: '8px 12px', borderRadius: 9, border: 'none',
          background: active === t ? 'rgba(139,92,246,0.25)' : 'transparent',
          color: active === t ? '#8b5cf6' : '#64748b',
          fontWeight: active === t ? 700 : 500, fontSize: 13, cursor: 'pointer',
          borderBottom: active === t ? '2px solid #8b5cf6' : '2px solid transparent',
          transition: 'all 0.15s',
        }}>{t}</button>
      ))}
    </div>
  );
}

const inputStyle = { width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' };
const labelStyle = { display: 'block', color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 5 };

// ── Keyword Rules Tab ────────────────────────────────────────
function KeywordRulesTab({ getHeaders }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [resp, setResp] = useState('');
  const [mode, setMode] = useState('contains');
  const [action, setAction] = useState('reply');
  const [addLoading, setAddLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { fetchRules(); }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/keyword-rules`, { headers: getHeaders() });
      const d = await r.json();
      setRules(Array.isArray(d) ? d : d.rules || []);
    } catch { setRules([]); }
    finally { setLoading(false); }
  };

  const addRule = async () => {
    if (!kw.trim() || !resp.trim()) return;
    setAddLoading(true); setMsg('');
    try {
      await fetch(`${API_BASE}/api/keyword-rules`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ keyword: kw, response: resp, match_mode: mode, action_type: action }),
      });
      setKw(''); setResp(''); setMsg('Rule added!');
      fetchRules();
    } catch { setMsg('Failed to add rule.'); }
    finally { setAddLoading(false); setTimeout(() => setMsg(''), 3000); }
  };

  const deleteRule = async (id) => {
    try {
      await fetch(`${API_BASE}/api/keyword-rules/${id}`, { method: 'DELETE', headers: getHeaders() });
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {}
  };

  const MODE_COLORS = { contains: '#8b5cf6', exact: '#06b6d4', startswith: '#10b981', regex: '#f59e0b' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Add Rule Form */}
      <div style={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.05)', padding: '16px' }}>
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, marginBottom: 12, letterSpacing: 0.5 }}>ADD NEW RULE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Trigger Keyword</label>
            <input className="glass-input" value={kw} onChange={e => setKw(e.target.value)} placeholder="price, discount, shipping..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Response</label>
            <input className="glass-input" value={resp} onChange={e => setResp(e.target.value)} placeholder="Auto-reply text..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Match Mode</label>
            <select className="glass-input" value={mode} onChange={e => setMode(e.target.value)} style={inputStyle}>
              {MATCH_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Action Type</label>
            <select className="glass-input" value={action} onChange={e => setAction(e.target.value)} style={inputStyle}>
              {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {msg && <span style={{ alignSelf: 'center', color: '#10b981', fontSize: 12 }}>{msg}</span>}
          <button onClick={addRule} disabled={addLoading} style={{
            minHeight: 42, padding: '0 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{addLoading ? 'Adding...' : '+ Add Rule'}</button>
        </div>
      </div>

      {/* Rules List */}
      {loading ? <Spinner /> : rules.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: 24 }}>No keyword rules yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((rule) => (
            <div key={rule.id} style={{
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.03)', padding: '12px 16px',
              display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 12, alignItems: 'center',
            }}>
              <div>
                <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 13 }}>"{rule.keyword}"</div>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>trigger keyword</div>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{(rule.response || '').substring(0, 60)}</div>
              <span style={{
                padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: `${MODE_COLORS[rule.match_mode] || '#8b5cf6'}22`,
                color: MODE_COLORS[rule.match_mode] || '#8b5cf6'
              }}>{rule.match_mode}</span>
              <span style={{
                padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: 'rgba(6,182,212,0.12)', color: '#06b6d4'
              }}>{rule.action_type}</span>
              <button onClick={() => deleteRule(rule.id)} style={{
                background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '4px 10px', minHeight: 32,
              }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Commands Tab ──────────────────────────────────────
function CustomCommandsTab({ getHeaders }) {
  const [cmds, setCmds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState('');
  const [resp, setResp] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { fetchCmds(); }, []);

  const fetchCmds = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/keyword-rules?type=command`, { headers: getHeaders() });
      const d = await r.json();
      setCmds(Array.isArray(d) ? d : d.commands || d.rules || []);
    } catch { setCmds([]); }
    finally { setLoading(false); }
  };

  const addCmd = async () => {
    if (!trigger.trim() || !resp.trim()) return;
    const t = trigger.startsWith('/') ? trigger : `/${trigger}`;
    setAddLoading(true); setMsg('');
    try {
      await fetch(`${API_BASE}/api/keyword-rules`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ keyword: t, response: resp, match_mode: 'exact', action_type: 'reply', rule_type: 'command' }),
      });
      setTrigger(''); setResp(''); setMsg('Command added!');
      fetchCmds();
    } catch { setMsg('Failed to add command.'); }
    finally { setAddLoading(false); setTimeout(() => setMsg(''), 3000); }
  };

  const deleteCmd = async (id) => {
    try {
      await fetch(`${API_BASE}/api/keyword-rules/${id}`, { method: 'DELETE', headers: getHeaders() });
      setCmds(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ borderRadius: 12, border: '1px solid rgba(6,182,212,0.2)', background: 'rgba(6,182,212,0.04)', padding: 16 }}>
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>ADD COMMAND</div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>/Command Trigger</label>
            <input className="glass-input" value={trigger} onChange={e => setTrigger(e.target.value)}
              placeholder="/status, /price..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Response Text</label>
            <input className="glass-input" value={resp} onChange={e => setResp(e.target.value)}
              placeholder="What the bot replies..." style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {msg && <span style={{ alignSelf: 'center', color: '#10b981', fontSize: 12 }}>{msg}</span>}
          <button onClick={addCmd} disabled={addLoading} style={{
            minHeight: 42, padding: '0 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
            border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{addLoading ? 'Adding...' : '+ Add Command'}</button>
        </div>
      </div>

      {loading ? <Spinner /> : cmds.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: 24 }}>No custom commands yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cmds.map(cmd => (
            <div key={cmd.id} style={{
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.03)', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{
                fontWeight: 700, color: '#06b6d4', fontSize: 14,
                background: 'rgba(6,182,212,0.1)', padding: '4px 10px', borderRadius: 8, fontFamily: 'monospace',
              }}>{cmd.keyword}</span>
              <span style={{ flex: 1, color: '#94a3b8', fontSize: 13 }}>→ {cmd.response}</span>
              <button onClick={() => deleteCmd(cmd.id)} style={{
                background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '4px 10px', minHeight: 32,
              }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Q&A Library Tab ──────────────────────────────────────────
function QALibraryTab({ getHeaders }) {
  const [qa, setQa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { fetchQa(); }, []);

  const fetchQa = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/qa-rules`, { headers: getHeaders() });
      const d = await r.json();
      setQa(Array.isArray(d) ? d : d.qa || d.rules || []);
    } catch { setQa([]); }
    finally { setLoading(false); }
  };

  const addQa = async () => {
    if (!question.trim() || !answer.trim()) return;
    setAddLoading(true); setMsg('');
    try {
      await fetch(`${API_BASE}/api/qa-rules`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ question, answer }),
      });
      setQuestion(''); setAnswer(''); setMsg('Q&A added!');
      fetchQa();
    } catch { setMsg('Failed to add.'); }
    finally { setAddLoading(false); setTimeout(() => setMsg(''), 3000); }
  };

  const deleteQa = async (id) => {
    try {
      await fetch(`${API_BASE}/api/qa-rules/${id}`, { method: 'DELETE', headers: getHeaders() });
      setQa(prev => prev.filter(q => q.id !== id));
    } catch {}
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(qa, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'qa-library.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const arr = Array.isArray(data) ? data : data.qa || [];
        for (const item of arr) {
          await fetch(`${API_BASE}/api/qa-rules`, {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ question: item.question, answer: item.answer }),
          });
        }
        setMsg(`Imported ${arr.length} Q&As!`);
        fetchQa();
      } catch { setMsg('Import failed.'); }
      setTimeout(() => setMsg(''), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filtered = qa.filter(q => {
    const s = search.toLowerCase();
    return !s || (q.question || '').toLowerCase().includes(s) || (q.answer || '').toLowerCase().includes(s);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="glass-input" placeholder="🔍 Search Q&As..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, minHeight: 40, padding: '0 14px', borderRadius: 10, fontSize: 13 }} />
        <button onClick={exportJson} style={{
          minHeight: 40, padding: '0 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981',
        }}>⬇ Export JSON</button>
        <button onClick={() => fileInputRef.current?.click()} style={{
          minHeight: 40, padding: '0 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4',
        }}>⬆ Import JSON</button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={importJson} style={{ display: 'none' }} />
      </div>

      {/* Add New Q&A */}
      <div style={{ borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.04)', padding: 16 }}>
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>ADD Q&A PAIR</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Question</label>
            <textarea className="glass-input" value={question} onChange={e => setQuestion(e.target.value)}
              placeholder="What is your return policy?" rows={3}
              style={{ ...inputStyle, padding: '10px 14px', resize: 'none', lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={labelStyle}>Answer</label>
            <textarea className="glass-input" value={answer} onChange={e => setAnswer(e.target.value)}
              placeholder="We offer 7-day returns..." rows={3}
              style={{ ...inputStyle, padding: '10px 14px', resize: 'none', lineHeight: 1.5 }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {msg && <span style={{ alignSelf: 'center', color: '#10b981', fontSize: 12 }}>{msg}</span>}
          <button onClick={addQa} disabled={addLoading} style={{
            minHeight: 42, padding: '0 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{addLoading ? 'Adding...' : '+ Add Q&A'}</button>
        </div>
      </div>

      {/* Q&A List */}
      <div style={{ color: '#64748b', fontSize: 12 }}>{filtered.length} pairs</div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: 24 }}>No Q&A pairs found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((item) => (
            <div key={item.id} style={{
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.03)', padding: '14px 16px',
              display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 14, alignItems: 'flex-start',
            }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>QUESTION</div>
                <div style={{ color: '#f8fafc', fontSize: 13 }}>{item.question}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>ANSWER</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>{item.answer}</div>
              </div>
              <button onClick={() => deleteQa(item.id)} style={{
                background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '4px 10px', minHeight: 32, alignSelf: 'center',
              }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function Automation({ token, getHeaders }) {
  const [tab, setTab] = useState('Keyword Rules');

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="page-header" style={{ marginBottom: 28 }}>
        <h1 className="page-title">Automation</h1>
        <p className="page-subtitle">Configure keyword triggers, custom commands, and Q&A knowledge pairs</p>
      </div>

      <div style={{
        borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)',
        padding: '24px',
      }}>
        <TabBar active={tab} onChange={setTab} />
        {tab === 'Keyword Rules' && <KeywordRulesTab getHeaders={getHeaders} />}
        {tab === 'Custom Commands' && <CustomCommandsTab getHeaders={getHeaders} />}
        {tab === 'Q&A Library' && <QALibraryTab getHeaders={getHeaders} />}
      </div>
    </div>
  );
}
