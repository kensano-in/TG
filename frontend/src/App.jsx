import React, { useState, useEffect, useRef } from 'react';
import { 
  DashboardIcon, 
  ContactsIcon, 
  SettingsIcon, 
  LogsIcon, 
  UserIcon, 
  SendIcon, 
  ShieldIcon, 
  StatusOnlineIcon,
  AlertIcon,
  CheckIcon
} from './Icons';

const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:8000' 
  : 'https://tg-5o6r.onrender.com';

const WS_BASE = API_BASE.replace('http', 'ws');

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loginTimezone, setLoginTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  
  // App Navigation
  const [activeTab, setActiveTab] = useState('overview'); // overview, contacts, rules, logs
  
  // System Status State
  const [sysStatus, setSysStatus] = useState({
    telegram_connected: false,
    phone: '',
    current_status: 'focus',
    resolved_status: 'focus',
    owner_online: false,
    ai_enabled: true,
    approval_mode: false,
    idle_threshold: 300
  });
  
  // Telegram Login Wizard State
  const [loginStep, setLoginStep] = useState('init'); // init, code_pending, authenticated
  const [loginCode, setLoginCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  // Contacts State
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [pendingDraft, setPendingDraft] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  
  const [settings, setSettings] = useState({
    ai_enabled: true,
    approval_mode: false,
    idle_threshold: 300,
    ai_personality: '',
    assistant_name: 'Coet',
    timezone: 'Asia/Kolkata',
    owner_activity_override: 'auto',
    bypass_family_friends: false,
    force_draft_vips: true,
    tone_profile: 'concise',
    auto_sleep_enabled: true,
    auto_busy_enabled: true,
    blacklist_keywords: '',
    reply_delay_min: '1',
    reply_delay_max: '4',
    active_hours_start: '9',
    active_hours_end: '23',
    owner_style_profile: '',
    enable_human_delays: true,
    enable_reactions: true,
    enable_split_messages: true,
    var_upi: 'shinichiro@upi',
    var_website: 'https://verlyn.dev',
  });

  const [isRebuildingProfile, setIsRebuildingProfile] = useState(false);
  
  // Logs State
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('ALL'); // ALL, INFO, WARNING, ERROR
  const [logSearch, setLogSearch] = useState('');
  
  // Keyword Rules State
  const [keywordRules, setKeywordRules] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [newMatchMode, setNewMatchMode] = useState('contains'); // contains, regex, fuzzy
  const [newActionType, setNewActionType] = useState('reply'); // reply, category, priority, mute, combined
  const [newActionValue, setNewActionValue] = useState('');
  
  // Simulator State
  const [simText, setSimText] = useState('');
  const [simContactId, setSimContactId] = useState('');
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  
  // Analytics State
  const [analytics, setAnalytics] = useState({
    total_messages: 0,
    handled_by_ai: 0,
    critical_alerts: 0,
    response_rate: 0,
    avg_response_time: 0,
    categories: {},
    sentiments: {},
    daily_history: []
  });
  
  const [wsConnected, setWsConnected] = useState(false);
  
  // Executive Daily Briefing State
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingData, setBriefingData] = useState(null);
  const [briefingError, setBriefingError] = useState('');
  const [briefingSentSuccess, setBriefingSentSuccess] = useState(false);

  // Reminders & Audible Alerts State
  const [reminders, setReminders] = useState([]);
  const [newReminderTask, setNewReminderTask] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');
  const [audibleAlerts, setAudibleAlerts] = useState(localStorage.getItem('audibleAlerts') !== 'false');
  // Key Pool Diagnostics State
  const [keyPool, setKeyPool] = useState([]);
  const [keyPoolLoading, setKeyPoolLoading] = useState(false);
  const [keyPoolError, setKeyPoolError] = useState('');

  // Contact Filter & Sort State
  const [contactFilter, setContactFilter] = useState('all'); // all, client, vip, family, friend, muted
  const [contactSort, setContactSort] = useState('recent'); // recent, name, priority
  const [chatSearch, setChatSearch] = useState('');

  // Live Clock State
  const [liveClock, setLiveClock] = useState(new Date());

  // Spotlight Command Console State
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightSearch, setSpotlightSearch] = useState('');
  const [spotlightIndex, setSpotlightIndex] = useState(0);

  // AI Tester State
  const [aiTestMsg, setAiTestMsg] = useState('');
  const [aiTestStatus, setAiTestStatus] = useState('busy');
  const [aiTestResult, setAiTestResult] = useState(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);

  // Log auto-scroll
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [logClearConfirm, setLogClearConfirm] = useState(false);

  // Pipeline notes modal
  const [pipelineNoteContact, setPipelineNoteContact] = useState(null);
  const [pipelineNoteText, setPipelineNoteText] = useState('');
  const playChime = (type = 'message') => {
    if (!audibleAlerts) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (type === 'alarm') {
        const playSiren = (timeOffset, frequency) => {
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, audioCtx.currentTime + timeOffset);
          osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, audioCtx.currentTime + timeOffset + 0.15);
          osc.frequency.exponentialRampToValueAtTime(frequency, audioCtx.currentTime + timeOffset + 0.3);
          
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime + timeOffset);
          gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + timeOffset + 0.05);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + timeOffset + 0.3);
          
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          osc.start(audioCtx.currentTime + timeOffset);
          osc.stop(audioCtx.currentTime + timeOffset + 0.3);
        };
        playSiren(0, 880);
        playSiren(0.35, 880);
      } else {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.25);
        
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      }
    } catch (e) {
      console.warn("Failed to play synthesized chime:", e);
    }
  };

  const fetchReminders = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/reminders`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReminders(data);
      }
    } catch (err) {
      console.error("Error fetching reminders:", err);
    }
  };

  const handleCreateReminder = async (e) => {
    e.preventDefault();
    if (!newReminderTask.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/reminders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          telegram_id: selectedContact ? selectedContact.telegram_id : null,
          task: newReminderTask,
          due_time: newReminderTime || 'today'
        })
      });
      if (res.ok) {
        setNewReminderTask('');
        setNewReminderTime('');
        fetchReminders();
      }
    } catch (err) {
      console.error("Error creating reminder:", err);
    }
  };

  const handleToggleReminderStatus = async (reminderId, currentStatus) => {
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch(`${API_BASE}/api/reminders/${reminderId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchReminders();
      }
    } catch (err) {
      console.error("Error updating reminder status:", err);
    }
  };

  const renderTrafficChart = () => {
    const history = [...(analytics.daily_history || [])].reverse();
    if (history.length === 0) {
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        history.push({
          date: d.toISOString().split('T')[0],
          count: 0
        });
      }
    }

    const counts = history.map(h => h.count);
    const maxVal = Math.max(...counts, 10);
    const height = 180;
    const width = 500;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };

    const points = history.map((h, i) => {
      const denom = history.length > 1 ? history.length - 1 : 1;
      const x = padding.left + (i * (width - padding.left - padding.right) / denom);
      const y = height - padding.bottom - (h.count * (height - padding.top - padding.bottom) / maxVal);
      return { x, y, date: h.date, count: h.count };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = points.length > 0 
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`
      : '';

    return (
      <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', flex: '1.5', minWidth: '320px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈 Weekly Message Traffic Flow</span>
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Visual monitoring of inbound and outbound Telegram communication volumes.
          </p>
        </div>
        <div style={{ position: 'relative', width: '100%', height: `${height}px` }}>
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-secondary)" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
              const y = padding.top + r * (height - padding.top - padding.bottom);
              const label = Math.round(maxVal * (1 - r));
              return (
                <g key={i}>
                  <line 
                    x1={padding.left} 
                    y1={y} 
                    x2={width - padding.right} 
                    y2={y} 
                    stroke="rgba(255, 255, 255, 0.05)" 
                    strokeDasharray="4 4" 
                  />
                  <text 
                    x={padding.left - 10} 
                    y={y + 4} 
                    fill="var(--text-muted)" 
                    fontSize="9px" 
                    textAnchor="end"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {areaPath && (
              <path d={areaPath} fill="url(#areaGradient)" />
            )}

            {linePath && (
              <path 
                d={linePath} 
                fill="none" 
                stroke="url(#lineGradient)" 
                strokeWidth="3" 
                filter="url(#glow)"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {points.map((p, i) => {
              const dateObj = new Date(p.date);
              const shortDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <g key={i} className="chart-dot-group">
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r="4" 
                    fill="var(--color-secondary)" 
                    stroke="#fff" 
                    strokeWidth="1.5"
                    style={{ transition: 'all 0.2s ease-in-out', cursor: 'pointer' }}
                  />
                  <text 
                    x={p.x} 
                    y={height - 10} 
                    fill="var(--text-muted)" 
                    fontSize="9px" 
                    textAnchor="middle"
                  >
                    {shortDate}
                  </text>
                  <text
                    x={p.x}
                    y={p.y - 10}
                    fill="#fff"
                    fontSize="9px"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {p.count}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  const renderAgendaPanel = () => {
    return (
      <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', flex: '1', minWidth: '280px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅 Manager Agenda & Reminders</span>
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Automated calendar events and manager follow-ups extracted by Gemini.
          </p>
        </div>

        <form onSubmit={handleCreateReminder} style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            className="glass-input" 
            placeholder="Add new task..." 
            value={newReminderTask}
            onChange={(e) => setNewReminderTask(e.target.value)}
            required
            style={{ flex: 2, padding: '8px 12px', fontSize: '0.8rem' }}
          />
          <input 
            type="text" 
            className="glass-input" 
            placeholder="Due (e.g. 4pm)" 
            value={newReminderTime}
            onChange={(e) => setNewReminderTime(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem' }}
          />
          <button type="submit" className="glass-btn" style={{ padding: '8px 15px', fontSize: '0.8rem' }}>
            +
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', paddingRight: '4px' }}>
          {reminders.map(rem => {
            const isCompleted = rem.status === 'completed';
            return (
              <div 
                key={rem.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: isCompleted ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  opacity: isCompleted ? 0.6 : 1,
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={isCompleted}
                    onChange={() => handleToggleReminderStatus(rem.id, rem.status)}
                    style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ 
                      fontSize: '0.85rem', 
                      fontWeight: 500,
                      color: isCompleted ? 'var(--text-muted)' : '#fff',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {rem.task}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: isCompleted ? 'var(--text-muted)' : 'var(--color-primary)' }}>
                      🕒 Due: {rem.due_time}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {reminders.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>
              No reminders scheduled. Gemini will auto-schedule them from your conversations.
            </p>
          )}
        </div>
      </div>
    );
  };

  const fetchDailyBriefing = async (sendTelegram = false) => {
    setBriefingLoading(true);
    setBriefingError('');
    if (sendTelegram) {
      setBriefingSentSuccess(false);
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/briefing`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ send_telegram: sendTelegram })
      });
      if (res.ok) {
        const data = await res.json();
        setBriefingData(data);
        if (sendTelegram) {
          setBriefingSentSuccess(true);
        }
      } else {
        const err = await res.json();
        setBriefingError(err.detail || 'Failed to generate briefing.');
      }
    } catch (err) {
      setBriefingError('Network error connecting to briefing engine.');
    } finally {
      setBriefingLoading(false);
    }
  };
  const wsRef = useRef(null);
  const chatBottomRef = useRef(null);
  const logTerminalRef = useRef(null);

  // Authenticate Admin Dashboard
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, timezone: loginTimezone })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        setToken(data.token);
      } else {
        setAuthError('Unauthorized. Incorrect manager code.');
      }
    } catch (err) {
      setAuthError('Server connection error.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
  };

  // Helper for authorized headers
  const getHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchSysStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setSysStatus(data);
        if (data.key_pool) setKeyPool(data.key_pool);
        if (data.telegram_connected) {
          setLoginStep('authenticated');
        } else {
          setLoginStep('init');
        }
      }
    } catch (err) {
      console.error("Error fetching system status:", err);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/settings`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  // Save Settings
  const saveSettings = async (updatedFields) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        fetchSysStatus();
        fetchSettings();
      }
    } catch (err) {
      console.error("Error saving settings:", err);
    }
  };

  // Rebuild Owner Style DNA Profile
  const rebuildOwnerStyleProfile = async () => {
    if (!token) return;
    setIsRebuildingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/rebuild_owner_profile`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setSettings(prev => ({ ...prev, owner_style_profile: data.profile }));
          alert("🧬 Owner Writing Style DNA profile rebuilt successfully from history!");
        } else {
          alert("❌ Failed to rebuild style DNA: " + data.message);
        }
      } else {
        alert("❌ Server error rebuilding style DNA.");
      }
    } catch (err) {
      console.error("Error rebuilding style profile:", err);
      alert("❌ Network error rebuilding style profile.");
    } finally {
      setIsRebuildingProfile(false);
    }
  };

  // Fetch Keyword Rules
  const fetchKeywordRules = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/rules/keywords`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKeywordRules(data);
      }
    } catch (err) {
      console.error("Error fetching keyword rules:", err);
    }
  };

  // Add Keyword Rule
  const handleAddKeywordRule = async (e) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/rules/keywords`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
          keyword: newKeyword, 
          response: newResponse,
          match_mode: newMatchMode,
          action_type: newActionType,
          action_value: newActionValue
        })
      });
      if (res.ok) {
        setNewKeyword('');
        setNewResponse('');
        setNewMatchMode('contains');
        setNewActionType('reply');
        setNewActionValue('');
        fetchKeywordRules();
      }
    } catch (err) {
      console.error("Error adding keyword rule:", err);
    }
  };

  // Simulate Rule Matches
  const handleSimulateRule = async (e) => {
    e.preventDefault();
    if (!simText.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/rules/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
          text: simText, 
          telegram_id: simContactId ? parseInt(simContactId) : null 
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSimResult(data);
      } else {
        setSimResult({ error: 'Server error during simulation.' });
      }
    } catch (err) {
      setSimResult({ error: 'Failed to communicate with API.' });
    } finally {
      setSimLoading(false);
    }
  };

  // Delete Keyword Rule
  const handleDeleteKeywordRule = async (ruleId) => {
    try {
      const res = await fetch(`${API_BASE}/api/rules/keywords/${ruleId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        fetchKeywordRules();
      }
    } catch (err) {
      console.error("Error deleting keyword rule:", err);
    }
  };

  // Fetch Contacts
  const fetchContacts = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/contacts`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (err) {
      console.error("Error fetching contacts:", err);
    }
  };

  // Fetch Selected Contact Chat History & Draft
  const fetchSelectedHistory = async (contactId) => {
    if (!token || !contactId) return;
    try {
      const res = await fetch(`${API_BASE}/api/contacts/${contactId}/history`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.history);
        setPendingDraft(data.draft);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  // Update Contact Category/Notes
  const updateContactMeta = async (contactId, fields) => {
    if (!token || !contactId) return;
    try {
      const res = await fetch(`${API_BASE}/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(fields)
      });
      if (res.ok) {
        fetchContacts();
        // Refresh selected
        setSelectedContact(prev => prev ? { ...prev, ...fields } : null);
      }
    } catch (err) {
      console.error("Error updating contact:", err);
    }
  };

  // Fetch System Logs
  const fetchLogs = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/logs`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  // Fetch Analytics
  const fetchAnalytics = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/analytics`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
    }
  };

  // Trigger Telegram verification code dispatch
  const handleSendTelegramCode = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-code`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        setLoginStep('code_pending');
      } else {
        const errData = await res.json();
        setLoginError(errData.detail || 'Failed to dispatch verification code.');
      }
    } catch (err) {
      setLoginError('Could not communicate with the Telegram backend.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Submit Telegram Code & Optional Password
  const handleTelegramAuth = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          code: loginCode,
          password: loginPassword || null
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setLoginStep('authenticated');
        fetchSysStatus();
      } else if (data.status === 'password_required') {
        setLoginError('2-Step Verification Password required. Please enter it below.');
      } else {
        setLoginError(data.message || 'Login attempt failed.');
      }
    } catch (err) {
      setLoginError('Authentication process experienced a network fault.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Send Manual Reply
  const handleSendReply = async (textToSend) => {
    if (!selectedContact || !textToSend.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/reply`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          telegram_id: selectedContact.telegram_id,
          text: textToSend
        })
      });
      if (res.ok) {
        setCustomMessage('');
        setPendingDraft('');
        fetchSelectedHistory(selectedContact.telegram_id);
        fetchContacts();
      } else {
        console.error("Failed to relay message.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Connect WebSockets
  useEffect(() => {
    if (!token) return;
    
    const ws = new WebSocket(WS_BASE + '/ws');
    wsRef.current = ws;
    
    ws.onopen = () => {
      setWsConnected(true);
      console.log("WebSocket stream connected.");
    };
    
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      const { event: evt, data } = payload;
      
      // Update logs in real-time
      if (evt === 'new_message') {
        // If it belongs to currently selected contact, reload history
        if (selectedContact && selectedContact.telegram_id === data.telegram_id) {
          fetchSelectedHistory(selectedContact.telegram_id);
        }
        
        if (data.sender === 'contact') {
          playChime('message');
        }
        
        // Append to logs
        const logMsg = `Telegram Message Relayed - Chat: ${data.telegram_id} - ${data.sender}: ${data.text.slice(0, 30)}...`;
        setLogs(prev => [{ id: Date.now(), timestamp: new Date().toISOString(), level: 'INFO', message: logMsg }, ...prev]);
        fetchContacts();
        fetchAnalytics();
      }
      
      if (evt === 'draft_created') {
        if (selectedContact && selectedContact.telegram_id === data.telegram_id) {
          setPendingDraft(data.draft);
        }
        fetchContacts();
      }

      if (evt === 'analysis_update') {
        if (selectedContact && selectedContact.telegram_id === data.telegram_id) {
          fetchSelectedHistory(selectedContact.telegram_id);
        }
        if (data.suggested_category === 'scammer' && data.is_muted === 1) {
          playChime('alarm');
        } else if (data.priority === 'critical') {
          playChime('alarm');
        }
        fetchContacts();
      }

      if (evt === 'new_reminder') {
        playChime('message');
        fetchReminders();
      }
    };
    
    ws.onclose = () => {
      setWsConnected(false);
      console.log("WebSocket stream disconnected. Reconnecting in 5s...");
      setTimeout(() => {
        if (token) fetchSysStatus();
      }, 5000);
    };
    
    return () => {
      ws.close();
    };
  }, [token, selectedContact]);

  // Live Clock Interval Tick
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial Fetches
  useEffect(() => {
    fetchSysStatus();
    if (token) {
      fetchSettings();
      fetchContacts();
      fetchLogs();
      fetchAnalytics();
      fetchKeywordRules();
      fetchReminders();
    }
  }, [token]);

  // Scroll Chat Stream & Log terminal
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = 0;
    }
  }, [logs]);

  // Spotlight Keyboard Shortcut Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen(open => !open);
        setSpotlightSearch('');
        setSpotlightIndex(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getSpotlightItems = () => {
    const items = [
      { id: 'toggle_ai', label: `🤖 Toggle AI Autopilot (${sysStatus.ai_enabled ? 'ON → OFF' : 'OFF → ON'})`, type: 'action', desc: 'Enable/disable automatic AI replies' },
      { id: 'toggle_approval', label: `✅ Toggle Approval Required (${sysStatus.approval_mode ? 'ON → OFF' : 'OFF → ON'})`, type: 'action', desc: 'Require manual approval before sending drafts' },
      { id: 'status_online', label: '🟢 Set Status: Online', type: 'action', desc: 'Set active status preset' },
      { id: 'status_focus', label: '🎯 Set Status: Focus', type: 'action', desc: 'Set active status preset' },
      { id: 'status_busy', label: '🔴 Set Status: Busy', type: 'action', desc: 'Set active status preset' },
      { id: 'status_sleeping', label: '🌙 Set Status: Sleeping', type: 'action', desc: 'Set active status preset' },
      { id: 'diagnostics', label: '🛡️ Run API Key Diagnostics', type: 'action', desc: `Pings all ${keyPool.length || 5} Gemini keys to check health status` },
      { id: 'clear_logs', label: '🗑️ Clear Event Logs', type: 'action', desc: 'Flush all events from SQLite database' },
      { id: 'test_chime', label: '🔊 Test Audio Chime', type: 'action', desc: 'Play synthesized success notification' },
    ];
    
    // Add filtered contacts
    contacts.forEach(c => {
      items.push({
        id: `contact_${c.telegram_id}`,
        label: `👤 Chat: ${c.first_name || ''} ${c.last_name || ''}`,
        type: 'contact',
        desc: c.username ? `@${c.username}` : `ID: ${c.telegram_id}`,
        contact: c
      });
    });

    if (!spotlightSearch.trim()) return items;

    return items.filter(item => 
      item.label.toLowerCase().includes(spotlightSearch.toLowerCase()) ||
      (item.desc && item.desc.toLowerCase().includes(spotlightSearch.toLowerCase()))
    );
  };

  const handleSpotlightAction = async (item) => {
    playChime('message');
    if (item.type === 'contact') {
      setActiveTab('contacts');
      handleSelectContact(item.contact);
      setSpotlightOpen(false);
    } else if (item.type === 'action') {
      if (item.id === 'toggle_ai') {
        saveSettings({ ai_enabled: !sysStatus.ai_enabled });
      } else if (item.id === 'toggle_approval') {
        saveSettings({ approval_mode: !sysStatus.approval_mode });
      } else if (item.id === 'diagnostics') {
        setSpotlightOpen(false);
        setActiveTab('overview');
        handleCheckKeys();
      } else if (item.id === 'clear_logs') {
        if (window.confirm('Clear all logs?')) {
          handleClearLogs();
        }
      } else if (item.id === 'test_chime') {
        playChime('message');
      } else if (item.id.startsWith('status_')) {
        const stat = item.id.replace('status_', '');
        saveSettings({ status: stat });
      }
      setSpotlightOpen(false);
    }
  };

  // Trigger fetches on tab changes
  useEffect(() => {
    if (token) {
      if (activeTab === 'overview') {
        fetchSysStatus();
        fetchAnalytics();
        fetchReminders();
      } else if (activeTab === 'contacts') {
        fetchContacts();
      } else if (activeTab === 'logs') {
        fetchLogs();
      } else if (activeTab === 'rules') {
        fetchSettings();
        fetchKeywordRules();
      } else if (activeTab === 'pipeline') {
        fetchContacts();
      }
    }
  }, [activeTab]);

  // Handle Chat Selection
  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setChatSearch('');
    fetchSelectedHistory(contact.telegram_id);
  };

  // AI Response Tester
  const handleTestAI = async (e) => {
    e.preventDefault();
    if (!aiTestMsg.trim()) return;
    setAiTestLoading(true);
    setAiTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/test-ai`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ message: aiTestMsg, status_mode: aiTestStatus, contact_name: 'Test User' })
      });
      if (res.ok) {
        const data = await res.json();
        setAiTestResult(data);
      }
    } catch (err) {
      setAiTestResult({ draft_reply: `Error: ${err.message}`, sentiment: 'error', priority: 'normal' });
    } finally {
      setAiTestLoading(false);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/logs`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setLogs([]);
        setLogClearConfirm(false);
      }
    } catch (err) { console.error(err); }
  };

  // Clear Contact Memory
  const handleClearMemory = async (telegramId) => {
    try {
      const res = await fetch(`${API_BASE}/api/contacts/${telegramId}/clear-memory`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        setSelectedContact(prev => ({ ...prev, relationship_summary: '', notes: '' }));
        fetchContacts();
      }
    } catch (err) { console.error(err); }
  };

  // Time ago helper
  const getTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    try {
      let t = timestamp;
      if (t && !t.endsWith('Z') && !t.includes('+') && !t.includes('-', 10)) t += 'Z';
      const diff = (Date.now() - new Date(t).getTime()) / 1000;
      if (diff < 60) return `${Math.floor(diff)}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch { return ''; }
  };

  // Export logs as TXT
  const handleExportLogs = () => {
    const filtered = logs.filter(log => {
      const matchesFilter = logFilter === 'ALL' || log.level === logFilter;
      const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase());
      return matchesFilter && matchesSearch;
    });
    const content = filtered.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coet-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render Login Portal
  if (!token) {
    return (
      <div className="login-screen-wrapper" style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw'
      }}>
        <div className="glass-container" style={{ padding: '40px', width: '420px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <ShieldIcon className="w-8 h-8 text-primary" style={{ color: 'var(--color-primary)' }} />
            Coet Portal
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '25px' }}>
            Executive Automation Manager Control Unit
          </p>
          <form onSubmit={handleAdminLogin}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>ENTER SECURITY PASSWORD</label>
              <input 
                type="password" 
                className="glass-input" 
                placeholder="Manager Password" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>SELECT YOUR TIMEZONE</label>
                <select 
                  value={loginTimezone} 
                  onChange={(e) => setLoginTimezone(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', cursor: 'pointer' }}
                >
                  <option value="Asia/Kolkata">India Standard Time (IST - Asia/Kolkata)</option>
                  <option value="UTC">Coordinated Universal Time (UTC)</option>
                  <option value="America/New_York">US Eastern Time (EST/EDT)</option>
                  <option value="America/Chicago">US Central Time (CST/CDT)</option>
                  <option value="America/Denver">US Mountain Time (MST/MDT)</option>
                  <option value="America/Los_Angeles">US Pacific Time (PST/PDT)</option>
                  <option value="Europe/London">London / Greenwich Time (GMT/BST)</option>
                  <option value="Europe/Paris">Central European Time (CET/CEST)</option>
                  <option value="Asia/Singapore">Singapore Standard Time (SGT)</option>
                  <option value="Asia/Tokyo">Japan Standard Time (JST)</option>
                  <option value="Australia/Sydney">Sydney Time (AEST/AEDT)</option>
                </select>
              </div>
              {authError && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{authError}</p>}
              <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>Access Control Unit</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const renderPipelineColumn = (title, list, defaultCat, accentColor = 'var(--color-primary)') => {
    const getPriorityFlag = (c) => {
      if (c.category === 'vip') return { emoji: '🔴', label: 'VIP', color: '#ef4444' };
      if (c.category === 'client' || c.category === 'business_partner') return { emoji: '🟡', label: 'Active', color: '#f59e0b' };
      return { emoji: '🟢', label: 'Normal', color: '#10b981' };
    };

    return (
      <div className="glass-container" style={{ 
        flex: '1', minWidth: '270px', maxWidth: '330px', padding: '16px', 
        display: 'flex', flexDirection: 'column', gap: '12px',
        background: 'rgba(13, 17, 38, 0.25)', height: '100%',
        borderTop: `2px solid ${accentColor}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
            {title}
          </h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {list.filter(c => c.is_muted === 1).length > 0 && `🔇${list.filter(c => c.is_muted === 1).length} `}
            </span>
            <span style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44`, color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
              {list.length}
            </span>
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
          {list.map(c => {
            const flag = getPriorityFlag(c);
            const timeAgo = getTimeAgo(c.last_active || c.created_at);
            return (
              <div 
                key={c.telegram_id}
                className="glass-container-hover"
                style={{ 
                  padding: '12px', borderRadius: '10px', 
                  background: 'rgba(255,255,255,0.01)', 
                  border: `1px solid ${c.is_muted === 1 ? 'rgba(100,116,139,0.15)' : 'var(--border-glass)'}`,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '7px',
                  opacity: c.is_muted === 1 ? 0.65 : 1
                }}
                onClick={() => { setActiveTab('contacts'); handleSelectContact(c); }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span title={flag.label}>{flag.emoji}</span>
                      {c.is_muted === 1 && (
                        <span className="badge takeover-badge" style={{ fontSize: '0.52rem', padding: '1px 5px', gap: '3px', flexShrink: 0 }}>
                          ⚔️ Takeover
                        </span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.first_name || ''} {c.last_name || ''}
                      </span>
                    </span>
                    {c.username && (
                      <p style={{ color: 'var(--text-dark)', fontSize: '0.68rem', marginTop: '1px' }}>@{c.username}</p>
                    )}
                  </div>
                  <span className={`badge badge-cat-${c.category}`} style={{ fontSize: '0.58rem', padding: '2px 5px', flexShrink: 0 }}>
                    {c.category}
                  </span>
                </div>

                {/* Notes preview */}
                {c.notes && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.73rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.4' }}>
                    📝 {c.notes}
                  </p>
                )}

                {/* AI summary chip */}
                {c.relationship_summary && (
                  <div style={{ 
                    fontSize: '0.68rem', color: '#bae6fd', 
                    background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.14)',
                    padding: '4px 7px', borderRadius: '6px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    🧠 {c.relationship_summary.split('\n')[0].replace(/^[-\*\s•]+/, '').slice(0, 60)}
                  </div>
                )}

                {/* Footer row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '7px' }} 
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    {timeAgo && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dark)', background: 'rgba(255,255,255,0.03)', padding: '2px 5px', borderRadius: '4px' }}>
                        🕐 {timeAgo}
                      </span>
                    )}
                    <button
                      title="Quick note"
                      onClick={() => { setPipelineNoteContact(c); setPipelineNoteText(c.notes || ''); }}
                      style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.15)', color: '#d8b4fe' }}
                    >
                      ✏️ Note
                    </button>
                  </div>
                  <select 
                    value={c.category} 
                    onChange={e => updateContactMeta(c.telegram_id, { category: e.target.value })}
                    className="glass-input"
                    style={{ padding: '2px 4px', fontSize: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px' }}
                  >
                    <option value="unknown">→ Lead</option>
                    <option value="client">→ Client</option>
                    <option value="business_partner">→ Partner</option>
                    <option value="vip">→ VIP</option>
                    <option value="friend">→ Friend</option>
                    <option value="family">→ Family</option>
                  </select>
                </div>
              </div>
            );
          })}
          {list.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '8px', paddingTop: '40px' }}>
              <span style={{ fontSize: '1.8rem', opacity: 0.3 }}>📭</span>
              <p style={{ color: 'var(--text-dark)', fontSize: '0.8rem', fontStyle: 'italic' }}>No contacts here</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <h1 className="sidebar-title">
          <ShieldIcon className="w-7 h-7" style={{ color: 'var(--color-primary)' }} />
          Coet Manager
        </h1>
        
        {/* Core Status Block */}
        <div className="glass-container" style={{ padding: '15px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: sysStatus.telegram_connected ? 'var(--color-success)' : 'var(--color-danger)',
              boxShadow: sysStatus.telegram_connected ? '0 0 8px var(--color-success)' : '0 0 8px var(--color-danger)'
            }} />
            <span style={{ fontWeight: 600 }}>Telegram Account</span>
          </div>
          <p style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>ID: {sysStatus.phone || '+351937898039'}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
            AI Engine: <span style={{ color: 'var(--color-secondary)' }}>Gemini Active</span>
          </p>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button 
            className={`sidebar-nav-btn ${activeTab === 'overview' ? 'active-nav' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <DashboardIcon /> Overview
          </button>
          
          <button 
            className={`sidebar-nav-btn ${activeTab === 'contacts' ? 'active-nav' : ''}`}
            onClick={() => setActiveTab('contacts')}
          >
            <ContactsIcon /> Contacts & Memory
          </button>
          
          <button 
            className={`sidebar-nav-btn ${activeTab === 'pipeline' ? 'active-nav' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg> Deals Pipeline
          </button>
          
          <button 
            className={`sidebar-nav-btn ${activeTab === 'rules' ? 'active-nav' : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            <SettingsIcon /> AI & Rules
          </button>
          
          <button 
            className={`sidebar-nav-btn ${activeTab === 'logs' ? 'active-nav' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <LogsIcon /> System Logs
          </button>
        </nav>
        
        {/* Footer info */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Live Clock */}
          <div style={{ background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.15)', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: '#d8b4fe', letterSpacing: '0.05em' }}>
              {liveClock.toLocaleTimeString('en-IN', { timeZone: settings.timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dark)', marginTop: '2px' }}>
              {liveClock.toLocaleDateString('en-IN', { timeZone: settings.timezone || 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
          {/* WS indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: wsConnected ? '#10b981' : '#ef4444', display: 'inline-block', animation: wsConnected ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: '0.72rem', color: wsConnected ? '#34d399' : '#f87171' }}>
              {wsConnected ? 'Live Stream Active' : 'Stream Offline'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)', textAlign: 'center' }}>Coet System v2.5</div>
          <button className="glass-btn-secondary" onClick={handleLogout} style={{ fontSize: '0.85rem' }}>Logout</button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main-content">
        {/* HEADER BAR */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.8rem' }}>
              {activeTab === 'overview' && 'Executive Console'}
              {activeTab === 'contacts' && 'Conversation Memory Vault'}
              {activeTab === 'pipeline' && 'Deals & Client Pipeline'}
              {activeTab === 'rules' && 'Manager Rules Configuration'}
              {activeTab === 'logs' && 'System Event Terminal'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {activeTab === 'overview' && 'Real-time telemetry and automation oversight.'}
              {activeTab === 'contacts' && 'Review relationships, custom client folders, and message histories.'}
              {activeTab === 'pipeline' && 'Steer client folders, monitor commitments, and manage active transactions.'}
              {activeTab === 'rules' && 'Tune automation modes, response delays, and persona parameters.'}
              {activeTab === 'logs' && 'Audit trail of server actions, database commits, and AI operations.'}
            </p>
          </div>

          {/* Live clock + WS badge in header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="glass-btn-secondary micro-scale glow-shadow-primary"
              onClick={() => {
                setSpotlightOpen(true);
                setSpotlightSearch('');
                setSpotlightIndex(0);
                playChime('message');
              }}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderColor: 'var(--color-primary)',
                background: 'var(--color-primary-glow)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              ⌨️ Summon Console <kbd style={{ fontSize: '0.7rem', opacity: 0.8, background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>⌘K</kbd>
            </button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#d8b4fe' }}>
                {liveClock.toLocaleTimeString('en-IN', { timeZone: settings.timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dark)' }}>
                {liveClock.toLocaleDateString('en-IN', { timeZone: settings.timezone || 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: wsConnected ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${wsConnected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: '8px', padding: '4px 10px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: wsConnected ? '#10b981' : '#ef4444', display: 'inline-block', animation: wsConnected ? 'pulse 1.5s infinite' : 'none' }} />
              <span style={{ fontSize: '0.72rem', color: wsConnected ? '#34d399' : '#f87171', fontWeight: 600 }}>WS {wsConnected ? 'LIVE' : 'OFF'}</span>
            </div>
          </div>

          {/* Quick status selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {sysStatus.resolved_status && sysStatus.resolved_status !== sysStatus.current_status && (
              <span className="badge" style={{
                backgroundColor: 'rgba(124, 77, 255, 0.15)',
                color: '#d8b4fe',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                boxShadow: '0 0 10px rgba(139, 92, 246, 0.2)',
                fontSize: '0.8rem',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span className="pulse-dot" style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  display: 'inline-block'
                }} />
                Auto-Override: {sysStatus.resolved_status.toUpperCase()}
              </span>
            )}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>CURRENT STATE:</span>
            <select 
              value={sysStatus.current_status}
              onChange={(e) => saveSettings({ status: e.target.value })}
              className="glass-input"
              style={{
                background: 'rgba(124, 77, 255, 0.1)',
                border: '1px solid var(--color-primary)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="online">Online / Active</option>
              <option value="busy">Busy / In Meeting</option>
              <option value="focus">Deep Focus Mode</option>
              <option value="sleeping">Sleeping Mode</option>
              <option value="travel">Travel Mode</option>
              <option value="vacation">Vacation Mode</option>
            </select>
          </div>
        </header>

        {/* TAB CONTENTS */}
        
        {/* TAB 1: OVERVIEW / DASHBOARD */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Connection Check / setup wizard */}
            {loginStep !== 'authenticated' && (
              <div className="glass-container" style={{ padding: '25px', borderColor: 'var(--color-warning)' }}>
                <h3 style={{ color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <AlertIcon /> Telegram Action Required
                </h3>
                <p style={{ fontSize: '0.9rem', marginBottom: '15px', color: 'var(--text-muted)' }}>
                  The Executive Telegram bot needs verification to log in and control target account <b>{sysStatus.phone || '+351937898039'}</b>.
                </p>
                
                {loginStep === 'init' && (
                  <button className="glass-btn" onClick={handleSendTelegramCode} disabled={loginLoading}>
                    {loginLoading ? 'Requesting Code...' : 'Initialize Connection'}
                  </button>
                )}

                {loginStep === 'code_pending' && (
                  <form onSubmit={handleTelegramAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ENTER TELEGRAM CODE SENT TO YOUR APP</label>
                      <input 
                        type="text" 
                        className="glass-input" 
                        placeholder="e.g. 54321" 
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>2-STEP PASSWORD (IF ACTIVE)</label>
                      <input 
                        type="password" 
                        className="glass-input" 
                        placeholder="2FA Password" 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>
                    {loginError && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{loginError}</p>}
                    <button type="submit" className="glass-btn" disabled={loginLoading}>
                      {loginLoading ? 'Verifying...' : 'Validate Credentials'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Quick Actions Strip */}
            <div className="glass-container" style={{ padding: '14px 20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', borderColor: 'rgba(124,77,255,0.2)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>⚡ QUICK STATUS:</span>
              {[
                { label: '🟢 Online', value: 'online', color: '#10b981' },
                { label: '🔴 Busy', value: 'busy', color: '#ef4444' },
                { label: '🎯 Focus', value: 'focus', color: '#8b5cf6' },
                { label: '🌙 Sleep', value: 'sleeping', color: '#64748b' },
                { label: '✈️ Travel', value: 'travel', color: '#f59e0b' },
                { label: '🏖️ Vacation', value: 'vacation', color: '#06b6d4' },
              ].map(s => (
                <button
                  key={s.value}
                  onClick={() => saveSettings({ status: s.value })}
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: `1px solid ${sysStatus.current_status === s.value ? s.color : 'rgba(255,255,255,0.08)'}`,
                    background: sysStatus.current_status === s.value ? `${s.color}22` : 'rgba(255,255,255,0.02)',
                    color: sysStatus.current_status === s.value ? s.color : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {s.label}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>AI ENGINE:</span>
                <button
                  onClick={() => saveSettings({ ai_enabled: !sysStatus.ai_enabled })}
                  style={{
                    padding: '5px 16px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', cursor: 'pointer',
                    border: `1px solid ${sysStatus.ai_enabled ? '#10b981' : '#ef4444'}`,
                    background: sysStatus.ai_enabled ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: sysStatus.ai_enabled ? '#10b981' : '#ef4444',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {sysStatus.ai_enabled ? '🤖 ON' : '⏸ OFF'}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>APPROVAL:</span>
                <button
                  onClick={() => saveSettings({ approval_mode: !sysStatus.approval_mode })}
                  style={{
                    padding: '5px 16px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', cursor: 'pointer',
                    border: `1px solid ${sysStatus.approval_mode ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`,
                    background: sysStatus.approval_mode ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.02)',
                    color: sysStatus.approval_mode ? '#f59e0b' : 'var(--text-muted)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {sysStatus.approval_mode ? '✅ Required' : '⚡ Auto-Send'}
                </button>
              </div>
            </div>

            {/* Metrics cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              <div className="glass-container glass-container-hover" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>TOTAL COMMUNICATIONS</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', marginTop: '8px', color: 'var(--text-primary)' }}>
                  {analytics.total_messages}
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>All inbound + outbound msgs</span>
              </div>
              <div className="glass-container glass-container-hover" style={{ padding: '20px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>MANAGED BY COET</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', marginTop: '8px', color: 'var(--color-primary)' }}>
                  {analytics.handled_by_ai}
                </h3>
                <div style={{ marginTop: '6px', height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${analytics.total_messages > 0 ? Math.round(analytics.handled_by_ai / analytics.total_messages * 100) : 0}%`, background: 'var(--color-primary)', borderRadius: '4px', transition: 'width 1s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>{analytics.total_messages > 0 ? Math.round(analytics.handled_by_ai / analytics.total_messages * 100) : 0}% automation rate</span>
              </div>
              <div className="glass-container glass-container-hover" style={{ padding: '20px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>CRITICAL ALERTS</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', marginTop: '8px', color: analytics.critical_alerts > 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                  {analytics.critical_alerts}
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Priority-escalated events</span>
              </div>
              <div className="glass-container glass-container-hover" style={{ padding: '20px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>RESPONSE RATE</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', marginTop: '8px', color: '#10b981' }}>
                  {analytics.response_rate}%
                </h3>
                <div style={{ marginTop: '6px', height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${analytics.response_rate}%`, background: '#10b981', borderRadius: '4px', transition: 'width 1s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Chats with assistant reply</span>
              </div>
              <div className="glass-container glass-container-hover" style={{ padding: '20px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>AVG REPLY TIME</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', marginTop: '8px', color: '#06b6d4' }}>
                  {analytics.avg_response_time > 0 ? `${analytics.avg_response_time}s` : '—'}
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Contact message → reply</span>
              </div>
              <div className="glass-container glass-container-hover" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>OWNER ACTIVITY</p>
                  <select
                    value={settings.owner_activity_override || 'auto'}
                    onChange={(e) => saveSettings({ owner_activity_override: e.target.value })}
                    className="glass-input"
                    style={{ padding: '1px 4px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', cursor: 'pointer', borderRadius: '4px' }}
                  >
                    <option value="auto">Auto</option>
                    <option value="online">Force On</option>
                    <option value="offline">Force Off</option>
                  </select>
                </div>
                <div style={{ marginTop: '12px' }}>
                  {sysStatus.owner_online ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '6px 12px', color: '#a7f3d0', fontSize: '0.85rem', fontWeight: 600 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                      Active / Online
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: '8px', padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'rgba(148,163,184,0.4)', display: 'inline-block' }} />
                      Idle / Offline
                    </span>
                  )}
                </div>
              </div>
            </div>


            {/* Weekly Flow and Agenda Grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', margin: '20px 0' }}>
              {renderTrafficChart()}
              {renderAgendaPanel()}
            </div>

            {/* Gemini API Key Pool Diagnostics */}
            <div className="glass-container" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🧠 Gemini API Key Rotation Pool</span>
                    {keyPool.length > 0 && (
                      <span style={{ fontSize: '0.75rem', background: 'rgba(124,77,255,0.15)', border: '1px solid rgba(124,77,255,0.3)', borderRadius: '999px', padding: '2px 10px', color: 'var(--color-primary)', fontWeight: 600 }}>
                        {keyPool.filter(k => k.status === 'active').length}/{keyPool.length} Active
                      </span>
                    )}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>Live health status of all configured API keys. The system automatically rotates to the next available key when one is rate-limited or exhausted.</p>
                </div>
                <button
                  id="btn-check-keys"
                  className="glass-btn"
                  onClick={async () => {
                    setKeyPoolLoading(true);
                    setKeyPoolError('');
                    try {
                      const res = await fetch(`${API_BASE}/api/admin/check-keys`, {
                        method: 'POST',
                        headers: getHeaders()
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setKeyPool(data.keys);
                      } else {
                        setKeyPoolError('Diagnostics request failed.');
                      }
                    } catch (err) {
                      setKeyPoolError('Network error running diagnostics.');
                    } finally {
                      setKeyPoolLoading(false);
                    }
                  }}
                  disabled={keyPoolLoading}
                  style={{ padding: '8px 18px', fontSize: '0.82rem', minWidth: '180px' }}
                >
                  {keyPoolLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Testing Keys...
                    </span>
                  ) : '🔄 Refresh Key Diagnostics'}
                </button>
              </div>
              {keyPoolError && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: '12px' }}>{keyPoolError}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {keyPool.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1/-1', textAlign: 'center', padding: '20px' }}>
                    No key data yet. Click "Refresh Key Diagnostics" to run a live check.
                  </p>
                ) : keyPool.map((key) => {
                  const statusConfig = {
                    active:         { label: 'Active',         color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', icon: '✅' },
                    quota_exceeded: { label: 'Quota Exceeded', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '⚠️' },
                    invalid:        { label: 'Invalid',        color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: '❌' },
                    timeout:        { label: 'Timeout/Busy',   color: '#818cf8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.25)', icon: '⏳' },
                    error:          { label: 'Error',          color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '⚠️' },
                    unknown:        { label: 'Unknown',        color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.25)', icon: '❓' },
                  };
                  const cfg = statusConfig[key.status] || statusConfig.unknown;
                  return (
                    <div key={key.index} style={{
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>KEY {key.index}</span>
                        <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '1px 6px' }}>{key.prefix}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1rem' }}>{cfg.icon}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                      </div>
                      {key.cooldown_remaining > 0 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Retrying in {key.cooldown_remaining}s</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '30px' }}>
              
              {/* Daily Briefing Center */}
              <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📋 Executive Daily Briefing</span>
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                    On-demand AI intelligence report synthesized by Gemini. Analyzes deal pipelines, commitments, and urgent items.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button 
                    className="glass-btn" 
                    onClick={() => fetchDailyBriefing(false)} 
                    disabled={briefingLoading}
                    style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                  >
                    {briefingLoading && !briefingSentSuccess ? 'Analyzing...' : '🔄 Generate 24h Briefing'}
                  </button>
                  {briefingData && (
                    <button 
                      className="glass-btn-outline" 
                      onClick={() => fetchDailyBriefing(true)} 
                      disabled={briefingLoading}
                      style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                    >
                      {briefingLoading && briefingSentSuccess ? 'Sending...' : '✈️ Forward to Telegram Channel'}
                    </button>
                  )}
                </div>

                {briefingError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{briefingError}</p>
                )}

                {briefingSentSuccess && !briefingLoading && (
                  <p style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600 }}>✔️ Briefing successfully forwarded to your Telegram notification channel!</p>
                )}

                {briefingData && (
                  <div style={{ 
                    background: 'rgba(0, 0, 0, 0.2)', 
                    border: '1px solid var(--border-glass)', 
                    borderRadius: '12px', 
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '15px',
                    maxHeight: '380px',
                    overflowY: 'auto'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>Report Date: {briefingData.date}</span>
                      <span>Active Chats: {briefingData.total_contacts_active}</span>
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--color-secondary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>💼 Business & Deal Pipeline</h4>
                      {briefingData.deal_pipeline && briefingData.deal_pipeline.length > 0 ? (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {briefingData.deal_pipeline.map((item, idx) => <li key={idx}>{item}</li>)}
                        </ul>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No active business deals detected in the logs.</p>
                      )}
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--color-warning)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>⚠️ Urgent Action Items</h4>
                      {briefingData.urgent_action_items && briefingData.urgent_action_items.length > 0 ? (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {briefingData.urgent_action_items.map((item, idx) => <li key={idx}>{item}</li>)}
                        </ul>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No urgent issues requiring immediate attention.</p>
                      )}
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>🎭 Customer Sentiment & Relationship Vibes</h4>
                      {briefingData.relationship_vibe_summary && briefingData.relationship_vibe_summary.length > 0 ? (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {briefingData.relationship_vibe_summary.map((item, idx) => <li key={idx}>{item}</li>)}
                        </ul>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No sentiment data summarized.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sentiment & Contact Vibe Charts */}
              <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff' }}>
                    🎭 Sentiment & Relationship Vibe Metrics
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                    Statistical breakdown of user emotions and contact categories processed in real-time.
                  </p>
                </div>

                {/* Sentiment Bar Charts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>CLIENT SENTIMENTS</h4>
                  {(() => {
                    const sData = analytics.sentiments || {};
                    const total = Object.values(sData).reduce((a, b) => a + b, 0);
                    const sentimentsList = ['happiness', 'excitement', 'neutral', 'urgency', 'frustration', 'confusion', 'anger', 'sadness'];
                    
                    const getSentimentColor = (s) => {
                      if (s === 'happiness' || s === 'excitement') return 'var(--color-success)';
                      if (s === 'neutral') return 'var(--color-info)';
                      if (s === 'urgency' || s === 'frustration') return 'var(--color-warning)';
                      return 'var(--color-danger)';
                    };

                    if (total === 0) {
                      return (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>
                          No messages categorized yet to chart sentiments.
                        </p>
                      );
                    }

                    return sentimentsList.map(s => {
                      const count = sData[s] || 0;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      if (count === 0) return null;

                      return (
                        <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500 }}>
                            <span style={{ textTransform: 'capitalize' }}>
                              {s === 'happiness' ? '😊 Happiness' : ''}
                              {s === 'excitement' ? '🚀 Excitement' : ''}
                              {s === 'neutral' ? '😐 Neutral' : ''}
                              {s === 'urgency' ? '🚨 Urgency' : ''}
                              {s === 'frustration' ? '😤 Frustration' : ''}
                              {s === 'confusion' ? '🤔 Confusion' : ''}
                              {s === 'anger' ? '😡 Anger' : ''}
                              {s === 'sadness' ? '😢 Sadness' : ''}
                            </span>
                            <span>{count} ({pct}%)</span>
                          </div>
                          <div style={{ 
                            height: '8px', 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid var(--border-glass)', 
                            borderRadius: '4px', 
                            overflow: 'hidden' 
                          }}>
                            <div style={{ 
                              height: '100%', 
                              width: `${pct}%`, 
                              background: `linear-gradient(90deg, ${getSentimentColor(s)}, var(--color-primary))`,
                              borderRadius: '4px',
                              boxShadow: `0 0 8px ${getSentimentColor(s)}`
                            }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Categories Badge Counters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-glass)', paddingTop: '15px', marginTop: '5px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>CONTACT SEGMENTS</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Object.entries(analytics.categories || {}).map(([cat, count]) => (
                      <span key={cat} className={`badge badge-cat-${cat}`} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                        {cat.replace('_', ' ')}: {count}
                      </span>
                    ))}
                    {Object.keys(analytics.categories || {}).length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No categorizations recorded.</p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Split layout for Live Logs and Pending Drafts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '30px' }}>
              {/* Left Column: Live Message Feed */}
              <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                  Live Communication Stream
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }}>
                  {contacts.slice(0, 8).map(contact => (
                    <div 
                      key={contact.telegram_id} 
                      className="glass-container-hover"
                      onClick={() => {
                        setActiveTab('contacts');
                        handleSelectContact(contact);
                      }}
                      style={{ 
                        padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.01)', 
                        border: '1px solid var(--border-glass)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {contact.first_name || ''} {contact.last_name || ''}
                        </span>
                        <span className={`badge badge-cat-${contact.category}`}>
                          {contact.category}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contact.notes || 'No context summary recorded.'}
                      </p>
                    </div>
                  ))}
                  {contacts.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                      No chats processed by manager yet.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Pending Draft Approvals */}
              <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                  Pending Draft Approvals
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '400px', overflowY: 'auto' }}>
                  {contacts.filter(c => c.telegram_id).map(contact => {
                    // Check if we have a saved draft for this contact ID
                    // Wait, we can query it or if it is locally flagged. To be safe, we let contacts list hold it
                    // Or retrieve all drafts. Let's list contacts who require action.
                    return null; // We will handle drafts inside the Contact manager detailed chat.
                  })}
                  
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '20px', textAlign: 'center' }}>
                    <p>Go to the "Contacts & Memory" tab to view specific drafts, override AI generated responses, or take over chats manually.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONTACTS & MEMORY */}
        {activeTab === 'contacts' && (
          <div style={{ display: 'flex', gap: '30px', height: 'calc(100vh - 180px)' }}>
            
            {/* Left Column: Search & Contact list */}
            <div className="glass-container" style={{ width: '300px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="text" 
                className="glass-input" 
                placeholder="🔍 Search contacts..." 
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                style={{ width: '100%' }}
              />
              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {['all','client','vip','family','friend','muted'].map(f => (
                  <button key={f} onClick={() => setContactFilter(f)} style={{
                    padding: '3px 8px', fontSize: '0.7rem', fontWeight: 600, borderRadius: '6px', cursor: 'pointer',
                    border: `1px solid ${contactFilter === f ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)'}`,
                    background: contactFilter === f ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.02)',
                    color: contactFilter === f ? '#d8b4fe' : 'var(--text-muted)', textTransform: 'capitalize'
                  }}>{f}</button>
                ))}
              </div>
              {/* Sort + Count */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>
                  {contacts.filter(c => {
                    if (contactFilter === 'all') return true;
                    if (contactFilter === 'muted') return c.is_muted === 1;
                    return c.category === contactFilter;
                  }).length} contacts
                </span>
                <select value={contactSort} onChange={e => setContactSort(e.target.value)} className="glass-input"
                  style={{ padding: '2px 6px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: '#fff', cursor: 'pointer' }}>
                  <option value="recent">Recent</option>
                  <option value="name">Name A-Z</option>
                  <option value="priority">Priority</option>
                </select>
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contacts
                  .filter(c => {
                    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
                    const user = (c.username || '').toLowerCase();
                    const query = contactSearch.toLowerCase();
                    const matchesSearch = name.includes(query) || user.includes(query);
                    const matchesFilter = contactFilter === 'all' ? true :
                      contactFilter === 'muted' ? c.is_muted === 1 : c.category === contactFilter;
                    return matchesSearch && matchesFilter;
                  })
                  .sort((a, b) => {
                    if (contactSort === 'name') return (a.first_name || '').localeCompare(b.first_name || '');
                    if (contactSort === 'priority') {
                      const prioOrder = { vip: 0, client: 1, business_partner: 2, team_member: 3, friend: 4, family: 5, unknown: 6 };
                      return (prioOrder[a.category] ?? 99) - (prioOrder[b.category] ?? 99);
                    }
                    return 0;
                  })
                  .map(c => (
                    <div 
                      key={c.telegram_id}
                      onClick={() => handleSelectContact(c)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: selectedContact?.telegram_id === c.telegram_id ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.01)',
                        border: '1px solid',
                        borderColor: selectedContact?.telegram_id === c.telegram_id ? 'var(--color-primary)' : 'var(--border-glass)',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {c.is_muted === 1 && (
                            <span className="badge takeover-badge" style={{ fontSize: '0.52rem', padding: '1px 5px', gap: '3px', marginRight: '4px', flexShrink: 0 }}>
                              ⚔️ Takeover
                            </span>
                          )}
                          {c.first_name || ''} {c.last_name || ''}
                        </span>
                        <span className={`badge badge-cat-${c.category}`} style={{ fontSize: '0.6rem' }}>
                          {c.category}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.username ? `@${c.username}` : `ID: ${c.telegram_id}`}
                      </p>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Right Column: Chat History & Memory Panel */}
            {selectedContact ? (
              <div style={{ flex: 1, display: 'flex', gap: '30px' }}>
                
                {/* Center Panel: Messages & Input */}
                <div className="glass-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Selected Contact Header */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                      <h4 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {selectedContact.first_name} {selectedContact.last_name}
                        <span className={`badge badge-cat-${selectedContact.category}`} style={{ fontSize: '0.6rem' }}>{selectedContact.category}</span>
                      </h4>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{selectedContact.username ? `@${selectedContact.username}` : `ID: ${selectedContact.telegram_id}`}</p>
                    </div>
                    
                    {/* Controls Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="🔍 Search messages..."
                        value={chatSearch}
                        onChange={e => setChatSearch(e.target.value)}
                        style={{ padding: '4px 10px', fontSize: '0.78rem', width: '150px' }}
                      />
                      <select 
                        value={selectedContact.category}
                        onChange={(e) => updateContactMeta(selectedContact.telegram_id, { category: e.target.value })}
                        className="glass-input"
                        style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                      >
                        <option value="family">Family</option>
                        <option value="friend">Friend</option>
                        <option value="client">Client</option>
                        <option value="vip">VIP Partner</option>
                        <option value="business_partner">Business Partner</option>
                        <option value="team_member">Team Member</option>
                        <option value="unknown">Unknown</option>
                      </select>
                      <button 
                        className="micro-scale"
                        onClick={() => {
                          updateContactMeta(selectedContact.telegram_id, { is_muted: selectedContact.is_muted === 1 ? 0 : 1 });
                          playChime('message');
                        }}
                        style={{
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: `1px solid ${selectedContact.is_muted === 1 ? '#ef4444' : 'var(--color-primary)'}`,
                          background: selectedContact.is_muted === 1 
                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(153, 27, 27, 0.2))' 
                            : 'linear-gradient(135deg, var(--color-primary-glow), rgba(76, 29, 149, 0.2))',
                          color: selectedContact.is_muted === 1 ? '#fca5a5' : '#d8b4fe',
                          boxShadow: selectedContact.is_muted === 1 
                            ? '0 0 10px rgba(239, 68, 68, 0.3)' 
                            : '0 0 10px rgba(139, 92, 246, 0.2)'
                        }}
                      >
                        {selectedContact.is_muted === 1 ? '⚔️ Takeover Active' : '🤖 AI Copilot Active'}
                      </button>
                      <button 
                        className="glass-btn-secondary"
                        onClick={() => {
                          const txt = chatHistory.map(m => `[${m.sender}] ${m.text}`).join('\n');
                          navigator.clipboard.writeText(txt);
                        }}
                        title="Copy full chat as text"
                        style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Message History Area */}
                  <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {selectedContact.is_muted === 1 && (
                      <div className="takeover-banner">
                        <span style={{ fontSize: '1.2rem', animation: 'pulse 1.5s infinite' }}>⚔️</span>
                        <div>
                          <h5 style={{ fontWeight: 600, color: '#fca5a5' }}>Active Manual Takeover Mode</h5>
                          <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '2px' }}>
                            Gemini autopilot is silenced strictly for this chat. Auto-replies are paused.
                          </p>
                        </div>
                      </div>
                    )}
                    {chatHistory
                      .filter(msg => !chatSearch || msg.text?.toLowerCase().includes(chatSearch.toLowerCase()))
                      .map((msg, index) => {
                      const isOwner = msg.sender === 'owner';
                      const isAssistant = msg.sender === 'assistant';
                      
                      return (
                        <div 
                          key={index} 
                          style={{
                            alignSelf: isOwner || isAssistant ? 'flex-end' : 'flex-start',
                            maxWidth: '75%',
                            display: 'flex',

                            flexDirection: 'column',
                            alignItems: isOwner || isAssistant ? 'flex-end' : 'flex-start'
                          }}
                        >
                          <div style={{
                            background: isOwner 
                              ? 'rgba(255, 255, 255, 0.08)' 
                              : (isAssistant ? 'var(--color-primary-glow)' : 'rgba(124, 77, 255, 0.08)'),
                            border: '1px solid',
                            borderColor: isOwner 
                              ? 'rgba(255,255,255,0.1)' 
                              : (isAssistant ? 'var(--color-primary)' : 'rgba(124, 77, 255, 0.2)'),
                            padding: '10px 14px',
                            borderRadius: '12px',
                            borderTopRightRadius: isOwner || isAssistant ? '2px' : '12px',
                            borderTopLeftRadius: isOwner || isAssistant ? '12px' : '2px',
                            fontSize: '0.9rem',
                            color: '#fff',
                            boxShadow: isAssistant ? '0 0 10px rgba(124, 77, 255, 0.15)' : 'none'
                          }}>
                            {msg.text}
                          </div>
                          
                          {/* Tags: Timestamp, Priority, Sentiment */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <span>
                              {(() => {
                                try {
                                  let t = msg.timestamp;
                                  if (t && !t.endsWith('Z') && !t.includes('+') && !t.includes('-')) t += 'Z';
                                  return new Intl.DateTimeFormat('en-US', {
                                    timeZone: settings.timezone || 'Asia/Kolkata',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  }).format(new Date(t));
                                } catch (e) {
                                  return new Date(msg.timestamp).toLocaleTimeString();
                                }
                              })()}
                            </span>
                            {msg.sender === 'contact' && (
                              <>
                                <span className={`badge-sentiment-${msg.sentiment}`} style={{ fontSize: '0.65rem', padding: '0 4px', borderRadius: '4px' }}>
                                  {msg.sentiment}
                                </span>
                                {msg.priority !== 'normal' && (
                                  <span className={`badge-priority-${msg.priority}`} style={{ fontSize: '0.65rem', padding: '0 4px', borderRadius: '4px' }}>
                                    {msg.priority}
                                  </span>
                                )}
                                {msg.language && msg.language !== 'english' && (
                                  <span style={{ 
                                    fontSize: '0.65rem', padding: '0 4px', borderRadius: '4px',
                                    background: 'rgba(139, 92, 246, 0.15)', color: '#d8b4fe',
                                    border: '1px solid rgba(139, 92, 246, 0.3)'
                                  }}>
                                    🌐 {msg.language}
                                  </span>
                                )}
                                {msg.tone && msg.tone !== 'neutral' && (
                                  <span style={{ 
                                    fontSize: '0.65rem', padding: '0 4px', borderRadius: '4px',
                                    background: 'rgba(6, 182, 212, 0.15)', color: '#bae6fd',
                                    border: '1px solid rgba(6, 182, 212, 0.3)'
                                  }}>
                                    🎭 {msg.tone}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Draft Box (If in Approval Mode) */}
                  {pendingDraft && (
                    <div style={{ 
                      background: 'rgba(124, 77, 255, 0.06)', 
                      borderTop: '1px solid var(--border-glass)', 
                      padding: '15px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>Proposed Assistant Draft Reply:</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="glass-btn-outline" 
                            onClick={() => {
                              setCustomMessage(pendingDraft);
                              setPendingDraft('');
                            }}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            Edit Response
                          </button>
                          <button 
                            className="glass-btn" 
                            onClick={() => handleSendReply(pendingDraft)}
                            style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <CheckIcon className="w-3.5 h-3.5" /> Approve & Send
                          </button>
                        </div>
                      </div>
                      <p style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
                        "{pendingDraft}"
                      </p>
                    </div>
                  )}

                  {/* Message Input Reply Box */}
                  <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="Type custom response immediately..." 
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendReply(customMessage)}
                      style={{ flex: 1 }}
                    />
                    <button 
                      className="glass-btn"
                      onClick={() => handleSendReply(customMessage)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px' }}
                    >
                      <SendIcon />
                    </button>
                  </div>
                </div>

                {/* Right Panel: Context / Memory Manager */}
                <div className="glass-container" style={{ width: '300px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                      🧠 Relationship Memory
                    </h3>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ fontSize: '0.7rem', background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.2)', borderRadius: '6px', padding: '2px 8px', color: '#d8b4fe' }}>
                        {chatHistory.length} msgs
                      </span>
                      <button
                        className="glass-btn-secondary"
                        onClick={() => { if (window.confirm('Clear all memory and notes for this contact?')) handleClearMemory(selectedContact.telegram_id); }}
                        title="Reset AI memory for this contact"
                        style={{ padding: '2px 8px', fontSize: '0.7rem', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}
                      >
                        🗑 Forget
                      </button>
                    </div>
                  </div>
                  
                  {/* Notes Text Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>MANAGER NOTES</label>
                    <textarea 
                      className="glass-input"
                      rows={4}
                      placeholder="Business goals, relationship background, important dates..."
                      value={selectedContact.notes || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedContact(prev => ({ ...prev, notes: val }));
                      }}
                      onBlur={() => updateContactMeta(selectedContact.telegram_id, { notes: selectedContact.notes })}
                      style={{ resize: 'none', fontSize: '0.82rem' }}
                    />
                    <button
                      className="glass-btn-secondary"
                      onClick={() => updateContactMeta(selectedContact.telegram_id, { notes: selectedContact.notes })}
                      style={{ fontSize: '0.75rem', padding: '4px 10px', alignSelf: 'flex-end' }}
                    >
                      💾 Save Notes
                    </button>
                  </div>

                  {/* Relationship Memory Summary */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>AI RELATIONSHIP SUMMARY</label>
                    <div style={{ 
                      flex: 1, background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-glass)', 
                      borderRadius: '8px', padding: '12px', fontSize: '0.78rem', color: 'var(--text-primary)',
                      overflowY: 'auto', whiteSpace: 'pre-wrap', maxHeight: '200px'
                    }}>
                      {selectedContact.relationship_summary || 'No commitments or action items recorded yet.'}
                    </div>
                  </div>

                  {/* Telegram Quick Link */}
                  <a
                    href={`https://t.me/${selectedContact.username || ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px', textAlign: 'center', display: 'block', textDecoration: 'none', color: '#bae6fd' }}
                  >
                    ✈️ Open in Telegram
                  </a>
                </div>


              </div>
            ) : (
              <div className="glass-container" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                Select a contact from the vault to view conversation logs and relationship history.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AI CONFIG & RULES */}
        {activeTab === 'rules' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px' }}>
              
              {/* Left Column Wrapper */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                {/* Left Panel: General Rules */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                  Automation Toggles
                </h3>
                
                {/* Bot Active Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Enable Automation Bot</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Toggle entire auto-reply engine on/off.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.ai_enabled}
                    onChange={(e) => saveSettings({ ai_enabled: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Approval Mode Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Draft Verification Mode</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Require manual approval for AI drafted messages.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.approval_mode}
                    onChange={(e) => saveSettings({ approval_mode: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Idle Threshold Slider */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>Online Idle Timeout</span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{Math.floor(settings.idle_threshold / 60)} minutes</span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Delay before assistant takes over when your Telegram status is Online.</p>
                  <input 
                    type="range" 
                    min="60" 
                    max="1800" 
                    step="60"
                    value={settings.idle_threshold}
                    onChange={(e) => setSettings(prev => ({ ...prev, idle_threshold: parseInt(e.target.value) }))}
                    onMouseUp={(e) => saveSettings({ idle_threshold: e.target.value })}
                    style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                  />
                </div>

                {/* Bypass Family & Friends */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Bypass Family & Friends</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Never send automated responses to friends or family.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.bypass_family_friends || false}
                    onChange={(e) => saveSettings({ bypass_family_friends: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Force VIP verification drafts */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Force VIP Verification Drafts</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Always queue VIP/client replies in drafts for manual review.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.force_draft_vips || false}
                    onChange={(e) => saveSettings({ force_draft_vips: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Smart Hinglish Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Smart Hinglish & Language Mode</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Detect Hinglish/Hindi Roman script and reply smartly in Hinglish script.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.smart_hinglish || false}
                    onChange={(e) => saveSettings({ smart_hinglish: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Auto Sleep Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Auto-Sleep Night Mode</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Automatically switch status to Sleeping Mode between 12:00 AM and 10:00 AM.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.auto_sleep_enabled || false}
                    onChange={(e) => saveSettings({ auto_sleep_enabled: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Auto Busy Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Auto-Busy Chat Override</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Automatically switch status to Busy for other DMs when actively chatting in another DM.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.auto_busy_enabled || false}
                    onChange={(e) => saveSettings({ auto_busy_enabled: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Audible Alerts Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Audible Sound Alerts</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Play premium synthesized audio chime notifications on incoming events.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                      type="button" 
                      className="glass-btn-secondary" 
                      onClick={() => playChime('message')} 
                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      🔊 Test Chime
                    </button>
                    <input 
                      type="checkbox" 
                      checked={audibleAlerts}
                      onChange={(e) => {
                        setAudibleAlerts(e.target.checked);
                        localStorage.setItem('audibleAlerts', e.target.checked ? 'true' : 'false');
                      }}
                      style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* Natural Humanized Delays */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Natural Typing Delays & Read Receipts</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Simulates real human chat opening speed, cognitive breaks, and character typing speed.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.enable_human_delays || false}
                    onChange={(e) => saveSettings({ enable_human_delays: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Smart Emoji Reactions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Smart Emoji Reactions</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>React with emojis (👍, 🔥, 🙏) on short acknowledgments instead of sending text.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.enable_reactions || false}
                    onChange={(e) => saveSettings({ enable_reactions: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Split Consecutive Messages */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Split Consecutive Messages</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Break long thoughts into multiple consecutive text bubbles with typing breaks.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.enable_split_messages || false}
                    onChange={(e) => saveSettings({ enable_split_messages: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                {/* Tone Profile */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontWeight: 600 }}>Assistant Tone Profile</span>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Define response formatting and length guidelines.</p>
                  <select 
                    value={settings.tone_profile || 'concise'} 
                    onChange={(e) => saveSettings({ tone_profile: e.target.value })}
                    className="glass-input"
                    style={{ width: '100%', cursor: 'pointer' }}
                  >
                    <option value="concise">Polished & Concise (1 Sentence Max)</option>
                    <option value="elaborated">Elaborated Manager (2-3 Sentences)</option>
                  </select>
                </div>

                {/* Timezone Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontWeight: 600 }}>System Timezone</span>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Set timezone for dashboard chat bubbles and log files.</p>
                  <select 
                    value={settings.timezone || 'Asia/Kolkata'} 
                    onChange={(e) => saveSettings({ timezone: e.target.value })}
                    className="glass-input"
                    style={{ width: '100%', cursor: 'pointer' }}
                  >
                    <option value="Asia/Kolkata">India Standard Time (IST - Asia/Kolkata)</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                    <option value="America/New_York">US Eastern Time (EST/EDT)</option>
                    <option value="America/Chicago">US Central Time (CST/CDT)</option>
                    <option value="America/Denver">US Mountain Time (MST/MDT)</option>
                    <option value="America/Los_Angeles">US Pacific Time (PST/PDT)</option>
                    <option value="Europe/London">London / Greenwich Time (GMT/BST)</option>
                    <option value="Europe/Paris">Central European Time (CET/CEST)</option>
                    <option value="Asia/Singapore">Singapore Standard Time (SGT)</option>
                    <option value="Asia/Tokyo">Japan Standard Time (JST)</option>
                    <option value="Australia/Sydney">Sydney Time (AEST/AEDT)</option>
                  </select>
                </div>
              </div>

                {/* Left Panel - Bottom Card: Payment Credentials */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    💳 Payment Credentials & Auto-Share
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '-10px' }}>
                    These coordinates are dynamically shared in casual chats when contacts request payment details.
                  </p>

                  {/* UPI Address Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>UPI ID Address</span>
                    <input 
                      type="text" 
                      value={settings.var_upi || ''} 
                      onChange={(e) => setSettings(prev => ({ ...prev, var_upi: e.target.value }))}
                      onBlur={(e) => saveSettings({ var_upi: e.target.value })}
                      placeholder="e.g. founder@upi"
                      className="glass-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* Website Payment Address Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Website URL</span>
                    <input 
                      type="text" 
                      value={settings.var_website || ''} 
                      onChange={(e) => setSettings(prev => ({ ...prev, var_website: e.target.value }))}
                      onBlur={(e) => saveSettings({ var_website: e.target.value })}
                      placeholder="https://example.com/pay"
                      className="glass-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Panel: AI Personality Tuning */}
              <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                  Executive Assistant Personality
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SYSTEM PROMPT & DIRECTIVES</label>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '5px' }}>
                    Define assistant behavioral bounds. Direct tone, relationship memory handling, and language.
                  </p>
                  
                  {/* Preset personality buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    <button 
                      type="button"
                      className="glass-btn-secondary" 
                      style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                      onClick={() => {
                        const prompt = "You are Coet, CatVos's elite executive assistant/manager. Keep replies warm, professional, respectful, concise, and human-like. Speak with high-end polished corporate professionalism, polite and structured. Never mention you are an AI or Gemini. Only introduce yourself as Coet, CatVos's manager on the first message or if the contact asks who you are. Keep replies to 1 sentence maximum.";
                        setSettings(prev => ({ ...prev, ai_personality: prompt }));
                        saveSettings({ ai_personality: prompt });
                      }}
                    >
                      💼 Elite Executive
                    </button>
                    <button 
                      type="button"
                      className="glass-btn-secondary" 
                      style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                      onClick={() => {
                        const prompt = "You are Coet, CatVos's manager and friendly buddy. Speak in roman-script Hinglish (Hindi words using English alphabet) when the user speaks in Hinglish or Hindi. Keep it casual, warm, and natural (e.g. 'Bhai CatVos abhi busy hai, main unhe details de dunga.'). Keep responses short and build on their previous motive. Never mention you are an AI or Gemini.";
                        setSettings(prev => ({ ...prev, ai_personality: prompt }));
                        saveSettings({ ai_personality: prompt });
                      }}
                    >
                      🤝 Hinglish Buddy
                    </button>
                    <button 
                      type="button"
                      className="glass-btn-secondary" 
                      style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                      onClick={() => {
                        const prompt = "You are Coet, CatVos's protective manager. Set extremely firm and clear boundaries. Keep replies brief (under 10 words). If the sender is rude, angry, spamming, or asking technical/coding questions, politely but firmly decline. (e.g. 'As CatVos's manager, I only handle transactions and schedule requests.'). Never mention you are an AI.";
                        setSettings(prev => ({ ...prev, ai_personality: prompt }));
                        saveSettings({ ai_personality: prompt });
                      }}
                    >
                      🛡️ Direct Gatekeeper
                    </button>
                    <button 
                      type="button"
                      className="glass-btn-secondary" 
                      style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                      onClick={() => {
                        const prompt = "You are Coet, CatVos's Middleman Escrow Coordinator. Be professional, highly organized, secure-minded, and direct. Guide middleman deals securely: ask for the deal terms, buyer & seller details, and verify transaction amount. Highlight the 5% security fee. Decline all non-deal queries.";
                        setSettings(prev => ({ ...prev, ai_personality: prompt }));
                        saveSettings({ ai_personality: prompt });
                      }}
                    >
                      ⚖️ Escrow Coordinator
                    </button>
                    <button 
                      type="button"
                      className="glass-btn-secondary" 
                      style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                      onClick={() => {
                        const prompt = "You are Coet, CatVos's client concierge. Adopt a highly warm, polite, elegant, and helpful concierge persona. Answer questions regarding graphic design, video editing, or account sales with professional hospitality. Guide them smoothly to register project briefs.";
                        setSettings(prev => ({ ...prev, ai_personality: prompt }));
                        saveSettings({ ai_personality: prompt });
                      }}
                    >
                      🛎️ Client Concierge
                    </button>
                  </div>

                  <textarea 
                    className="glass-input"
                    rows={8}
                    value={settings.ai_personality}
                    onChange={(e) => setSettings(prev => ({ ...prev, ai_personality: e.target.value }))}
                    onBlur={() => saveSettings({ ai_personality: settings.ai_personality })}
                    style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ASSISTANT DESIGNATION</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    value={settings.assistant_name}
                    onChange={(e) => setSettings(prev => ({ ...prev, assistant_name: e.target.value }))}
                    onBlur={() => saveSettings({ assistant_name: settings.assistant_name })}
                  />
                </div>
              </div>
            </div>

            {/* RAG Knowledge Base FAQ Editor */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '30px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff' }}>
                  📖 Business Knowledge Base & RAG FAQ Guidelines
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Input your business FAQs, middleman terms, channel pricing structures, and developer rates. 
                  The AI Assistant (Coet) dynamically references these guidelines to answer client queries accurately.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea 
                  className="glass-input"
                  rows={6}
                  value={settings.knowledge_base || ''}
                  onChange={(e) => {
                    const kb = e.target.value;
                    setSettings(prev => ({ ...prev, knowledge_base: kb }));
                  }}
                  onBlur={() => saveSettings({ knowledge_base: settings.knowledge_base })}
                  placeholder="Enter business details (e.g. Website projects start at $200. Middleman fee is 5%...)"
                  style={{ fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Auto-references are injected dynamically. Click save or click outside to commit changes.
                  </span>
                  <button 
                    type="button" 
                    className="glass-btn" 
                    onClick={() => saveSettings({ knowledge_base: settings.knowledge_base })}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    💾 Save Knowledge Base
                  </button>
                </div>
              </div>
            </div>

            {/* 🧬 Owner Writing Style DNA (CatVos Mirror) */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '30px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🧬 Owner Writing Style DNA (CatVos Mirror)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  This style DNA profile is dynamically generated by analyzing your historical messages. The AI Assistant (Coet) emulates these traits to type exactly like you (casing, shorthands, emoji patterns, and Hinglish usage).
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea 
                  className="glass-input"
                  rows={8}
                  value={settings.owner_style_profile || ''}
                  onChange={(e) => {
                    const profileVal = e.target.value;
                    setSettings(prev => ({ ...prev, owner_style_profile: profileVal }));
                  }}
                  onBlur={() => saveSettings({ owner_style_profile: settings.owner_style_profile })}
                  placeholder="Owner Writing Style traits will appear here after analysis. You can also manually tweak/write rules here."
                  style={{ fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Auto-updates in the background. Or trigger a manual rebuild from your chat history.
                  </span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      type="button" 
                      className="glass-btn-secondary" 
                      onClick={rebuildOwnerStyleProfile}
                      disabled={isRebuildingProfile}
                      style={{ padding: '6px 14px', fontSize: '0.8rem', opacity: isRebuildingProfile ? 0.6 : 1 }}
                    >
                      {isRebuildingProfile ? "🧬 Analyzing History..." : "🧬 Rebuild Style DNA"}
                    </button>
                    <button 
                      type="button" 
                      className="glass-btn" 
                      onClick={() => saveSettings({ owner_style_profile: settings.owner_style_profile })}
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                      💾 Save Style DNA
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Advanced Automation Controls Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px' }}>

              {/* Blacklist / Spam Filter */}
              <div className="glass-container" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🚫 Blacklist / Spam Filter
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
                    Any message containing these words will be silently blocked. Comma-separated.
                  </p>
                </div>
                <textarea
                  className="glass-input"
                  rows={4}
                  placeholder="spam, scam, lottery, click here, free money, urgent transfer..."
                  value={settings.blacklist_keywords || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, blacklist_keywords: e.target.value }))}
                  onBlur={() => saveSettings({ blacklist_keywords: settings.blacklist_keywords })}
                  style={{ fontSize: '0.83rem', fontFamily: 'monospace', resize: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>
                    {(settings.blacklist_keywords || '').split(',').filter(w => w.trim()).length} blocked terms
                  </span>
                  <button className="glass-btn" onClick={() => saveSettings({ blacklist_keywords: settings.blacklist_keywords })}
                    style={{ padding: '5px 14px', fontSize: '0.78rem' }}>
                    💾 Save Blacklist
                  </button>
                </div>
              </div>

              {/* Response Delay Randomizer */}
              <div className="glass-container" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⏱️ Human-Like Reply Delay
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
                    Randomise reply delays to look natural. Coet will wait between min–max seconds before replying.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>MIN DELAY (sec)</label>
                    <input
                      type="number" min="0" max="30"
                      className="glass-input"
                      value={settings.reply_delay_min || '1'}
                      onChange={(e) => setSettings(prev => ({ ...prev, reply_delay_min: e.target.value }))}
                      onBlur={() => saveSettings({ reply_delay_min: settings.reply_delay_min })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>MAX DELAY (sec)</label>
                    <input
                      type="number" min="0" max="120"
                      className="glass-input"
                      value={settings.reply_delay_max || '4'}
                      onChange={(e) => setSettings(prev => ({ ...prev, reply_delay_max: e.target.value }))}
                      onBlur={() => saveSettings({ reply_delay_max: settings.reply_delay_max })}
                    />
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '14px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '10px' }}>🕐 Active Hours</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '10px' }}>
                    Coet only replies automatically within these hours. Outside hours → queued.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>START HOUR (0-23)</label>
                      <input
                        type="number" min="0" max="23"
                        className="glass-input"
                        value={settings.active_hours_start || '9'}
                        onChange={(e) => setSettings(prev => ({ ...prev, active_hours_start: e.target.value }))}
                        onBlur={() => saveSettings({ active_hours_start: settings.active_hours_start })}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>END HOUR (0-23)</label>
                      <input
                        type="number" min="0" max="23"
                        className="glass-input"
                        value={settings.active_hours_end || '23'}
                        onChange={(e) => setSettings(prev => ({ ...prev, active_hours_end: e.target.value }))}
                        onBlur={() => saveSettings({ active_hours_end: settings.active_hours_end })}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dark)', marginTop: '8px' }}>
                    Currently: {liveClock.toLocaleTimeString('en-IN', { timeZone: settings.timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} {settings.timezone || 'Asia/Kolkata'}
                    {' '}→ {liveClock.getHours() >= parseInt(settings.active_hours_start || 9) && liveClock.getHours() < parseInt(settings.active_hours_end || 23)
                      ? <span style={{ color: '#34d399' }}>✅ Within active window</span>
                      : <span style={{ color: '#f87171' }}>🔴 Outside active window</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* ── AI Response Live Tester ── */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🧪 AI Response Live Tester
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Simulate exactly what Coet would reply to any message under any status mode. Tests the real Gemini pipeline.
                </p>
              </div>
              <form onSubmit={handleTestAI} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SIMULATED INCOMING MESSAGE</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. bhai price kya hai WP account ka?"
                    value={aiTestMsg}
                    onChange={(e) => setAiTestMsg(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>STATUS MODE</label>
                  <select
                    className="glass-input"
                    value={aiTestStatus}
                    onChange={(e) => setAiTestStatus(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="online">Online</option>
                    <option value="busy">Busy</option>
                    <option value="focus">Deep Focus</option>
                    <option value="sleeping">Sleeping</option>
                    <option value="travel">Travel</option>
                    <option value="vacation">Vacation</option>
                  </select>
                </div>
                <button type="submit" className="glass-btn" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }} disabled={aiTestLoading}>
                  {aiTestLoading ? '⏳ Testing...' : '▶ Run Test'}
                </button>
              </form>

              {aiTestResult && (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#a7f3d0', fontWeight: 600 }}>
                      🎭 Sentiment: {aiTestResult.sentiment || 'neutral'}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontWeight: 600 }}>
                      🚨 Priority: {aiTestResult.priority || 'normal'}
                    </span>
                    {aiTestResult.suggested_category && (
                      <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.2)', color: '#d8b4fe', fontWeight: 600 }}>
                        🏷 Category: {aiTestResult.suggested_category}
                      </span>
                    )}
                    {aiTestResult.key_used && (
                      <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: '#bae6fd' }}>
                        🔑 Key: ...{aiTestResult.key_used?.slice(-6)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>COET'S DRAFT REPLY:</label>
                    <div style={{ background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.2)', borderRadius: '8px', padding: '14px', fontSize: '0.9rem', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.6' }}>
                      "{aiTestResult.draft_reply}"
                    </div>
                  </div>
                  <button
                    className="glass-btn-secondary"
                    onClick={() => navigator.clipboard.writeText(aiTestResult.draft_reply || '')}
                    style={{ alignSelf: 'flex-end', fontSize: '0.78rem', padding: '5px 14px' }}
                  >
                    📋 Copy Reply
                  </button>
                </div>
              )}
            </div>

            {/* Keyword Auto-Replies Panel */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff' }}>
                  Instant Keyword Auto-Replies & Action Routes
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Define keyword matching rules to execute instant actions (auto-replies, mutes, categorizations, priority shifts) and bypass the Gemini AI engine.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                {/* Form to Add New Keyword Rule */}
                <form onSubmit={handleAddKeywordRule} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Add Advanced Rule</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRIGGER PHRASE / PATTERN</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder={newMatchMode === 'regex' ? 'e.g. price|cost|rate or \\b(mm|deal)\\b' : 'e.g. price, deal, help'} 
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>MATCH MODE</label>
                      <select 
                        className="glass-input" 
                        value={newMatchMode} 
                        onChange={(e) => setNewMatchMode(e.target.value)}
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="contains">Contains Substring</option>
                        <option value="regex">Regex Pattern</option>
                        <option value="fuzzy">Fuzzy Match</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ACTION TYPE</label>
                      <select 
                        className="glass-input" 
                        value={newActionType} 
                        onChange={(e) => {
                          setNewActionType(e.target.value);
                          setNewActionValue('');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="reply">Send Text Reply</option>
                        <option value="category">Auto-Categorize Contact</option>
                        <option value="priority">Set Priority Alert</option>
                        <option value="mute">Mute Contact</option>
                        <option value="combined">Combined Actions</option>
                      </select>
                    </div>
                  </div>

                  {/* Conditional Action Values */}
                  {newActionType === 'category' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TARGET CATEGORY</label>
                      <select 
                        className="glass-input" 
                        value={newActionValue} 
                        onChange={(e) => setNewActionValue(e.target.value)}
                        required
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="">-- Choose Category --</option>
                        <option value="family">Family</option>
                        <option value="friend">Friend</option>
                        <option value="client">Client</option>
                        <option value="vip">VIP Partner</option>
                        <option value="business_partner">Business Partner</option>
                        <option value="team_member">Team Member</option>
                      </select>
                    </div>
                  )}

                  {newActionType === 'priority' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ALERT LEVEL</label>
                      <select 
                        className="glass-input" 
                        value={newActionValue} 
                        onChange={(e) => setNewActionValue(e.target.value)}
                        required
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="">-- Choose Priority --</option>
                        <option value="critical">🚨 Critical (Send Bot Alert)</option>
                        <option value="important">⭐ Important</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  )}

                  {newActionType === 'combined' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMBINED DIRECTIVES</label>
                      <input 
                        type="text" 
                        className="glass-input" 
                        placeholder="e.g. category:vip;priority:critical;mute:0" 
                        value={newActionValue}
                        onChange={(e) => setNewActionValue(e.target.value)}
                        required
                      />
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Semicolon-separated pairs: category:X; priority:Y; mute:1/0</p>
                    </div>
                  )}

                  {(newActionType === 'reply' || newActionType === 'combined') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AUTO-REPLY TEXT</label>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>Supports: {"{first_name}"}, {"{assistant_name}"}, {"{status}"}</span>
                      </div>
                      <textarea 
                        className="glass-input" 
                        rows={3}
                        placeholder="Enter response... (e.g. Hi {first_name}, CatVos is {status}. I am {assistant_name}.)" 
                        value={newResponse}
                        onChange={(e) => setNewResponse(e.target.value)}
                        required={newActionType === 'reply'}
                        style={{ resize: 'none' }}
                      />
                    </div>
                  )}

                  <button type="submit" className="glass-btn" style={{ padding: '10px 20px', alignSelf: 'flex-start' }}>
                    Save Keyword Rule
                  </button>
                </form>

                {/* List of Active Keyword Rules */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)' }}>Active Keyword Rules</h4>
                  
                  <div style={{ 
                    maxHeight: '340px', 
                    overflowY: 'auto', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px',
                    paddingRight: '5px'
                  }}>
                    {keywordRules.map(rule => (
                      <div 
                        key={rule.id} 
                        style={{
                          background: 'rgba(255,255,255,0.01)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '10px',
                          padding: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{
                              background: 'var(--color-primary-glow)',
                              color: '#d8b4fe',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              "{rule.keyword}"
                            </span>

                            {/* Match Mode Badge */}
                            {rule.match_mode === 'contains' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.12)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)' }}>⚡ Contains</span>}
                            {rule.match_mode === 'regex' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.12)', color: '#fde68a', border: '1px solid rgba(245, 158, 11, 0.2)' }}>🔍 Regex</span>}
                            {rule.match_mode === 'fuzzy' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: '#bfdbfe', border: '1px solid rgba(59, 130, 246, 0.2)' }}>🧬 Fuzzy</span>}

                            {/* Action Type Badge */}
                            {rule.action_type === 'reply' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.12)', color: '#d8b4fe', border: '1px solid rgba(139, 92, 246, 0.2)' }}>💬 Reply</span>}
                            {rule.action_type === 'category' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.12)', color: '#bae6fd', border: '1px solid rgba(6, 182, 212, 0.2)' }}>🏷️ Categorize ({rule.action_value})</span>}
                            {rule.action_type === 'priority' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.12)', color: '#fecaca', border: '1px solid rgba(239, 68, 68, 0.2)' }}>🚨 Priority ({rule.action_value})</span>}
                            {rule.action_type === 'mute' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.12)', color: '#cbd5e1', border: '1px solid rgba(100, 116, 139, 0.2)' }}>🔇 Mute</span>}
                            {rule.action_type === 'combined' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(236, 72, 153, 0.12)', color: '#fbcfe8', border: '1px solid rgba(236, 72, 153, 0.2)' }}>⚙️ Combined</span>}
                          </div>
                          {rule.response && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', wordBreak: 'break-word', marginTop: '4px' }}>
                              {rule.response}
                            </p>
                          )}
                          {rule.action_type === 'combined' && rule.action_value && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              Cmds: {rule.action_value}
                            </p>
                          )}
                        </div>
                        <button 
                          className="glass-btn-secondary" 
                          onClick={() => handleDeleteKeywordRule(rule.id)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            color: 'var(--color-danger)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.03)'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                    {keywordRules.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '30px' }}>
                        No keyword rules set.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Rules Simulator Console Card */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '30px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🧬 Rules Simulator Console</span>
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Simulate how messages are evaluated by the local rules engine in real-time. Resolve template variables and see triggered actions instantly.
                </p>
              </div>

              <form onSubmit={handleSimulateRule} style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: '15px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SIMULATED MESSAGE CONTENT</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="Type simulated contact text... (e.g. price, need mm, urgent)" 
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SIMULATED SENDER (OPTIONAL)</label>
                  <select 
                    className="glass-input" 
                    value={simContactId} 
                    onChange={(e) => setSimContactId(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Default (Guest)</option>
                    {contacts.map(c => (
                      <option key={c.telegram_id} value={c.telegram_id}>
                        {c.first_name || ''} {c.last_name || ''} ({c.username ? `@${c.username}` : c.telegram_id})
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="glass-btn" style={{ padding: '10px 20px' }} disabled={simLoading}>
                  {simLoading ? 'Simulating...' : 'Run Match Simulation'}
                </button>
              </form>

              {/* Simulation Result Area */}
              {simResult && (
                <div style={{ 
                  background: 'rgba(0, 0, 0, 0.25)', 
                  border: '1px solid var(--border-glass)', 
                  borderRadius: '10px', 
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {simResult.matched ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.9rem' }}>✔️ RULE MATCHED!</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rule ID: {simResult.rule.id}</span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>MATCHED KEYWORD</span>
                          <span className="badge" style={{ marginTop: '4px', background: 'var(--color-primary-glow)', color: '#d8b4fe' }}>"{simResult.rule.keyword}"</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>MATCH MODE</span>
                          <span style={{ display: 'inline-block', marginTop: '4px' }}>
                            {simResult.rule.match_mode === 'contains' && <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)' }}>⚡ Contains</span>}
                            {simResult.rule.match_mode === 'regex' && <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#fde68a', border: '1px solid rgba(245, 158, 11, 0.2)' }}>🔍 Regex</span>}
                            {simResult.rule.match_mode === 'fuzzy' && <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#bfdbfe', border: '1px solid rgba(59, 130, 246, 0.2)' }}>🧬 Fuzzy</span>}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>ACTION TRIGGERED</span>
                          <span style={{ display: 'inline-block', marginTop: '4px' }}>
                            {simResult.rule.action_type === 'reply' && <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#d8b4fe', border: '1px solid rgba(139, 92, 246, 0.2)' }}>💬 Reply</span>}
                            {simResult.rule.action_type === 'category' && <span className="badge" style={{ backgroundColor: 'rgba(6, 182, 212, 0.12)', color: '#bae6fd', border: '1px solid rgba(6, 182, 212, 0.2)' }}>🏷️ Categorize ({simResult.rule.action_value})</span>}
                            {simResult.rule.action_type === 'priority' && <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#fecaca', border: '1px solid rgba(239, 68, 68, 0.2)' }}>🚨 Priority ({simResult.rule.action_value})</span>}
                            {simResult.rule.action_type === 'mute' && <span className="badge" style={{ backgroundColor: 'rgba(100, 116, 139, 0.12)', color: '#cbd5e1', border: '1px solid rgba(100, 116, 139, 0.2)' }}>🔇 Mute</span>}
                            {simResult.rule.action_type === 'combined' && <span className="badge" style={{ backgroundColor: 'rgba(236, 72, 153, 0.12)', color: '#fbcfe8', border: '1px solid rgba(236, 72, 153, 0.2)' }}>⚙️ Combined ({simResult.rule.action_value})</span>}
                          </span>
                        </div>
                      </div>

                      {simResult.rule.response ? (
                        <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600, marginBottom: '6px' }}>DYNAMICALLY COMPILED REPLY TEXT</span>
                          <div style={{ 
                            background: 'rgba(124, 77, 255, 0.05)', 
                            border: '1px solid rgba(124, 77, 255, 0.2)', 
                            padding: '12px', 
                            borderRadius: '6px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            color: '#e2e8f0',
                            whiteSpace: 'pre-wrap'
                          }}>
                            "{simResult.rule.response}"
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '10px' }}>
                          No text response defined. Rule only performs metadata database actions.
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 600, fontSize: '0.9rem' }}>
                      ❌ NO MATCH FOUND.
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>This message bypassed the local keyword rules and will be routed to the Gemini AI engine.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SYSTEM EVENT LOGS */}
        {activeTab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Log Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
              <div className="glass-container" style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>TOTAL EVENTS</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--text-primary)', marginTop: '4px' }}>{logs.length}</h3>
              </div>
              <div className="glass-container" style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 600 }}>INFO</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: '#34d399', marginTop: '4px' }}>{logs.filter(l => l.level === 'INFO').length}</h3>
              </div>
              <div className="glass-container" style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ color: '#fbbf24', fontSize: '0.75rem', fontWeight: 600 }}>WARNINGS</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: '#fbbf24', marginTop: '4px' }}>{logs.filter(l => l.level === 'WARNING').length}</h3>
              </div>
              <div className="glass-container" style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ color: '#f87171', fontSize: '0.75rem', fontWeight: 600 }}>ERRORS</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: '#f87171', marginTop: '4px' }}>{logs.filter(l => l.level === 'ERROR').length}</h3>
              </div>
              <div className="glass-container" style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>WS STREAM</p>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: wsConnected ? '#10b981' : '#ef4444', display: 'inline-block', animation: wsConnected ? 'pulse 1.5s infinite' : 'none' }} />
                  <span style={{ color: wsConnected ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '0.85rem' }}>{wsConnected ? 'LIVE' : 'OFF'}</span>
                </div>
              </div>
            </div>

            <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>FILTER:</span>
                  {['ALL', 'INFO', 'WARNING', 'ERROR'].map(lvl => (
                    <button 
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      style={{ 
                        padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px', cursor: 'pointer',
                        background: logFilter === lvl ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.02)',
                        border: logFilter === lvl ? '1px solid var(--color-primary)' : '1px solid var(--border-glass)',
                        color: logFilter === lvl ? '#d8b4fe' : 'var(--text-muted)'
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="🔍 Search logs..." 
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    style={{ padding: '4px 10px', fontSize: '0.75rem', width: '180px' }}
                  />
                  <button
                    onClick={() => setLogAutoScroll(p => !p)}
                    style={{ padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '6px',
                      background: logAutoScroll ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)',
                      border: logAutoScroll ? '1px solid #10b981' : '1px solid var(--border-glass)',
                      color: logAutoScroll ? '#34d399' : 'var(--text-muted)' }}
                  >
                    {logAutoScroll ? '📌 Auto-Scroll ON' : '📌 Auto-Scroll OFF'}
                  </button>
                  <button className="glass-btn-secondary" onClick={handleExportLogs} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                    📥 Export TXT
                  </button>
                  {!logClearConfirm ? (
                    <button className="glass-btn-secondary" onClick={() => setLogClearConfirm(true)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      🗑 Clear All
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>Confirm?</span>
                      <button onClick={handleClearLogs} className="glass-btn-secondary" style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>Yes</button>
                      <button onClick={() => setLogClearConfirm(false)} className="glass-btn-secondary" style={{ padding: '4px 8px', fontSize: '0.72rem' }}>No</button>
                    </div>
                  )}
                  <button className="glass-btn" onClick={fetchLogs} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>🔄 Refresh</button>
                </div>
              </div>
              
              {/* Terminal View */}
              <div 
                ref={logTerminalRef}
                style={{
                  background: '#04060c',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '16px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: '#34d399',
                  height: 'calc(100vh - 400px)',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                {logs
                  .filter(log => {
                    const matchesFilter = logFilter === 'ALL' || log.level === logFilter;
                    const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase());
                    return matchesFilter && matchesSearch;
                  })
                  .map((log) => (
                    <div key={log.id} style={{ display: 'flex', gap: '10px', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ color: 'var(--text-dark)', flexShrink: 0 }}>
                        [{(() => {
                          try {
                            let t = log.timestamp;
                            if (t && !t.endsWith('Z') && !t.includes('+') && !t.includes('-')) t += 'Z';
                            return new Intl.DateTimeFormat('en-US', {
                              timeZone: settings.timezone || 'Asia/Kolkata',
                              month: 'short', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                            }).format(new Date(t));
                          } catch (e) { return new Date(log.timestamp).toLocaleTimeString(); }
                        })()}]
                      </span>
                      <span style={{ 
                        color: log.level === 'ERROR' ? '#f87171' : (log.level === 'WARNING' ? '#fbbf24' : '#34d399'),
                        fontWeight: 700, flexShrink: 0
                      }}>
                        {log.level === 'ERROR' ? '🔴' : log.level === 'WARNING' ? '🟡' : '🟢'} [{log.level}]
                      </span>
                      <span style={{ color: '#cbd5e1', wordBreak: 'break-word' }}>{log.message}</span>
                    </div>
                  ))}
                {logs.length === 0 && (
                  <p style={{ color: 'var(--text-dark)', textAlign: 'center', marginTop: '40px' }}>No audit events logged yet.</p>
                )}
              </div>
            </div>
          </div>
        )}


        {/* TAB 5: DEALS KANBAN PIPELINE */}
        {activeTab === 'pipeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 200px)' }}>
            
            {/* Pipeline Summary Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', flexShrink: 0 }}>
              {[
                { label: 'Total Contacts', value: contacts.length, color: 'var(--color-primary)' },
                { label: 'Leads', value: contacts.filter(c => c.category === 'unknown' || !c.category).length, color: '#10b981' },
                { label: 'Active Deals', value: contacts.filter(c => ['client','business_partner','team_member'].includes(c.category)).length, color: '#f59e0b' },
                { label: 'VIP', value: contacts.filter(c => c.category === 'vip').length, color: '#ef4444' },
                { label: 'Personal', value: contacts.filter(c => ['family','friend'].includes(c.category)).length, color: '#06b6d4' },
                { label: 'Muted', value: contacts.filter(c => c.is_muted === 1).length, color: '#64748b' },
              ].map(s => (
                <div key={s.label} className="glass-container" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Kanban Columns */}
            <div style={{ display: 'flex', gap: '16px', flex: 1, overflowX: 'auto', paddingBottom: '10px' }}>
              {renderPipelineColumn("📥 Leads / Inbox", contacts.filter(c => c.category === 'unknown' || !c.category), 'unknown', '#10b981')}
              {renderPipelineColumn("💬 Active Deals", contacts.filter(c => ['client', 'business_partner', 'team_member'].includes(c.category)), 'client', '#f59e0b')}
              {renderPipelineColumn("👑 VIP Deals", contacts.filter(c => c.category === 'vip'), 'vip', '#ef4444')}
              {renderPipelineColumn("🤝 Personal", contacts.filter(c => ['family', 'friend'].includes(c.category)), 'friend', '#06b6d4')}
            </div>

            {/* Quick Notes Modal */}
            {pipelineNoteContact && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
              }} onClick={() => setPipelineNoteContact(null)}>
                <div className="glass-container" style={{ padding: '28px', width: '420px', display: 'flex', flexDirection: 'column', gap: '16px' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                      ✏️ Quick Note — {pipelineNoteContact.first_name} {pipelineNoteContact.last_name}
                    </h3>
                    <button onClick={() => setPipelineNoteContact(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                  </div>
                  <textarea
                    className="glass-input"
                    rows={5}
                    autoFocus
                    placeholder="Add a quick note about this contact..."
                    value={pipelineNoteText}
                    onChange={e => setPipelineNoteText(e.target.value)}
                    style={{ resize: 'none', fontSize: '0.9rem' }}
                  />
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button className="glass-btn-secondary" onClick={() => setPipelineNoteContact(null)}
                      style={{ padding: '7px 16px', fontSize: '0.82rem' }}>Cancel</button>
                    <button className="glass-btn" onClick={() => {
                      updateContactMeta(pipelineNoteContact.telegram_id, { notes: pipelineNoteText });
                      setPipelineNoteContact(null);
                    }} style={{ padding: '7px 18px', fontSize: '0.82rem' }}>💾 Save Note</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Spotlight Command Bar Overlay */}
      {spotlightOpen && (
        <div className="command-overlay" onClick={() => setSpotlightOpen(false)}>
          <div className="command-modal" onClick={e => e.stopPropagation()}>
            <div className="command-input-container">
              <span style={{ fontSize: '1.2rem' }}>⚡</span>
              <input
                type="text"
                className="command-search"
                autoFocus
                placeholder="Search chats or type commands... (Arrow keys navigate, Esc to close)"
                value={spotlightSearch}
                onChange={e => {
                  setSpotlightSearch(e.target.value);
                  setSpotlightIndex(0);
                }}
                onKeyDown={e => {
                  const items = getSpotlightItems();
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSpotlightIndex(idx => (idx + 1) % items.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSpotlightIndex(idx => (idx - 1 + items.length) % items.length);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (items.length > 0) {
                      handleSpotlightAction(items[spotlightIndex]);
                    }
                  } else if (e.key === 'Escape') {
                    setSpotlightOpen(false);
                  }
                }}
              />
            </div>
            <div className="command-results">
              {getSpotlightItems().map((item, idx) => (
                <div
                  key={item.id}
                  className={`command-item ${idx === spotlightIndex ? 'selected' : ''}`}
                  onMouseEnter={() => setSpotlightIndex(idx)}
                  onClick={() => handleSpotlightAction(item)}
                >
                  <div className="command-item-label">
                    <span>{item.type === 'contact' ? '👤' : '⚡'}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.92rem', color: idx === spotlightIndex ? 'var(--color-primary)' : '#fff', fontWeight: 600 }}>
                        {item.label}
                      </span>
                      {item.desc && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {item.desc}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.type === 'action' && (
                    <span className="command-item-kbd">Action</span>
                  )}
                  {item.type === 'contact' && (
                    <span className="command-item-kbd" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#d8b4fe' }}>Vault</span>
                  )}
                </div>
              ))}
              {getSpotlightItems().length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No matching shortcuts or chats found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
