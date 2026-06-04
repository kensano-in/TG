import { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

const TABS = ['Persona', 'Knowledge Base', 'Simulator', 'DNA Rebuild'];
const TONE_OPTIONS = ['Professional', 'Friendly', 'Casual', 'Formal', 'Witty', 'Empathetic', 'Direct'];

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

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, flexWrap: 'wrap' }}>
      {TABS.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          flex: 1, minWidth: 100, minHeight: 40, padding: '8px 16px', borderRadius: 9, border: 'none',
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

function SaveMsg({ msg }) {
  if (!msg) return null;
  const isErr = msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error');
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px', borderRadius: 10,
      background: isErr ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
      border: `1px solid ${isErr ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
      color: isErr ? '#ef4444' : '#10b981', fontSize: 13,
    }}>{msg}</div>
  );
}

// ── Persona Tab ──────────────────────────────────────────────
function PersonaTab({ settings, onSave }) {
  const [name, setName] = useState(settings?.assistant_name || '');
  const [personality, setPersonality] = useState(settings?.personality || '');
  const [tone, setTone] = useState(settings?.tone || TONE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (settings) {
      setName(settings.assistant_name || '');
      setPersonality(settings.personality || '');
      setTone(settings.tone || TONE_OPTIONS[0]);
    }
  }, [settings]);

  const save = async () => {
    setLoading(true); setMsg('');
    try {
      await onSave({ assistant_name: name, personality, tone });
      setMsg('Persona saved successfully!');
    } catch { setMsg('Failed to save persona.'); }
    finally { setLoading(false); setTimeout(() => setMsg(''), 4000); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Assistant Name</label>
          <input className="glass-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Coet Assistant" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Tone Profile</label>
          <select className="glass-input" value={tone} onChange={e => setTone(e.target.value)} style={inputStyle}>
            {TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Personality & Behavior Description</label>
        <textarea
          className="glass-input"
          value={personality}
          onChange={e => setPersonality(e.target.value)}
          placeholder="Describe the assistant's personality, response style, what topics to prioritize, how to handle unknown questions..."
          rows={8}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={loading} style={primaryBtnStyle}>
          {loading ? 'Saving...' : '💾  Save Persona'}
        </button>
      </div>
      <SaveMsg msg={msg} />
    </div>
  );
}

// ── Knowledge Base Tab ───────────────────────────────────────
function KnowledgeBaseTab({ settings, onSave }) {
  const [facts, setFacts] = useState(settings?.knowledge_base || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (settings?.knowledge_base !== undefined) setFacts(settings.knowledge_base || '');
  }, [settings]);

  const save = async () => {
    setLoading(true); setMsg('');
    try {
      await onSave({ knowledge_base: facts });
      setMsg('Knowledge base saved!');
    } catch { setMsg('Failed to save.'); }
    finally { setLoading(false); setTimeout(() => setMsg(''), 4000); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 14 }}>Knowledge Base Facts</div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>Enter one fact/context per line. The AI uses these to answer questions.</div>
        </div>
        <span style={{ color: '#475569', fontSize: 11 }}>{facts.split('\n').filter(Boolean).length} entries</span>
      </div>
      <textarea
        className="glass-input"
        value={facts}
        onChange={e => setFacts(e.target.value)}
        placeholder={"Product price: ₹2499\nDelivery: 3-5 business days\nRefund policy: 7 days no questions asked\nSupport contact: @support_handle\n..."}
        rows={16}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={() => setFacts('')} style={secondaryBtnStyle}>Clear All</button>
        <button onClick={save} disabled={loading} style={primaryBtnStyle}>
          {loading ? 'Saving...' : '💾  Save Knowledge Base'}
        </button>
      </div>
      <SaveMsg msg={msg} />
    </div>
  );
}

// ── Simulator Tab ────────────────────────────────────────────
function SimulatorTab({ getHeaders }) {
  const [input, setInput] = useState('');
  const [contactName, setContactName] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const test = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResponse('');
    try {
      const r = await fetch(`${API_BASE}/api/admin/test-ai`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ message: input, contact_name: contactName }),
      });
      const d = await r.json();
      setResponse(d.response || d.reply || d.output || JSON.stringify(d));
    } catch { setError('Failed to get AI response.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 12 }}>
        <div>
          <label style={labelStyle}>Test Message</label>
          <input className="glass-input" value={input} onChange={e => setInput(e.target.value)}
            placeholder="What's the price of your service?" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Contact Name (optional)</label>
          <input className="glass-input" value={contactName} onChange={e => setContactName(e.target.value)}
            placeholder="John Doe" style={inputStyle} />
        </div>
      </div>
      <button onClick={test} disabled={loading || !input.trim()} style={primaryBtnStyle}>
        {loading ? '🤖  Generating...' : '🤖  Simulate AI Reply'}
      </button>
      {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {response && (
        <div style={{
          borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)',
          background: 'rgba(139,92,246,0.08)', padding: '16px 18px',
        }}>
          <div style={{ color: '#8b5cf6', fontSize: 11, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>🤖 AI RESPONSE</div>
          <div style={{ color: '#f8fafc', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{response}</div>
        </div>
      )}
      {!response && !loading && (
        <div style={{
          borderRadius: 12, border: '1px dashed rgba(255,255,255,0.08)',
          padding: '32px', textAlign: 'center', color: '#475569', fontSize: 13
        }}>
          AI response will appear here
        </div>
      )}
    </div>
  );
}

// ── DNA Rebuild Tab ──────────────────────────────────────────
function DNARebuildTab({ getHeaders }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const rebuild = async () => {
    setLoading(true); setResult(''); setError('');
    try {
      const r = await fetch(`${API_BASE}/api/settings/rebuild_owner_profile`, {
        method: 'POST', headers: getHeaders(),
      });
      const d = await r.json();
      setResult(d.message || d.status || 'DNA profile rebuilt successfully!');
    } catch { setError('Rebuild failed. Try again.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        borderRadius: 14, border: '1px solid rgba(139,92,246,0.2)',
        background: 'rgba(139,92,246,0.06)', padding: '22px 24px',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🧬</div>
        <h3 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>Owner DNA Profile Rebuild</h3>
        <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
          This process analyzes your conversation history to extract your unique writing style, 
          tone patterns, vocabulary, and response habits. The AI will use this profile to better 
          mimic how you naturally communicate.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          {['Response Patterns', 'Vocabulary Style', 'Tone Analysis', 'Emoji Usage'].map(f => (
            <div key={f} style={{
              padding: '10px 12px', borderRadius: 8, background: 'rgba(139,92,246,0.1)',
              border: '1px solid rgba(139,92,246,0.15)', color: '#8b5cf6', fontSize: 11, fontWeight: 600, textAlign: 'center'
            }}>{f}</div>
          ))}
        </div>
        <button onClick={rebuild} disabled={loading} style={{
          ...primaryBtnStyle, width: '100%',
          background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
        }}>
          {loading ? '⚙️  Rebuilding DNA Profile...' : '🧬  Rebuild Owner DNA Profile'}
        </button>
      </div>
      {result && (
        <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, color: '#10b981', fontSize: 13 }}>
          ✅ {result}
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13 }}>
          ❌ {error}
        </div>
      )}
    </div>
  );
}

// ── Shared Styles ────────────────────────────────────────────
const labelStyle = { display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: 0.3 };
const inputStyle = { width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' };
const primaryBtnStyle = {
  minHeight: 44, padding: '0 24px', borderRadius: 10,
  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const secondaryBtnStyle = {
  minHeight: 44, padding: '0 16px', borderRadius: 10,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#94a3b8', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

// ── Main Component ───────────────────────────────────────────
export default function AIEngine({ token, getHeaders }) {
  const [tab, setTab] = useState('Persona');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/api/settings`, { headers: getHeaders() });
        const d = await r.json();
        setSettings(d);
      } catch { setError('Failed to load settings.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const saveSettings = async (patch) => {
    const r = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error('Save failed');
    const d = await r.json();
    setSettings(prev => ({ ...prev, ...patch }));
    return d;
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="page-header" style={{ marginBottom: 28 }}>
        <h1 className="page-title">AI Engine</h1>
        <p className="page-subtitle">Configure your AI persona, knowledge base, and response behavior</p>
      </div>

      <div style={{
        borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)',
        padding: '24px',
      }}>
        <TabBar active={tab} onChange={setTab} />

        {loading ? <Spinner /> : error ? (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444' }}>{error}</div>
        ) : (
          <>
            {tab === 'Persona' && <PersonaTab settings={settings} onSave={saveSettings} />}
            {tab === 'Knowledge Base' && <KnowledgeBaseTab settings={settings} onSave={saveSettings} />}
            {tab === 'Simulator' && <SimulatorTab getHeaders={getHeaders} />}
            {tab === 'DNA Rebuild' && <DNARebuildTab getHeaders={getHeaders} />}
          </>
        )}
      </div>
    </div>
  );
}
