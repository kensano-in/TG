import { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

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

const STATUS_COLORS = {
  open: { bg: 'rgba(6,182,212,0.15)', color: '#06b6d4' },
  pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  closed: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
};

const cardStyle = {
  borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)',
  background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(16px)',
  padding: '22px 24px', marginBottom: 20,
};
const labelStyle = { display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6 };
const inputStyle = { width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' };
const primaryBtnStyle = {
  minHeight: 44, padding: '0 20px', borderRadius: 10,
  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};

function InvoiceModal({ invoice, onClose }) {
  if (!invoice) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(5,6,15,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        borderRadius: 16, border: '1px solid rgba(139,92,246,0.3)',
        background: 'rgba(13,17,38,0.95)', padding: '28px 32px',
        maxWidth: 540, width: '100%', maxHeight: '80vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 17, fontWeight: 700 }}>🧾 Invoice</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <pre style={{
          color: '#f8fafc', fontSize: 13, lineHeight: 1.7,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>{typeof invoice === 'string' ? invoice : JSON.stringify(invoice, null, 2)}</pre>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={primaryBtnStyle}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Deals({ token, getHeaders }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [closingId, setClosingId] = useState(null);

  // New deal form
  const [showForm, setShowForm] = useState(false);
  const [formContact, setFormContact] = useState('');
  const [formItems, setFormItems] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formStatus, setFormStatus] = useState('open');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  // Generator wizard
  const [wizService, setWizService] = useState('');
  const [wizContact, setWizContact] = useState('');
  const [wizOutput, setWizOutput] = useState('');
  const [wizLoading, setWizLoading] = useState(false);

  useEffect(() => { fetchDeals(); }, []);

  const fetchDeals = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API_BASE}/api/deals`, { headers: getHeaders() });
      const d = await r.json();
      setDeals(Array.isArray(d) ? d : d.deals || []);
    } catch { setError('Failed to load deals.'); }
    finally { setLoading(false); }
  };

  const addDeal = async () => {
    if (!formContact.trim() || !formAmount) return;
    setFormLoading(true); setFormMsg('');
    try {
      await fetch(`${API_BASE}/api/deals`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ contact: formContact, items: formItems, amount: parseFloat(formAmount), status: formStatus }),
      });
      setFormMsg('Deal added!');
      setFormContact(''); setFormItems(''); setFormAmount(''); setFormStatus('open');
      setShowForm(false);
      fetchDeals();
    } catch { setFormMsg('Failed to add deal.'); }
    finally { setFormLoading(false); setTimeout(() => setFormMsg(''), 3000); }
  };

  const closeDeal = async (deal) => {
    setClosingId(deal.id); setInvoice(null);
    try {
      const r = await fetch(`${API_BASE}/api/admin/command`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ command: `/close ${deal.id}` }),
      });
      const d = await r.json();
      setInvoice(d.invoice || d.result || d.message || d);
      fetchDeals();
    } catch { setInvoice('Failed to generate invoice.'); }
    finally { setClosingId(null); }
  };

  const updateStatus = async (id, status) => {
    try {
      await fetch(`${API_BASE}/api/deals/${id}`, {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({ status }),
      });
      setDeals(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    } catch {}
  };

  const generateDealMessage = async () => {
    if (!wizService.trim()) return;
    setWizLoading(true); setWizOutput('');
    try {
      const r = await fetch(`${API_BASE}/api/admin/test-ai`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({
          message: `Generate a professional deal proposal message for: Service: ${wizService}. Contact: ${wizContact || 'valued customer'}.`,
        }),
      });
      const d = await r.json();
      setWizOutput(d.response || d.reply || d.output || JSON.stringify(d));
    } catch { setWizOutput('Failed to generate message.'); }
    finally { setWizLoading(false); }
  };

  const activeDeals = deals.filter(d => d.status !== 'closed' && d.status !== 'cancelled');
  const closedDeals = deals.filter(d => d.status === 'closed' || d.status === 'cancelled');

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <InvoiceModal invoice={invoice} onClose={() => setInvoice(null)} />

      <div className="page-header" style={{ marginBottom: 28 }}>
        <h1 className="page-title">Deal Management</h1>
        <p className="page-subtitle">Track, manage, and close your business deals</p>
      </div>

      {error && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13 }}>{error}</div>}

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Deals', value: deals.length, color: '#8b5cf6' },
          { label: 'Active', value: activeDeals.length, color: '#06b6d4' },
          { label: 'Closed', value: closedDeals.length, color: '#10b981' },
          { label: 'Total Value', value: `₹${deals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0).toLocaleString()}`, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{
            borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(13,17,38,0.55)', backdropFilter: 'blur(12px)',
            padding: '16px 18px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active Deals Table */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15 }}>Active Deals</div>
          <button onClick={() => setShowForm(!showForm)} style={{
            minHeight: 40, padding: '0 16px', borderRadius: 10,
            background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)',
            color: '#8b5cf6', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>{showForm ? '✕ Cancel' : '+ New Deal'}</button>
        </div>

        {/* Add Deal Form */}
        {showForm && (
          <div style={{
            marginBottom: 18, padding: '16px', borderRadius: 12,
            border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.05)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Contact</label>
                <input className="glass-input" value={formContact} onChange={e => setFormContact(e.target.value)}
                  placeholder="Contact name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Items / Service</label>
                <input className="glass-input" value={formItems} onChange={e => setFormItems(e.target.value)}
                  placeholder="Service description" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Amount (₹)</label>
                <input className="glass-input" type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)}
                  placeholder="0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select className="glass-input" value={formStatus} onChange={e => setFormStatus(e.target.value)} style={inputStyle}>
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {formMsg && <span style={{ color: '#10b981', fontSize: 12, alignSelf: 'center' }}>{formMsg}</span>}
              <button onClick={addDeal} disabled={formLoading} style={primaryBtnStyle}>
                {formLoading ? 'Adding...' : '+ Add Deal'}
              </button>
            </div>
          </div>
        )}

        {loading ? <Spinner /> : activeDeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#475569', padding: '24px', fontSize: 13 }}>No active deals</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Contact', 'Items', 'Amount', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeDeals.map((deal) => {
                  const sc = STATUS_COLORS[deal.status] || STATUS_COLORS.open;
                  return (
                    <tr key={deal.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' }}>
                      <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 600 }}>{deal.contact || deal.contact_name || '—'}</td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8', maxWidth: 200 }}>{(deal.items || deal.description || '').substring(0, 50)}</td>
                      <td style={{ padding: '12px 14px', color: '#f59e0b', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>₹{parseFloat(deal.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <select
                          value={deal.status}
                          onChange={e => updateStatus(deal.id, e.target.value)}
                          style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            background: sc.bg, color: sc.color, border: `1px solid ${sc.color}44`,
                          }}
                        >
                          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => closeDeal(deal)}
                          disabled={closingId === deal.id}
                          style={{
                            minHeight: 34, padding: '0 14px', borderRadius: 8,
                            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                            color: '#10b981', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                            opacity: closingId === deal.id ? 0.6 : 1,
                          }}
                        >
                          {closingId === deal.id ? '...' : '🧾 Close'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deal Message Generator */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15, marginBottom: 16 }}>🪄 Deal Message Generator</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Service / Product Type</label>
            <input className="glass-input" value={wizService} onChange={e => setWizService(e.target.value)}
              placeholder="e.g. Logo Design, SEO Package, Consulting..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input className="glass-input" value={wizContact} onChange={e => setWizContact(e.target.value)}
              placeholder="Optional" style={inputStyle} />
          </div>
        </div>
        <button onClick={generateDealMessage} disabled={wizLoading || !wizService.trim()} style={{ ...primaryBtnStyle, marginBottom: 14 }}>
          {wizLoading ? '🪄 Generating...' : '🪄 Generate Deal Message'}
        </button>
        {wizOutput && (
          <div style={{
            borderRadius: 12, border: '1px solid rgba(139,92,246,0.25)',
            background: 'rgba(139,92,246,0.06)', padding: '16px 18px',
          }}>
            <div style={{ color: '#8b5cf6', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>✨ GENERATED MESSAGE</div>
            <div style={{ color: '#f8fafc', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{wizOutput}</div>
          </div>
        )}
      </div>

      {/* Invoice History */}
      {closedDeals.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15, marginBottom: 16 }}>📁 Closed Deals</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Contact', 'Amount', 'Status', 'Date'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedDeals.map((deal) => {
                  const sc = STATUS_COLORS[deal.status] || STATUS_COLORS.closed;
                  return (
                    <tr key={deal.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px', color: '#f8fafc' }}>{deal.contact || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#f59e0b', fontWeight: 600 }}>₹{parseFloat(deal.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{deal.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{deal.closed_at ? new Date(deal.closed_at).toLocaleDateString() : deal.updated_at ? new Date(deal.updated_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
