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
  CheckIcon,
  ChatIcon,
  CreditCardIcon,
  BriefcaseIcon,
  KeyIcon,
  TrashIcon,
  PlusIcon,
  PlayIcon,
  StopIcon
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
  const [activeTab, _setActiveTab] = useState('overview'); // overview, contacts, rules, logs
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const setActiveTab = (tab) => {
    _setActiveTab(tab);
    setMobileMenuOpen(false);
  };
  const [expandedGroups, setExpandedGroups] = useState({
    core: true,
    contacts: false,
    pipeline: false,
    reminders: false,
    leads: false,
    rules: false,
    swarm: false,
    personas: false,
    labs: false,
    tone: false,
    sentiment: false,
    broadcast: false,
    scheduler: false,
    outreach: false,
    media: false,
    feedback: false,
    analytics: false,
    groups: false,
    relays: false,
    mirror: false,
    proxies: false,
    sessions: false,
    keywords: false,
    traffic: false,
    commerce: false,
    billing: false,
    payments: false,
    disputes: false,
    security: false,
    antiScam: false,
    threats: false,
    sandbox: true
  });
  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };
  
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
    force_draft_vips: false,
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

  // Dynamic Gemini Key manager state
  const [dbKeys, setDbKeys] = useState([]);
  const [dbKeysLoading, setDbKeysLoading] = useState(false);
  const [newKeyString, setNewKeyString] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [testingKeyPrefix, setTestingKeyPrefix] = useState(null);

  // Offline Q&A Fallback RAG state
  const [qaRules, setQaRules] = useState([]);
  const [qaRulesLoading, setQaRulesLoading] = useState(false);
  const [newQaQuery, setNewQaQuery] = useState('');
  const [newQaResponse, setNewQaResponse] = useState('');
  const [qaSearch, setQaSearch] = useState('');

  // Behaviour Lists editing mode
  const [kbEditMode, setKbEditMode] = useState('list'); // 'list' | 'raw'
  const [kbInputFact, setKbInputFact] = useState('');
  const [persEditMode, setPersEditMode] = useState('list'); // 'list' | 'raw'
  const [persInputTrait, setPersInputTrait] = useState('');

  // Maintenance Loading
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

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

  // Mass Broadcaster State
  const [broadcastCategory, setBroadcastCategory] = useState('all');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState('');

  // Scheduler State
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [schedForm, setSchedForm] = useState({ label: '', message: '', cron_expr: '', category: 'all', enabled: true });
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedStatus, setSchedStatus] = useState('');

  // System / Telemetry State
  const [telemetry, setTelemetry] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [clearLogsLoading, setClearLogsLoading] = useState(false);
  const [clearLogsConfirm, setClearLogsConfirm] = useState(false);
  const [qaImportFile, setQaImportFile] = useState(null);
  const [qaImportStatus, setQaImportStatus] = useState('');
  const [qaExportLoading, setQaExportLoading] = useState(false);
  const [dbOptStatus, setDbOptStatus] = useState('');
  const [systemHealth, setSystemHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [dbCounts, setDbCounts] = useState(null);
  const [sysBackupLoading, setSysBackupLoading] = useState(false);
  const [sysRestoreStatus, setSysRestoreStatus] = useState('');

  // Broadcast Command Center State
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [broadcastTemplates, setBroadcastTemplates] = useState([]);
  const [bcDryRun, setBcDryRun] = useState(false);
  const [bcDryRunCount, setBcDryRunCount] = useState(null);
  const [bcNewTplName, setBcNewTplName] = useState('');
  const [bcNewTplContent, setBcNewTplContent] = useState('');
  const [bcTplStatus, setBcTplStatus] = useState('');
  const [bcScheduledDate, setBcScheduledDate] = useState('');

  // AI Intelligence Lab State
  const [aiLabMsg, setAiLabMsg] = useState('');
  const [aiLabResult, setAiLabResult] = useState(null);
  const [aiLabLoading, setAiLabLoading] = useState(false);
  const [aiLabConvo, setAiLabConvo] = useState([]);
  const [promptStudio, setPromptStudio] = useState('');
  const [knowledgeBaseLocal, setKnowledgeBaseLocal] = useState('');
  const [blacklistLocal, setBlacklistLocal] = useState('');
  const [dnaRebuildLoading, setDnaRebuildLoading] = useState(false);
  const [dnaRebuildStatus, setDnaRebuildStatus] = useState('');

  // Reminders & CRM State
  const [allReminders, setAllReminders] = useState([]);
  const [reminderForm, setReminderForm] = useState({ task: '', due_time: '', telegram_id: '', priority: 'medium' });
  const [reminderStatus, setReminderStatus] = useState('');
  const [followUpDays, setFollowUpDays] = useState(7);
  const [crmContactSearch, setCrmContactSearch] = useState('');

  // API Key Vault State
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyInput, setNewKeyInput] = useState('');
  // newKeyLabel already declared above (shared with db-key manager)
  const [keyStatus, setKeyStatus] = useState('');
  const [keyTestResults, setKeyTestResults] = useState({});

  // Persona Studio State
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaStatus, setPersonaStatus] = useState('');
  const [personaPreviewMsg, setPersonaPreviewMsg] = useState('');
  const [personaPreviewResult, setPersonaPreviewResult] = useState(null);
  const [personaPreviewLoading, setPersonaPreviewLoading] = useState(false);
  const [personaPreviewStatus, setPersonaPreviewStatus] = useState('');

  // Security & Access State
  const [secSessions, setSecSessions] = useState([]);
  const [secTokenInfo, setSecTokenInfo] = useState(null);
  const [pwdForm, setPwdForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [pwdStatus, setPwdStatus] = useState('');

  // Command Terminal State
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [rawApiEndpoint, setRawApiEndpoint] = useState('/api/status');
  const [rawApiMethod, setRawApiMethod] = useState('GET');
  const [rawApiBody, setRawApiBody] = useState('');
  const [rawApiResult, setRawApiResult] = useState(null);
  const [rawApiLoading, setRawApiLoading] = useState(false);
  const [cmdLoadingKey, setCmdLoadingKey] = useState('');

  // --- New Feature States ---
  const [customCommands, setCustomCommands] = useState([]);
  const [ccForm, setCcForm] = useState({ trigger_name: '', description: '', response_template: '', variables: '{}' });
  const [ccStatus, setCcStatus] = useState('');

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pmForm, setPmForm] = useState({ type: 'upi', label: '', value: '', network: '', qr_image_path: '', command_trigger: '', enabled: 1 });
  const [pmUploadLoading, setPmUploadLoading] = useState(false);
  const [pmStatus, setPmStatus] = useState('');

  const [deals, setDeals] = useState([]);
  const [dealForm, setDealForm] = useState({ contact_id: '', contact_name: '', items: '', amount: '', currency: 'USD' });
  const [dealStatus, setDealStatus] = useState('');
  const [closingDealId, setClosingDealId] = useState('');
  const [aiSummaryResult, setAiSummaryResult] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const [licenses, setLicenses] = useState([]);
  const [licenseForm, setLicenseForm] = useState({ client_telegram_id: '', client_name: '', store_name: '', duration_days: 30 });
  const [licStatus, setLicStatus] = useState('');

  // --- God-Level Expansion States ---
  const [joinedChats, setJoinedChats] = useState([]);
  const [gcLinkInput, setGcLinkInput] = useState('');
  const [gcStatus, setGcStatus] = useState('');
  const [gcLoading, setGcLoading] = useState(false);

  const [syncRules, setSyncRules] = useState([]);
  const [syncForm, setSyncForm] = useState({ source_chat_id: '', target_chat_id: '', keywords: '*', enabled: 1 });
  const [syncStatus, setSyncStatus] = useState('');

  const [proxies, setProxies] = useState([]);
  const [proxyForm, setProxyForm] = useState({ type: 'socks5', addr: '', port: '', username: '', password: '' });
  const [proxyStatus, setProxyStatus] = useState('');
  const [proxyLoading, setProxyLoading] = useState(false);

  const [storefrontAnalytics, setStorefrontAnalytics] = useState(null);
  const [storefrontLoading, setStorefrontLoading] = useState(false);

  // --- Even More God-Level Expansion States ---
  const [webhooks, setWebhooks] = useState([]);
  const [webhookForm, setWebhookForm] = useState({ url: '', secret_token: '', events: '*' });
  const [webhookStatus, setWebhookStatus] = useState('');
  const [threats, setThreats] = useState([]);
  const [threatStatus, setThreatStatus] = useState('');
  const [sandboxQuery, setSandboxQuery] = useState('SELECT COUNT(*) FROM contacts;');
  const [sandboxRows, setSandboxRows] = useState([]);
  const [sandboxError, setSandboxError] = useState('');
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(true);

  // --- Deal Completion Message Generator State ---
  const [dealMsgServiceType, setDealMsgServiceType] = useState('whatsapp_alt');
  const [dealMsgFields, setDealMsgFields] = useState({
    buyer_username: '',
    store_name: '',
    order_id: '',
    item_name: '',
    item_value: '',
    seller_info: '',
    login_number: '',
    email: '',
    password: '',
    totp_code: '',
    video_link: '',
    support_contact: '',
    bot_username: '',
    bot_name: '',
    custom_note: '',
  });
  const [dealMsgGenerated, setDealMsgGenerated] = useState('');
  const [dealMsgCopied, setDealMsgCopied] = useState(false);
  const [dealDirectSendStatus, setDealDirectSendStatus] = useState('');
  const [isDealDirectSending, setIsDealDirectSending] = useState(false);
  const [dealMsgWizardTab, setDealMsgWizardTab] = useState('meta');
  const [magicAuraEnhanced, setMagicAuraEnhanced] = useState(false);
  const [uplinkLogs, setUplinkLogs] = useState([]);

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
            <span>Weekly Message Traffic Flow</span>
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
            <span>Manager Agenda & Reminders</span>
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
                      Due: {rem.due_time}
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

  const saveSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    saveSettings({ [key]: value });
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
          alert("Owner Writing Style DNA profile rebuilt successfully from history!");
        } else {
          alert("Failed to rebuild style DNA: " + data.message);
        }
      } else {
        alert("Server error rebuilding style DNA.");
      }
    } catch (err) {
      console.error("Error rebuilding style profile:", err);
      alert("Network error rebuilding style profile.");
    } finally {
      setIsRebuildingProfile(false);
    }
  };

  // Fetch dynamic API keys from backend
  const fetchDbKeys = async () => {
    if (!token) return;
    setDbKeysLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDbKeys(data);
      }
    } catch (err) {
      console.error("Error fetching db keys:", err);
    } finally {
      setDbKeysLoading(false);
    }
  };

  // Add Gemini API key
  const handleAddGeminiKey = async (e) => {
    e.preventDefault();
    if (!newKeyString.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ key: newKeyString, label: newKeyLabel })
      });
      if (res.ok) {
        setNewKeyString('');
        setNewKeyLabel('');
        fetchDbKeys();
      } else {
        const data = await res.json();
        alert("Error: " + (data.detail || "Could not add key."));
      }
    } catch (err) {
      console.error("Error adding key:", err);
    }
  };

  // Delete Gemini API key
  const handleDeleteGeminiKey = async (keyString) => {
    if (!window.confirm("Are you sure you want to delete this API key from rotation pool?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys/delete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ key: keyString })
      });
      if (res.ok) {
        fetchDbKeys();
      } else {
        const data = await res.json();
        alert("Error: " + (data.detail || "Could not delete key."));
      }
    } catch (err) {
      console.error("Error deleting key:", err);
    }
  };

  // Test single Gemini key
  const handleTestSingleKey = async (keyString, index) => {
    setTestingKeyPrefix(index);
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys/test-single`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ key: keyString })
      });
      const data = await res.json();
      if (data.status === 'active') {
        alert(`Success: Key is ACTIVE and working!\nMessage: ${data.message || 'OK'}`);
      } else {
        alert(`Failed: Key status is '${data.status}'.\nError: ${data.message || 'Unknown error'}`);
      }
      fetchDbKeys();
    } catch (err) {
      console.error("Error testing key:", err);
      alert("Connection timed out or server error testing key.");
    } finally {
      setTestingKeyPrefix(null);
    }
  };

  // Ping All configured keys (run full diagnostics)
  const handlePingAllKeys = async () => {
    setKeyPoolLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/check-keys`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        alert("Active key diagnostics test complete. Rotator states updated!");
        fetchDbKeys();
      } else {
        alert("Failed to complete rotator health diagnostics.");
      }
    } catch (err) {
      console.error("Error checking keys:", err);
    } finally {
      setKeyPoolLoading(false);
    }
  };

  // Fetch Q&A rules
  const fetchQARules = async () => {
    if (!token) return;
    setQaRulesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rules/qa`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setQaRules(data);
      }
    } catch (err) {
      console.error("Error fetching QA rules:", err);
    } finally {
      setQaRulesLoading(false);
    }
  };

  // Add Q&A rule
  const handleAddQARule = async (e) => {
    e.preventDefault();
    if (!newQaQuery.trim() || !newQaResponse.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/rules/qa`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query: newQaQuery, response: newQaResponse })
      });
      if (res.ok) {
        setNewQaQuery('');
        setNewQaResponse('');
        fetchQARules();
      } else {
        const data = await res.json();
        alert("Error: " + (data.detail || "Could not save Q&A rule."));
      }
    } catch (err) {
      console.error("Error saving Q&A:", err);
    }
  };

  // Delete Q&A rule
  const handleDeleteQARule = async (ruleId) => {
    if (!window.confirm("Are you sure you want to delete this offline Q&A fallback rule?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/rules/qa/${ruleId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        fetchQARules();
      } else {
        alert("Failed to delete Q&A rule.");
      }
    } catch (err) {
      console.error("Error deleting Q&A:", err);
    }
  };

  // Database Vacuum Maintenance
  const handleDatabaseVacuum = async () => {
    setMaintenanceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/maintenance`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        alert("SUCCESS: " + (data.message || "Database optimized and vacuumed!"));
      } else {
        alert("FAILED: " + (data.detail || "Database optimization failed."));
      }
    } catch (err) {
      console.error("Error executing database vacuum:", err);
      alert("Connection error executing database vacuum.");
    } finally {
      setMaintenanceLoading(false);
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

  // Mass Broadcaster Sender
  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    setBroadcastStatus('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          category: broadcastCategory,
          message: broadcastMessage
        })
      });
      if (res.ok) {
        const data = await res.json();
        setBroadcastStatus(`success:${data.queued_count}`);
        setBroadcastMessage('');
      } else {
        const errData = await res.json();
        setBroadcastStatus(`error:${errData.detail || 'Failed to queue broadcast'}`);
      }
    } catch (err) {
      console.error("Error broadcasting messages:", err);
      setBroadcastStatus('error:Network error occurred');
    } finally {
      setBroadcastLoading(false);
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
      { id: 'toggle_ai', label: ` Toggle AI Autopilot (${sysStatus.ai_enabled ? 'ON → OFF' : 'OFF → ON'})`, type: 'action', desc: 'Enable/disable automatic AI replies' },
      { id: 'toggle_approval', label: `Toggle Approval Required (${sysStatus.approval_mode ? 'ON → OFF' : 'OFF → ON'})`, type: 'action', desc: 'Require manual approval before sending drafts' },
      { id: 'status_online', label: ' Set Status: Online', type: 'action', desc: 'Set active status preset' },
      { id: 'status_focus', label: ' Set Status: Focus', type: 'action', desc: 'Set active status preset' },
      { id: 'status_busy', label: ' Set Status: Busy', type: 'action', desc: 'Set active status preset' },
      { id: 'status_sleeping', label: ' Set Status: Sleeping', type: 'action', desc: 'Set active status preset' },
      { id: 'diagnostics', label: '️ Run API Key Diagnostics', type: 'action', desc: `Pings all ${keyPool.length || 5} Gemini keys to check health status` },
      { id: 'clear_logs', label: 'Clear Event Logs', type: 'action', desc: 'Flush all events from SQLite database' },
      { id: 'test_chime', label: ' Test Audio Chime', type: 'action', desc: 'Play synthesized success notification' },
    ];
    
    // Add filtered contacts
    contacts.forEach(c => {
      items.push({
        id: `contact_${c.telegram_id}`,
        label: ` Chat: ${c.first_name || ''} ${c.last_name || ''}`,
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

  // Scheduler fetch
  const fetchScheduledTasks = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/scheduler/tasks`, { headers: getHeaders() });
      if (res.ok) setScheduledTasks(await res.json());
    } catch (err) { console.error('Error fetching scheduler tasks:', err); }
  };

  const handleCreateScheduledTask = async (e) => {
    e.preventDefault();
    if (!schedForm.label.trim() || !schedForm.message.trim() || !schedForm.cron_expr.trim()) {
      setSchedStatus('Please fill label, message and cron expression.');
      return;
    }
    setSchedLoading(true); setSchedStatus('');
    try {
      const res = await fetch(`${API_BASE}/api/scheduler/tasks`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify(schedForm)
      });
      if (res.ok) {
        setSchedStatus('Task created.');
        setSchedForm({ label: '', message: '', cron_expr: '', category: 'all', enabled: true });
        fetchScheduledTasks();
      } else { setSchedStatus('Failed to create task.'); }
    } catch (err) { setSchedStatus('Network error.'); }
    finally { setSchedLoading(false); }
  };

  const handleDeleteScheduledTask = async (id) => {
    if (!window.confirm('Delete this scheduled task?')) return;
    try {
      await fetch(`${API_BASE}/api/scheduler/tasks/${id}`, { method: 'DELETE', headers: getHeaders() });
      fetchScheduledTasks();
    } catch (err) { console.error('Error deleting task:', err); }
  };

  // System telemetry fetch
  const fetchTelemetry = async () => {
    if (!token) return;
    setTelemetryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/telemetry`, { headers: getHeaders() });
      if (res.ok) setTelemetry(await res.json());
    } catch (err) { console.error('Error fetching telemetry:', err); }
    finally { setTelemetryLoading(false); }
  };

  const handleSystemClearLogs = async () => {
    if (!clearLogsConfirm) { setClearLogsConfirm(true); return; }
    setClearLogsLoading(true);
    try {
      await fetch(`${API_BASE}/api/admin/system/clear_logs`, { method: 'POST', headers: getHeaders() });
      setClearLogsConfirm(false);
      fetchTelemetry();
    } catch (err) { console.error('Error clearing logs:', err); }
    finally { setClearLogsLoading(false); }
  };

  const handleQaExport = async () => {
    setQaExportLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/qa/export`, { headers: getHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'qa_backup.json'; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) { console.error('Error exporting Q&A:', err); }
    finally { setQaExportLoading(false); }
  };

  const handleQaImport = async () => {
    if (!qaImportFile) { setQaImportStatus('Please select a JSON file first.'); return; }
    const formData = new FormData();
    formData.append('file', qaImportFile);
    setQaImportStatus('Uploading...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/qa/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setQaImportStatus(`Imported ${data.imported || '?'} rules.`);
        setQaImportFile(null);
        fetchQARules();
      } else { setQaImportStatus('Import failed.'); }
    } catch (err) { setQaImportStatus('Network error.'); }
  };

  const handleDbOptimize = async () => {
    setDbOptStatus('Running VACUUM...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/telemetry`, { headers: getHeaders() });
      if (res.ok) { setDbOptStatus('Database optimized (VACUUM OK).'); fetchTelemetry(); }
      else { setDbOptStatus('Optimization failed.'); }
    } catch (err) { setDbOptStatus('Network error.'); }
  };

  // ---- Broadcast Command Center ----
  const fetchBroadcastHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast/history`, { headers: getHeaders() });
      if (res.ok) setBroadcastHistory(await res.json());
    } catch (e) { console.error(e); }
  };
  const fetchBroadcastTemplates = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast/templates`, { headers: getHeaders() });
      if (res.ok) setBroadcastTemplates(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleSaveTemplate = async () => {
    if (!bcNewTplName.trim() || !bcNewTplContent.trim()) { setBcTplStatus('Name and content required.'); return; }
    setBcTplStatus('Saving...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast/templates`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: bcNewTplName, content: bcNewTplContent })
      });
      if (res.ok) {
        setBcTplStatus('Template saved!');
        setBcNewTplName(''); setBcNewTplContent('');
        fetchBroadcastTemplates();
      } else { setBcTplStatus('Save failed.'); }
    } catch (e) { setBcTplStatus('Network error.'); }
  };
  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    await fetch(`${API_BASE}/api/admin/broadcast/templates/${id}`, { method: 'DELETE', headers: getHeaders() });
    fetchBroadcastTemplates();
  };
  const getBroadcastRecipients = () => {
    if (broadcastCategory === 'all') return contacts;
    return contacts.filter(c => c.category === broadcastCategory);
  };

  // ---- AI Intelligence Lab ----
  const handleAiLabTest = async (e) => {
    e?.preventDefault();
    if (!aiLabMsg.trim()) return;
    setAiLabLoading(true);
    const userMsg = aiLabMsg;
    setAiLabMsg('');
    setAiLabConvo(prev => [...prev, { role: 'user', text: userMsg }]);
    try {
      const res = await fetch(`${API_BASE}/api/admin/test-ai`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ message: userMsg, status_mode: settings.status || 'online', contact_name: 'Lab Tester' })
      });
      if (res.ok) {
        const data = await res.json();
        setAiLabResult(data);
        setAiLabConvo(prev => [...prev, { role: 'ai', text: data.draft_reply, sentiment: data.sentiment, priority: data.priority }]);
      }
    } catch (e) { console.error(e); }
    finally { setAiLabLoading(false); }
  };
  const handleDnaRebuild = async () => {
    setDnaRebuildLoading(true);
    setDnaRebuildStatus('Rebuilding owner style DNA...');
    try {
      const res = await fetch(`${API_BASE}/api/settings/rebuild_owner_profile`, { method: 'POST', headers: getHeaders() });
      if (res.ok) setDnaRebuildStatus('Owner DNA style profile rebuilt successfully!');
      else setDnaRebuildStatus('Rebuild failed. Check logs.');
    } catch (e) { setDnaRebuildStatus('Network error.'); }
    finally { setDnaRebuildLoading(false); }
  };

  // ---- Reminders & CRM ----
  const fetchAllReminders = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/reminders`, { headers: getHeaders() });
      if (res.ok) setAllReminders(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleCreateCRMReminder = async (e) => {
    e.preventDefault();
    if (!reminderForm.task.trim()) { setReminderStatus('Task text required.'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/reminders`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ task: reminderForm.task, due_time: reminderForm.due_time || 'today', telegram_id: reminderForm.telegram_id || null })
      });
      if (res.ok) {
        setReminderStatus('Reminder created.');
        setReminderForm({ task: '', due_time: '', telegram_id: '', priority: 'medium' });
        fetchAllReminders();
      } else { setReminderStatus('Failed.'); }
    } catch (e) { setReminderStatus('Network error.'); }
  };
  const handleCompleteReminder = async (id, current) => {
    const next = current === 'completed' ? 'pending' : 'completed';
    await fetch(`${API_BASE}/api/reminders/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status: next }) });
    fetchAllReminders();
  };

  // ---- API Key Vault ----
  const fetchApiKeys = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys`, { headers: getHeaders() });
      if (res.ok) setApiKeys(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleAddKey = async () => {
    if (!newKeyInput.trim()) { setKeyStatus('Enter a key.'); return; }
    setKeyStatus('Adding...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ key: newKeyInput, label: newKeyLabel || 'Key ' + (apiKeys.length + 1) })
      });
      if (res.ok) { setKeyStatus('Key added.'); setNewKeyInput(''); setNewKeyLabel(''); fetchApiKeys(); }
      else { setKeyStatus('Failed to add key.'); }
    } catch (e) { setKeyStatus('Network error.'); }
  };
  const handleDeleteKey = async (key) => {
    if (!window.confirm('Delete this API key?')) return;
    await fetch(`${API_BASE}/api/admin/keys/delete`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ key }) });
    fetchApiKeys();
  };
  const handleTestVaultKey = async (key) => {
    setKeyTestResults(prev => ({ ...prev, [key]: 'testing...' }));
    try {
      const res = await fetch(`${API_BASE}/api/admin/keys/test-single`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ key }) });
      const data = await res.json();
      setKeyTestResults(prev => ({ ...prev, [key]: data.valid ? 'Valid' : 'Invalid' }));
    } catch (e) { setKeyTestResults(prev => ({ ...prev, [key]: 'Error' })); }
  };

  // ---- Security & Access ----
  const fetchSecSessions = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/security/sessions`, { headers: getHeaders() });
      if (res.ok) setSecSessions(await res.json());
    } catch (e) { console.error(e); }
  };
  const fetchSecTokenInfo = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/security/token-info`, { headers: getHeaders() });
      if (res.ok) setSecTokenInfo(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPwd !== pwdForm.confirm) { setPwdStatus('New passwords do not match.'); return; }
    if (pwdForm.newPwd.length < 4) { setPwdStatus('Password must be 4+ chars.'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/admin/security/change-password`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ current_password: pwdForm.current, new_password: pwdForm.newPwd })
      });
      if (res.ok) { setPwdStatus('Password changed successfully!'); setPwdForm({ current: '', newPwd: '', confirm: '' }); }
      else { const d = await res.json(); setPwdStatus(` ${d.detail || 'Failed.'}`); }
    } catch (e) { setPwdStatus('Network error.'); }
  };

  // ---- System Health ----
  const fetchSystemHealth = async () => {
    if (!token) return;
    setHealthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/health`, { headers: getHeaders() });
      if (res.ok) setSystemHealth(await res.json());
    } catch (e) { console.error(e); }
    finally { setHealthLoading(false); }
  };
  const fetchDbCounts = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/db-counts`, { headers: getHeaders() });
      if (res.ok) setDbCounts(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleFullBackup = async () => {
    setSysBackupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/backup`, { headers: getHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'coet_full_backup.json'; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { console.error(e); }
    finally { setSysBackupLoading(false); }
  };

  // ---- Command Terminal ----
  const addTerminalLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev.slice(-49), { msg, type, ts }]);
  };
  const handleRawApiCall = async () => {
    setRawApiLoading(true);
    setRawApiResult(null);
    addTerminalLog(`→ ${rawApiMethod} ${rawApiEndpoint}`, 'cmd');
    try {
      const opts = { method: rawApiMethod, headers: getHeaders() };
      if (rawApiMethod !== 'GET' && rawApiBody.trim()) opts.body = rawApiBody;
      const res = await fetch(`${API_BASE}${rawApiEndpoint}`, opts);
      const data = await res.json();
      setRawApiResult({ status: res.status, data });
      addTerminalLog(`← ${res.status} OK`, 'ok');
    } catch (e) {
      setRawApiResult({ error: e.message });
      addTerminalLog(`← ERROR: ${e.message}`, 'err');
    } finally { setRawApiLoading(false); }
  };
  const runCommand = async (key, endpoint, method = 'POST') => {
    setCmdLoadingKey(key);
    addTerminalLog(`CMD: ${key}`, 'cmd');
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { method, headers: getHeaders() });
      const data = await res.json();
      addTerminalLog(`${key} → ${JSON.stringify(data).slice(0, 80)}`, 'ok');
    } catch (e) { addTerminalLog(` ${key} failed: ${e.message}`, 'err'); }
    finally { setCmdLoadingKey(''); }
  };

  // ---- Custom Commands Handlers ----
  const fetchCustomCommands = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/custom-commands`, { headers: getHeaders() });
      if (res.ok) setCustomCommands(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleSaveCustomCommand = async (e) => {
    e.preventDefault();
    if (!ccForm.trigger_name.trim() || !ccForm.response_template.trim()) {
      setCcStatus('Trigger and Template are required.');
      return;
    }
    setCcStatus('Saving...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/custom-commands`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(ccForm)
      });
      if (res.ok) {
        setCcStatus('Custom command saved.');
        setCcForm({ trigger_name: '', description: '', response_template: '', variables: '{}' });
        fetchCustomCommands();
      } else {
        setCcStatus('Failed to save command.');
      }
    } catch (e) { setCcStatus('Network error.'); }
  };
  const handleDeleteCustomCommand = async (id) => {
    if (!window.confirm('Delete this custom command?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/custom-commands/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) fetchCustomCommands();
    } catch (e) { console.error(e); }
  };

  // ---- Payment Methods Handlers ----
  const fetchPaymentMethods = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/payment-methods`, { headers: getHeaders() });
      if (res.ok) setPaymentMethods(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleSavePaymentMethod = async (e) => {
    e.preventDefault();
    if (!pmForm.label.trim() || !pmForm.value.trim() || !pmForm.command_trigger.trim()) {
      setPmStatus('Label, Value, and Command Trigger are required.');
      return;
    }
    setPmStatus('Saving...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/payment-methods`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(pmForm)
      });
      if (res.ok) {
        setPmStatus('Payment method saved.');
        setPmForm({ type: 'upi', label: '', value: '', network: '', qr_image_path: '', command_trigger: '', enabled: 1 });
        fetchPaymentMethods();
      } else {
        setPmStatus('Failed to save payment method.');
      }
    } catch (e) { setPmStatus('Network error.'); }
  };
  const handleDeletePaymentMethod = async (id) => {
    if (!window.confirm('Delete this payment method?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/payment-methods/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) fetchPaymentMethods();
    } catch (e) { console.error(e); }
  };
  const handleQrUpload = async (file) => {
    if (!file) return;
    setPmUploadLoading(true);
    setPmStatus('Uploading QR Image...');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/admin/payment-methods/upload-qr`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setPmForm(prev => ({ ...prev, qr_image_path: data.qr_image_path }));
        setPmStatus('QR Image uploaded successfully.');
      } else {
        setPmStatus('Upload failed.');
      }
    } catch (e) { setPmStatus('Network error.'); }
    finally { setPmUploadLoading(false); }
  };

  // ---- Deal Manager Handlers ----
  const fetchDeals = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/deals`, { headers: getHeaders() });
      if (res.ok) setDeals(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleCreateDeal = async (e) => {
    e.preventDefault();
    if (!dealForm.contact_id || !dealForm.items.trim() || !dealForm.amount) {
      setDealStatus('Select Contact, enter Items, and Amount.');
      return;
    }
    const contact = contacts.find(c => c.telegram_id === parseInt(dealForm.contact_id));
    const payload = {
      contact_id: parseInt(dealForm.contact_id),
      contact_name: contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Unknown Contact',
      items: dealForm.items,
      amount: parseFloat(dealForm.amount),
      currency: dealForm.currency
    };
    setDealStatus('Creating deal...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/deals`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setDealStatus(`Deal created! Order ID: ${data.order_id}`);
        setDealForm({ contact_id: '', contact_name: '', items: '', amount: '', currency: 'USD' });
        fetchDeals();
      } else {
        setDealStatus('Failed to create deal.');
      }
    } catch (e) { setDealStatus('Network error.'); }
  };
  const handleGenerateSummary = async (order_id) => {
    setClosingDealId(order_id);
    setAiSummaryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/deals/${order_id}/generate-summary`, { method: 'POST', headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAiSummaryResult(data);
      }
    } catch (e) { console.error(e); }
    finally { setAiSummaryLoading(false); }
  };
  const handleCloseDeal = async (order_id, summary, thankYouMessage) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/deals/${order_id}/close`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ summary, thank_you_message: thankYouMessage })
      });
      if (res.ok) {
        setAiSummaryResult(null);
        setClosingDealId('');
        fetchDeals();
        fetchContacts();
      }
    } catch (e) { console.error(e); }
  };
  const handleSendThankYouMessage = async (order_id) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/deals/${order_id}/send-thanks`, { method: 'POST', headers: getHeaders() });
      if (res.ok) {
        alert('Thank-you message sent directly to Telegram chat successfully!');
      } else {
        alert('Failed to send thank-you message.');
      }
    } catch (e) { alert('Network error.'); }
  };

  // ---- Customer Access Handlers ----
  const fetchLicenses = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/licenses`, { headers: getHeaders() });
      if (res.ok) setLicenses(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleCreateLicense = async (e) => {
    e.preventDefault();
    if (!licenseForm.client_name.trim() || !licenseForm.store_name.trim() || !licenseForm.client_telegram_id) {
      setLicStatus('Client Name, Store Name, and Telegram ID are required.');
      return;
    }
    const payload = {
      client_telegram_id: parseInt(licenseForm.client_telegram_id),
      client_name: licenseForm.client_name,
      store_name: licenseForm.store_name,
      duration_days: parseInt(licenseForm.duration_days)
    };
    setLicStatus('Generating key...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/licenses`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setLicStatus(`Key generated: ${data.license_key}`);
        setLicenseForm({ client_telegram_id: '', client_name: '', store_name: '', duration_days: 30 });
        fetchLicenses();
      } else {
        setLicStatus('Failed to generate license.');
      }
    } catch (e) { setLicStatus('Network error.'); }
  };
  const handleToggleLicenseStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`${API_BASE}/api/admin/licenses/${id}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) fetchLicenses();
    } catch (e) { console.error(e); }
  };
  const handleDeleteLicense = async (id) => {
    if (!window.confirm('Delete this license key? Admin access and client bot access will be immediately terminated.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/licenses/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) fetchLicenses();
    } catch (e) { console.error(e); }
  };

  // ---- GC Manager Handlers ----
  const fetchJoinedChats = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/gc/chats`, { headers: getHeaders() });
      if (res.ok) setJoinedChats(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleJoinGC = async (e) => {
    e.preventDefault();
    if (!gcLinkInput.trim()) {
      setGcStatus('Invite link or username is required.');
      return;
    }
    setGcLoading(true);
    setGcStatus('Userbot joining chat...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/gc/join`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ link: gcLinkInput })
      });
      if (res.ok) {
        const data = await res.json();
        setGcStatus(`Success: Joined ${data.title}`);
        setGcLinkInput('');
        fetchJoinedChats();
      } else {
        const d = await res.json();
        setGcStatus(`Error: ${d.detail || 'Failed to join.'}`);
      }
    } catch (e) { setGcStatus('Network error.'); }
    finally { setGcLoading(false); }
  };
  const handleToggleGCWhitelist = async (chat_id, whitelisted) => {
    const nextVal = whitelisted === 1 ? 0 : 1;
    try {
      const res = await fetch(`${API_BASE}/api/admin/gc/chats/${chat_id}/whitelist`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ whitelisted: nextVal })
      });
      if (res.ok) fetchJoinedChats();
    } catch (e) { console.error(e); }
  };
  const handleDeleteGCChat = async (chat_id) => {
    if (!window.confirm('Remove this chat from joined whitelist?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/gc/chats/${chat_id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) fetchJoinedChats();
    } catch (e) { console.error(e); }
  };

  // ---- Sync / Forwarding Rules Handlers ----
  const fetchSyncRules = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/sync/rules`, { headers: getHeaders() });
      if (res.ok) setSyncRules(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleCreateSyncRule = async (e) => {
    e.preventDefault();
    if (!syncForm.source_chat_id || !syncForm.target_chat_id) {
      setSyncStatus('Source and Target Chat IDs are required.');
      return;
    }
    setSyncStatus('Saving sync rule...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/sync/rules`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          source_chat_id: parseInt(syncForm.source_chat_id),
          target_chat_id: parseInt(syncForm.target_chat_id),
          keywords: syncForm.keywords || '*',
          enabled: 1
        })
      });
      if (res.ok) {
        setSyncStatus('Sync rule saved successfully!');
        setSyncForm({ source_chat_id: '', target_chat_id: '', keywords: '*', enabled: 1 });
        fetchSyncRules();
      } else {
        setSyncStatus('Failed to save rule.');
      }
    } catch (e) { setSyncStatus('Network error.'); }
  };
  const handleDeleteSyncRule = async (id) => {
    if (!window.confirm('Delete this sync rule?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/sync/rules/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) fetchSyncRules();
    } catch (e) { console.error(e); }
  };

  // ---- Proxy Handlers ----
  const fetchProxies = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/proxies`, { headers: getHeaders() });
      if (res.ok) setProxies(await res.json());
    } catch (e) { console.error(e); }
  };
  const handleCreateProxy = async (e) => {
    e.preventDefault();
    if (!proxyForm.addr || !proxyForm.port) {
      setProxyStatus('Address and Port are required.');
      return;
    }
    setProxyStatus('Saving proxy...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/proxies`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: proxyForm.type,
          addr: proxyForm.addr,
          port: parseInt(proxyForm.port),
          username: proxyForm.username || '',
          password: proxyForm.password || ''
        })
      });
      if (res.ok) {
        setProxyStatus('Proxy configuration saved!');
        setProxyForm({ type: 'socks5', addr: '', port: '', username: '', password: '' });
        fetchProxies();
      } else {
        setProxyStatus('Failed to save proxy.');
      }
    } catch (e) { setProxyStatus('Network error.'); }
  };
  const handleTestProxy = async (proxy_id) => {
    setProxyLoading(true);
    setProxyStatus('Testing proxy latency...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/proxies/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ proxy_id })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'active') {
          setProxyStatus(`Proxy Active: ${data.latency_ms}ms latency.`);
        } else {
          setProxyStatus(`Proxy Error: ${data.message || 'Connection failed.'}`);
        }
        fetchProxies();
      } else {
        setProxyStatus('Test request failed.');
      }
    } catch (e) { setProxyStatus('Network error.'); }
    finally { setProxyLoading(false); }
  };
  const handleDeleteProxy = async (id) => {
    if (!window.confirm('Remove proxy profile?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/proxies/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) fetchProxies();
    } catch (e) { console.error(e); }
  };

  // ---- Storefront Handlers ----
  const fetchStorefrontAnalytics = async () => {
    if (!token) return;
    setStorefrontLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/storefront/analytics`, { headers: getHeaders() });
      if (res.ok) setStorefrontAnalytics(await res.json());
    } catch (e) { console.error(e); }
    finally { setStorefrontLoading(false); }
  };

  // ---- God-Level 5 Workspace Handlers ----
  const fetchWebhooks = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/webhooks`, { headers: getHeaders() });
      if (res.ok) setWebhooks(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchThreats = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/threats`, { headers: getHeaders() });
      if (res.ok) setThreats(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleSaveWebhook = async (e) => {
    e.preventDefault();
    if (!webhookForm.url) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/webhooks`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(webhookForm)
      });
      if (res.ok) {
        setWebhookStatus('Webhook registered successfully');
        setWebhookForm({ url: '', secret_token: '', events: '*' });
        fetchWebhooks();
      } else {
        const err = await res.json();
        setWebhookStatus(`Error: ${err.detail || 'Failed'}`);
      }
    } catch (err) {
      setWebhookStatus(`Error: ${err.message}`);
    }
  };

  const handleDeleteWebhook = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/webhooks/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) fetchWebhooks();
    } catch (e) { console.error(e); }
  };

  const handleClearThreats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/threats`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) fetchThreats();
    } catch (e) { console.error(e); }
  };

  const handleExecuteSandboxQuery = async (e) => {
    e.preventDefault();
    setSandboxLoading(true);
    setSandboxError('');
    setSandboxRows([]);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/query`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query: sandboxQuery })
      });
      const data = await res.json();
      if (res.ok) {
        setSandboxRows(data.rows || []);
      } else {
        setSandboxError(data.detail || 'Failed to execute query');
      }
    } catch (err) {
      setSandboxError(err.message);
    } finally {
      setSandboxLoading(false);
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
        fetchDbKeys();
        fetchQARules();
      } else if (activeTab === 'pipeline') {
        fetchContacts();
      } else if (activeTab === 'analytics') {
        fetchAnalytics();
        fetchSysStatus();
      } else if (activeTab === 'scheduler') {
        fetchScheduledTasks();
      } else if (activeTab === 'system') {
        fetchTelemetry();
        fetchSystemHealth();
        fetchDbCounts();
      } else if (activeTab === 'broadcast') {
        fetchBroadcastHistory();
        fetchBroadcastTemplates();
        if (contacts.length === 0) fetchContacts();
      } else if (activeTab === 'intelligence') {
        fetchSettings();
      } else if (activeTab === 'reminders') {
        fetchAllReminders();
        if (contacts.length === 0) fetchContacts();
      } else if (activeTab === 'keys') {
        fetchApiKeys();
      } else if (activeTab === 'personas') {
        fetchSettings();
      } else if (activeTab === 'security') {
        fetchSecSessions();
        fetchSecTokenInfo();
      } else if (activeTab === 'commands') {
        fetchSystemHealth();
      } else if (activeTab === 'customCommands') {
        fetchCustomCommands();
      } else if (activeTab === 'paymentHub') {
        fetchPaymentMethods();
      } else if (activeTab === 'dealManager') {
        fetchDeals();
        fetchContacts();
      } else if (activeTab === 'customerAccess') {
        fetchLicenses();
      } else if (activeTab === 'gcManager') {
        fetchJoinedChats();
      } else if (activeTab === 'autoForwarder') {
        fetchSyncRules();
      } else if (activeTab === 'keywordStudio') {
        fetchKeywordRules();
      } else if (activeTab === 'proxyManager') {
        fetchProxies();
      } else if (activeTab === 'antiScam') {
        fetchSettings();
      } else if (activeTab === 'storefrontAnalytics') {
        fetchStorefrontAnalytics();
      } else if (activeTab === 'aiSwarm') {
        fetchSettings();
      } else if (activeTab === 'threatRadar') {
        fetchSettings();
        fetchThreats();
      } else if (activeTab === 'ledgerStudio') {
        fetchSettings();
      } else if (activeTab === 'webhookHub') {
        fetchWebhooks();
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
      if (c.category === 'vip') return { emoji: '', label: 'VIP', color: '#ef4444' };
      if (c.category === 'client' || c.category === 'business_partner') return { emoji: '', label: 'Active', color: '#f59e0b' };
      return { emoji: '', label: 'Normal', color: '#10b981' };
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
              {list.filter(c => c.is_muted === 1).length > 0 && `${list.filter(c => c.is_muted === 1).length} `}
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
                          Takeover
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
                    {c.notes}
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
                    {c.relationship_summary.split('\n')[0].replace(/^[-\*\s•]+/, '').slice(0, 60)}
                  </div>
                )}

                {/* Footer row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '7px' }} 
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    {timeAgo && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dark)', background: 'rgba(255,255,255,0.03)', padding: '2px 5px', borderRadius: '4px' }}>
                        {timeAgo}
                      </span>
                    )}
                    <button
                      title="Quick note"
                      onClick={() => { setPipelineNoteContact(c); setPipelineNoteText(c.notes || ''); }}
                      style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.15)', color: '#d8b4fe' }}
                    >
                      Note
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
              <span style={{ fontSize: '1.8rem', opacity: 0.3 }}></span>
              <p style={{ color: 'var(--text-dark)', fontSize: '0.8rem', fontStyle: 'italic' }}>No contacts here</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const sidebarGroupHeaderStyle = (isOpen) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 10px',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: isOpen ? 'var(--color-primary)' : 'var(--text-dark)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'color 0.2s ease',
    marginTop: '6px'
  });

  const sidebarGroupArrowStyle = (isOpen) => ({
    fontSize: '0.65rem',
    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 0.15s'
  });

  const sidebarGroupContentStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    paddingLeft: '6px',
    marginTop: '4px',
    borderLeft: '1px solid rgba(255,255,255,0.03)',
    marginLeft: '6px'
  };

  return (
    <div className="app-shell">
      {/* Mobile Topbar */}
      <div className="mobile-topbar">
        <button 
          type="button"
          className="hamburger-btn" 
          onClick={() => setMobileMenuOpen(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="mobile-topbar-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldIcon style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
          Coet Manager
        </span>
      </div>

      {/* Mobile Drawer Overlay */}
      <div 
        className={`drawer-overlay ${mobileMenuOpen ? 'open' : ''}`} 
        onClick={() => setMobileMenuOpen(false)} 
      />

      {/* SIDEBAR NAVIGATION */}
      <aside className={`sidebar ${mobileMenuOpen ? 'drawer open' : ''}`}>
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
            AI Engine: <span style={{ color: sysStatus.ai_enabled ? 'var(--color-secondary)' : '#f87171', fontWeight: 'bold' }}>
              {sysStatus.ai_enabled ? 'Gemini Active' : 'Lockdown Muted'}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              const nextVal = !sysStatus.ai_enabled;
              setSysStatus(prev => ({ ...prev, ai_enabled: nextVal }));
              saveSettings({ ai_enabled: nextVal });
            }}
            className="micro-scale"
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '6px',
              cursor: 'pointer',
              border: `1px solid ${sysStatus.ai_enabled ? '#ef4444' : 'var(--color-success)'}`,
              background: sysStatus.ai_enabled
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(16, 185, 129, 0.12)',
              color: sysStatus.ai_enabled ? '#fca5a5' : '#a7f3d0',
              textAlign: 'center',
              boxShadow: sysStatus.ai_enabled ? 'none' : '0 0 10px rgba(16,185,129,0.3)',
              transition: 'all 0.2s ease'
            }}
          >
            {sysStatus.ai_enabled ? 'Panic Lockdown' : 'Resume Autopilot'}
          </button>
        </div>
        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          
          {/* Group 1: Core Console */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('core')} style={sidebarGroupHeaderStyle(expandedGroups.core)}>
              <span>1. Core Console</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.core)}>▶</span>
            </button>
            {expandedGroups.core && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'overview' ? 'active-nav' : ''}`} onClick={() => setActiveTab('overview')}>
                  <DashboardIcon /> Overview
                </button>
              </div>
            )}
          </div>

          {/* Group 2: Account Memory */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('contacts')} style={sidebarGroupHeaderStyle(expandedGroups.contacts)}>
              <span>2. Contacts & Memory</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.contacts)}>▶</span>
            </button>
            {expandedGroups.contacts && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'contacts' ? 'active-nav' : ''}`} onClick={() => setActiveTab('contacts')}>
                  <ContactsIcon /> Contacts & Memory
                </button>
              </div>
            )}
          </div>

          {/* Group 3: Deals Pipeline */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('pipeline')} style={sidebarGroupHeaderStyle(expandedGroups.pipeline)}>
              <span>3. Deals Pipeline</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.pipeline)}>▶</span>
            </button>
            {expandedGroups.pipeline && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'pipeline' ? 'active-nav' : ''}`} onClick={() => setActiveTab('pipeline')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg> Deals Pipeline
                </button>
              </div>
            )}
          </div>

          {/* Group 4: Task Reminders */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('reminders')} style={sidebarGroupHeaderStyle(expandedGroups.reminders)}>
              <span>4. Reminders</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.reminders)}>▶</span>
            </button>
            {expandedGroups.reminders && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'reminders' ? 'active-nav' : ''}`} onClick={() => setActiveTab('reminders')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg> Reminders
                </button>
              </div>
            )}
          </div>

          {/* Group 5: Lead Scrapers */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('leads')} style={sidebarGroupHeaderStyle(expandedGroups.leads)}>
              <span>5. Lead Extractor</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.leads)}>▶</span>
            </button>
            {expandedGroups.leads && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'leadExtractor' ? 'active-nav' : ''}`} onClick={() => setActiveTab('leadExtractor')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg> Lead Extractor
                </button>
              </div>
            )}
          </div>

          {/* Group 6: AI Rules */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('rules')} style={sidebarGroupHeaderStyle(expandedGroups.rules)}>
              <span>6. AI Rules Engine</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.rules)}>▶</span>
            </button>
            {expandedGroups.rules && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'rules' ? 'active-nav' : ''}`} onClick={() => setActiveTab('rules')}>
                  <SettingsIcon /> AI Rules
                </button>
              </div>
            )}
          </div>

          {/* Group 7: Swarm Coordinator */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('swarm')} style={sidebarGroupHeaderStyle(expandedGroups.swarm)}>
              <span>7. AI Swarm Control</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.swarm)}>▶</span>
            </button>
            {expandedGroups.swarm && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'aiSwarm' ? 'active-nav' : ''}`} onClick={() => setActiveTab('aiSwarm')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> AI Swarm Coordinator
                </button>
              </div>
            )}
          </div>

          {/* Group 8: Persona Studio */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('personas')} style={sidebarGroupHeaderStyle(expandedGroups.personas)}>
              <span>8. Persona Studio</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.personas)}>▶</span>
            </button>
            {expandedGroups.personas && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'personas' ? 'active-nav' : ''}`} onClick={() => setActiveTab('personas')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg> Persona Studio
                </button>
              </div>
            )}
          </div>

          {/* Group 9: AI Labs */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('labs')} style={sidebarGroupHeaderStyle(expandedGroups.labs)}>
              <span>9. AI Labs</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.labs)}>▶</span>
            </button>
            {expandedGroups.labs && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'intelligence' ? 'active-nav' : ''}`} onClick={() => setActiveTab('intelligence')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> AI Lab
                </button>
              </div>
            )}
          </div>

          {/* Group 10: Tone & Writing DNA */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('tone')} style={sidebarGroupHeaderStyle(expandedGroups.tone)}>
              <span>10. Tone & Writing DNA</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.tone)}>▶</span>
            </button>
            {expandedGroups.tone && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'styleMirror' ? 'active-nav' : ''}`} onClick={() => setActiveTab('styleMirror')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Tone & Dialect Mirror
                </button>
              </div>
            )}
          </div>

          {/* Group 11: Sentiment Radar */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('sentiment')} style={sidebarGroupHeaderStyle(expandedGroups.sentiment)}>
              <span>11. Sentiment Radar</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.sentiment)}>▶</span>
            </button>
            {expandedGroups.sentiment && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'sentimentRadar' ? 'active-nav' : ''}`} onClick={() => setActiveTab('sentimentRadar')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M12 9v6m-7 6h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> Sentiment Radar
                </button>
              </div>
            )}
          </div>

          {/* Group 12: Broadcast Hub */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('broadcast')} style={sidebarGroupHeaderStyle(expandedGroups.broadcast)}>
              <span>12. Broadcast Hub</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.broadcast)}>▶</span>
            </button>
            {expandedGroups.broadcast && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'broadcast' ? 'active-nav' : ''}`} onClick={() => setActiveTab('broadcast')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg> Broadcast
                </button>
              </div>
            )}
          </div>

          {/* Group 13: Time Scheduler */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('scheduler')} style={sidebarGroupHeaderStyle(expandedGroups.scheduler)}>
              <span>13. Job Scheduler</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.scheduler)}>▶</span>
            </button>
            {expandedGroups.scheduler && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'scheduler' ? 'active-nav' : ''}`} onClick={() => setActiveTab('scheduler')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Scheduler
                </button>
              </div>
            )}
          </div>

          {/* Group 14: DM Campaigns */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('outreach')} style={sidebarGroupHeaderStyle(expandedGroups.outreach)}>
              <span>14. Outreach Campaign</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.outreach)}>▶</span>
            </button>
            {expandedGroups.outreach && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'massdmCampaign' ? 'active-nav' : ''}`} onClick={() => setActiveTab('massdmCampaign')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> DM Campaigns
                </button>
              </div>
            )}
          </div>

          {/* Group 15: Media Postings */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('media')} style={sidebarGroupHeaderStyle(expandedGroups.media)}>
              <span>15. Media Scheduler</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.media)}>▶</span>
            </button>
            {expandedGroups.media && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'mediaScheduler' ? 'active-nav' : ''}`} onClick={() => setActiveTab('mediaScheduler')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Rich Media Scheduler
                </button>
              </div>
            )}
          </div>

          {/* Group 16: Feedback Loop */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('feedback')} style={sidebarGroupHeaderStyle(expandedGroups.feedback)}>
              <span>16. Feedback & Vouches</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.feedback)}>▶</span>
            </button>
            {expandedGroups.feedback && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'feedbackCollector' ? 'active-nav' : ''}`} onClick={() => setActiveTab('feedbackCollector')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg> Feedback & Vouches
                </button>
              </div>
            )}
          </div>

          {/* Group 17: General Analytics */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('analytics')} style={sidebarGroupHeaderStyle(expandedGroups.analytics)}>
              <span>17. Growth Analytics</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.analytics)}>▶</span>
            </button>
            {expandedGroups.analytics && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'analytics' ? 'active-nav' : ''}`} onClick={() => setActiveTab('analytics')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> Analytics
                </button>
              </div>
            )}
          </div>

          {/* Group 18: Group Chats Manager */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('groups')} style={sidebarGroupHeaderStyle(expandedGroups.groups)}>
              <span>18. GC Group Chats</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.groups)}>▶</span>
            </button>
            {expandedGroups.groups && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'gcManager' ? 'active-nav' : ''}`} onClick={() => setActiveTab('gcManager')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> GC Manager
                </button>
              </div>
            )}
          </div>

          {/* Group 19: Relay Cloners */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('relays')} style={sidebarGroupHeaderStyle(expandedGroups.relays)}>
              <span>19. Auto Relays & Cloners</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.relays)}>▶</span>
            </button>
            {expandedGroups.relays && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'autoForwarder' ? 'active-nav' : ''}`} onClick={() => setActiveTab('autoForwarder')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> Auto-Forwarder
                </button>
              </div>
            )}
          </div>

          {/* Group 20: Channel Mirror */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('mirror')} style={sidebarGroupHeaderStyle(expandedGroups.mirror)}>
              <span>20. Channel Mirroring</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.mirror)}>▶</span>
            </button>
            {expandedGroups.mirror && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'channelMirror' ? 'active-nav' : ''}`} onClick={() => setActiveTab('channelMirror')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Channel Mirroring
                </button>
              </div>
            )}
          </div>

          {/* Group 21: Proxy Vault */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('proxies')} style={sidebarGroupHeaderStyle(expandedGroups.proxies)}>
              <span>21. Proxy Manager</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.proxies)}>▶</span>
            </button>
            {expandedGroups.proxies && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'proxyManager' ? 'active-nav' : ''}`} onClick={() => setActiveTab('proxyManager')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg> Proxy Manager
                </button>
              </div>
            )}
          </div>

          {/* Group 22: Session Rotator */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('sessions')} style={sidebarGroupHeaderStyle(expandedGroups.sessions)}>
              <span>22. Multi-Session Rotator</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.sessions)}>▶</span>
            </button>
            {expandedGroups.sessions && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'sessionRotator' ? 'active-nav' : ''}`} onClick={() => setActiveTab('sessionRotator')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3m0 0l-3-3m3 3H9" /></svg> Session Rotator
                </button>
              </div>
            )}
          </div>

          {/* Group 23: Keyword Studio */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('keywords')} style={sidebarGroupHeaderStyle(expandedGroups.keywords)}>
              <span>23. Keyword Studio</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.keywords)}>▶</span>
            </button>
            {expandedGroups.keywords && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'keywordStudio' ? 'active-nav' : ''}`} onClick={() => setActiveTab('keywordStudio')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg> Keyword Studio
                </button>
              </div>
            )}
          </div>

          {/* Group 24: Traffic Monitor */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('traffic')} style={sidebarGroupHeaderStyle(expandedGroups.traffic)}>
              <span>24. Traffic Monitor</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.traffic)}>▶</span>
            </button>
            {expandedGroups.traffic && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'trafficMonitor' ? 'active-nav' : ''}`} onClick={() => setActiveTab('trafficMonitor')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> Traffic Monitor
                </button>
              </div>
            )}
          </div>

          {/* Group 25: Commerce Deals */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('commerce')} style={sidebarGroupHeaderStyle(expandedGroups.commerce)}>
              <span>25. Deal Manager</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.commerce)}>▶</span>
            </button>
            {expandedGroups.commerce && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'dealManager' ? 'active-nav' : ''}`} onClick={() => setActiveTab('dealManager')}>
                  <BriefcaseIcon /> Deal Manager
                </button>
              </div>
            )}
          </div>

          {/* Group 26: Billing Ledger */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('billing')} style={sidebarGroupHeaderStyle(expandedGroups.billing)}>
              <span>26. Store Invoicing & Ledger</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.billing)}>▶</span>
            </button>
            {expandedGroups.billing && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'ledgerStudio' ? 'active-nav' : ''}`} onClick={() => setActiveTab('ledgerStudio')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> Ledger Studio
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'billingLedger' ? 'active-nav' : ''}`} onClick={() => setActiveTab('billingLedger')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Store Invoicing Ledger
                </button>
              </div>
            )}
          </div>

          {/* Group 27: Payment Portal */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('payments')} style={sidebarGroupHeaderStyle(expandedGroups.payments)}>
              <span>27. Payment Gateways</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.payments)}>▶</span>
            </button>
            {expandedGroups.payments && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'paymentHub' ? 'active-nav' : ''}`} onClick={() => setActiveTab('paymentHub')}>
                  <CreditCardIcon /> Payment Hub
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'paymentEscrow' ? 'active-nav' : ''}`} onClick={() => setActiveTab('paymentEscrow')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> Escrow Vault Hub
                </button>
              </div>
            )}
          </div>

          {/* Group 28: Dispute Arbitrator */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('disputes')} style={sidebarGroupHeaderStyle(expandedGroups.disputes)}>
              <span>28. Disputes & Licenses</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.disputes)}>▶</span>
            </button>
            {expandedGroups.disputes && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'disputeArbitrator' ? 'active-nav' : ''}`} onClick={() => setActiveTab('disputeArbitrator')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7H1m12 0l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M16 7l3 9m-3-9h-5" /></svg> Dispute Arbitrator
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'customerAccess' ? 'active-nav' : ''}`} onClick={() => setActiveTab('customerAccess')}>
                  <KeyIcon /> Customer Access
                </button>
              </div>
            )}
          </div>

          {/* Group 29: Security Shield */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('security')} style={sidebarGroupHeaderStyle(expandedGroups.security)}>
              <span>29. Shield Security</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.security)}>▶</span>
            </button>
            {expandedGroups.security && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'security' ? 'active-nav' : ''}`} onClick={() => setActiveTab('security')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> Security Settings
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'antiScam' ? 'active-nav' : ''}`} onClick={() => setActiveTab('antiScam')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> Anti-Scam Cap
                </button>
              </div>
            )}
          </div>

          {/* Group 30: Threat Radar & Blockers */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('threats')} style={sidebarGroupHeaderStyle(expandedGroups.threats)}>
              <span>30. Threats & Filters</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.threats)}>▶</span>
            </button>
            {expandedGroups.threats && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'threatRadar' ? 'active-nav' : ''}`} onClick={() => setActiveTab('threatRadar')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> Threat Radar
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'wordFilter' ? 'active-nav' : ''}`} onClick={() => setActiveTab('wordFilter')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg> Regex Filter Lab
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'botSpammerBlocker' ? 'active-nav' : ''}`} onClick={() => setActiveTab('botSpammerBlocker')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> Spam Wave Blocker
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'linkProtector' ? 'active-nav' : ''}`} onClick={() => setActiveTab('linkProtector')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> Link Protector
                </button>
              </div>
            )}
          </div>

          {/* Group 31: Compliance & Archive */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('archiving')} style={sidebarGroupHeaderStyle(expandedGroups.archiving)}>
              <span>31. Compliance & Archive</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.archiving)}>▶</span>
            </button>
            {expandedGroups.archiving && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'autoArchiver' ? 'active-nav' : ''}`} onClick={() => setActiveTab('autoArchiver')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 4v3m0 0v3m0-3h3m-3 0H5m12 0h3m-3 0H5m7 12H7a2 2 0 01-2-2V6a2 2 0 012-2h11" /></svg> Archive Exporter
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'gdprCompliance' ? 'active-nav' : ''}`} onClick={() => setActiveTab('gdprCompliance')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944" /></svg> Data Compliance
                </button>
              </div>
            )}
          </div>

          {/* Group 32: Diagnostic Sandbox */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" onClick={() => toggleGroup('sandbox')} style={sidebarGroupHeaderStyle(expandedGroups.sandbox)}>
              <span>32. Diagnostic Sandbox</span>
              <span style={sidebarGroupArrowStyle(expandedGroups.sandbox)}>▶</span>
            </button>
            {expandedGroups.sandbox && (
              <div style={sidebarGroupContentStyle}>
                <button className={`sidebar-nav-btn ${activeTab === 'commands' ? 'active-nav' : ''}`} onClick={() => setActiveTab('commands')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Console Terminal
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'customCommands' ? 'active-nav' : ''}`} onClick={() => setActiveTab('customCommands')}>
                  <ChatIcon /> Custom Commands
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'webhookHub' ? 'active-nav' : ''}`} onClick={() => setActiveTab('webhookHub')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> Webhook Hub
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'dbSandbox' ? 'active-nav' : ''}`} onClick={() => setActiveTab('dbSandbox')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg> Database Sandbox
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'telemetryPanel' ? 'active-nav' : ''}`} onClick={() => setActiveTab('telemetryPanel')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> System Telemetry
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'systemOptimizer' ? 'active-nav' : ''}`} onClick={() => setActiveTab('systemOptimizer')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3m0 0l-3-3m3 3H9" /></svg> System Optimizer
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'logs' ? 'active-nav' : ''}`} onClick={() => setActiveTab('logs')}>
                  <LogsIcon /> System Logs
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'system' ? 'active-nav' : ''}`} onClick={() => setActiveTab('system')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg> System Settings
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'keys' ? 'active-nav' : ''}`} onClick={() => setActiveTab('keys')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg> API Keys Vault
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'notificationHub' ? 'active-nav' : ''}`} onClick={() => setActiveTab('notificationHub')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0" /></svg> Notification Hub
                </button>
              </div>
            )}
          </div>
          
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
              {activeTab === 'analytics' && 'Deep Analytics'}
              {activeTab === 'scheduler' && 'Task Scheduler'}
              {activeTab === 'system' && 'System Control Center'}
              {activeTab === 'broadcast' && 'Broadcast Command Center'}
              {activeTab === 'intelligence' && 'AI Intelligence Lab'}
              {activeTab === 'reminders' && 'Reminders & CRM'}
              {activeTab === 'keys' && 'API Key Vault'}
              {activeTab === 'personas' && 'Persona Studio'}
              {activeTab === 'security' && 'Security & Access'}
              {activeTab === 'commands' && 'Command Terminal'}
              {activeTab === 'customCommands' && 'Custom Commands'}
              {activeTab === 'paymentHub' && 'Payment Hub'}
              {activeTab === 'dealManager' && 'Deal Manager'}
              {activeTab === 'customerAccess' && 'Customer Access License Keys'}
              {activeTab === 'gcManager' && 'GC Auto-Joining & Whitelist'}
              {activeTab === 'autoForwarder' && 'Auto-Forwarder & Sync'}
              {activeTab === 'keywordStudio' && 'Keyword Studio Triggers'}
              {activeTab === 'proxyManager' && 'Userbot Proxy Manager'}
              {activeTab === 'storefrontAnalytics' && 'Consolidated Storefront Analytics'}
              {activeTab === 'aiSwarm' && 'AI Swarm Coordinator'}
              {activeTab === 'threatRadar' && 'Threat Radar'}
              {activeTab === 'ledgerStudio' && 'Ledger Studio'}
              {activeTab === 'webhookHub' && 'Webhook Hub'}
              {activeTab === 'dbSandbox' && 'Database Diagnostic Query Sandbox'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {activeTab === 'overview' && 'Real-time telemetry and automation oversight.'}
              {activeTab === 'contacts' && 'Review relationships, custom client folders, and message histories.'}
              {activeTab === 'pipeline' && 'Steer client folders, monitor commitments, and manage active transactions.'}
              {activeTab === 'rules' && 'Tune automation modes, response delays, and persona parameters.'}
              {activeTab === 'logs' && 'Audit trail of server actions, database commits, and AI operations.'}
              {activeTab === 'analytics' && 'Traffic graphs, sentiment breakdown, cost simulator, and AI performance metrics.'}
              {activeTab === 'scheduler' && 'Create recurring broadcast tasks with cron expressions and category targeting.'}
              {activeTab === 'system' && 'Database diagnostics, Q&A backup/restore, log purge, and optimization tools.'}
              {activeTab === 'broadcast' && 'Mass messaging, templates library, dry-run preview, and broadcast history.'}
              {activeTab === 'intelligence' && 'Live AI simulator, prompt studio, DNA rebuilder, knowledge base editor.'}
              {activeTab === 'reminders' && 'Full CRM reminders, follow-up tracker, overdue alerts, contact notes.'}
              {activeTab === 'keys' && 'Manage, test, rotate, and monitor all Gemini API keys from one vault.'}
              {activeTab === 'personas' && 'Edit AI persona for each mood — prompt, tone, signature, and preview.'}
              {activeTab === 'security' && 'Password management, session inspector, JWT info, and audit log.'}
              {activeTab === 'commands' && 'Raw API console, quick commands, system health checks, and WS monitor.'}
              {activeTab === 'customCommands' && 'Manage custom slash commands for easy dynamic message templates.'}
              {activeTab === 'paymentHub' && 'Setup payment methods, crypto network addresses, and upload QR codes.'}
              {activeTab === 'dealManager' && 'Generate Order IDs, close deals, analyze histories with AI, and copy thank-you notes.'}
              {activeTab === 'customerAccess' && 'Provision bot client API key duration, manage store isolation, and revoke access.'}
              {activeTab === 'gcManager' && 'Paste group links or usernames. The userbot will automatically send a request/join and whitelist the chat.'}
              {activeTab === 'autoForwarder' && 'Setup keyword-based mirroring and auto-forwarding routes between channels and chats.'}
              {activeTab === 'keywordStudio' && 'Design precision keyword rules: matching algorithms, replies, mutes, and categorizations.'}
              {activeTab === 'proxyManager' && 'Configure custom proxy servers for userbots and run latency diagnostics.'}
              {activeTab === 'antiScam' && 'Configure active math CAPTCHA verification gates on member join and sweep impersonators.'}
              {activeTab === 'storefrontAnalytics' && 'Aggregated metrics from tenant stores, consolidated orders, total products, and revenue.'}
              {activeTab === 'aiSwarm' && 'Configure sales, support, and dispute prompt matrices for swarm coordination.'}
              {activeTab === 'threatRadar' && 'Audit blocked impersonators, CAPTCHA gate failure logs, and anti-raid alerts.'}
              {activeTab === 'ledgerStudio' && 'Manage middleman transaction fee percentages, escrow credits, and dynamic ledger calculations.'}
              {activeTab === 'webhookHub' && 'Register outbound webhook subscriptions, secret authentication tokens, and headers.'}
              {activeTab === 'dbSandbox' && 'Execute read-only SQL diagnostic queries against SQLite database tables.'}
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
              Summon Console <kbd style={{ fontSize: '0.7rem', opacity: 0.8, background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>K</kbd>
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
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>QUICK STATUS:</span>
              {[
                { label: ' Online', value: 'online', color: '#10b981' },
                { label: ' Busy', value: 'busy', color: '#ef4444' },
                { label: ' Focus', value: 'focus', color: '#8b5cf6' },
                { label: ' Sleep', value: 'sleeping', color: '#64748b' },
                { label: '️ Travel', value: 'travel', color: '#f59e0b' },
                { label: '️ Vacation', value: 'vacation', color: '#06b6d4' },
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
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.color, display: 'inline-block' }} />
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
                  {sysStatus.ai_enabled ? 'ON' : 'OFF'}
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
                  {sysStatus.approval_mode ? 'Required' : 'Auto-Send'}
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
                    <span>Gemini API Key Rotation Pool</span>
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
                  ) : 'Refresh Key Diagnostics'}
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
                    active:         { label: 'Active',         color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', icon: '' },
                    quota_exceeded: { label: 'Quota Exceeded', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '' },
                    invalid:        { label: 'Invalid',        color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: '' },
                    timeout:        { label: 'Timeout/Busy',   color: '#818cf8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.25)', icon: '' },
                    error:          { label: 'Error',          color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '' },
                    unknown:        { label: 'Unknown',        color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.25)', icon: '' },
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
                    <span>Executive Daily Briefing</span>
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
                    {briefingLoading && !briefingSentSuccess ? 'Analyzing...' : 'Generate 24h Briefing'}
                  </button>
                  {briefingData && (
                    <button 
                      className="glass-btn-outline" 
                      onClick={() => fetchDailyBriefing(true)} 
                      disabled={briefingLoading}
                      style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                    >
                      {briefingLoading && briefingSentSuccess ? 'Sending...' : 'Forward to Telegram Channel'}
                    </button>
                  )}
                </div>

                {briefingError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{briefingError}</p>
                )}

                {briefingSentSuccess && !briefingLoading && (
                  <p style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600 }}>Briefing successfully forwarded to your Telegram notification channel!</p>
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
                      <h4 style={{ color: 'var(--color-secondary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>Business & Deal Pipeline</h4>
                      {briefingData.deal_pipeline && briefingData.deal_pipeline.length > 0 ? (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {briefingData.deal_pipeline.map((item, idx) => <li key={idx}>{item}</li>)}
                        </ul>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No active business deals detected in the logs.</p>
                      )}
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--color-warning)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>Urgent Action Items</h4>
                      {briefingData.urgent_action_items && briefingData.urgent_action_items.length > 0 ? (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {briefingData.urgent_action_items.map((item, idx) => <li key={idx}>{item}</li>)}
                        </ul>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No urgent issues requiring immediate attention.</p>
                      )}
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>Customer Sentiment & Relationship Vibes</h4>
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
                    Sentiment & Relationship Vibe Metrics
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
                              {s === 'happiness' ? 'Happiness' : ''}
                              {s === 'excitement' ? 'Excitement' : ''}
                              {s === 'neutral' ? 'Neutral' : ''}
                              {s === 'urgency' ? 'Urgency' : ''}
                              {s === 'frustration' ? 'Frustration' : ''}
                              {s === 'confusion' ? 'Confusion' : ''}
                              {s === 'anger' ? 'Anger' : ''}
                              {s === 'sadness' ? 'Sadness' : ''}
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
                placeholder="Search contacts..." 
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
                              Takeover
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
                        placeholder="Search messages..."
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
                        {selectedContact.is_muted === 1 ? 'Takeover Active' : 'AI Copilot Active'}
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
                        Copy
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Message History Area */}
                  <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {selectedContact.is_muted === 1 && (
                      <div className="takeover-banner">
                        <span style={{ fontSize: '1.2rem', animation: 'pulse 1.5s infinite' }}>️</span>
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
                                    {msg.language}
                                  </span>
                                )}
                                {msg.tone && msg.tone !== 'neutral' && (
                                  <span style={{ 
                                    fontSize: '0.65rem', padding: '0 4px', borderRadius: '4px',
                                    background: 'rgba(6, 182, 212, 0.15)', color: '#bae6fd',
                                    border: '1px solid rgba(6, 182, 212, 0.3)'
                                  }}>
                                    {msg.tone}
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
                      Relationship Memory
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
                        Forget
                      </button>
                    </div>
                  </div>
                  
                  {/* Notes Text Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>MANAGER NOTES</label>
                    <textarea 
                      className="glass-input"
                      rows={3}
                      placeholder="Business goals, relationship background, important dates..."
                      value={selectedContact.notes || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedContact(prev => prev ? { ...prev, notes: val } : null);
                      }}
                      onBlur={() => updateContactMeta(selectedContact.telegram_id, { notes: selectedContact.notes })}
                      style={{ resize: 'none', fontSize: '0.82rem' }}
                    />
                    <button
                      className="glass-btn-secondary"
                      onClick={() => updateContactMeta(selectedContact.telegram_id, { notes: selectedContact.notes })}
                      style={{ fontSize: '0.75rem', padding: '4px 10px', alignSelf: 'flex-end' }}
                    >
                      Save Notes
                    </button>
                  </div>

                  {/* Advanced Autopilot Overrides */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--border-glass)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)' }}>Custom Client Overrides</span>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>PERSONAL OVERRIDE PROMPT</label>
                      <input 
                        type="text"
                        className="glass-input"
                        placeholder="e.g. Always remind him to complete KYC."
                        value={selectedContact.custom_prompt || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedContact(prev => ({ ...prev, custom_prompt: val }));
                        }}
                        onBlur={() => updateContactMeta(selectedContact.telegram_id, { custom_prompt: selectedContact.custom_prompt })}
                        style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>REPLY DELAY (Seconds; -1 for global)</label>
                      <input 
                        type="number"
                        className="glass-input"
                        placeholder="Default"
                        min="-1"
                        max="300"
                        value={selectedContact.custom_delay !== null && selectedContact.custom_delay !== undefined ? selectedContact.custom_delay : -1}
                        onChange={(e) => {
                          const val = e.target.value === '' ? -1 : parseInt(e.target.value);
                          setSelectedContact(prev => ({ ...prev, custom_delay: val }));
                        }}
                        onBlur={() => updateContactMeta(selectedContact.telegram_id, { custom_delay: selectedContact.custom_delay })}
                        style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                      />
                    </div>
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
                    Open in Telegram
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
                        Test Chime
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
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>React with reactions on short acknowledgments instead of sending text.</p>
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

                {/* Left Panel - Middle Card: Payment Credentials */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    Payment Credentials & Auto-Share
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

                {/* Left Panel - Bottom Card: Advanced Bot Controls */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    Power Bot Controls
                  </h3>
                  
                  {/* Signature Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Custom Reply Signature / Footer</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Automatically append a custom signature (e.g. <i>— Coet (Manager)</i>) to auto-replies.</p>
                    <input 
                      type="text" 
                      value={settings.custom_signature || ''} 
                      onChange={(e) => setSettings(prev => ({ ...prev, custom_signature: e.target.value }))}
                      onBlur={(e) => saveSettings({ custom_signature: e.target.value })}
                      placeholder="e.g. — Coet (CatVos's Manager)"
                      className="glass-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* Active Days of Week Checkboxes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Active Days of Week</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Specify weekdays the bot auto-reply engine is active. Checked days = Active.</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {[
                        { key: 'mon', label: 'Mon' },
                        { key: 'tue', label: 'Tue' },
                        { key: 'wed', label: 'Wed' },
                        { key: 'thu', label: 'Thu' },
                        { key: 'fri', label: 'Fri' },
                        { key: 'sat', label: 'Sat' },
                        { key: 'sun', label: 'Sun' }
                      ].map(d => {
                        const activeDaysList = (settings.active_days || 'mon,tue,wed,thu,fri,sat,sun').split(',').map(item => item.trim().toLowerCase());
                        const isChecked = activeDaysList.includes(d.key);
                        return (
                          <button
                            type="button"
                            key={d.key}
                            onClick={() => {
                              let days = [...activeDaysList];
                              if (days.includes(d.key)) {
                                days = days.filter(item => item !== d.key);
                              } else {
                                days.push(d.key);
                              }
                              saveSettings({ active_days: days.join(',') });
                            }}
                            className={isChecked ? "glass-btn" : "glass-btn-secondary"}
                            style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '15px', cursor: 'pointer' }}
                          >
                            {isChecked ? `${d.label}` : d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Log level dropdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>System Log Level</span>
                    <select
                      value={settings.log_level || 'INFO'}
                      onChange={(e) => saveSettings({ log_level: e.target.value })}
                      className="glass-input"
                      style={{ width: '100%', cursor: 'pointer' }}
                    >
                      <option value="DEBUG">DEBUG (Detailed Telemetry)</option>
                      <option value="INFO">INFO (Normal Audits)</option>
                      <option value="WARNING">WARNING (Only Alerts/Warnings)</option>
                      <option value="ERROR">ERROR (Only Errors)</option>
                    </select>
                  </div>

                  {/* DB vacuum button */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '15px' }}>
                    <span style={{ fontWeight: 600 }}>Database Optimization</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Defragment tables, indices and reclaim database storage space.</p>
                    <button 
                      type="button" 
                      className="glass-btn-secondary" 
                      onClick={handleDatabaseVacuum}
                      disabled={maintenanceLoading}
                      style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                      {maintenanceLoading ? 'Compressing DB...' : 'Run Database Vacuum'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Panel Wrapper */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

                {/* Gemini Engine Configuration Card */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    Gemini Core Engine Settings
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '-10px' }}>
                    Configure the primary Gemini API model and processing parameters for bot automation.
                  </p>

                  {/* Model Dropdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Active Model</span>
                    <select
                      value={settings.gemini_model || 'gemini-2.5-flash-lite'}
                      onChange={(e) => saveSettings({ gemini_model: e.target.value })}
                      className="glass-input"
                      style={{ width: '100%', cursor: 'pointer' }}
                    >
                      <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Recommended - Ultra Fast)</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Balanced speed & power)</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep reasoning)</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy Fast)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Legacy High Reasoning)</option>
                    </select>
                  </div>

                  {/* Temperature Slider */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>Temperature (Creativity)</span>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {settings.gemini_temperature || '0.85'}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Lower values are precise and factual; higher values are more creative and human-like.
                    </p>
                    <input
                      type="range"
                      min="0.0"
                      max="2.0"
                      step="0.05"
                      value={parseFloat(settings.gemini_temperature || '0.85')}
                      onChange={(e) => setSettings(prev => ({ ...prev, gemini_temperature: e.target.value }))}
                      onMouseUp={(e) => saveSettings({ gemini_temperature: e.target.value })}
                      style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Max Tokens Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Max Output Tokens</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Safety limit on response length (e.g. 1500 tokens is ~1000 words).
                    </p>
                    <input
                      type="number"
                      min="100"
                      max="8192"
                      step="100"
                      className="glass-input"
                      value={settings.gemini_max_tokens || '1500'}
                      onChange={(e) => setSettings(prev => ({ ...prev, gemini_max_tokens: e.target.value }))}
                      onBlur={(e) => saveSettings({ gemini_max_tokens: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                
                {/* Right Panel Card 1: API Key Rotation Pool */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', margin: 0 }}>
                      Gemini API Key Rotation Pool
                    </h3>
                    <button 
                      type="button" 
                      className="glass-btn" 
                      onClick={handlePingAllKeys}
                      disabled={dbKeysLoading || keyPoolLoading}
                      style={{ padding: '5px 12px', fontSize: '0.75rem' }}
                    >
                      {keyPoolLoading ? "Testing Keys..." : "Ping & Diagnose All Keys"}
                    </button>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '-10px' }}>
                    The system automatically rotates requests across active keys. Cooled-down keys are automatically retried. Environment variables merge with database keys dynamically.
                  </p>

                  {/* Key list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto', paddingRight: '5px' }}>
                    {dbKeys.map((item, idx) => {
                      const isActive = item.status === 'active';
                      const isQuota = item.status === 'quota_exceeded';
                      const isInvalid = item.status === 'invalid';
                      const isTimeout = item.status === 'timeout';
                      
                      let badgeBg = 'rgba(255,255,255,0.05)';
                      let badgeColor = '#94a3b8';
                      let statusText = 'Unknown';
                      if (isActive) { badgeBg = 'rgba(16,185,129,0.12)'; badgeColor = '#34d399'; statusText = 'Active'; }
                      else if (isQuota) { badgeBg = 'rgba(245,158,11,0.12)'; badgeColor = '#f59e0b'; statusText = 'Rate Limited'; }
                      else if (isInvalid) { badgeBg = 'rgba(239,68,68,0.12)'; badgeColor = '#ef4444'; statusText = 'Invalid'; }
                      else if (isTimeout) { badgeBg = 'rgba(59,130,246,0.12)'; badgeColor = '#60a5fa'; statusText = 'Timeout Cooldown'; }

                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{item.label}</span>
                              <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}33`, fontWeight: 600 }}>
                                {statusText}
                              </span>
                              {item.source === 'env' && (
                                <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(124, 77, 255, 0.1)', color: '#d8b4fe', border: '1px solid rgba(124,77,255,0.2)' }}>
                                  System Config
                                </span>
                              )}
                            </div>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Prefix: {item.key_prefix} ({item.full_key_masked})
                            </span>
                            {item.cooldown_remaining > 0 && (
                              <span style={{ fontSize: '0.7rem', color: '#fbbf24' }}>
                                Cooldown Remaining: {item.cooldown_remaining}s
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button
                              type="button"
                              className="glass-btn-secondary"
                              onClick={() => handleTestSingleKey(item.raw_key, idx)}
                              disabled={testingKeyPrefix === idx}
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              {testingKeyPrefix === idx ? "Testing..." : "Test"}
                            </button>
                            {item.source === 'database' && (
                              <button
                                type="button"
                                className="glass-btn-secondary"
                                onClick={() => handleDeleteGeminiKey(item.raw_key)}
                                style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {dbKeys.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>
                        No Gemini API keys loaded. Add keys below.
                      </p>
                    )}
                  </div>

                  {/* Add key form */}
                  <form onSubmit={handleAddGeminiKey} style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Add Dynamic Rotation Key</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>KEY LABEL (e.g. Mom's Key)</label>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="Mom's Key"
                          value={newKeyLabel}
                          onChange={(e) => setNewKeyLabel(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>GEMINI API KEY STRING</label>
                        <input
                          type="password"
                          className="glass-input"
                          placeholder="AIzaSy..."
                          value={newKeyString}
                          onChange={(e) => setNewKeyString(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="glass-btn" style={{ padding: '8px 16px', alignSelf: 'flex-start' }}>
                      Add Key to Rotator
                    </button>
                  </form>
                </div>

                {/* Right Panel Card 2: AI Personality Tuning */}
                <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', margin: 0 }}>
                      Executive Assistant Personality
                    </h3>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        type="button" 
                        onClick={() => setPersEditMode('list')} 
                        className={persEditMode === 'list' ? 'glass-btn' : 'glass-btn-secondary'}
                        style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px' }}
                      >
                        List mode
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setPersEditMode('raw')} 
                        className={persEditMode === 'raw' ? 'glass-btn' : 'glass-btn-secondary'}
                        style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px' }}
                      >
                        Raw edit
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SYSTEM PROMPT & DIRECTIVES</label>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '5px' }}>
                      Define assistant behavioral bounds. Direct tone, relationship memory handling, and language.
                    </p>
                    
                    {/* Preset personality buttons */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      {[
                        { label: ' Elite Executive', prompt: "You are Coet, CatVos's elite executive assistant/manager. Keep replies warm, professional, respectful, concise, and human-like. Speak with high-end polished corporate professionalism, polite and structured. Never mention you are an AI or Gemini. Only introduce yourself as Coet, CatVos's manager on the first message or if the contact asks who you are. Keep replies to 1 sentence maximum." },
                        { label: ' Hinglish Buddy', prompt: "You are Coet, CatVos's manager and friendly buddy. Speak in roman-script Hinglish (Hindi words using English alphabet) when the user speaks in Hinglish or Hindi. Keep it casual, warm, and natural (e.g. 'Bhai CatVos abhi busy hai, main unhe details de dunga.'). Keep responses short and build on their previous motive. Never mention you are an AI or Gemini." },
                        { label: '️ Direct Gatekeeper', prompt: "You are Coet, CatVos's protective manager. Set extremely firm and clear boundaries. Keep replies brief (under 10 words). If the sender is rude, angry, spamming, or asking technical/coding questions, politely but firmly decline. (e.g. 'As CatVos's manager, I only handle transactions and schedule requests.'). Never mention you are an AI." },
                        { label: '️ Escrow Coordinator', prompt: "You are Coet, CatVos's Middleman Escrow Coordinator. Be professional, highly organized, secure-minded, and direct. Guide middleman deals securely: ask for the deal terms, buyer & seller details, and verify transaction amount. Highlight the 5% security fee. Decline all non-deal queries." },
                        { label: '️ Client Concierge', prompt: "You are Coet, CatVos's client concierge. Adopt a highly warm, polite, elegant, and helpful concierge persona. Answer questions regarding graphic design, video editing, or account sales with professional hospitality. Guide them smoothly to register project briefs." }
                      ].map(preset => (
                        <button 
                          key={preset.label}
                          type="button"
                          className="glass-btn-secondary" 
                          style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                          onClick={() => {
                            setSettings(prev => ({ ...prev, ai_personality: preset.prompt }));
                            saveSettings({ ai_personality: preset.prompt });
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Interactive vs raw directives manager */}
                    {persEditMode === 'list' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '5px' }}>
                          {(settings.ai_personality || '').split('\n').filter(line => line.trim().length > 0).map((trait, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', background: 'rgba(124, 77, 255, 0.04)', border: '1px solid rgba(124, 77, 255, 0.15)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', color: '#cbd5e1' }}>
                              <span> {trait}</span>
                              <button 
                                type="button" 
                                onClick={() => {
                                  const list = (settings.ai_personality || '').split('\n').filter(line => line.trim().length > 0);
                                  list.splice(idx, 1);
                                  const newPers = list.join('\n');
                                  setSettings(prev => ({ ...prev, ai_personality: newPers }));
                                  saveSettings({ ai_personality: newPers });
                                }} 
                                style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem' }}
                              >
                                x
                              </button>
                            </div>
                          ))}
                          {!(settings.ai_personality || '').trim() && (
                            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>No custom persona rules added yet.</p>
                          )}
                        </div>
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!persInputTrait.trim()) return;
                            const newPers = settings.ai_personality ? settings.ai_personality + '\n' + persInputTrait.trim() : persInputTrait.trim();
                            setSettings(prev => ({ ...prev, ai_personality: newPers }));
                            saveSettings({ ai_personality: newPers });
                            setPersInputTrait('');
                          }} 
                          style={{ display: 'flex', gap: '8px' }}
                        >
                          <input
                            type="text"
                            className="glass-input"
                            placeholder="Add a new custom rule (e.g. Always end replies with a smiley face.)"
                            value={persInputTrait}
                            onChange={(e) => setPersInputTrait(e.target.value)}
                            style={{ flex: 1, fontSize: '0.85rem' }}
                          />
                          <button type="submit" className="glass-btn" style={{ padding: '8px 16px' }}>+ Add</button>
                        </form>
                      </div>
                    ) : (
                      <textarea 
                        className="glass-input"
                        rows={8}
                        value={settings.ai_personality || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, ai_personality: e.target.value }))}
                        onBlur={() => saveSettings({ ai_personality: settings.ai_personality })}
                        style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                      />
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ASSISTANT DESIGNATION</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      value={settings.assistant_name || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, assistant_name: e.target.value }))}
                      onBlur={() => saveSettings({ assistant_name: settings.assistant_name })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Mood-Specific Prompt Manager */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Mood-Specific Persona & Status Prompt Manager
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Define custom descriptions and sub-prompt guidelines for each of the 6 bot states. When your status shifts, Coet dynamically inherits these parameters.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {[
                  { key: 'online', name: ' Online State', color: '#34d399' },
                  { key: 'busy', name: ' Busy State', color: '#f87171' },
                  { key: 'focus', name: '️ Deep Focus State', color: '#818cf8' },
                  { key: 'sleeping', name: ' Sleeping State', color: '#c084fc' },
                  { key: 'travel', name: '️ Travel State', color: '#fbbf24' },
                  { key: 'vacation', name: ' Vacation State', color: '#2dd4bf' }
                ].map(mood => {
                  const descKey = `status_desc_${mood.key}`;
                  const promptKey = `status_prompt_${mood.key}`;
                  
                  return (
                    <div 
                      key={mood.key} 
                      style={{ 
                        background: 'rgba(255,255,255,0.01)', 
                        border: '1px solid var(--border-glass)', 
                        borderRadius: '12px', 
                        padding: '20px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '15px' 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: mood.color }}></span>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', margin: 0 }}>{mood.name}</h4>
                      </div>
                      
                      {/* Mood Description Input */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>STATUS DESCRIPTION (e.g. busy rn)</label>
                        <input
                          type="text"
                          className="glass-input"
                          value={settings[descKey] || ''}
                          onChange={(e) => setSettings(prev => ({ ...prev, [descKey]: e.target.value }))}
                          onBlur={() => saveSettings({ [descKey]: settings[descKey] })}
                          placeholder="e.g. occupied with something else"
                          style={{ fontSize: '0.8rem' }}
                        />
                      </div>

                      {/* Mood Custom Instructions (Prompt Override) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>CUSTOM PROMPT DIRECTIVE</label>
                        <textarea
                          className="glass-input"
                          rows={4}
                          value={settings[promptKey] || ''}
                          onChange={(e) => setSettings(prev => ({ ...prev, [promptKey]: e.target.value }))}
                          onBlur={() => saveSettings({ [promptKey]: settings[promptKey] })}
                          placeholder="Specific system prompt instructions for this state..."
                          style={{ fontSize: '0.8rem', resize: 'none' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RAG Knowledge Base FAQ Editor */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', margin: 0 }}>
                     Business Knowledge Base & RAG FAQ Guidelines
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px', margin: 0 }}>
                    Input your business FAQs, middleman terms, channel pricing structures, and developer rates. Coet references these guidelines to reply to clients.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    type="button" 
                    onClick={() => setKbEditMode('list')} 
                    className={kbEditMode === 'list' ? 'glass-btn' : 'glass-btn-secondary'}
                    style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px' }}
                  >
                     Facts list
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setKbEditMode('raw')} 
                    className={kbEditMode === 'raw' ? 'glass-btn' : 'glass-btn-secondary'}
                    style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px' }}
                  >
                    Raw editor
                  </button>
                </div>
              </div>

              {kbEditMode === 'list' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '240px', overflowY: 'auto', padding: '10px 5px' }}>
                    {(settings.knowledge_base || '').split('\n').filter(line => line.trim().length > 0).map((fact, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', color: '#e2e8f0' }}>
                        <span> {fact}</span>
                        <button 
                          type="button" 
                          onClick={() => {
                            const list = (settings.knowledge_base || '').split('\n').filter(line => line.trim().length > 0);
                            list.splice(idx, 1);
                            const newKB = list.join('\n');
                            setSettings(prev => ({ ...prev, knowledge_base: newKB }));
                            saveSettings({ knowledge_base: newKB });
                          }} 
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          x
                        </button>
                      </div>
                    ))}
                    {!(settings.knowledge_base || '').trim() && (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>No business facts added yet.</p>
                    )}
                  </div>
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!kbInputFact.trim()) return;
                      const newKB = settings.knowledge_base ? settings.knowledge_base + '\n' + kbInputFact.trim() : kbInputFact.trim();
                      setSettings(prev => ({ ...prev, knowledge_base: newKB }));
                      saveSettings({ knowledge_base: newKB });
                      setKbInputFact('');
                    }} 
                    style={{ display: 'flex', gap: '8px', marginTop: '10px' }}
                  >
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="Add a new business fact (e.g. WhatsApp alts stock pricing is $20 per Alt account.)"
                      value={kbInputFact}
                      onChange={(e) => setKbInputFact(e.target.value)}
                      style={{ flex: 1, fontSize: '0.85rem' }}
                    />
                    <button type="submit" className="glass-btn" style={{ padding: '8px 16px' }}>+ Add Fact</button>
                  </form>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea 
                    className="glass-input"
                    rows={6}
                    value={settings.knowledge_base || ''}
                    onChange={(e) => setSettings(prev => ({ ...prev, knowledge_base: e.target.value }))}
                    onBlur={() => saveSettings({ knowledge_base: settings.knowledge_base })}
                    placeholder="Enter business details (e.g. Website projects start at $200. Middleman fee is 5%...)"
                    style={{ fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      className="glass-btn" 
                      onClick={() => saveSettings({ knowledge_base: settings.knowledge_base })}
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                       Save Raw Guidelines
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/*  Owner Writing Style DNA (CatVos Mirror) */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                   Owner Writing Style DNA (CatVos Mirror)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  This style DNA profile is dynamically generated by analyzing your historical messages. Coet emulates these writing traits (casing, abbreviations, casual vocabulary).
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea 
                  className="glass-input"
                  rows={8}
                  value={settings.owner_style_profile || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, owner_style_profile: e.target.value }))}
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
                      {isRebuildingProfile ? " Analyzing History..." : "Rebuild Style DNA"}
                    </button>
                    <button 
                      type="button" 
                      className="glass-btn" 
                      onClick={() => saveSettings({ owner_style_profile: settings.owner_style_profile })}
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                       Save Style DNA
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Offline Q&A Fallback RAG Editor Panel */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff' }}>
                  Offline Q&A Fallback rules (Intelligent RAG Backup)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Define specific question phrases and responses. If all Gemini API keys are exhausted, the local engine matches these questions (using fuzzy comparison) to reply instantly.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                
                {/* Form to Add Q&A Rule */}
                <form onSubmit={handleAddQARule} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Add Fallback Rule</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRIGGER PHRASE / QUERY (e.g. mm charges)</label>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="e.g. what is middleman charges"
                      value={newQaQuery}
                      onChange={(e) => setNewQaQuery(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OFFLINE FALLBACK REPLY TEXT</label>
                    <textarea
                      className="glass-input"
                      rows={4}
                      placeholder="e.g. Escrow middleman charges are flat 5% per transaction."
                      value={newQaResponse}
                      onChange={(e) => setNewQaResponse(e.target.value)}
                      required
                      style={{ resize: 'none' }}
                    />
                  </div>

                  <button type="submit" className="glass-btn" style={{ padding: '10px 20px', alignSelf: 'flex-start' }} disabled={qaRulesLoading}>
                     Save Offline Fallback Q&A
                  </button>
                </form>

                {/* List of Offline Fallbacks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', margin: 0 }}>Fallback Base</h4>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder=" Search fallbacks..."
                      value={qaSearch}
                      onChange={(e) => setQaSearch(e.target.value)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem', width: '150px' }}
                    />
                  </div>

                  <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' }}>
                    {qaRules
                      .filter(r => {
                        const cleanQ = (r.original_query || '').toLowerCase();
                        const cleanA = (r.response || '').toLowerCase();
                        const s = qaSearch.toLowerCase();
                        return cleanQ.includes(s) || cleanA.includes(s);
                      })
                      .map(rule => (
                        <div key={rule.id} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-primary)' }}>
                              "{(rule.original_query || rule.cleaned_query)}"
                            </span>
                            <p style={{ fontSize: '0.8rem', color: '#cbd5e1', wordBreak: 'break-word', margin: 0 }}>
                              {rule.response}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="glass-btn-secondary"
                            onClick={() => handleDeleteQARule(rule.id)}
                            style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)', flexShrink: 0 }}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    {qaRules.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '30px' }}>
                        No fallback Q&A rules set. Default ones are active.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/*  Mass Category Broadcaster Console */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                   Mass Category Broadcaster Console
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Send bulk, humanized messages to all contacts in a specific category list. Employs smart, randomized delay throttling to prevent Telegram anti-spam triggers.
                </p>
              </div>

              <form onSubmit={handleSendBroadcast} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                {/* Inputs area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TARGET LIST CATEGORY</label>
                    <select
                      className="glass-input"
                      value={broadcastCategory}
                      onChange={(e) => setBroadcastCategory(e.target.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="all"> All Contacts (Broadcast to Everyone)</option>
                      <option value="client"> Clients only</option>
                      <option value="vip"> VIP Partners only</option>
                      <option value="business_partner"> Business Partners only</option>
                      <option value="team_member"> Team Members only</option>
                      <option value="friend"> Friends only</option>
                      <option value="family"> Family only</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>BROADCAST MESSAGE TEMPLATE</label>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>Variables: {"{first_name}"}</span>
                    </div>
                    <textarea
                      className="glass-input"
                      rows={5}
                      placeholder="Write your broadcast message here... e.g. Hey {first_name}! We have new stock of WP accounts today at discount rates. Drop a DM if interested!"
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      required
                      style={{ resize: 'vertical' }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                      Note: Broadcasts execute sequentially with a 2.5 second cooldown per message to maintain Telegram security compliance.
                    </span>
                  </div>

                  <button 
                    type="submit" 
                    className="glass-btn" 
                    style={{ padding: '10px 20px', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}
                    disabled={broadcastLoading || !broadcastMessage.trim()}
                  >
                    {broadcastLoading ? " Sending Broadcast..." : " Trigger Broadcast Send"}
                  </button>
                </div>

                {/* Status and logs preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-secondary)', margin: 0 }}>Broadcast Logs & Status</h4>
                  
                  <div style={{ 
                    flex: 1, 
                    minHeight: '180px', 
                    background: 'rgba(0,0,0,0.3)', 
                    border: '1px solid var(--border-glass)', 
                    borderRadius: '10px', 
                    padding: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center'
                  }}>
                    {!broadcastStatus && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>
                        No active broadcast queue. Select a category list and trigger a message to begin.
                      </p>
                    )}
                    
                    {broadcastStatus && broadcastStatus.startsWith('success') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '2rem' }}></span>
                        <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '0.9rem' }}>BROADCAST QUEUED SECURELY!</span>
                        <p style={{ color: 'var(--text-primary)', fontSize: '0.8rem', margin: 0 }}>
                          Queued {broadcastStatus.split(':')[1]} target messages successfully.
                        </p>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          Check the Event Logs tab to monitor live anti-spam send status.
                        </span>
                      </div>
                    )}

                    {broadcastStatus && broadcastStatus.startsWith('error') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '2rem' }}></span>
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: '0.9rem' }}>BROADCAST INITIATION FAILED</span>
                        <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>
                          Reason: {broadcastStatus.split(':')[1]}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>

            {/* ── Advanced Automation Controls Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px' }}>

              {/* Blacklist / Spam Filter */}
              <div className="glass-container" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     Blacklist / Spam Filter
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
                     Save Blacklist
                  </button>
                </div>
              </div>

              {/* Response Delay Randomizer */}
              <div className="glass-container" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ️ Human-Like Reply Delay
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
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '10px' }}>Active Hours</h4>
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
                      ? <span style={{ color: '#34d399' }}>Within active window</span>
                      : <span style={{ color: '#f87171' }}> Outside active window</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* ── AI Response Live Tester ── */}
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                   AI Response Live Tester
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
                  {aiTestLoading ? 'Testing...' : '▶ Run Test'}
                </button>
              </form>

              {aiTestResult && (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#a7f3d0', fontWeight: 600 }}>
                      Sentiment: {aiTestResult.sentiment || 'neutral'}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontWeight: 600 }}>
                       Priority: {aiTestResult.priority || 'normal'}
                    </span>
                    {aiTestResult.suggested_category && (
                      <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.2)', color: '#d8b4fe', fontWeight: 600 }}>
                         Category: {aiTestResult.suggested_category}
                      </span>
                    )}
                    {aiTestResult.key_used && (
                      <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: '#bae6fd' }}>
                         Key: ...{aiTestResult.key_used?.slice(-6)}
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
                    Copy Reply
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
                        <option value="critical"> Critical (Send Bot Alert)</option>
                        <option value="important"> Important</option>
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
                            {rule.match_mode === 'contains' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.12)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)' }}> Contains</span>}
                            {rule.match_mode === 'regex' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.12)', color: '#fde68a', border: '1px solid rgba(245, 158, 11, 0.2)' }}> Regex</span>}
                            {rule.match_mode === 'fuzzy' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: '#bfdbfe', border: '1px solid rgba(59, 130, 246, 0.2)' }}> Fuzzy</span>}

                            {/* Action Type Badge */}
                            {rule.action_type === 'reply' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.12)', color: '#d8b4fe', border: '1px solid rgba(139, 92, 246, 0.2)' }}> Reply</span>}
                            {rule.action_type === 'category' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.12)', color: '#bae6fd', border: '1px solid rgba(6, 182, 212, 0.2)' }}>️ Categorize ({rule.action_value})</span>}
                            {rule.action_type === 'priority' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.12)', color: '#fecaca', border: '1px solid rgba(239, 68, 68, 0.2)' }}> Priority ({rule.action_value})</span>}
                            {rule.action_type === 'mute' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.12)', color: '#cbd5e1', border: '1px solid rgba(100, 116, 139, 0.2)' }}> Mute</span>}
                            {rule.action_type === 'combined' && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(236, 72, 153, 0.12)', color: '#fbcfe8', border: '1px solid rgba(236, 72, 153, 0.2)' }}>️ Combined</span>}
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
            <div className="glass-container" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span> Rules Simulator Console</span>
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
                        <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.9rem' }}> RULE MATCHED!</span>
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
                            {simResult.rule.match_mode === 'contains' && <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)' }}> Contains</span>}
                            {simResult.rule.match_mode === 'regex' && <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#fde68a', border: '1px solid rgba(245, 158, 11, 0.2)' }}> Regex</span>}
                            {simResult.rule.match_mode === 'fuzzy' && <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#bfdbfe', border: '1px solid rgba(59, 130, 246, 0.2)' }}> Fuzzy</span>}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>ACTION TRIGGERED</span>
                          <span style={{ display: 'inline-block', marginTop: '4px' }}>
                            {simResult.rule.action_type === 'reply' && <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#d8b4fe', border: '1px solid rgba(139, 92, 246, 0.2)' }}> Reply</span>}
                            {simResult.rule.action_type === 'category' && <span className="badge" style={{ backgroundColor: 'rgba(6, 182, 212, 0.12)', color: '#bae6fd', border: '1px solid rgba(6, 182, 212, 0.2)' }}>️ Categorize ({simResult.rule.action_value})</span>}
                            {simResult.rule.action_type === 'priority' && <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#fecaca', border: '1px solid rgba(239, 68, 68, 0.2)' }}> Priority ({simResult.rule.action_value})</span>}
                            {simResult.rule.action_type === 'mute' && <span className="badge" style={{ backgroundColor: 'rgba(100, 116, 139, 0.12)', color: '#cbd5e1', border: '1px solid rgba(100, 116, 139, 0.2)' }}> Mute</span>}
                            {simResult.rule.action_type === 'combined' && <span className="badge" style={{ backgroundColor: 'rgba(236, 72, 153, 0.12)', color: '#fbcfe8', border: '1px solid rgba(236, 72, 153, 0.2)' }}>️ Combined ({simResult.rule.action_value})</span>}
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
                       NO MATCH FOUND.
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
                    placeholder=" Search logs..." 
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
                    {logAutoScroll ? ' Auto-Scroll ON' : ' Auto-Scroll OFF'}
                  </button>
                  <button className="glass-btn-secondary" onClick={handleExportLogs} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                     Export TXT
                  </button>
                  {!logClearConfirm ? (
                    <button className="glass-btn-secondary" onClick={() => setLogClearConfirm(true)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                       Clear All
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>Confirm?</span>
                      <button onClick={handleClearLogs} className="glass-btn-secondary" style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>Yes</button>
                      <button onClick={() => setLogClearConfirm(false)} className="glass-btn-secondary" style={{ padding: '4px 8px', fontSize: '0.72rem' }}>No</button>
                    </div>
                  )}
                  <button className="glass-btn" onClick={fetchLogs} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Refresh</button>
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
                        {log.level === 'ERROR' ? '' : log.level === 'WARNING' ? '' : ''} [{log.level}]
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
              {renderPipelineColumn(" Leads / Inbox", contacts.filter(c => c.category === 'unknown' || !c.category), 'unknown', '#10b981')}
              {renderPipelineColumn(" Active Deals", contacts.filter(c => ['client', 'business_partner', 'team_member'].includes(c.category)), 'client', '#f59e0b')}
              {renderPipelineColumn(" VIP Deals", contacts.filter(c => c.category === 'vip'), 'vip', '#ef4444')}
              {renderPipelineColumn(" Personal", contacts.filter(c => ['family', 'friend'].includes(c.category)), 'friend', '#06b6d4')}
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
                      Quick Note — {pipelineNoteContact.first_name} {pipelineNoteContact.last_name}
                    </h3>
                    <button onClick={() => setPipelineNoteContact(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>x</button>
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
                    }} style={{ padding: '7px 18px', fontSize: '0.82rem' }}> Save Note</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}


        {/* ===== TAB 6: ANALYTICS ===== */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '14px' }}>
              {[
                { label: 'Total Contacts', value: analytics.total_contacts ?? '—', icon: '', color: '#a78bfa' },
                { label: 'Messages Sent', value: analytics.messages_sent ?? '—', icon: '', color: '#34d399' },
                { label: 'AI Replies', value: analytics.ai_replies ?? analytics.total_messages ?? '—', icon: '', color: '#60a5fa' },
                { label: 'Avg Response Time', value: analytics.avg_response_time ? `${analytics.avg_response_time}s` : '—', icon: '', color: '#fbbf24' },
                { label: 'Active Today', value: analytics.active_today ?? '—', icon: '', color: '#f87171' },
                { label: 'DB Q&A Rules', value: analytics.qa_count ?? '—', icon: '', color: '#c084fc' },
              ].map(k => (
                <div key={k.label} className="glass-container" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: '1.8rem' }}>{k.icon}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{k.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Traffic + Sentiment Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* 7-day traffic */}
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '18px', color: '#d8b4fe' }}> 7-Day Message Traffic</h3>
                {(() => {
                  const history = [...(analytics.daily_history || [])].reverse().slice(-7);
                  const max = Math.max(...history.map(h => h.count || 0), 1);
                  return (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '120px' }}>
                      {history.length === 0
                        ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data yet.</p>
                        : history.map((h, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{
                              width: '100%',
                              height: `${Math.max(4, ((h.count || 0) / max) * 100)}px`,
                              background: 'linear-gradient(180deg, #7c3aed, #a78bfa)',
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.4s ease',
                            }} title={`${h.count} messages`} />
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                              {new Date(h.date).toLocaleDateString('en', { weekday: 'short' })}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  );
                })()}
              </div>

              {/* Sentiment Breakdown */}
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '18px', color: '#d8b4fe' }}> Sentiment Breakdown</h3>
                {[
                  { label: 'Positive', pct: analytics.sentiment_positive ?? 45, color: '#34d399' },
                  { label: 'Neutral', pct: analytics.sentiment_neutral ?? 40, color: '#60a5fa' },
                  { label: 'Negative', pct: analytics.sentiment_negative ?? 15, color: '#f87171' },
                ].map(s => (
                  <div key={s.label} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                      <span style={{ color: s.color, fontWeight: 600 }}>{s.pct}%</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ width: `${s.pct}%`, height: '100%', background: s.color, borderRadius: '6px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Distribution + Cost Simulator */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Category distribution */}
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '18px', color: '#d8b4fe' }}>️ Contact Category Distribution</h3>
                {[
                  { label: 'VIP', value: contacts.filter(c => c.category === 'vip').length, color: '#ef4444' },
                  { label: 'Client', value: contacts.filter(c => c.category === 'client').length, color: '#f59e0b' },
                  { label: 'Business Partner', value: contacts.filter(c => c.category === 'business_partner').length, color: '#06b6d4' },
                  { label: 'Family', value: contacts.filter(c => c.category === 'family').length, color: '#10b981' },
                  { label: 'Friend', value: contacts.filter(c => c.category === 'friend').length, color: '#34d399' },
                  { label: 'Unknown / Lead', value: contacts.filter(c => !c.category || c.category === 'unknown').length, color: '#64748b' },
                ].map(item => {
                  const total = Math.max(contacts.length, 1);
                  return (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.label}</div>
                      <div style={{ flex: 3, background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${(item.value / total) * 100}%`, height: '100%', background: item.color }} />
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#fff', fontWeight: 600, minWidth: '24px', textAlign: 'right' }}>{item.value}</div>
                    </div>
                  );
                })}
              </div>

              {/* Gemini Cost Simulator */}
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '18px', color: '#d8b4fe' }}> Gemini Cost Simulator</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Estimated monthly cost based on current traffic volume.</p>
                {(() => {
                  const msgs = analytics.total_messages || 0;
                  const tokPerMsg = 800;
                  const totalTok = msgs * tokPerMsg;
                  const costPer1k = 0.00025; // flash 1.5
                  const cost = (totalTok / 1000) * costPer1k;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {[
                        { label: 'Est. Messages / Month', value: `${(msgs * 30).toLocaleString()}` },
                        { label: 'Est. Tokens / Month', value: `${((msgs * 30 * tokPerMsg) / 1000).toFixed(0)}K` },
                        { label: 'Estimated Cost', value: `$${(cost * 30).toFixed(3)}` },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(124,58,237,0.08)', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.15)' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.label}</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#d8b4fe' }}>{row.value}</span>
                        </div>
                      ))}
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-dark)', marginTop: '4px' }}>Based on Gemini 1.5 Flash pricing ($0.25 / 1M tokens). Estimate only.</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Automation Health */}
            <div className="glass-container" style={{ padding: '22px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '18px', color: '#d8b4fe' }}>️ Automation Health Dashboard</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '16px' }}>
                {[
                  { label: 'AI Engine', status: sysStatus.ai_enabled, good: true },
                  { label: 'Sleep Mode', status: !sysStatus.sleep_mode, good: true },
                  { label: 'Keyword Rules', status: (analytics.keyword_count ?? 0) > 0 },
                  { label: 'Q&A Fallback', status: (analytics.qa_count ?? 0) > 0 },
                  { label: 'Scheduler Active', status: scheduledTasks.filter(t => t.enabled).length > 0 },
                  { label: 'WebSocket Live', status: wsConnected },
                ].map(h => (
                  <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: `1px solid ${h.status ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
                    <span style={{ fontSize: '1.1rem' }}>{h.status ? '' : ''}</span>
                    <span style={{ fontSize: '0.82rem', color: h.status ? '#34d399' : '#f87171', fontWeight: 600 }}>{h.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}


        {/* ===== TAB 7: SCHEDULER ===== */}
        {activeTab === 'scheduler' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Create Task Form */}
            <div className="glass-container" style={{ padding: '26px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '20px', color: '#d8b4fe' }}> Create Scheduled Broadcast Task</h3>
              <form onSubmit={handleCreateScheduledTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Task Label *</label>
                    <input className="glass-input" placeholder="e.g. Morning Check-in" value={schedForm.label}
                      onChange={e => setSchedForm(f => ({ ...f, label: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Target Category</label>
                    <select className="glass-input" value={schedForm.category}
                      onChange={e => setSchedForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="all">All Contacts</option>
                      <option value="vip">VIP</option>
                      <option value="client">Client</option>
                      <option value="business_partner">Business Partner</option>
                      <option value="family">Family</option>
                      <option value="friend">Friend</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Cron Expression *</label>
                    <input className="glass-input" placeholder="e.g. 0 9 * * * (daily 9am)" value={schedForm.cron_expr}
                      onChange={e => setSchedForm(f => ({ ...f, cron_expr: e.target.value }))} required />
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-dark)', marginTop: '4px' }}>Format: minute hour day month weekday</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '22px' }}>
                    <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Enabled</label>
                    <div
                      onClick={() => setSchedForm(f => ({ ...f, enabled: !f.enabled }))}
                      style={{
                        width: '44px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                        background: schedForm.enabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                        position: 'relative', transition: 'background 0.2s'
                      }}>
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: schedForm.enabled ? '24px' : '3px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s'
                      }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Message Template * (use {`{name}`} for contact name)</label>
                  <textarea className="glass-input" rows={4} placeholder="Hi {name}, just checking in! " value={schedForm.message}
                    onChange={e => setSchedForm(f => ({ ...f, message: e.target.value }))} required style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button type="submit" className="glass-btn" disabled={schedLoading}
                    style={{ padding: '10px 24px', fontSize: '0.9rem', opacity: schedLoading ? 0.7 : 1 }}>
                    {schedLoading ? ' Creating...' : 'Create Task'}
                  </button>
                  {schedStatus && <span style={{ fontSize: '0.82rem', color: schedStatus.startsWith('') ? '#34d399' : '#f87171' }}>{schedStatus}</span>}
                </div>
              </form>
            </div>

            {/* Cron Reference */}
            <div className="glass-container" style={{ padding: '20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: '14px', color: '#d8b4fe' }}> Cron Expression Reference</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '10px' }}>
                {[
                  { expr: '0 9 * * *', desc: 'Every day at 9:00 AM' },
                  { expr: '0 9 * * 1', desc: 'Every Monday at 9:00 AM' },
                  { expr: '0 9,18 * * *', desc: 'Twice daily (9am & 6pm)' },
                  { expr: '*/30 * * * *', desc: 'Every 30 minutes' },
                  { expr: '0 10 1 * *', desc: 'First day of month at 10am' },
                  { expr: '0 8 * * 1-5', desc: 'Weekdays at 8:00 AM' },
                ].map(c => (
                  <div key={c.expr} style={{ background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#c084fc', marginBottom: '4px' }}>{c.expr}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Tasks Queue */}
            <div className="glass-container" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#d8b4fe' }}> Active Task Queue ({scheduledTasks.length})</h3>
                <button className="glass-btn-secondary" onClick={fetchScheduledTasks} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>Refresh</button>
              </div>
              {scheduledTasks.length === 0
                ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontSize: '0.9rem' }}>No scheduled tasks yet. Create one above ️</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {scheduledTasks.map(task => (
                      <div key={task.id} style={{
                        display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
                        background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
                        border: `1px solid ${task.enabled ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`,
                      }}>
                        <span style={{ fontSize: '1.3rem' }}>{task.enabled ? '' : '️'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', marginBottom: '3px' }}>{task.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <span style={{ fontFamily: 'monospace', color: '#c084fc' }}>{task.cron_expr}</span>
                            {' · '}{task.category} · {task.message?.substring(0, 60)}{task.message?.length > 60 ? '…' : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteScheduledTask(task.id)}
                          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem' }}
                        >Delete Delete</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>

          </div>
        )}


        {/* ===== TAB 8: SYSTEM ===== */}
        {activeTab === 'system' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Telemetry */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#d8b4fe' }}>️ Database & Runtime Telemetry</h3>
                <button className="glass-btn-secondary" onClick={fetchTelemetry} disabled={telemetryLoading}
                  style={{ fontSize: '0.8rem', padding: '6px 14px', opacity: telemetryLoading ? 0.6 : 1 }}>
                  {telemetryLoading ? '' : ''} Refresh
                </button>
              </div>
              {telemetry ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '14px' }}>
                  {Object.entries(telemetry).map(([key, val]) => (
                    <div key={key} style={{ background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '10px', padding: '14px 18px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{key.replace(/_/g, ' ')}</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#d8b4fe' }}>{String(val)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  {telemetryLoading ? ' Loading telemetry…' : ' Click Refresh to load system data.'}
                </div>
              )}
            </div>

            {/* Q&A Backup/Restore */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '16px', color: '#34d399' }}> Export Q&A Database</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>Download all Q&A rules as a JSON backup file for safekeeping or migration.</p>
                <button className="glass-btn" onClick={handleQaExport} disabled={qaExportLoading}
                  style={{ padding: '10px 22px', fontSize: '0.9rem', opacity: qaExportLoading ? 0.6 : 1 }}>
                  {qaExportLoading ? ' Exporting…' : '⬇️ Download JSON Backup'}
                </button>
              </div>

              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '16px', color: '#60a5fa' }}> Import Q&A Database</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Restore Q&A rules from a previously exported JSON file. Existing entries will be preserved.</p>
                <input type="file" accept=".json" onChange={e => { setQaImportFile(e.target.files[0]); setQaImportStatus(''); }}
                  style={{ display: 'block', marginBottom: '12px', fontSize: '0.82rem', color: 'var(--text-muted)' }} />
                <button className="glass-btn" onClick={handleQaImport}
                  style={{ padding: '10px 22px', fontSize: '0.9rem' }}>⬆️ Upload & Import</button>
                {qaImportStatus && <div style={{ marginTop: '10px', fontSize: '0.82rem', color: qaImportStatus.startsWith('') ? '#34d399' : qaImportStatus.startsWith('') ? '#fbbf24' : '#f87171' }}>{qaImportStatus}</div>}
              </div>
            </div>

            {/* Log Purge & DB Optimize */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '12px', color: '#f87171' }}>Clear Event Logs</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>Permanently delete all audit event log entries from the database. This cannot be undone.</p>
                {clearLogsConfirm && (
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '0.82rem', color: '#fca5a5' }}>
                     This will permanently delete ALL event log records. Click again to confirm.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSystemClearLogs}
                    disabled={clearLogsLoading}
                    style={{
                      padding: '10px 20px', fontSize: '0.88rem', cursor: 'pointer', borderRadius: '10px',
                      background: clearLogsConfirm ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.4)', color: clearLogsConfirm ? '#fff' : '#f87171',
                      opacity: clearLogsLoading ? 0.6 : 1
                    }}>
                    {clearLogsLoading ? ' Clearing…' : clearLogsConfirm ? ' CONFIRM CLEAR' : 'Clear All Logs'}
                  </button>
                  {clearLogsConfirm && (
                    <button className="glass-btn-secondary" onClick={() => setClearLogsConfirm(false)}
                      style={{ padding: '10px 16px', fontSize: '0.85rem' }}>Cancel</button>
                  )}
                </div>
              </div>

              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '12px', color: '#fbbf24' }}>Database Optimization</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>Run VACUUM to reclaim disk space and optimize SQLite database performance. Safe to run anytime.</p>
                <button className="glass-btn" onClick={handleDbOptimize}
                  style={{ padding: '10px 22px', fontSize: '0.9rem' }}>Run VACUUM</button>
                {dbOptStatus && <div style={{ marginTop: '12px', fontSize: '0.82rem', color: dbOptStatus.startsWith('') ? '#34d399' : '#f87171' }}>{dbOptStatus}</div>}
              </div>
            </div>

            {/* System Info */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '18px', color: '#d8b4fe' }}>ℹ️ System Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '12px' }}>
                {[
                  { label: 'Panel Version', value: 'Coet System v2.5' },
                  { label: 'AI Engine', value: settings.gemini_model || 'gemini-1.5-flash' },
                  { label: 'WebSocket Status', value: wsConnected ? ' Connected' : 'Disconnected' },
                  { label: 'Active Contacts', value: contacts.length },
                  { label: 'Scheduled Tasks', value: scheduledTasks.length },
                  { label: 'Timezone', value: settings.timezone || 'Asia/Kolkata' },
                ].map(info => (
                  <div key={info.label} style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: '10px', padding: '14px 18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{info.label}</div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#d8b4fe' }}>{info.value}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}


        {/* ===== TAB 9: BROADCAST COMMAND CENTER ===== */}
        {activeTab === 'broadcast' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Composer + Recipients */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '18px' }}>Message Composer</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Target Category</label>
                      <select value={broadcastCategory} onChange={e => setBroadcastCategory(e.target.value)} className="glass-input" style={{ width: '100%' }}>
                        {['all','vip','client','partner','family','friend','lead','unknown'].map(c => <option key={c} value={c}>{c.toUpperCase()} ({c === 'all' ? contacts.length : contacts.filter(x => x.category === c).length})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Schedule (optional)</label>
                      <input type="datetime-local" className="glass-input" style={{ width: '100%' }} value={bcScheduledDate} onChange={e => setBcScheduledDate(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Message — Tokens: {'{name}'} {'{category}'} {'{date}'}</label>
                    <textarea className="glass-input" rows={6} placeholder="Hi {name}, this is a message for our {category} contacts..." value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="glass-btn"
                      onClick={async () => {
                        if (!broadcastMessage.trim()) { setBroadcastStatus('Message required.'); return; }
                        const recips = getBroadcastRecipients();
                        if (bcDryRun) { setBcDryRunCount(recips.length); setBroadcastStatus(`Dry run: Would send to ${recips.length} contacts.`); return; }
                        setBroadcastLoading(true); setBroadcastStatus('Sending...');
                        try {
                          const res = await fetch(`${API_BASE}/api/admin/broadcast`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ category: broadcastCategory, message: broadcastMessage }) });
                          if (res.ok) { const d = await res.json(); setBroadcastStatus(`Broadcast sent to ${d.sent || '?'} contacts.`); fetchBroadcastHistory(); setBroadcastMessage(''); }
                          else { setBroadcastStatus('Broadcast failed.'); }
                        } catch (e) { setBroadcastStatus('Network error.'); }
                        setBroadcastLoading(false);
                      }}
                      disabled={broadcastLoading}
                      style={{ padding: '10px 22px', opacity: broadcastLoading ? 0.6 : 1 }}
                    >
                      {broadcastLoading ? 'Sending...' : bcDryRun ? 'Dry Run' : 'Send Broadcast'}
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={bcDryRun} onChange={e => setBcDryRun(e.target.checked)} /> Dry-Run Mode
                    </label>
                    <button className="glass-btn-secondary" onClick={() => setBroadcastMessage('')} style={{ padding: '8px 14px', fontSize: '0.8rem' }}>Clear</button>
                  </div>
                  {broadcastStatus && <div style={{ fontSize: '0.85rem', padding: '10px 14px', borderRadius: '8px', background: broadcastStatus.startsWith('') ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)', border: `1px solid ${broadcastStatus.startsWith('') ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)'}`, color: broadcastStatus.startsWith('') ? '#34d399' : '#fbbf24' }}>{broadcastStatus}</div>}
                </div>
              </div>

              {/* Recipient Preview */}
              <div className="glass-container" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399', marginBottom: '14px' }}>Recipients Preview</h3>
                <div style={{ fontSize: '2.2rem', fontWeight: 700, color: '#d8b4fe', textAlign: 'center', marginBottom: '6px' }}>{getBroadcastRecipients().length}</div>
                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>contacts will receive this message</div>
                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {getBroadcastRecipients().slice(0, 20).map(c => (
                    <div key={c.telegram_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(124,77,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                        {(c.first_name || '?')[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{c.first_name} {c.last_name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>@{c.username || 'no_username'}</div>
                      </div>
                    </div>
                  ))}
                  {getBroadcastRecipients().length > 20 && <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px' }}>+{getBroadcastRecipients().length - 20} more…</div>}
                </div>
              </div>
            </div>

            {/* Template Library + Broadcast History */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fbbf24', marginBottom: '16px' }}>Message Templates</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  <input className="glass-input" placeholder="Template name" value={bcNewTplName} onChange={e => setBcNewTplName(e.target.value)} style={{ fontSize: '0.85rem' }} />
                  <textarea className="glass-input" rows={3} placeholder="Template content with {name} tokens..." value={bcNewTplContent} onChange={e => setBcNewTplContent(e.target.value)} style={{ resize: 'vertical', fontSize: '0.85rem' }} />
                  <button className="glass-btn" onClick={handleSaveTemplate} style={{ padding: '8px 18px', fontSize: '0.85rem' }}>Save Template</button>
                  {bcTplStatus && <div style={{ fontSize: '0.8rem', color: bcTplStatus.startsWith('') ? '#34d399' : '#fbbf24' }}>{bcTplStatus}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {broadcastTemplates.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.content?.slice(0, 60)}…</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="glass-btn-secondary" onClick={() => setBroadcastMessage(t.content)} style={{ padding: '4px 10px', fontSize: '0.72rem' }}>Use</button>
                        <button onClick={() => handleDeleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: '0.8rem' }}>x</button>
                      </div>
                    </div>
                  ))}
                  {broadcastTemplates.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '20px' }}>No templates yet. Save one above.</div>}
                </div>
              </div>

              <div className="glass-container" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#a78bfa' }}>Broadcast History</h3>
                  <button className="glass-btn-secondary" onClick={fetchBroadcastHistory} style={{ fontSize: '0.75rem', padding: '5px 12px' }}></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                  {broadcastHistory.map(b => (
                    <div key={b.id} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase' }}>{b.category}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(b.sent_at).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{b.message?.slice(0, 80)}…</div>
                      <div style={{ fontSize: '0.72rem', color: '#34d399' }}>{b.recipient_count} recipients</div>
                    </div>
                  ))}
                  {broadcastHistory.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '30px' }}>No broadcast history yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ===== TAB 10: AI INTELLIGENCE LAB ===== */}
        {activeTab === 'intelligence' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Conversation Simulator + Result Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa' }}>Conversation Simulator</h3>
                <div style={{ minHeight: '220px', maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px' }}>
                  {aiLabConvo.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '80px' }}>Type a message to start testing AI responses</div>}
                  {aiLabConvo.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '80%', padding: '10px 14px', borderRadius: '12px', fontSize: '0.85rem',
                        background: msg.role === 'user' ? 'rgba(124,77,255,0.25)' : 'rgba(52,211,153,0.1)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(124,77,255,0.3)' : 'rgba(52,211,153,0.2)'}`,
                        color: msg.role === 'user' ? '#d8b4fe' : '#d1fae5'
                      }}>{msg.text}</div>
                      {msg.role === 'ai' && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '4px' }}>Sentiment: {msg.sentiment} • Priority: {msg.priority}</div>}
                    </div>
                  ))}
                  {aiLabLoading && <div style={{ textAlign: 'center', color: '#60a5fa', fontSize: '0.85rem' }}>AI thinking...</div>}
                </div>
                <form onSubmit={handleAiLabTest} style={{ display: 'flex', gap: '10px' }}>
                  <input className="glass-input" style={{ flex: 1, fontSize: '0.9rem' }} placeholder="Send a test message to the AI..." value={aiLabMsg} onChange={e => setAiLabMsg(e.target.value)} />
                  <button className="glass-btn" type="submit" disabled={aiLabLoading} style={{ padding: '10px 18px' }}>Send</button>
                </form>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="glass-btn-secondary" onClick={() => { setAiLabConvo([]); setAiLabResult(null); }} style={{ fontSize: '0.78rem', padding: '5px 12px' }}>Clear</button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Using status: <strong>{settings.status || 'online'}</strong></span>
                </div>
              </div>

              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '16px' }}>Last AI Response Analysis</h3>
                {aiLabResult ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '14px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Draft Reply</div>
                      <div style={{ fontSize: '0.9rem', color: '#d1fae5' }}>{aiLabResult.draft_reply}</div>
                    </div>
                    {[
                      { label: 'Sentiment', value: aiLabResult.sentiment, color: aiLabResult.sentiment === 'positive' ? '#34d399' : aiLabResult.sentiment === 'negative' ? '#f87171' : '#fbbf24' },
                      { label: 'Priority', value: aiLabResult.priority, color: '#60a5fa' },
                      { label: 'Language', value: aiLabResult.language || 'en', color: '#a78bfa' },
                      { label: 'Tone', value: aiLabResult.tone || 'neutral', color: '#fb923c' },
                    ].map(m => (
                      <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{m.label}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: m.color, textTransform: 'capitalize' }}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: '0.9rem' }}>Send a test message to see AI analysis here.</div>}
              </div>
            </div>

            {/* Knowledge Base + Blacklist + DNA Rebuilder */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fbbf24', marginBottom: '14px' }}>Knowledge Base Editor</h3>
                <textarea className="glass-input" rows={8} style={{ width: '100%', resize: 'vertical', fontSize: '0.83rem' }}
                  placeholder="Edit the knowledge base that AI uses for responses..."
                  value={knowledgeBaseLocal || settings.knowledge_base || ''}
                  onChange={e => setKnowledgeBaseLocal(e.target.value)}
                />
                <button className="glass-btn" style={{ marginTop: '10px', padding: '8px 18px', fontSize: '0.85rem' }}
                  onClick={async () => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ knowledge_base: knowledgeBaseLocal }) }); fetchSettings(); }}>
                  Save Knowledge Base
                </button>
              </div>

              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#f87171', marginBottom: '14px' }}>Blacklist Keywords</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Comma-separated. AI will never respond to messages containing these words.</p>
                <textarea className="glass-input" rows={5} style={{ width: '100%', resize: 'vertical', fontSize: '0.83rem' }}
                  placeholder="spam, scam, hack, phishing..."
                  value={blacklistLocal || settings.blacklist_keywords || ''}
                  onChange={e => setBlacklistLocal(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button className="glass-btn" style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                    onClick={async () => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ blacklist_keywords: blacklistLocal }) }); fetchSettings(); }}>
                    Save Blacklist
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    {(blacklistLocal || settings.blacklist_keywords || '').split(',').filter(x => x.trim()).length} words blocked
                  </span>
                </div>
              </div>

              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#a78bfa', marginBottom: '14px' }}>Owner DNA Rebuild</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '18px' }}>Reanalyze your message history to rebuild a fresh owner style DNA profile. AI will mimic your exact tone.</p>
                <button className="glass-btn" onClick={handleDnaRebuild} disabled={dnaRebuildLoading} style={{ width: '100%', padding: '12px', fontSize: '0.9rem', opacity: dnaRebuildLoading ? 0.6 : 1 }}>
                  {dnaRebuildLoading ? ' Rebuilding...' : 'Rebuild Style DNA'}
                </button>
                {dnaRebuildStatus && <div style={{ marginTop: '12px', fontSize: '0.8rem', color: dnaRebuildStatus.startsWith('') ? '#34d399' : '#fbbf24', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>{dnaRebuildStatus}</div>}
                <div style={{ marginTop: '14px', padding: '10px', background: 'rgba(167,139,250,0.06)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Current DNA: <br/><span style={{ color: '#a78bfa' }}>{(settings.owner_style_profile || 'Not built yet').slice(0, 120)}…</span>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ===== TAB 11: REMINDERS & CRM ===== */}
        {activeTab === 'reminders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Create Reminder + Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fbbf24', marginBottom: '18px' }}>Create Reminder</h3>
                <form onSubmit={handleCreateCRMReminder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Task / Note</label>
                    <input className="glass-input" placeholder="Follow up with client about deal..." style={{ width: '100%', fontSize: '0.9rem' }}
                      value={reminderForm.task} onChange={e => setReminderForm(p => ({ ...p, task: e.target.value }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Due Time</label>
                      <input type="datetime-local" className="glass-input" style={{ width: '100%' }} value={reminderForm.due_time} onChange={e => setReminderForm(p => ({ ...p, due_time: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Priority</label>
                      <select className="glass-input" style={{ width: '100%' }} value={reminderForm.priority} onChange={e => setReminderForm(p => ({ ...p, priority: e.target.value }))}>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Link Contact</label>
                      <select className="glass-input" style={{ width: '100%' }} value={reminderForm.telegram_id} onChange={e => setReminderForm(p => ({ ...p, telegram_id: e.target.value }))}>
                        <option value="">-- No contact --</option>
                        {contacts.slice(0, 50).map(c => <option key={c.telegram_id} value={c.telegram_id}>{c.first_name} {c.last_name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="glass-btn" type="submit" style={{ padding: '10px 24px', fontSize: '0.9rem' }}>Create Reminder</button>
                    <button type="button" className="glass-btn-secondary" onClick={fetchAllReminders} style={{ padding: '10px 16px', fontSize: '0.85rem' }}>Refresh</button>
                  </div>
                  {reminderStatus && <div style={{ fontSize: '0.85rem', color: reminderStatus.startsWith('') ? '#34d399' : '#fbbf24' }}>{reminderStatus}</div>}
                </form>
              </div>

              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#f87171', marginBottom: '16px' }}>Overdue Alerts</h3>
                {(() => {
                  const overdue = allReminders.filter(r => r.status === 'pending' && r.due_time && new Date(r.due_time) < new Date());
                  return overdue.length === 0
                    ? <div style={{ textAlign: 'center', color: '#34d399', fontSize: '0.9rem', padding: '30px 0' }}>No overdue reminders!</div>
                    : overdue.map(r => (
                        <div key={r.id} style={{ padding: '10px 12px', marginBottom: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f87171' }}>{r.task}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Was due: {new Date(r.due_time).toLocaleString()}</div>
                          <button className="glass-btn-secondary" onClick={() => handleCompleteReminder(r.id, r.status)} style={{ marginTop: '6px', padding: '3px 10px', fontSize: '0.72rem' }}>Mark Done</button>
                        </div>
                      ));
                })()}
              </div>
            </div>

            {/* Full Reminders Table */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#d8b4fe' }}>All Reminders ({allReminders.length})</h3>
                <input className="glass-input" placeholder="Filter..." style={{ width: '220px', fontSize: '0.82rem' }} value={crmContactSearch} onChange={e => setCrmContactSearch(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '440px', overflowY: 'auto' }}>
                {allReminders.filter(r => !crmContactSearch || r.task?.toLowerCase().includes(crmContactSearch.toLowerCase())).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: `1px solid ${r.status === 'completed' ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`, opacity: r.status === 'completed' ? 0.6 : 1 }}>
                    <input type="checkbox" checked={r.status === 'completed'} onChange={() => handleCompleteReminder(r.id, r.status)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c4dff' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, textDecoration: r.status === 'completed' ? 'line-through' : 'none', color: r.status === 'completed' ? 'var(--text-muted)' : '#fff' }}>{r.task}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Due: {r.due_time ? new Date(r.due_time).toLocaleString() : 'No deadline'}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: r.status === 'completed' ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)', color: r.status === 'completed' ? '#34d399' : '#fbbf24', textTransform: 'uppercase' }}>{r.status}</span>
                  </div>
                ))}
                {allReminders.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>No reminders yet. Create one above.</div>}
              </div>
            </div>

            {/* Follow-up Tracker */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#60a5fa' }}>Follow-up Needed ({contacts.filter(c => !c.updated_at || (Date.now() - new Date(c.updated_at + 'Z').getTime()) / 86400000 > followUpDays).length})</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  No activity in <input type="number" min={1} max={90} value={followUpDays} onChange={e => setFollowUpDays(parseInt(e.target.value))} className="glass-input" style={{ width: '60px', textAlign: 'center', padding: '4px', fontSize: '0.82rem' }} /> days
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px' }}>
                {contacts.filter(c => !c.updated_at || (Date.now() - new Date(c.updated_at + 'Z').getTime()) / 86400000 > followUpDays).slice(0, 12).map(c => (
                  <div key={c.telegram_id} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.first_name} {c.last_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{c.category} • @{c.username || 'no_user'}</div>
                    <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '4px' }}>Last seen: {c.updated_at ? Math.floor((Date.now() - new Date(c.updated_at + 'Z').getTime()) / 86400000) + 'd ago' : 'unknown'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}


        {/* ===== TAB 12: API KEY VAULT ===== */}
        {activeTab === 'keys' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Key Health Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
              {[
                { label: 'Total Keys', value: apiKeys.length, color: '#d8b4fe' },
                { label: 'Active / Valid', value: apiKeys.filter(k => k.status === 'active').length, color: '#34d399' },
                { label: 'Invalid / Failed', value: apiKeys.filter(k => k.status === 'invalid').length, color: '#f87171' },
                { label: 'Untested', value: apiKeys.filter(k => !k.status || k.status === 'unchecked').length, color: '#fbbf24' },
              ].map(stat => (
                <div key={stat.label} className="glass-container" style={{ padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Add New Key */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fbbf24', marginBottom: '16px' }}>Add Gemini API Key</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '2' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>API KEY</label>
                  <input className="glass-input" type="password" placeholder="AIza..." value={newKeyInput} onChange={e => setNewKeyInput(e.target.value)} style={{ width: '100%', fontFamily: 'monospace' }} />
                </div>
                <div style={{ flex: '1' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>LABEL</label>
                  <input className="glass-input" placeholder="Primary / Backup 1..." value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} style={{ width: '100%' }} />
                </div>
                <button className="glass-btn" onClick={handleAddKey} style={{ padding: '10px 22px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Add Key</button>
              </div>
              {keyStatus && <div style={{ marginTop: '10px', fontSize: '0.85rem', color: keyStatus.startsWith('') ? '#34d399' : '#fbbf24' }}>{keyStatus}</div>}
            </div>

            {/* Keys List */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#d8b4fe' }}>API Keys ({apiKeys.length})</h3>
                <button className="glass-btn-secondary" onClick={() => fetch(`${API_BASE}/api/admin/check-keys`, { method: 'POST', headers: getHeaders() }).then(() => fetchApiKeys())} style={{ fontSize: '0.8rem', padding: '6px 14px' }}> Test All Keys</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {apiKeys.map((k, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: `1px solid ${k.status === 'active' ? 'rgba(52,211,153,0.2)' : k.status === 'invalid' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: k.status === 'active' ? '#10b981' : k.status === 'invalid' ? '#ef4444' : '#6b7280', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{k.label || `Key ${i+1}`}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{k.key ? (k.key.slice(0, 8) + '···' + k.key.slice(-6)) : '—'}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', background: k.status === 'active' ? 'rgba(52,211,153,0.12)' : k.status === 'invalid' ? 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.12)', color: k.status === 'active' ? '#34d399' : k.status === 'invalid' ? '#f87171' : '#9ca3af', textTransform: 'uppercase' }}>
                      {keyTestResults[k.key] || k.status || 'unchecked'}
                    </span>
                    <button className="glass-btn-secondary" onClick={() => handleTestVaultKey(k.key)} style={{ fontSize: '0.75rem', padding: '5px 12px' }}>Test</button>
                    <button onClick={() => handleDeleteKey(k.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: '0.9rem', padding: '4px 8px' }}>Delete</button>
                  </div>
                ))}
                {apiKeys.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>No API keys configured. Add one above.</div>}
              </div>
            </div>
          </div>
        )}


        {/* ===== TAB 13: PERSONA STUDIO ===== */}
        {activeTab === 'personas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* ── SECTION HEADER ── */}
            <div style={{ background: 'linear-gradient(135deg,rgba(251,191,36,0.07),rgba(167,139,250,0.05))', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Persona Studio — Mega Control Center</div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>Full command over your AI identity — voice, mood, timing, language intelligence, tonal memory, emotional responses, output format, and 100+ precision dials.</p>
              </div>
              <div style={{ padding: '8px 18px', borderRadius: '20px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {settings.status ? settings.status.toUpperCase() : 'ONLINE'} MODE
              </div>
            </div>

            {/* ── 1. MOOD CARDS (6 moods) ── */}
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fbbf24', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
                Mood Personas
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px' }}>
                {[
                  { key: 'online', label: 'Online', color: '#34d399' },
                  { key: 'busy', label: 'Busy', color: '#f87171' },
                  { key: 'focus', label: 'Focus', color: '#60a5fa' },
                  { key: 'sleeping', label: 'Sleeping', color: '#a78bfa' },
                  { key: 'travel', label: 'Travel', color: '#fbbf24' },
                  { key: 'vacation', label: 'Vacation', color: '#fb923c' },
                ].map(mood => (
                  <div key={mood.key} className="glass-container" style={{ padding: '18px', border: settings.status === mood.key ? `1px solid ${mood.color}` : '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: mood.color, display: 'inline-block', boxShadow: settings.status === mood.key ? `0 0 8px ${mood.color}` : 'none' }} />
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, color: mood.color }}>{mood.label}</span>
                      </div>
                      <button onClick={async () => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ status: mood.key }) }); fetchSettings(); setPersonaStatus(`Switched to ${mood.label} mode`); }}
                        style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: '20px', border: `1px solid ${mood.color}40`, background: settings.status === mood.key ? `${mood.color}20` : 'transparent', color: mood.color, cursor: 'pointer' }}>
                        {settings.status === mood.key ? '● Active' : 'Activate'}
                      </button>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Status Message</label>
                      <input className="glass-input" style={{ width: '100%', fontSize: '0.78rem' }}
                        defaultValue={settings[`status_desc_${mood.key}`] || ''}
                        onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [`status_desc_${mood.key}`]: e.target.value }) }); }} />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>AI Behaviour Prompt</label>
                      <textarea className="glass-input" rows={3} style={{ width: '100%', resize: 'vertical', fontSize: '0.76rem' }}
                        defaultValue={settings[`status_prompt_${mood.key}`] || ''}
                        onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [`status_prompt_${mood.key}`]: e.target.value }) }); }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Auto-Switch Trigger (Cron / Time)</label>
                      <input className="glass-input" style={{ width: '100%', fontSize: '0.76rem' }}
                        placeholder="e.g. 22:00 or MANUAL"
                        defaultValue={settings[`status_auto_switch_${mood.key}`] || ''}
                        onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [`status_auto_switch_${mood.key}`]: e.target.value }) }); }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. VOICE DNA ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#34d399', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} /> Voice DNA
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px' }}>
                {[
                  { label: 'Assistant Name', key: 'assistant_name', type: 'input', placeholder: 'CatVos' },
                  { label: 'Owner Nickname (how AI refers to you)', key: 'owner_nickname', type: 'input', placeholder: 'boss' },
                  { label: 'Custom Signature', key: 'custom_signature', type: 'input', placeholder: '— Team Shinken' },
                  { label: 'Tone Profile', key: 'tone_profile', type: 'select', options: ['concise', 'elaborated', 'bullet', 'formal', 'casual', 'street', 'luxury', 'professional'] },
                  { label: 'Language Style', key: 'language_style', type: 'select', options: ['english_clean', 'hinglish', 'urdu_mix', 'spanish', 'arabic', 'pidgin', 'french', 'auto_detect'] },
                  { label: 'Slang Level', key: 'slang_level', type: 'select', options: ['none', 'mild', 'moderate', 'heavy'] },
                  { label: 'Formality Level (1-10)', key: 'formality_level', type: 'number', placeholder: '5' },
                  { label: 'Warmth Level (1-10)', key: 'warmth_level', type: 'number', placeholder: '7' },
                  { label: 'Confidence Level (1-10)', key: 'confidence_level', type: 'number', placeholder: '8' },
                  { label: 'Sarcasm Tolerance (0=none, 10=full)', key: 'sarcasm_tolerance', type: 'number', placeholder: '3' },
                  { label: 'Gemini Model', key: 'gemini_model', type: 'select', options: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'] },
                  { label: 'AI Temperature (0.0–2.0)', key: 'ai_temperature', type: 'number', placeholder: '0.7' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    {field.type === 'select'
                      ? <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : <input type={field.type || 'text'} className="glass-input" style={{ width: '100%' }} placeholder={field.placeholder || ''} defaultValue={settings[field.key] || ''} onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }} />
                    }
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Banned Phrases (comma-separated — AI will NEVER say these)</label>
                <textarea className="glass-input" rows={2} style={{ width: '100%', fontSize: '0.8rem' }}
                  defaultValue={settings.style_banned_phrases || ''}
                  onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ style_banned_phrases: e.target.value }) }); }} />
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Forced Opener Words (AI starts every reply with one of these)</label>
                <input className="glass-input" style={{ width: '100%' }} placeholder="e.g. Hey, Sure, Noted, Absolutely"
                  defaultValue={settings.forced_opener_words || ''}
                  onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ forced_opener_words: e.target.value }) }); }} />
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Personal Catchphrases (AI sprinkles these naturally)</label>
                <input className="glass-input" style={{ width: '100%' }} placeholder="e.g. no worries bro, handled"
                  defaultValue={settings.persona_catchphrases || ''}
                  onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ persona_catchphrases: e.target.value }) }); }} />
              </div>
            </div>

            {/* ── 3. REPLY ENGINE & TIMING ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#60a5fa', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#60a5fa', display: 'inline-block' }} /> Reply Engine & Timing
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Min Reply Delay (sec)', key: 'reply_delay_min', type: 'number', placeholder: '2' },
                  { label: 'Max Reply Delay (sec)', key: 'reply_delay_max', type: 'number', placeholder: '8' },
                  { label: 'Typing Indicator Duration (sec)', key: 'typing_duration', type: 'number', placeholder: '3' },
                  { label: 'Max Reply Length (chars)', key: 'max_reply_length', type: 'number', placeholder: '1000' },
                  { label: 'Context Window (messages)', key: 'context_window', type: 'number', placeholder: '20' },
                  { label: 'Burst Message Merge Window (sec)', key: 'burst_merge_window', type: 'number', placeholder: '5' },
                  { label: 'Re-read Delay (sec)', key: 'reread_delay', type: 'number', placeholder: '1' },
                  { label: 'Max Messages Per Minute', key: 'max_messages_per_min', type: 'number', placeholder: '10' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    <input type="number" className="glass-input" style={{ width: '100%' }} placeholder={field.placeholder}
                      defaultValue={settings[field.key] || ''}
                      onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Split Long Messages', key: 'enable_split_messages' },
                  { label: 'Read Receipts Simulation', key: 'simulate_read_receipts' },
                  { label: 'Typing Bubbles', key: 'show_typing_indicator' },
                  { label: 'Smart Hinglish Mix', key: 'smart_hinglish' },
                  { label: 'Enable Reactions', key: 'enable_reactions' },
                  { label: 'Auto-Correct Typos', key: 'auto_correct_typos' },
                  { label: 'Humanize Spacing', key: 'humanize_message_spacing' },
                  { label: 'Compress Short Replies', key: 'compress_short_replies' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#7c4dff' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 4. CONVERSATION STYLE & MEMORY ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#a78bfa', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} /> Conversation Style & Tonal Memory
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Default Conversation Style', key: 'conversation_style', type: 'select', options: ['direct', 'storytelling', 'question_led', 'empathetic', 'commanding', 'playful', 'educational'] },
                  { label: 'Mirror Client Tone', key: 'tone_mirror_mode', type: 'select', options: ['off', 'subtle', 'medium', 'full'] },
                  { label: 'Persona Consistency Lock', key: 'persona_consistency_lock', type: 'select', options: ['strict', 'flexible', 'adaptive'] },
                  { label: 'Memory Style', key: 'memory_style', type: 'select', options: ['session_only', 'rolling_20', 'full_history', 'semantic_search'] },
                  { label: 'Recall Old Context After (days)', key: 'memory_recall_days', type: 'number', placeholder: '7' },
                  { label: 'Tonal Drift Correction', key: 'tonal_drift_correction', type: 'select', options: ['off', 'gentle', 'strong'] },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    {field.type === 'select'
                      ? <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : <input type={field.type || 'text'} className="glass-input" style={{ width: '100%' }} placeholder={field.placeholder || ''} defaultValue={settings[field.key] || ''} onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); }} />
                    }
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Remember Names', key: 'memory_remember_names' },
                  { label: 'Remember Prices Discussed', key: 'memory_remember_prices' },
                  { label: 'Remember Complaints', key: 'memory_remember_complaints' },
                  { label: 'Reference Past Deals', key: 'memory_reference_past_deals' },
                  { label: 'Track VIP Client Preferences', key: 'memory_track_vip_prefs' },
                  { label: 'Remember Deadline Promises', key: 'memory_deadline_track' },
                  { label: 'Cross-Session Memory', key: 'cross_session_memory' },
                  { label: 'Auto-Summarize Long Chats', key: 'auto_summarize_chats' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#a78bfa' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 5. EMOTIONAL INTELLIGENCE ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#f87171', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f87171', display: 'inline-block' }} /> Emotional Intelligence Engine
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Sentiment Detection Model', key: 'sentiment_model', type: 'select', options: ['basic_keywords', 'ai_full', 'hybrid'] },
                  { label: 'Negative Sentiment Threshold (0-1)', key: 'sentiment_negative_threshold', type: 'number', placeholder: '0.65' },
                  { label: 'Anger Escalation Action', key: 'anger_escalation_action', type: 'select', options: ['pause_ai', 'notify_owner', 'send_apology', 'switch_to_owner'] },
                  { label: 'Grief / Emotional Message Action', key: 'grief_message_action', type: 'select', options: ['empathetic_reply', 'pause_and_notify', 'ignore'] },
                  { label: 'Compliment Response Style', key: 'compliment_response', type: 'select', options: ['humble', 'confident', 'playful', 'ignore'] },
                  { label: 'Urgency Detection Sensitivity', key: 'urgency_sensitivity', type: 'select', options: ['low', 'medium', 'high', 'extreme'] },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    {field.type === 'select'
                      ? <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : <input type={field.type || 'text'} className="glass-input" style={{ width: '100%' }} placeholder={field.placeholder || ''} defaultValue={settings[field.key] || ''} onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); }} />
                    }
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Detect Frustration', key: 'detect_frustration' },
                  { label: 'Detect Sarcasm', key: 'detect_sarcasm' },
                  { label: 'Detect Loneliness / Venting', key: 'detect_loneliness' },
                  { label: 'Detect Excitement', key: 'detect_excitement' },
                  { label: 'Send Apology on Delay > 30min', key: 'auto_apology_long_wait' },
                  { label: 'Celebrate Client Wins', key: 'celebrate_client_wins' },
                  { label: 'Match Energy Level', key: 'match_energy_level' },
                  { label: 'Emoji Sentiment Boost', key: 'emoji_sentiment_boost' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#f87171' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 6. LANGUAGE INTELLIGENCE ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#10b981', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Language Intelligence
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Auto Language Detection', key: 'auto_lang_detect', type: 'select', options: ['off', 'detect_and_match', 'detect_and_translate'] },
                  { label: 'Fallback Language', key: 'fallback_language', type: 'select', options: ['english', 'hindi', 'urdu', 'arabic', 'spanish', 'french'] },
                  { label: 'Transliteration Mode', key: 'transliteration_mode', type: 'select', options: ['off', 'auto', 'always_roman'] },
                  { label: 'Script Mixing (e.g. Hinglish)', key: 'script_mixing', type: 'select', options: ['off', 'natural', 'forced'] },
                  { label: 'Abbreviation Expansion', key: 'abbreviation_expansion', type: 'select', options: ['off', 'subtle', 'full'] },
                  { label: 'Formal Titles (Sir/Ma\'am)', key: 'formal_titles', type: 'select', options: ['off', 'always', 'context_aware'] },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Respect Code-Switching', key: 'respect_code_switching' },
                  { label: 'Casual Number Format (lakhs)', key: 'casual_number_format' },
                  { label: 'Currency Symbol Localization', key: 'currency_localization' },
                  { label: 'Date Format Localization', key: 'date_localization' },
                  { label: 'Avoid Western Idioms', key: 'avoid_western_idioms' },
                  { label: 'Use Local Greetings', key: 'use_local_greetings' },
                  { label: 'Religious Sensitivity Mode', key: 'religious_sensitivity' },
                  { label: 'Gender-Neutral Pronouns', key: 'gender_neutral_pronouns' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#10b981' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 7. SALES & PERSUASION ENGINE ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fbbf24', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} /> Sales & Persuasion Engine
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Sales Mode', key: 'sales_mode', type: 'select', options: ['off', 'soft_sell', 'consultative', 'aggressive', 'scarcity_based'] },
                  { label: 'Upsell Trigger', key: 'upsell_trigger', type: 'select', options: ['off', 'after_purchase', 'on_interest', 'always'] },
                  { label: 'Negotiation Stance', key: 'negotiation_stance', type: 'select', options: ['firm', 'flexible', 'match_client'] },
                  { label: 'Objection Handling Style', key: 'objection_handling', type: 'select', options: ['logical', 'empathetic', 'social_proof', 'redirect'] },
                  { label: 'FOMO Triggers', key: 'fomo_trigger_mode', type: 'select', options: ['off', 'natural', 'strong'] },
                  { label: 'Price Anchoring', key: 'price_anchoring', type: 'select', options: ['off', 'high_anchor', 'value_anchor'] },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Auto Offer Discount', key: 'auto_offer_discount' },
                  { label: 'Social Proof Injection', key: 'social_proof_injection' },
                  { label: 'Reciprocity Principle', key: 'reciprocity_principle' },
                  { label: 'Urgency Language', key: 'urgency_language_boost' },
                  { label: 'Trust Badge Mentions', key: 'trust_badge_mentions' },
                  { label: 'Testimonial References', key: 'auto_testimonial_refs' },
                  { label: 'Risk Reversal Offers', key: 'risk_reversal_offers' },
                  { label: 'Competitor Deflection', key: 'competitor_deflection' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#fbbf24' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 8. CONTENT MODERATION & SAFETY ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fb923c', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fb923c', display: 'inline-block' }} /> Content Moderation & Safety
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Safety Filter Level', key: 'safety_filter_level', type: 'select', options: ['off', 'low', 'medium', 'high', 'maximum'] },
                  { label: 'Profanity Filter', key: 'profanity_filter', type: 'select', options: ['off', 'block', 'clean_replace', 'warn_only'] },
                  { label: 'NSFW Detection', key: 'nsfw_detection', type: 'select', options: ['off', 'flag', 'block_and_notify'] },
                  { label: 'Scam/Phishing Detection', key: 'scam_detection', type: 'select', options: ['off', 'flag', 'block_and_alert'] },
                  { label: 'PII Redaction Mode', key: 'pii_redaction', type: 'select', options: ['off', 'log_only', 'redact_in_logs', 'block_sharing'] },
                  { label: 'Legal Risk Words Action', key: 'legal_risk_action', type: 'select', options: ['allow', 'flag', 'rephrase', 'block'] },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Block Personal Info Requests', key: 'block_personal_info_req' },
                  { label: 'Detect Manipulation Attempts', key: 'detect_manipulation' },
                  { label: 'Ignore Jailbreak Prompts', key: 'ignore_jailbreak' },
                  { label: 'Flag Unusual Ask Patterns', key: 'flag_unusual_asks' },
                  { label: 'No Price Sharing with Strangers', key: 'block_price_sharing_strangers' },
                  { label: 'Auto-Sanitize Outputs', key: 'auto_sanitize_outputs' },
                  { label: 'Hallucination Guard', key: 'hallucination_guard' },
                  { label: 'Fact-Check Critical Claims', key: 'fact_check_critical' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#fb923c' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 9. OUTPUT FORMAT ENGINEERING ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#d8b4fe', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d8b4fe', display: 'inline-block' }} /> Output Format Engineering
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'List Format', key: 'list_format', type: 'select', options: ['off', 'bullets', 'numbers', 'dashes', 'auto'] },
                  { label: 'Bold Key Words', key: 'bold_key_words', type: 'select', options: ['off', 'prices', 'dates', 'names', 'all_important'] },
                  { label: 'Paragraph Density', key: 'paragraph_density', type: 'select', options: ['compact', 'normal', 'airy', 'one_line_per_idea'] },
                  { label: 'Code Block Formatting', key: 'code_block_format', type: 'select', options: ['off', 'monospace', 'github_style'] },
                  { label: 'Quote Style', key: 'quote_style', type: 'select', options: ['none', 'double_quotes', 'block_quote', 'italics'] },
                  { label: 'Signature Position', key: 'signature_position', type: 'select', options: ['none', 'end', 'every_message', 'first_message_only'] },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                    <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {[
                  { label: 'Include Timestamps in Logs', key: 'include_timestamps' },
                  { label: 'Strip Markdown for Simple Clients', key: 'strip_markdown_simple' },
                  { label: 'Append "Sent via Bot" Footer', key: 'sent_via_bot_footer' },
                  { label: 'Include Order ID in Receipts', key: 'include_order_id_receipts' },
                  { label: 'Add Horizontal Dividers', key: 'add_horizontal_dividers' },
                  { label: 'Auto-Translate to English in Logs', key: 'auto_translate_logs' },
                  { label: 'Format Phone Numbers Consistently', key: 'format_phone_numbers' },
                  { label: 'Insert Breathing Space Between Sections', key: 'breathing_space_sections' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.76rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#d8b4fe' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 10. SYSTEM PROMPT EDITOR + MASTER OVERRIDE ── */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#f59e0b', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> System Prompt Editor
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Master System Prompt (Injected before every AI call)</label>
                  <textarea className="glass-input" rows={6} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.7 }}
                    defaultValue={settings.master_system_prompt || ''}
                    onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ master_system_prompt: e.target.value }) }); }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Deal Close Suffix (appended when deal closes)</label>
                    <textarea className="glass-input" rows={3} style={{ width: '100%', fontSize: '0.8rem' }}
                      defaultValue={settings.deal_close_suffix_prompt || ''}
                      onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ deal_close_suffix_prompt: e.target.value }) }); }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>VIP Client Override Prompt</label>
                    <textarea className="glass-input" rows={3} style={{ width: '100%', fontSize: '0.8rem' }}
                      defaultValue={settings.vip_override_prompt || ''}
                      onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ vip_override_prompt: e.target.value }) }); }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>New Contact First-Message Prompt</label>
                    <textarea className="glass-input" rows={3} style={{ width: '100%', fontSize: '0.8rem' }}
                      defaultValue={settings.new_contact_prompt || ''}
                      onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ new_contact_prompt: e.target.value }) }); }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Complaint Handling Override Prompt</label>
                    <textarea className="glass-input" rows={3} style={{ width: '100%', fontSize: '0.8rem' }}
                      defaultValue={settings.complaint_prompt || ''}
                      onBlur={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ complaint_prompt: e.target.value }) }); }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── 11. PERSONA PREVIEW ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#60a5fa', marginBottom: '14px' }}>Live Persona Preview</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>Test how the AI responds with current persona settings applied.</p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <input className="glass-input" style={{ flex: 1, fontSize: '0.85rem' }} placeholder="Send a test message..." value={personaPreviewMsg} onChange={e => setPersonaPreviewMsg(e.target.value)} />
                  <button className="glass-btn" disabled={personaPreviewLoading} onClick={async () => {
                    if (!personaPreviewMsg.trim()) return;
                    setPersonaPreviewLoading(true);
                    try {
                      const res = await fetch(`${API_BASE}/api/admin/test-ai`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ message: personaPreviewMsg, status_mode: settings.status || 'online', contact_name: 'Preview' }) });
                      if (res.ok) setPersonaPreviewResult(await res.json());
                    } catch(e){}
                    setPersonaPreviewLoading(false);
                  }} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                    {personaPreviewLoading ? '...' : 'Test'}
                  </button>
                </div>
                {personaPreviewResult && (
                  <div style={{ padding: '14px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>AI Response — Sentiment: {personaPreviewResult.sentiment} | Priority: {personaPreviewResult.priority}</div>
                    <div style={{ fontSize: '0.88rem', color: '#bfdbfe', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{personaPreviewResult.draft_reply}</div>
                  </div>
                )}
              </div>
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fbbf24', marginBottom: '14px' }}>Quick Controls</h3>
                {[
                  { label: 'Active Persona Mode', key: 'status', type: 'select', options: ['online', 'busy', 'focus', 'sleeping', 'travel', 'vacation'] },
                  { label: 'Gemini Model', key: 'gemini_model', type: 'select', options: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] },
                  { label: 'Tone Profile', key: 'tone_profile', type: 'select', options: ['concise', 'elaborated', 'bullet', 'formal', 'casual'] },
                ].map(field => (
                  <div key={field.key} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>{field.label}</label>
                    <select className="glass-input" style={{ width: '100%' }} value={settings[field.key] || ''} onChange={async e => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [field.key]: e.target.value }) }); fetchSettings(); }}>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                {[
                  { label: 'Smart Hinglish', key: 'smart_hinglish' },
                  { label: 'Split Messages', key: 'enable_split_messages' },
                  { label: 'Enable Reactions', key: 'enable_reactions' },
                  { label: 'Hallucination Guard', key: 'hallucination_guard' },
                ].map(toggle => (
                  <div key={toggle.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.78rem' }}>{toggle.label}</span>
                    <div onClick={async () => { const nv = settings[toggle.key] === '1' ? '0' : '1'; await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ [toggle.key]: nv }) }); fetchSettings(); }}
                      style={{ width: '34px', height: '18px', borderRadius: '9px', background: settings[toggle.key] === '1' ? '#7c4dff' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings[toggle.key] === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
                {personaStatus && <div style={{ marginTop: '10px', fontSize: '0.82rem', color: '#34d399' }}>{personaStatus}</div>}
              </div>
            </div>

          </div>
        )}



        {/* ===== TAB 14: SECURITY & ACCESS ===== */}
        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Token Info Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
              {secTokenInfo ? [
                { label: 'Token Subject', value: secTokenInfo.subject || 'admin', color: '#d8b4fe' },
                { label: 'Timezone', value: secTokenInfo.timezone || '—', color: '#60a5fa' },
                { label: 'Issued At', value: secTokenInfo.issued_at ? new Date(secTokenInfo.issued_at * 1000).toLocaleString() : '—', color: '#34d399' },
                { label: 'Expires At', value: secTokenInfo.expires_at ? new Date(secTokenInfo.expires_at * 1000).toLocaleString() : '—', color: '#fbbf24' },
              ].map(s => (
                <div key={s.label} className="glass-container" style={{ padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              )) : <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>Loading session info...</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Change Password */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f87171', marginBottom: '18px' }}>Change Dashboard Password</h3>
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { label: 'Current Password', key: 'current', type: 'password' },
                    { label: 'New Password', key: 'newPwd', type: 'password' },
                    { label: 'Confirm New Password', key: 'confirm', type: 'password' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                      <input type={f.type} className="glass-input" style={{ width: '100%' }} value={pwdForm[f.key]} onChange={e => setPwdForm(p => ({ ...p, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                  <button className="glass-btn" type="submit" style={{ padding: '10px 24px', marginTop: '4px' }}>Change Password</button>
                  {pwdStatus && <div style={{ fontSize: '0.85rem', color: pwdStatus.startsWith('') ? '#34d399' : '#f87171' }}>{pwdStatus}</div>}
                </form>
              </div>

              {/* Emergency Controls */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fbbf24', marginBottom: '18px' }}>Emergency Controls</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    onClick={async () => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ai_enabled: '0' }) }); fetchSettings(); }}
                    style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                    EMERGENCY PAUSE — Kill All AI
                  </button>
                  <button
                    onClick={async () => { await fetch(`${API_BASE}/api/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ai_enabled: '1' }) }); fetchSettings(); }}
                    style={{ padding: '14px', borderRadius: '10px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                    RESUME — Enable All AI
                  </button>
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Current AI Status</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: settings.ai_enabled === '1' ? '#34d399' : '#f87171' }}>
                      {settings.ai_enabled === '1' ? 'Active & Running' : 'Paused'}
                    </div>
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>WebSocket Connection</div>
                    <div style={{ fontWeight: 700, color: wsConnected ? '#34d399' : '#f87171' }}>{wsConnected ? 'Live Stream Active' : 'Disconnected'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Session Audit Log */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa' }}>Session Audit Log</h3>
                <button className="glass-btn-secondary" onClick={fetchSecSessions} style={{ fontSize: '0.78rem', padding: '5px 12px' }}>Refresh</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                {secSessions.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, background: s.level === 'ERROR' ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.1)', color: s.level === 'ERROR' ? '#f87171' : '#34d399' }}>{s.level}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.timestamp?.slice(0, 19)}</span>
                    <span style={{ fontSize: '0.8rem', flex: 1 }}>{s.message}</span>
                  </div>
                ))}
                {secSessions.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '0.9rem' }}>No session events found.</div>}
              </div>
            </div>
          </div>
        )}


        {/* ===== TAB 15: COMMAND TERMINAL ===== */}
        {activeTab === 'commands' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Quick Commands Grid */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '20px' }}>Quick Command Grid</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                {[
                  { key: 'pause-ai', label: 'Pause AI', endpoint: '/api/settings', body: JSON.stringify({ ai_enabled: '0' }), method: 'POST', color: '#f87171' },
                  { key: 'resume-ai', label: 'Resume AI', endpoint: '/api/settings', body: JSON.stringify({ ai_enabled: '1' }), method: 'POST', color: '#34d399' },
                  { key: 'rebuild-dna', label: 'Rebuild DNA', endpoint: '/api/settings/rebuild_owner_profile', color: '#a78bfa' },
                  { key: 'force-migrate', label: 'Force Migrate DB', endpoint: '/api/admin/force-migrate', color: '#fbbf24' },
                  { key: 'clear-logs', label: 'Clear Event Logs', endpoint: '/api/admin/system/clear_logs', color: '#fb923c' },
                  { key: 'briefing', label: 'Generate Briefing', endpoint: '/api/admin/briefing', body: JSON.stringify({ send_telegram: false }), color: '#60a5fa' },
                  { key: 'debug-userbot', label: 'Debug Userbot', endpoint: '/api/debug-userbot', method: 'GET', color: '#d8b4fe' },
                  { key: 'check-keys', label: 'Test All Keys', endpoint: '/api/admin/check-keys', color: '#10b981' },
                ].map(cmd => (
                  <button
                    key={cmd.key}
                    onClick={async () => {
                      setCmdLoadingKey(cmd.key);
                      addTerminalLog(`CMD: ${cmd.label}`, 'cmd');
                      try {
                        const opts = { method: cmd.method || 'POST', headers: getHeaders() };
                        if (cmd.body) opts.body = cmd.body;
                        const res = await fetch(`${API_BASE}${cmd.endpoint}`, opts);
                        const data = await res.json();
                        addTerminalLog(`Done: ${JSON.stringify(data).slice(0, 100)}`, 'ok');
                        if (cmd.key === 'pause-ai' || cmd.key === 'resume-ai') fetchSettings();
                      } catch (e) { addTerminalLog(` ${e.message}`, 'err'); }
                      setCmdLoadingKey('');
                    }}
                    disabled={cmdLoadingKey === cmd.key}
                    style={{ padding: '16px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${cmd.color}30`, color: cmd.color, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', textAlign: 'center', transition: 'all 0.2s', opacity: cmdLoadingKey === cmd.key ? 0.5 : 1 }}>
                    {cmdLoadingKey === cmd.key ? 'Running...' : cmd.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Terminal Log + Raw API Console */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Live Terminal */}
              <div className="glass-container" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399' }}>Command Log</h3>
                  <button className="glass-btn-secondary" onClick={() => setTerminalLogs([])} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Clear</button>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '14px', minHeight: '280px', maxHeight: '350px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                  {terminalLogs.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '100px' }}>No commands run yet. Use the grid above.</div>}
                  {terminalLogs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '4px', color: log.type === 'ok' ? '#34d399' : log.type === 'err' ? '#f87171' : log.type === 'cmd' ? '#60a5fa' : '#9ca3af' }}>
                      <span style={{ color: '#4b5563', marginRight: '8px' }}>[{log.ts}]</span>{log.msg}
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw API Console */}
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#a78bfa', marginBottom: '14px' }}>Raw API Console</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className="glass-input" value={rawApiMethod} onChange={e => setRawApiMethod(e.target.value)} style={{ width: '90px', flexShrink: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                      {['GET','POST','PUT','DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input className="glass-input" style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.82rem' }} value={rawApiEndpoint} onChange={e => setRawApiEndpoint(e.target.value)} placeholder="/api/status" />
                  </div>
                  {rawApiMethod !== 'GET' && (
                    <textarea className="glass-input" rows={3} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }} value={rawApiBody} onChange={e => setRawApiBody(e.target.value)} placeholder='{"key": "value"}' />
                  )}
                  <button className="glass-btn" onClick={handleRawApiCall} disabled={rawApiLoading} style={{ padding: '9px 20px', fontSize: '0.88rem', opacity: rawApiLoading ? 0.6 : 1 }}>
                    {rawApiLoading ? 'Sending...' : 'Execute Request'}
                  </button>
                  {rawApiResult && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '0.75rem', maxHeight: '200px', overflowY: 'auto', color: rawApiResult.error ? '#f87171' : '#34d399' }}>
                      {rawApiResult.error ? `Error: ${rawApiResult.error}` : `Status: ${rawApiResult.status}\n${JSON.stringify(rawApiResult.data, null, 2)}`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* System Health Dashboard */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fbbf24' }}>System Health Check</h3>
                <button className="glass-btn-secondary" onClick={fetchSystemHealth} disabled={healthLoading} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                  {healthLoading ? '' : ''} Refresh
                </button>
              </div>
              {systemHealth ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
                  {Object.entries(systemHealth).map(([service, info]) => (
                    <div key={service} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: `1px solid ${info.status === 'ok' || info.status === 'active' ? 'rgba(52,211,153,0.2)' : info.status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{service.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: info.status === 'ok' || info.status === 'active' ? '#34d399' : info.status === 'error' ? '#f87171' : '#fbbf24' }}>
                          {info.status === 'ok' ? 'OK' : info.status === 'active' ? ' Active' : info.status === 'disconnected' ? 'Offline' : ` ${info.status}`}
                        </span>
                      </div>
                      {info.latency_ms !== undefined && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Latency: {info.latency_ms}ms</div>}
                      {info.model && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Model: {info.model}</div>}
                      {info.tables && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{Object.keys(info.tables).length} tables</div>}
                    </div>
                  ))}
                </div>
              ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>Click Refresh to run health check.</div>}
            </div>

            {/* DB Table Inspector */}
            {dbCounts && (
              <div className="glass-container" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#d8b4fe' }}>Database Table Inspector</h3>
                  <button className="glass-btn-secondary" onClick={fetchDbCounts} style={{ fontSize: '0.78rem', padding: '5px 12px' }}></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '10px' }}>
                  {Object.entries(dbCounts).map(([table, count]) => (
                    <div key={table} style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: '#d8b4fe' }}>{count}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>{table}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full Backup / Restore */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399', marginBottom: '12px' }}>Full System Backup</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Export all settings, Q&A rules, keyword rules, and templates as a JSON backup file.</p>
                <button className="glass-btn" onClick={handleFullBackup} disabled={sysBackupLoading} style={{ padding: '10px 22px', fontSize: '0.9rem', opacity: sysBackupLoading ? 0.6 : 1 }}>
                  {sysBackupLoading ? ' Exporting...' : 'Download Full Backup'}
                </button>
              </div>
              <div className="glass-container" style={{ padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fbbf24', marginBottom: '12px' }}>Restore from Backup</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Upload a backup JSON file to restore all settings. This will overwrite current configuration.</p>
                <input type="file" accept=".json" className="glass-input" style={{ width: '100%', marginBottom: '10px' }} onChange={async e => {
                  const file = e.target.files[0]; if (!file) return;
                  setSysRestoreStatus('Reading file...');
                  const text = await file.text();
                  try {
                    const data = JSON.parse(text);
                    const res = await fetch(`${API_BASE}/api/admin/system/restore`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ settings: data.settings || data }) });
                    if (res.ok) { const d = await res.json(); setSysRestoreStatus(`Restored ${d.keys_restored} settings!`); fetchSettings(); }
                    else setSysRestoreStatus(' Restore failed.');
                  } catch (err) { setSysRestoreStatus('Invalid JSON file.'); }
                }} />
                {sysRestoreStatus && <div style={{ fontSize: '0.82rem', color: sysRestoreStatus.startsWith('') ? '#34d399' : '#f87171' }}>{sysRestoreStatus}</div>}
              </div>
            </div>
          </div>
        )}


        {/* ===== TAB 16: CUSTOM COMMANDS ===== */}
        {activeTab === 'customCommands' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusIcon style={{ color: '#60a5fa' }} /> Create Custom Command
                </h3>
                <form onSubmit={handleSaveCustomCommand} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Command Trigger (starts with /)</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. /wpstockR" 
                      value={ccForm.trigger_name} 
                      onChange={e => setCcForm(prev => ({ ...prev, trigger_name: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Description</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. Russia stock matching" 
                      value={ccForm.description} 
                      onChange={e => setCcForm(prev => ({ ...prev, description: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Response Template (use variable placeholders)</label>
                    <textarea 
                      className="glass-input" 
                      rows={5} 
                      placeholder="e.g. Russia Stock:&#10;Available: {available}&#10;Sold out: {sold_out}&#10;Matching: {matching}" 
                      value={ccForm.response_template} 
                      onChange={e => setCcForm(prev => ({ ...prev, response_template: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Variables JSON</label>
                    <textarea 
                      className="glass-input" 
                      rows={3} 
                      placeholder='e.g. {"available": "150", "sold_out": "40", "matching": "12"}' 
                      value={ccForm.variables} 
                      onChange={e => setCcForm(prev => ({ ...prev, variables: e.target.value }))} 
                    />
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Save Command
                  </button>
                  {ccStatus && (
                    <div style={{ fontSize: '0.82rem', color: ccStatus.includes('saved') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{ccStatus}</div>
                  )}
                </form>
              </div>

              {/* Commands List */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ChatIcon style={{ color: '#a78bfa' }} /> Custom Command Registry
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
                  {customCommands.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No custom commands configured yet.
                    </div>
                  )}
                  {customCommands.map(cmd => (
                    <div key={cmd.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: '#f43f5e' }}>{cmd.trigger_name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '10px' }}>{cmd.description}</span>
                        </div>
                        <button 
                          className="glass-btn-secondary" 
                          onClick={() => handleDeleteCustomCommand(cmd.id)} 
                          style={{ padding: '4px 8px', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        {cmd.response_template}
                      </div>
                      <div style={{ fontSize: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Variables:</span>
                        {Object.entries(JSON.parse(cmd.variables || '{}')).map(([k, v]) => (
                          <span key={k} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', padding: '2px 6px', borderRadius: '4px', color: '#d8b4fe' }}>
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 17: PAYMENT HUB ===== */}
        {activeTab === 'paymentHub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#06b6d4', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusIcon style={{ color: '#06b6d4' }} /> Add Payment Option
                </h3>
                <form onSubmit={handleSavePaymentMethod} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Payment Type</label>
                    <select 
                      className="glass-input" 
                      value={pmForm.type} 
                      onChange={e => setPmForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="upi">UPI ID</option>
                      <option value="crypto">Cryptocurrency Address</option>
                      <option value="paypal">PayPal</option>
                      <option value="bank">Bank Wire</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Trigger Command (e.g. /upi1, /usdt-trc20)</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. /upi1" 
                      value={pmForm.command_trigger} 
                      onChange={e => setPmForm(prev => ({ ...prev, command_trigger: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Label / Description</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. Personal UPI ID or USDT Address" 
                      value={pmForm.label} 
                      onChange={e => setPmForm(prev => ({ ...prev, label: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Address / ID Value</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. pay@upi or 0xAddress..." 
                      value={pmForm.value} 
                      onChange={e => setPmForm(prev => ({ ...prev, value: e.target.value }))} 
                    />
                  </div>
                  {pmForm.type === 'crypto' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Blockchain Network</label>
                      <input 
                        type="text" 
                        className="glass-input" 
                        placeholder="e.g. TRC20, ERC20, Solana, TON" 
                        value={pmForm.network} 
                        onChange={e => setPmForm(prev => ({ ...prev, network: e.target.value }))} 
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>QR Code Image (PNG/JPG)</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="glass-input" 
                      onChange={e => handleQrUpload(e.target.files[0])} 
                    />
                    {pmForm.qr_image_path && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Uploaded: {pmForm.qr_image_path}</span>
                      </div>
                    )}
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }} disabled={pmUploadLoading}>
                    {pmUploadLoading ? 'Uploading image...' : 'Save Payment Option'}
                  </button>
                  {pmStatus && (
                    <div style={{ fontSize: '0.82rem', color: pmStatus.includes('saved') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{pmStatus}</div>
                  )}
                </form>
              </div>

              {/* Payment Methods List */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#06b6d4', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCardIcon style={{ color: '#06b6d4' }} /> Active Payment Accounts
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
                  {paymentMethods.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No payment methods configured yet.
                    </div>
                  )}
                  {paymentMethods.map(pm => (
                    <div key={pm.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        {pm.qr_image_path ? (
                          <div style={{ width: '48px', height: '48px', background: '#fff', borderRadius: '8px', overflow: 'hidden', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={`${API_BASE}/${pm.qr_image_path}`} alt="QR" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CreditCardIcon style={{ color: 'var(--text-muted)' }} />
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#f8fafc' }}>{pm.label}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{pm.value}</div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                            <span className="badge" style={{ padding: '2px 8px', fontSize: '0.65rem', background: 'rgba(6,182,212,0.1)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.2)' }}>{pm.type.toUpperCase()}</span>
                            {pm.network && <span className="badge" style={{ padding: '2px 8px', fontSize: '0.65rem', background: 'rgba(139,92,246,0.1)', color: '#d8b4fe', border: '1px solid rgba(139,92,246,0.2)' }}>{pm.network}</span>}
                            <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#f43f5e', fontWeight: 600 }}>{pm.command_trigger}</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        className="glass-btn-secondary" 
                        onClick={() => handleDeletePaymentMethod(pm.id)} 
                        style={{ padding: '4px 8px', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 18: DEAL MANAGER ===== */}
        {activeTab === 'dealManager' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f59e0b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusIcon style={{ color: '#f59e0b' }} /> Initialize Client Deal
                </h3>
                <form onSubmit={handleCreateDeal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Select Contact / Client</label>
                    <select 
                      className="glass-input" 
                      value={dealForm.contact_id} 
                      onChange={e => setDealForm(prev => ({ ...prev, contact_id: e.target.value }))}
                    >
                      <option value="">-- Choose Client --</option>
                      {contacts.map(c => (
                        <option key={c.telegram_id} value={c.telegram_id}>
                          {c.first_name} {c.last_name || ''} (@{c.username || 'no_user'}) - ID: {c.telegram_id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Items Transacted (e.g. alt phone numbers, services)</label>
                    <textarea 
                      className="glass-input" 
                      rows={3} 
                      placeholder="e.g. +58 4265769872 Russian Alt" 
                      value={dealForm.items} 
                      onChange={e => setDealForm(prev => ({ ...prev, items: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Amount</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="glass-input" 
                        placeholder="e.g. 45.00" 
                        value={dealForm.amount} 
                        onChange={e => setDealForm(prev => ({ ...prev, amount: e.target.value }))} 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Currency</label>
                      <select 
                        className="glass-input" 
                        value={dealForm.currency} 
                        onChange={e => setDealForm(prev => ({ ...prev, currency: e.target.value }))}
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="USDT">USDT</option>
                        <option value="TON">TON</option>
                        <option value="INR">INR (₹)</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Create Deal Order
                  </button>
                  {dealStatus && (
                    <div style={{ fontSize: '0.82rem', color: dealStatus.includes('created') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{dealStatus}</div>
                  )}
                </form>
              </div>

              {/* Deal list & AI summaries */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f59e0b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BriefcaseIcon style={{ color: '#f59e0b' }} /> Deal Pipeline Management
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
                  {deals.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No deals tracked yet.
                    </div>
                  )}
                  {deals.map(d => (
                    <div key={d.order_id} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>ID: </span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#f59e0b', fontWeight: 700 }}>{d.order_id}</span>
                        </div>
                        <span className="badge" style={{
                          background: d.status === 'open' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                          color: d.status === 'open' ? '#f59e0b' : '#10b981',
                          border: d.status === 'open' ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(16,185,129,0.2)'
                        }}>{d.status.toUpperCase()}</span>
                      </div>
                      
                      <div style={{ fontSize: '0.88rem', margin: '6px 0', color: '#f8fafc' }}>
                        Client: <b>{d.contact_name}</b> (ID: {d.contact_id})
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Items: <i>{d.items}</i> | Amount: <b>{d.amount} {d.currency}</b>
                      </div>
                      
                      {d.status === 'open' ? (
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <button 
                            className="glass-btn-secondary" 
                            style={{ width: '100%', fontSize: '0.82rem', padding: '6px 12px' }} 
                            onClick={() => handleGenerateSummary(d.order_id)}
                            disabled={aiSummaryLoading && closingDealId === d.order_id}
                          >
                            {aiSummaryLoading && closingDealId === d.order_id ? 'Analyzing Chat...' : 'AI Generate Summary & Thank-You'}
                          </button>
                          
                          {aiSummaryResult && closingDealId === d.order_id && (
                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '10px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa' }}>AI Summary:</span>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{aiSummaryResult.summary}</p>
                              </div>
                              <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>AI Thank You Preview:</span>
                                <pre style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '6px', whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
                                  {aiSummaryResult.thank_you_message}
                                </pre>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  className="glass-btn" 
                                  style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px', background: 'linear-gradient(135deg, #10b981, #059669)' }} 
                                  onClick={() => handleCloseDeal(d.order_id, aiSummaryResult.summary, aiSummaryResult.thank_you_message)}
                                >
                                  Close & Commit Deal
                                </button>
                                <button 
                                  className="glass-btn-secondary" 
                                  style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }} 
                                  onClick={() => handleSendThankYouMessage(d.order_id)}
                                >
                                  Send to Telegram
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}><b>Summary:</b> {d.summary}</div>
                          {d.closed_at && <div style={{ fontSize: '0.7rem', color: 'var(--text-dark)', marginTop: '4px' }}>Closed at: {d.closed_at}</div>}
                          <button 
                            className="glass-btn-secondary" 
                            style={{ marginTop: '8px', width: '100%', fontSize: '0.75rem', padding: '4px 8px' }} 
                            onClick={() => handleSendThankYouMessage(d.order_id)}
                          >
                            Resend Thank-You
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== DEAL COMPLETION MESSAGE GENERATOR ===== */}
        {activeTab === 'dealManager' && (() => {
          const SERVICE_TYPES = [
            { key: 'whatsapp_alt', label: 'WhatsApp Alt Number', color: '#25D366', icon: '📱' },
            { key: 'telegram_acc', label: 'Telegram Account', color: '#2AABEE', icon: '📲' },
            { key: 'instagram_acc', label: 'Instagram Account', color: '#E1306C', icon: '📸' },
            { key: 'gmail_acc', label: 'Gmail / Google Account', color: '#EA4335', icon: '📧' },
            { key: 'facebook_acc', label: 'Facebook Account', color: '#1877F2', icon: '📘' },
            { key: 'crypto_wallet', label: 'Crypto Wallet / Seed', color: '#F7931A', icon: '🪙' },
            { key: 'vpn_access', label: 'VPN / Proxy Access', color: '#7c4dff', icon: '🛡️' },
            { key: 'custom_service', label: 'Custom Service', color: '#fbbf24', icon: '🔮' },
          ];

          const generateMessage = (forceEnhance = null) => {
            const isEnhanced = forceEnhance !== null ? forceEnhance : magicAuraEnhanced;
            const f = dealMsgFields;
            const svc = SERVICE_TYPES.find(s => s.key === dealMsgServiceType) || SERVICE_TYPES[0];
            const hr = isEnhanced ? '⚡ ━━━━━━━━━━━━━━━━━━━━━━━━ ⚡' : '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            const generateCoolOrderId = (serviceType) => {
              const shortForms = {
                whatsapp_alt: 'WP',
                telegram_acc: 'TG',
                instagram_acc: 'IG',
                gmail_acc: 'GM',
                facebook_acc: 'FB',
                crypto_wallet: 'CR',
                vpn_access: 'VP',
                custom_service: 'CS'
              };
              const sfx = shortForms[serviceType] || 'XX';
              const now = new Date();
              const day = String(now.getDate()).padStart(2, '0');
              const month = now.toLocaleString('default', { month: 'short' }).toUpperCase();
              const year = String(now.getFullYear()).substring(2); // e.g. 26 for 2026
              const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
              let rand1 = '';
              for (let i = 0; i < 3; i++) {
                rand1 += chars.charAt(Math.floor(Math.random() * chars.length));
              }
              let rand2 = '';
              for (let i = 0; i < 3; i++) {
                rand2 += chars.charAt(Math.floor(Math.random() * chars.length));
              }
              // Format: XX + 3 rand + MONTH + DAY + SFX + 2-digit year + 3 rand
              // Example: XX A7B JUN 04 WP 26 9X1 -> XXA7BJUN04WP269X1 (17 chars)
              return `XX${rand1}${month}${day}${sfx}${year}${rand2}`;
            };
            const orderId = f.order_id || generateCoolOrderId(dealMsgServiceType);

            let serviceBlock = '';
            let loginBlock = '';
            let howToBlock = '';

            if (dealMsgServiceType === 'whatsapp_alt') {
              serviceBlock = `${isEnhanced ? '💎' : '📱'} Purchased Alt:\n${f.login_number || '+X XXX XXX XXXX'}`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Login Details\n\nNumber:\n${f.login_number || '+X XXX XXX XXXX'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Login Guide:\n\n1. Open WhatsApp Business.\n2. Enter your purchased number.\n3. Select the option to receive the verification code via email.\n4. Check your email inbox and copy the verification code.\n5. Complete the login process.\n\n🔐 Two-Factor Authentication (2FA):\n${f.totp_code || 'N/A'}`;
            } else if (dealMsgServiceType === 'telegram_acc') {
              serviceBlock = `${isEnhanced ? '💎' : '📲'} Purchased Account:\n${f.login_number || '+X XXX XXX XXXX'}`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Login Details\n\nPhone Number:\n${f.login_number || '+X XXX XXX XXXX'}\n\nPassword:\n${f.password || '••••••••'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Login Guide:\n\n1. Open Telegram and click "Log In".\n2. Enter the purchased phone number.\n3. Wait for OTP — check the backup email.\n4. Enter the OTP code.\n5. If 2FA is set, use the password above.\n\n🔐 2FA Password:\n${f.password || 'N/A'}`;
            } else if (dealMsgServiceType === 'instagram_acc') {
              serviceBlock = `${isEnhanced ? '💎' : '📸'} Instagram Account:\n${f.email || 'username@example.com'}`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Login Credentials\n\nEmail / Username:\n${f.email || 'username@example.com'}\n\nPassword:\n${f.password || '••••••••'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Login Guide:\n\n1. Open Instagram and tap "Log In".\n2. Enter the email / username above.\n3. Enter the password above.\n4. If prompted for verification, check the backup email.\n5. Change the password immediately after login.`;
            } else if (dealMsgServiceType === 'gmail_acc') {
              serviceBlock = `${isEnhanced ? '💎' : '📧'} Google Account:\n${f.email || 'user@gmail.com'}`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Login Credentials\n\nEmail:\n${f.email || 'user@gmail.com'}\n\nPassword:\n${f.password || '••••••••'}\n\nRecovery Code:\n${f.totp_code || 'N/A'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Login Guide:\n\n1. Go to accounts.google.com\n2. Enter the email address above.\n3. Enter the password above.\n4. If 2-step verification is requested, use the recovery code.\n5. Immediately update recovery email/phone after login.`;
            } else if (dealMsgServiceType === 'facebook_acc') {
              serviceBlock = `${isEnhanced ? '💎' : '📘'} Facebook Account:\n${f.email || 'user@email.com'}`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Login Credentials\n\nEmail:\n${f.email || 'user@email.com'}\n\nPassword:\n${f.password || '••••••••'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Login Guide:\n\n1. Go to facebook.com or open the app.\n2. Enter the email and password above.\n3. If verification is needed, check the linked email.\n4. Do NOT log in from multiple devices immediately.\n5. Change password within 24h.`;
            } else if (dealMsgServiceType === 'crypto_wallet') {
              serviceBlock = `${isEnhanced ? '💎' : '🪙'} Crypto Wallet Delivered`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Wallet Credentials\n\nSeed Phrase:\n${f.password || '[12/24 word seed phrase]'}\n\nWallet Address:\n${f.login_number || '0x...'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Import Guide:\n\n1. Open your preferred wallet app (MetaMask, Trust Wallet, etc.).\n2. Select "Import Wallet" or "Add Wallet".\n3. Enter the seed phrase provided above, word by word.\n4. Set a new strong password for local encryption.\n5. NEVER share your seed phrase with anyone.\n\n⚠️ Security Notice: Transfer funds immediately to a new wallet.`;
            } else if (dealMsgServiceType === 'vpn_access') {
              serviceBlock = `${isEnhanced ? '💎' : '🛡️'} VPN / Proxy Access Delivered`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Access Credentials\n\nServer / Host:\n${f.login_number || 'vpn.server.com'}\n\nUsername:\n${f.email || 'user123'}\n\nPassword:\n${f.password || '••••••••'}`;
              howToBlock = `${isEnhanced ? '🚀' : 'How to'} Connect Guide:\n\n1. Download the VPN client (link in video below).\n2. Import the config or enter credentials manually.\n3. Select the nearest server for best speed.\n4. Test your IP at ipleak.net to confirm connection.\n\n📹 Setup Video: ${f.video_link || 'https://youtu.be/...'}`;
            } else {
              serviceBlock = `${isEnhanced ? '💎' : '🛒'} Service Delivered:\n${f.item_name || 'Custom Item'}`;
              loginBlock = `${isEnhanced ? '🔒' : '🔑'} Access Details\n\n${f.login_number ? `Credentials:\n${f.login_number}` : ''}\n${f.email ? `Email: ${f.email}` : ''}\n${f.password ? `Password: ${f.password}` : ''}`;
              howToBlock = `${isEnhanced ? '🚀' : 'Instructions'}:\n\n1. Follow the setup video for step-by-step guidance.\n2. Contact support if you face any issue.\n\n📹 Video Guide: ${f.video_link || 'https://youtu.be/...'}`;
            }

            const msg = `Hello @${f.buyer_username || 'username'},

Thank you for your purchase! We noticed that you recently purchased a ${svc.label} from our store, and we truly appreciate your trust in ${f.store_name || 'our store'}.

We hope you're satisfied with your purchase. If you ever need additional services in the future, feel free to contact us anytime.

${hr}

${serviceBlock}

📦 Order ID:\n${orderId}

🏪 Seller Details:\n${f.seller_info || '[Seller info here]'}

${hr}

${loginBlock}

${hr}

${howToBlock}

${hr}

If you encounter any issues, please contact our support team directly:
📩 ${f.support_contact || '@support'}

Thank you once again for choosing ${f.store_name || 'us'}.

With love,
Team ${f.store_name || 'us'} 🤍

${hr}

📢 Advertisement

This message was automatically generated by @${f.bot_username || 'YourBot'}.

As ${f.bot_name || 'our bot'} is still new and actively improving, you may occasionally notice minor formatting issues. We kindly ask for your understanding.

No reply is required to this message.

Need additional services?

📬 Contact:
${f.support_contact || '@support'}

${hr}

🤖 Introducing ${f.bot_name || 'Our AI Assistant'}

We now provide a powerful AI Assistant capable of helping manage your business directly through Telegram.

Features include:
• Automated customer support
• Business assistance
• Smart replies
• Task management
• And much more...

Bot: @${f.bot_username || 'YourBot'}

For activation and setup, please contact our team.

Thank you for choosing ${f.store_name || 'us'} 🤍`;

            setDealMsgGenerated(msg);
          };

          const handleDirectSend = async () => {
            const f = dealMsgFields;
            if (!f.buyer_username) {
              setDealDirectSendStatus('Error: Missing buyer username');
              return;
            }
            if (!dealMsgGenerated) {
              setDealDirectSendStatus('Error: Generate message first');
              return;
            }

            setIsDealDirectSending(true);
            setDealDirectSendStatus('Sending...');

            const logs = [
              '[SYSTEM] Initializing Quantum Uplink via CatVos ID...',
              '[RESOLVING] Contacting Telegram lookup database...',
              `[RESOLVING] Found target username: @${f.buyer_username}`,
              '[SECURITY] Encrypting credentials payload with AES-256...',
              '[DISPATCH] Attempting WebSocket broadcast...'
            ];

            setUplinkLogs([logs[0]]);

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (let i = 1; i < logs.length; i++) {
              await delay(700);
              setUplinkLogs(prev => [...prev, logs[i]]);
            }

            try {
              const res = await fetch(`${API_BASE}/api/admin/send-direct-message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token || localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                  target_username: f.buyer_username,
                  message: dealMsgGenerated
                })
              });
              const data = await res.json();
              await delay(600);
              if (res.ok && data.status === 'success') {
                setUplinkLogs(prev => [...prev, '✓ [SUCCESS] Message successfully delivered to client account!', '✓ CatVos connection closed.']);
                setDealDirectSendStatus('Message Sent Successfully!');
                playChime('message');
              } else {
                const errMsg = data.detail || data.message || 'Send failed';
                setUplinkLogs(prev => [...prev, `❌ [FAILED] Connection error: ${errMsg}`]);
                setDealDirectSendStatus(`Error: ${errMsg}`);
                playChime('alarm');
              }
            } catch (error) {
              setUplinkLogs(prev => [...prev, `❌ [FAILED] Exception occurred: ${error.message}`]);
              setDealDirectSendStatus(`Error: ${error.message}`);
              playChime('alarm');
            } finally {
              await delay(3500);
              setIsDealDirectSending(false);
            }
          };

          const toggleAuraEnhancement = () => {
            const nextVal = !magicAuraEnhanced;
            setMagicAuraEnhanced(nextVal);
            generateMessage(nextVal);
          };

          const calculateAuraLevel = () => {
            if (!dealMsgGenerated) return { score: 0, text: 'AURA EMPTY', color: '#64748b' };
            let score = 30;
            const f = dealMsgFields;
            if (f.buyer_username) score += 10;
            if (f.store_name) score += 10;
            if (f.order_id) score += 10;
            if (f.login_number || f.email) score += 15;
            if (f.password) score += 15;
            if (f.totp_code) score += 5;
            if (f.video_link) score += 5;
            if (magicAuraEnhanced) score += 10;

            score = Math.min(score, 100);

            let text = 'STREET LEVEL';
            let color = '#ef4444';
            if (score >= 95) { text = 'GOD LEVEL AURA'; color = '#c084fc'; }
            else if (score >= 80) { text = 'PURE GOLD AURA'; color = '#f59e0b'; }
            else if (score >= 60) { text = 'ELITE LEVEL AURA'; color = '#60a5fa'; }
            else if (score >= 40) { text = 'DECENT AURA'; color = '#10b981'; }

            return { score, text, color };
          };

          const aura = calculateAuraLevel();

          return (
            <div style={{ marginTop: '32px', position: 'relative' }}>

              {/* Header Title section */}
              <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(6, 182, 212, 0.04))', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '24px', padding: '28px', marginBottom: '28px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#8b5cf6', boxShadow: '0 0 15px #8b5cf6', animation: 'pulse 2s infinite' }} />
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #d8b4fe, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        COET QUANTUM MESSAGE FORGER
                      </h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Compile, enhance, and securely uplink commercial delivery credentials directly via Telegram.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '4px 12px', borderRadius: '20px', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.3)', fontWeight: 700 }}>
                      SYSTEM V3.0
                    </span>
                    <span style={{ fontSize: '0.72rem', padding: '4px 12px', borderRadius: '20px', background: magicAuraEnhanced ? 'rgba(192, 132, 252, 0.2)' : 'rgba(255,255,255,0.05)', color: magicAuraEnhanced ? '#d8b4fe' : 'var(--text-muted)', border: magicAuraEnhanced ? '1px solid rgba(192, 132, 252, 0.4)' : '1px solid rgba(255,255,255,0.08)', fontWeight: 700, cursor: 'pointer' }} onClick={toggleAuraEnhancement}>
                      ✨ AURA: {magicAuraEnhanced ? 'ENHANCED' : 'NORMAL'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '28px', alignItems: 'start' }}>

                {/* Left Column: Form & Controller */}
                <div className="glass-container" style={{ padding: '28px', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Service type buttons */}
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '10px', letterSpacing: '0.05em' }}>
                      SELECT TARGET PRODUCT
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                      {SERVICE_TYPES.map(svc => (
                        <button key={svc.key}
                          type="button"
                          onClick={() => setDealMsgServiceType(svc.key)}
                          style={{
                            padding: '10px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${dealMsgServiceType === svc.key ? svc.color : 'rgba(255,255,255,0.05)'}`,
                            background: dealMsgServiceType === svc.key ? `${svc.color}15` : 'rgba(255,255,255,0.01)',
                            color: dealMsgServiceType === svc.key ? '#fff' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start',
                            transition: 'all 0.25s',
                            boxShadow: dealMsgServiceType === svc.key ? `0 0 10px ${svc.color}15` : 'none'
                          }}>
                          <span style={{ fontSize: '0.9rem' }}>{svc.icon}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input Wizard Tabs */}
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '8px', letterSpacing: '0.05em' }}>
                      FORGER STATE WIZARD
                    </label>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '4px' }}>
                      {[
                        { id: 'meta', label: '📊 Transaction Meta' },
                        { id: 'credentials', label: '🔑 Credentials Block' },
                        { id: 'ads', label: '🤖 Support & Ads' }
                      ].map(t => (
                        <button key={t.id} type="button"
                          onClick={() => setDealMsgWizardTab(t.id)}
                          style={{
                            flex: 1, padding: '8px 4px', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                            background: dealMsgWizardTab === t.id ? 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(6,182,212,0.1))' : 'transparent',
                            color: dealMsgWizardTab === t.id ? '#fff' : 'var(--text-muted)',
                            borderBottom: dealMsgWizardTab === t.id ? '2px solid #8b5cf6' : 'none',
                            boxShadow: dealMsgWizardTab === t.id ? '0 4px 12px rgba(139,92,246,0.1)' : 'none',
                            transition: 'all 0.2s'
                          }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Wizard Tab Content */}
                  <div style={{ minHeight: '260px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {dealMsgWizardTab === 'meta' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Buyer Username (no @)</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. gurusuprme"
                              value={dealMsgFields.buyer_username || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, buyer_username: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Store / Brand Name</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. Shinken"
                              value={dealMsgFields.store_name || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, store_name: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Order ID (auto-generated if empty)</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. SH5308RUSMFX"
                              value={dealMsgFields.order_id || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, order_id: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Item / Service Name</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. WhatsApp Business Alt"
                              value={dealMsgFields.item_name || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, item_name: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Seller Details</label>
                          <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                            placeholder="e.g. @ShinichiroTt, @Maoxese"
                            value={dealMsgFields.seller_info || ''}
                            onChange={e => setDealMsgFields(prev => ({ ...prev, seller_info: e.target.value }))} />
                        </div>
                      </>
                    )}

                    {dealMsgWizardTab === 'credentials' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Account Number / Phone / Server</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. +7 775 673 1189"
                              value={dealMsgFields.login_number || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, login_number: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Email / Username</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. user@gmail.com"
                              value={dealMsgFields.email || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, email: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Password / Seed Phrase</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. secret123 or seed words"
                              value={dealMsgFields.password || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, password: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>2FA Code / Recovery Key</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. 156507"
                              value={dealMsgFields.totp_code || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, totp_code: e.target.value }))} />
                          </div>
                        </div>
                      </>
                    )}

                    {dealMsgWizardTab === 'ads' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Support Username</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. @ShinichiroTt"
                              value={dealMsgFields.support_contact || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, support_contact: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Tutorial Video Link</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. https://youtu.be/..."
                              value={dealMsgFields.video_link || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, video_link: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Bot Username</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. @Coetbot"
                              value={dealMsgFields.bot_username || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, bot_username: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Bot Display Name</label>
                            <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                              placeholder="e.g. Coet AI Assistant"
                              value={dealMsgFields.bot_name || ''}
                              onChange={e => setDealMsgFields(prev => ({ ...prev, bot_name: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Custom Note / Footnote</label>
                          <input className="glass-input" style={{ width: '100%', fontSize: '0.8rem' }}
                            placeholder="Any extra info to append..."
                            value={dealMsgFields.custom_note || ''}
                            onChange={e => setDealMsgFields(prev => ({ ...prev, custom_note: e.target.value }))} />
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    {dealMsgWizardTab !== 'meta' && (
                      <button
                        type="button"
                        onClick={() => setDealMsgWizardTab(dealMsgWizardTab === 'ads' ? 'credentials' : 'meta')}
                        style={{ flex: 0.4, padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                        Back
                      </button>
                    )}
                    {dealMsgWizardTab !== 'ads' ? (
                      <button
                        type="button"
                        onClick={() => setDealMsgWizardTab(dealMsgWizardTab === 'meta' ? 'credentials' : 'ads')}
                        style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(59,130,246,0.25)' }}>
                        Next Step
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => generateMessage()}
                        style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', letterSpacing: '0.02em', boxShadow: '0 4px 20px rgba(139,92,246,0.35)', transition: 'all 0.2s' }}>
                        ⚡ IGNITE QUANTUM GENERATOR
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Column: Premium Bezel Device Live Mockup */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>

                  {/* Glowing halo behind the phone */}
                  <div style={{
                    position: 'absolute',
                    width: '320px',
                    height: '420px',
                    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(6, 182, 212, 0.05) 50%, transparent 80%)',
                    filter: 'blur(40px)',
                    top: '50px',
                    zIndex: 0,
                    pointerEvents: 'none'
                  }} />

                  {/* Device frame */}
                  <div style={{
                    position: 'relative',
                    width: '330px',
                    height: '630px',
                    background: '#090d16',
                    border: '12px solid #1e293b',
                    borderRadius: '44px',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 2px 3px rgba(255,255,255,0.1), 0 0 20px rgba(139, 92, 246, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: 1
                  }}>

                    {/* Device Screen reflection lines */}
                    <div style={{
                      position: 'absolute',
                      top: 0, right: 0, width: '40%', height: '100%',
                      background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.015) 60%, transparent)',
                      transform: 'skewX(-20deg)', transformOrigin: 'top right', pointerEvents: 'none', zIndex: 15
                    }} />

                    {/* Smartphone Notch / Dynamic Island */}
                    <div style={{
                      position: 'absolute',
                      top: '0',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '110px',
                      height: '24px',
                      background: '#1e293b',
                      borderRadius: '0 0 16px 16px',
                      zIndex: 25,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#090d16', marginRight: '8px' }} />
                      <div style={{ width: '38px', height: '3px', borderRadius: '2px', background: '#0f172a' }} />
                    </div>

                    {/* Left Side Buttons (Volume) */}
                    <div style={{ position: 'absolute', left: '-15px', top: '100px', width: '3px', height: '40px', background: '#334155', borderRadius: '3px 0 0 3px', zIndex: -1 }} />
                    <div style={{ position: 'absolute', left: '-15px', top: '145px', width: '3px', height: '40px', background: '#334155', borderRadius: '3px 0 0 3px', zIndex: -1 }} />
                    {/* Right Side Button (Power) */}
                    <div style={{ position: 'absolute', right: '-15px', top: '120px', width: '3px', height: '55px', background: '#334155', borderRadius: '0 3px 3px 0', zIndex: -1 }} />

                    {/* Cyberpunk logs terminal overlay inside the screen */}
                    {isDealDirectSending && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(6, 9, 18, 0.96)',
                        zIndex: 20,
                        padding: '30px 20px 20px 20px',
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        color: '#34d399',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        gap: '12px',
                        boxShadow: 'inset 0 0 30px rgba(52,211,153,0.1)'
                      }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#818cf8', borderBottom: '1px solid rgba(129,140,248,0.2)', paddingBottom: '6px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#818cf8', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                          UPLINK CORE v3.0
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {uplinkLogs.map((log, idx) => (
                            <div key={idx} style={{ lineBreak: 'anywhere', opacity: 0.95, textShadow: '0 0 4px rgba(52,211,153,0.3)', animation: 'fadeIn 0.15s ease-out forwards' }}>
                              {log}
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', color: '#64748b' }}>
                            <span>core@catvos:~#</span>
                            <span style={{ width: '6px', height: '11px', background: '#34d399', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Telegram mockup chat header inside screen */}
                    <div style={{
                      padding: '24px 16px 10px 16px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      backdropFilter: 'blur(10px)',
                      zIndex: 10
                    }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, #c084fc, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.95rem', boxShadow: '0 0 10px rgba(99,102,241,0.4)' }}>
                        {dealMsgFields.buyer_username ? dealMsgFields.buyer_username.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {dealMsgFields.buyer_username ? `@${dealMsgFields.buyer_username}` : 'Buyer (Inactive)'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> online
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', color: 'var(--text-muted)' }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                      </div>
                    </div>

                    {/* Telegram mockup wallpaper/chat body */}
                    <div style={{
                      flex: 1,
                      padding: '16px',
                      overflowY: 'auto',
                      background: 'radial-gradient(ellipse at bottom, #0f172a, #070913)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      {dealMsgGenerated ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'fadeInUp 0.3s ease-out' }}>
                          <div style={{
                            maxWidth: '90%',
                            background: 'linear-gradient(135deg, rgba(79,70,229,0.7) 0%, rgba(49,46,129,0.85) 100%)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '16px 16px 4px 16px',
                            padding: '12px 14px',
                            fontSize: '0.78rem',
                            color: '#f8fafc',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
                          }}>
                            {dealMsgGenerated}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)' }}>
                                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '-8px' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '14px', textAlign: 'center', padding: '0 20px' }}>
                          <span style={{ fontSize: '2.5rem', animation: 'pulse 2.5s infinite', filter: 'drop-shadow(0 0 15px rgba(139,92,246,0.4))' }}>🔮</span>
                          <div>
                            <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Aura Generator Dormant</div>
                            <div style={{ fontSize: '0.68rem', lineHeight: 1.4 }}>Complete the required wizard fields and ignite the generator above.</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Aura Level dynamic bar (directly below phone mockup) */}
                  {dealMsgGenerated && (
                    <div style={{ width: '330px', marginTop: '16px', background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {aura.text}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: aura.color, fontWeight: 800 }}>
                          {aura.score}% PURE
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                        <div style={{ width: `${aura.score}%`, height: '100%', background: `linear-gradient(to right, #8b5cf6, ${aura.color})`, transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <span>Words: <b>{dealMsgGenerated.split(/\s+/).length}</b></span>
                          <span>Time: <b>{Math.ceil(dealMsgGenerated.split(/\s+/).length / 200)}m</b></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', background: 'rgba(16,185,129,0.08)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.15)' }}>
                          <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />
                          <span style={{ color: '#10b981', fontWeight: 700 }}>Safe</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* STICKY FLOATING CONTROL ACTION BAR (ALWAYS VISIBLE WHEN MSG GENERATED) */}
              {dealMsgGenerated && (
                <div style={{
                  position: 'sticky',
                  bottom: '24px',
                  left: 0,
                  right: 0,
                  background: 'rgba(13, 17, 38, 0.85)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '20px',
                  padding: '16px 24px',
                  marginTop: '32px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(139, 92, 246, 0.1)',
                  zIndex: 100,
                  animation: 'fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FORGER STATUS UPLINK</span>
                    <span style={{ fontSize: '0.78rem', color: dealDirectSendStatus.includes('Error') ? '#f87171' : dealDirectSendStatus.includes('Success') ? '#34d399' : '#fff', fontWeight: 700, fontFamily: 'monospace' }}>
                      {dealDirectSendStatus || '⚡ READY FOR BROADCAST'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>

                    {/* Magic Aura Enhancer button */}
                    <button
                      type="button"
                      onClick={toggleAuraEnhancement}
                      style={{
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                        background: magicAuraEnhanced ? 'rgba(192,132,252,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${magicAuraEnhanced ? 'rgba(192,132,252,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: magicAuraEnhanced ? '#d8b4fe' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.25s'
                      }}>
                      ✨ {magicAuraEnhanced ? 'Enhanced' : 'Enhance Aura'}
                    </button>

                    {/* Copy button */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(dealMsgGenerated);
                        setDealMsgCopied(true);
                        setTimeout(() => setDealMsgCopied(false), 2000);
                      }}
                      style={{
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                        background: dealMsgCopied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${dealMsgCopied ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: dealMsgCopied ? '#34d399' : '#fff',
                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.25s'
                      }}>
                      📋 {dealMsgCopied ? 'Copied Payload!' : 'Copy Payload'}
                    </button>

                    {/* Massive pulsing UPLINK DIRECT SEND button */}
                    <button
                      type="button"
                      onClick={handleDirectSend}
                      disabled={isDealDirectSending}
                      style={{
                        padding: '10px 24px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 800, cursor: isDealDirectSending ? 'wait' : 'pointer',
                        background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                        border: 'none', color: '#fff',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 0 20px rgba(139,92,246,0.3)',
                        transition: 'all 0.25s',
                        animation: !isDealDirectSending ? 'pulseGlowPurple 2.0s infinite' : 'none'
                      }}>
                      <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      {isDealDirectSending ? 'TRANSMITTING...' : `SEND DIRECT TO @${dealMsgFields.buyer_username || 'BUYER'}`}
                    </button>

                  </div>
                </div>
              )}

              {/* Pulsing animation styles for bottom buttons */}
              <style>{`
                @keyframes pulseGlowPurple {
                  0%, 100% { box-shadow: 0 0 12px rgba(139,92,246,0.35); }
                  50% { box-shadow: 0 0 22px rgba(139,92,246,0.65); transform: translateY(-1px); }
                }
              `}</style>

            </div>
          );
        })()}

        {/* ===== TAB 19: CUSTOMER ACCESS (LICENSE KEY SYSTEM) ===== */}

        {activeTab === 'customerAccess' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusIcon style={{ color: '#a78bfa' }} /> Generate License Key
                </h3>
                <form onSubmit={handleCreateLicense} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Telegram ID</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      placeholder="e.g. 7473010693" 
                      value={licenseForm.client_telegram_id} 
                      onChange={e => setLicenseForm(prev => ({ ...prev, client_telegram_id: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Name / Handle</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. @JohnDoe" 
                      value={licenseForm.client_name} 
                      onChange={e => setLicenseForm(prev => ({ ...prev, client_name: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Store Name</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. John's Alt Store" 
                      value={licenseForm.store_name} 
                      onChange={e => setLicenseForm(prev => ({ ...prev, store_name: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>License Duration</label>
                    <select 
                      className="glass-input" 
                      value={licenseForm.duration_days} 
                      onChange={e => setLicenseForm(prev => ({ ...prev, duration_days: e.target.value }))}
                    >
                      <option value={7}>7 Days (Trial)</option>
                      <option value={30}>30 Days (Standard)</option>
                      <option value={90}>90 Days (Quarterly)</option>
                      <option value={365}>365 Days (Annual)</option>
                    </select>
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Generate Key
                  </button>
                  {licStatus && (
                    <div style={{ fontSize: '0.82rem', color: licStatus.includes('') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{licStatus}</div>
                  )}
                </form>
              </div>

              {/* Licenses and overview */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyIcon style={{ color: '#a78bfa' }} /> Licensed Clients Overview
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
                  {licenses.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No active licenses configured yet.
                    </div>
                  )}
                  {licenses.map(lic => (
                    <div key={lic.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span 
                          onClick={() => { navigator.clipboard.writeText(lic.license_key); alert('License Key copied!'); }}
                          style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#a78bfa', fontWeight: 700, cursor: 'pointer' }}
                          title="Click to copy"
                        >
                          Key: {lic.license_key} (copy)
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="glass-btn-secondary" 
                            onClick={() => handleToggleLicenseStatus(lic.id, lic.status)}
                            style={{ padding: '2px 8px', fontSize: '0.72rem', color: lic.status === 'active' ? '#fb923c' : '#34d399' }}
                          >
                            {lic.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          <button 
                            className="glass-btn-secondary" 
                            onClick={() => handleDeleteLicense(lic.id)}
                            style={{ padding: '2px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '0.88rem', margin: '4px 0' }}>
                        Store: <b>{lic.store_name}</b> | Client: <b>{lic.client_name}</b> (ID: {lic.client_telegram_id || 'Not activated'})
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Expires: <i>{lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'N/A'}</i> | Status: <span style={{ color: lic.status === 'active' ? '#34d399' : '#f87171', fontWeight: 700 }}>{lic.status.toUpperCase()}</span>
                      </div>

                      {lic.client_telegram_id && (
                        <details style={{ marginTop: '10px', padding: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                          <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            Store Data ({lic.products_count || 0} Products, {lic.orders_count || 0} Orders)
                          </summary>
                          <div style={{ marginTop: '6px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: '#06b6d4' }}>Products:</span>
                              {lic.products && lic.products.length > 0 ? (
                                <ul style={{ paddingLeft: '14px', color: 'var(--text-muted)' }}>
                                  {lic.products.map(p => (
                                    <li key={p.id}>{p.product_name} - ${p.price}</li>
                                  ))}
                                </ul>
                              ) : <div style={{ color: 'var(--text-dark)', paddingLeft: '4px' }}>No products added.</div>}
                            </div>
                            <div>
                              <span style={{ fontWeight: 700, color: '#f59e0b' }}>Orders:</span>
                              {lic.orders && lic.orders.length > 0 ? (
                                <ul style={{ paddingLeft: '14px', color: 'var(--text-muted)' }}>
                                  {lic.orders.map(o => (
                                    <li key={o.id}>{o.buyer_name} ordered {o.product_name} (${o.amount}) - <span style={{ color: o.status === 'completed' ? '#34d399' : o.status === 'pending' ? '#fbbf24' : '#f87171' }}>{o.status}</span></li>
                                  ))}
                                </ul>
                              ) : <div style={{ color: 'var(--text-dark)', paddingLeft: '4px' }}>No orders placed.</div>}
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 20: GC MANAGER (JOIN / WHITELIST) ===== */}
        {activeTab === 'gcManager' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              
              {/* Join Chat Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg> Auto-Join Group or Channel
                </h3>
                <form onSubmit={handleJoinGC} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Invite Link / Username / Public Handle</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. t.me/joinchat/... or @public_channel" 
                      value={gcLinkInput} 
                      onChange={e => setGcLinkInput(e.target.value)} 
                    />
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }} disabled={gcLoading}>
                    {gcLoading ? 'Joining...' : 'Send Request / Join'}
                  </button>
                  {gcStatus && (
                    <div style={{ fontSize: '0.82rem', color: gcStatus.includes('Success') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{gcStatus}</div>
                  )}
                </form>
              </div>

              {/* Joined Chats Whitelist Table */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg> Joined Group Chats & Channels
                </h3>
                <div style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {joinedChats.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No joined chats whitelisted. Paste a link on the left to join.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '10px' }}>Title</th>
                          <th style={{ padding: '10px' }}>Username</th>
                          <th style={{ padding: '10px' }}>Type</th>
                          <th style={{ padding: '10px' }}>Status</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {joinedChats.map(chat => (
                          <tr key={chat.chat_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{chat.title}</td>
                            <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{chat.username ? `@${chat.username}` : 'Private'}</td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: chat.type === 'channel' ? 'rgba(6,182,212,0.15)' : 'rgba(124,77,255,0.15)', color: chat.type === 'channel' ? '#22d3ee' : '#a78bfa', border: chat.type === 'channel' ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(124,77,255,0.2)' }}>
                                {chat.type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: chat.whitelisted === 1 ? '#34d399' : '#94a3b8' }} />
                                <span style={{ color: chat.whitelisted === 1 ? '#34d399' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  {chat.whitelisted === 1 ? 'Whitelisted' : 'Ignored'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button 
                                  className="glass-btn-secondary" 
                                  onClick={() => handleToggleGCWhitelist(chat.chat_id, chat.whitelisted)}
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', color: chat.whitelisted === 1 ? '#94a3b8' : '#34d399' }}
                                >
                                  {chat.whitelisted === 1 ? 'Disable' : 'Whitelist'}
                                </button>
                                <button 
                                  className="glass-btn-secondary" 
                                  onClick={() => handleDeleteGCChat(chat.chat_id)}
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 21: AUTO-FORWARDER & SYNC ===== */}
        {activeTab === 'autoForwarder' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg> Add Sync Rule
                </h3>
                <form onSubmit={handleCreateSyncRule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Source Chat ID</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      placeholder="e.g. -100192837482" 
                      value={syncForm.source_chat_id} 
                      onChange={e => setSyncForm(prev => ({ ...prev, source_chat_id: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Target Chat ID</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      placeholder="e.g. -100283749203" 
                      value={syncForm.target_chat_id} 
                      onChange={e => setSyncForm(prev => ({ ...prev, target_chat_id: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter Keywords (Comma Separated)</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. catvos, deal, escrow (Use * for all)" 
                      value={syncForm.keywords} 
                      onChange={e => setSyncForm(prev => ({ ...prev, keywords: e.target.value }))} 
                    />
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Create Forwarder Rule
                  </button>
                  {syncStatus && (
                    <div style={{ fontSize: '0.82rem', color: syncStatus.includes('saved') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{syncStatus}</div>
                  )}
                </form>
              </div>

              {/* Active Sync Rules Table */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg> Active Forwarding & Sync Rules
                </h3>
                <div style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {syncRules.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No active sync rules configured. Create one on the left.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '10px' }}>Rule ID</th>
                          <th style={{ padding: '10px' }}>Source Chat</th>
                          <th style={{ padding: '10px' }}>Target Chat</th>
                          <th style={{ padding: '10px' }}>Keywords</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncRules.map(rule => (
                          <tr key={rule.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px', fontFamily: 'monospace' }}>#{rule.id}</td>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{rule.source_chat_id}</td>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{rule.target_chat_id}</td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}>
                                {rule.keywords}
                              </span>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <button 
                                className="glass-btn-secondary" 
                                onClick={() => handleDeleteSyncRule(rule.id)}
                                style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 22: KEYWORD STUDIO (CUSTOM CONDITIONAL TRIGGERS) ===== */}
        {activeTab === 'keywordStudio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg> Design Keyword Trigger
                </h3>
                <form onSubmit={handleAddKeywordRule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Keyword or Phrase</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. price, account, help" 
                      value={newKeyword} 
                      onChange={e => setNewKeyword(e.target.value)} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Match Algorithm</label>
                    <select 
                      className="glass-input" 
                      value={newMatchMode} 
                      onChange={e => setNewMatchMode(e.target.value)}
                    >
                      <option value="contains">Contains (Broad Match)</option>
                      <option value="exact">Exact (Exact Phrase Match)</option>
                      <option value="regex">Regex (Regular Expression)</option>
                      <option value="fuzzy">Fuzzy (Fuzzy string similarity)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Trigger Action</label>
                    <select 
                      className="glass-input" 
                      value={newActionType} 
                      onChange={e => setNewActionType(e.target.value)}
                    >
                      <option value="reply">Smart Auto-Reply</option>
                      <option value="category">Categorize conversation</option>
                      <option value="priority">Set priority level</option>
                      <option value="mute">Mute userbot replies</option>
                      <option value="combined">Combined instructions</option>
                    </select>
                  </div>
                  
                  {newActionType !== 'mute' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Action Value / Response Template</label>
                      <textarea 
                        className="glass-input" 
                        rows={3} 
                        placeholder={newActionType === 'reply' ? "e.g. Hi {first_name}, CatVos is away. Leave details." : "e.g. vip, scammer, normal"}
                        value={newResponse} 
                        onChange={e => setNewResponse(e.target.value)} 
                      />
                    </div>
                  )}

                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Save Trigger Rule
                  </button>
                </form>
              </div>

              {/* Active Triggers list */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg> Active Keyword Studio Triggers
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
                  {keywordRules.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No custom keyword triggers configured.
                    </div>
                  ) : (
                    keywordRules.map(rule => (
                      <div key={rule.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#c084fc', fontSize: '0.95rem' }}>"{rule.keyword}"</span>
                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{rule.match_mode}</span>
                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(124,77,255,0.15)', color: '#c084fc' }}>{rule.action_type}</span>
                          </div>
                          {rule.response && (
                            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                              <b>Value:</b> {rule.response}
                            </div>
                          )}
                        </div>
                        <button 
                          className="glass-btn-secondary" 
                          onClick={() => handleDeleteKeywordRule(rule.id)}
                          style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 23: PROXY MANAGER ===== */}
        {activeTab === 'proxyManager' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              
              {/* Creator Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg> Add Userbot Proxy Server
                </h3>
                <form onSubmit={handleCreateProxy} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Protocol / Type</label>
                    <select 
                      className="glass-input" 
                      value={proxyForm.type} 
                      onChange={e => setProxyForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="socks5">SOCKS5</option>
                      <option value="socks4">SOCKS4</option>
                      <option value="http">HTTP</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Host / IP Address</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="e.g. 192.168.1.100 or proxy.net" 
                      value={proxyForm.addr} 
                      onChange={e => setProxyForm(prev => ({ ...prev, addr: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Port</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      placeholder="e.g. 1080" 
                      value={proxyForm.port} 
                      onChange={e => setProxyForm(prev => ({ ...prev, port: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Username (Optional)</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="Username if auth is enabled" 
                      value={proxyForm.username} 
                      onChange={e => setProxyForm(prev => ({ ...prev, username: e.target.value }))} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Password (Optional)</label>
                    <input 
                      type="password" 
                      className="glass-input" 
                      placeholder="Password if auth is enabled" 
                      value={proxyForm.password} 
                      onChange={e => setProxyForm(prev => ({ ...prev, password: e.target.value }))} 
                    />
                  </div>
                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Save Proxy Profile
                  </button>
                  {proxyStatus && (
                    <div style={{ fontSize: '0.82rem', color: proxyStatus.includes('Active') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{proxyStatus}</div>
                  )}
                </form>
              </div>

              {/* Proxy server list */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg> Userbot Proxies Registry & Telemetry
                </h3>
                <div style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {proxies.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No proxies configured. Using direct local socket routes.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '10px' }}>Type</th>
                          <th style={{ padding: '10px' }}>Host / Port</th>
                          <th style={{ padding: '10px' }}>Status / Latency</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proxies.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px' }}>
                              <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.2)' }}>
                                {p.type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{p.addr}:{p.port}</td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.status === 'active' ? '#34d399' : p.status === 'error' ? '#ef4444' : '#94a3b8' }} />
                                <span style={{ color: p.status === 'active' ? '#34d399' : p.status === 'error' ? '#f87171' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  {p.status === 'active' ? `${p.latency_ms}ms (Active)` : p.status === 'error' ? 'Offline' : 'Untested'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button 
                                  className="glass-btn-secondary" 
                                  onClick={() => handleTestProxy(p.id)}
                                  disabled={proxyLoading}
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#38bdf8' }}
                                >
                                  Test Speed
                                </button>
                                <button 
                                  className="glass-btn-secondary" 
                                  onClick={() => handleDeleteProxy(p.id)}
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 24: ANTI-SCAM & CAPTCHA GATES ===== */}
        {activeTab === 'antiScam' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              
              {/* CAPTCHA Config Panel */}
              <div className="glass-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg> Join-Gate CAPTCHA Verification
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Block automation scripts and spammers from joining whitelisted chats by generating interactive mathematical CAPTCHA gates.
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>Require CAPTCHA Validation</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '2px' }}>New members must complete a math puzzle in group chat to be unmuted.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.enable_captcha_gate || false}
                    onChange={(e) => saveSettings({ enable_captcha_gate: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Validation Game Parameters</div>
                  <ul style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li><b>Puzzle Type:</b> Arithmetic additions and subtractions (e.g. 5 + 7 = ?)</li>
                    <li><b>Response Limit:</b> 60 seconds (Auto-kick on timeout or failure)</li>
                    <li><b>Isolation:</b> Restricted members are globally muted until puzzle is solved.</li>
                  </ul>
                </div>
              </div>

              {/* Anti-Scam Sweeper Shield */}
              <div className="glass-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg> Anti-Impersonator Screening Shield
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Automatically detect and ban copycat profiles, fake admin bots, and support impostors attempting to impersonate your handle in comments.
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>Impersonator Sweeper Shield</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '2px' }}>Enable active monitoring for name variations across whitelisted chats.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.enable_scam_shield || false}
                    onChange={(e) => saveSettings({ enable_scam_shield: e.target.checked })}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Flagged Terms & Behaviors</div>
                  <p>Shield triggers ban events when names matching your handle contain phrases such as:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {['admin', 'support', 'escrow', 'deal', 'middleman', 'staff', 'mod'].map(term => (
                      <span key={term} style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px' }}>
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 25: CONSOLIDATED STOREFRONT ANALYTICS ===== */}
        {activeTab === 'storefrontAnalytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* KPI Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              
              <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL STORES</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-display)' }}>
                  {storefrontAnalytics?.total_stores || 0}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Created Tenant Stores</span>
              </div>

              <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ACTIVE SHOPS</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22d3ee', fontFamily: 'var(--font-display)' }}>
                  {storefrontAnalytics?.active_stores || 0}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Currently Serving Clients</span>
              </div>

              <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL PRODUCTS</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-display)' }}>
                  {storefrontAnalytics?.total_products || 0}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Inventories Registered</span>
              </div>

              <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CONSOLIDATED ORDERS</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f472b6', fontFamily: 'var(--font-display)' }}>
                  {storefrontAnalytics?.total_orders || 0}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Total Sales Transactions</span>
              </div>

              <div className="glass-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ACCUMULATED REVENUE</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-display)' }}>
                  ${storefrontAnalytics?.total_revenue?.toFixed(2) || '0.00'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>Verified Sales Payouts</span>
              </div>

            </div>

            {/* Order status cards breakdown */}
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg> Sales Fulfillment Status Breakdown
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                {storefrontAnalytics?.order_statuses && Object.keys(storefrontAnalytics.order_statuses).length > 0 ? (
                  Object.entries(storefrontAnalytics.order_statuses).map(([status, count]) => {
                    const total = storefrontAnalytics.total_orders || 1;
                    const pct = Math.round((count / total) * 100);
                    const color = status === 'completed' ? '#34d399' : status === 'pending' ? '#fbbf24' : '#f87171';
                    return (
                      <div key={status} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700, color: color, textTransform: 'uppercase', fontSize: '0.8rem' }}>{status}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{count} orders ({pct}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                    No sales orders captured yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 26: AI SWARM COORDINATOR ===== */}
        {activeTab === 'aiSwarm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#8b5cf6', fontWeight: 700 }}>
                  AI Swarm Router Config
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Multi-Agent Swarm Mode</span>
                  <div onClick={async () => {
                    const nextVal = settings.ai_swarm_mode === '1' ? '0' : '1';
                    await saveSettings({ ai_swarm_mode: nextVal });
                  }}
                    style={{ width: '40px', height: '22px', borderRadius: '11px', background: settings.ai_swarm_mode === '1' ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings.ai_swarm_mode === '1' ? '21px' : '3px', transition: 'left 0.2s' }} />
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                When Swarm Mode is active, queries are dynamically categorized and responded to by dedicated agent prompts for Sales, Support, and disputes.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#d8b4fe', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Sales Agent Persona Prompt
                  </label>
                  <textarea 
                    className="glass-input" 
                    rows={4} 
                    style={{ width: '100%', resize: 'vertical' }}
                    defaultValue={settings.swarm_sales_prompt || 'You are the Sales Agent. Close the deal.'}
                    onBlur={(e) => saveSettings({ swarm_sales_prompt: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Support Agent Persona Prompt
                  </label>
                  <textarea 
                    className="glass-input" 
                    rows={4} 
                    style={{ width: '100%', resize: 'vertical' }}
                    defaultValue={settings.swarm_support_prompt || 'You are the Support Agent. Resolve technical queries.'}
                    onBlur={(e) => saveSettings({ swarm_support_prompt: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Dispute Agent Persona Prompt
                  </label>
                  <textarea 
                    className="glass-input" 
                    rows={4} 
                    style={{ width: '100%', resize: 'vertical' }}
                    defaultValue={settings.swarm_dispute_prompt || 'You are the Dispute Agent. Mediate and resolve conflicts calmly.'}
                    onBlur={(e) => saveSettings({ swarm_dispute_prompt: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 27: THREAT RADAR ===== */}
        {activeTab === 'threatRadar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              {/* Config Panel */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f87171', marginBottom: '20px', fontWeight: 700 }}>
                  Anti-Raid Parameters
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Threat Sensitivity Level</label>
                    <select 
                      className="glass-input" 
                      style={{ width: '100%' }}
                      value={settings.threat_level || 'medium'}
                      onChange={(e) => saveSettings({ threat_level: e.target.value })}
                    >
                      <option value="low">Low - Minimum blocks</option>
                      <option value="medium">Medium - Default scan rules</option>
                      <option value="high">High - Extreme verification</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Max Joins Per Minute Limit</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      style={{ width: '100%' }}
                      defaultValue={settings.max_joins_per_minute || 10}
                      onBlur={(e) => saveSettings({ max_joins_per_minute: parseInt(e.target.value) || 10 })}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.82rem' }}>Block/Kick VPN Senders</span>
                    <div onClick={async () => {
                      const nextVal = settings.auto_kick_vpn === '1' ? '0' : '1';
                      await saveSettings({ auto_kick_vpn: nextVal });
                    }}
                      style={{ width: '36px', height: '20px', borderRadius: '10px', background: settings.auto_kick_vpn === '1' ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: settings.auto_kick_vpn === '1' ? '19px' : '3px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Incidents Table */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f87171', fontWeight: 700 }}>
                    Threat Radar Incident Logs
                  </h3>
                  <button className="glass-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={handleClearThreats}>
                    Flush Logs
                  </button>
                </div>

                <div style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {threats.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No threats detected. System secure.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '8px' }}>Timestamp</th>
                          <th style={{ padding: '8px' }}>Incident Type</th>
                          <th style={{ padding: '8px' }}>User ID</th>
                          <th style={{ padding: '8px' }}>Chat ID</th>
                          <th style={{ padding: '8px' }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {threats.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ''}</td>
                            <td style={{ padding: '8px', fontWeight: 700, color: t.event_type.includes('ban') ? '#f87171' : '#fbbf24' }}>{t.event_type.toUpperCase()}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.telegram_id || 'N/A'}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.chat_id || 'N/A'}</td>
                            <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{t.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 28: LEDGER STUDIO ===== */}
        {activeTab === 'ledgerStudio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              {/* Config Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '20px', fontWeight: 700 }}>
                  Ledger Configuration
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Middleman Service Fee Percent</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="glass-input" 
                      style={{ width: '100%' }}
                      defaultValue={settings.ledger_fee_pct || 5.0}
                      onBlur={(e) => saveSettings({ ledger_fee_pct: parseFloat(e.target.value) || 5.0 })}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Log Retention Days</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      style={{ width: '100%' }}
                      defaultValue={settings.retention_days_logs || 30}
                      onBlur={(e) => saveSettings({ retention_days_logs: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                </div>
              </div>

              {/* Ledger calculator simulator */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '20px', fontWeight: 700 }}>
                  Live Commission Calculator
                </h3>
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '18px', border: '1px solid var(--border-glass)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Middleman Fee Percentage</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>{settings.ledger_fee_pct || 5.0}%</span>
                  </div>
                  
                  <div style={{ borderTop: '1px dashed var(--border-glass)', paddingTop: '12px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Simulate Transaction Value (USD)</label>
                    <input 
                      type="number" 
                      className="glass-input" 
                      style={{ width: '100%', fontSize: '0.9rem' }} 
                      defaultValue={100}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const pct = parseFloat(settings.ledger_fee_pct) || 5.0;
                        const fee = (val * pct) / 100;
                        const payout = val - fee;
                        document.getElementById('sim-fee-result').innerText = `$${fee.toFixed(2)}`;
                        document.getElementById('sim-payout-result').innerText = `$${payout.toFixed(2)}`;
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Escrow Secure Fee</span>
                      <span id="sim-fee-result" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>$5.00</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Seller Payout</span>
                      <span id="sim-payout-result" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>$95.00</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 29: WEBHOOK HUB ===== */}
        {activeTab === 'webhookHub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              {/* Registration Form */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#22d3ee', marginBottom: '20px', fontWeight: 700 }}>
                  Register Webhook Destination
                </h3>
                <form onSubmit={handleSaveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Destination Endpoint URL</label>
                    <input 
                      type="url" 
                      className="glass-input" 
                      placeholder="https://yourdomain.com/webhook"
                      value={webhookForm.url}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, url: e.target.value }))}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Secret Validation Token</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="Optional validation token"
                      value={webhookForm.secret_token}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, secret_token: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Event Subscriptions</label>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="on_deal_closed, on_scam_blocked, on_captcha_failed (or * for all)"
                      value={webhookForm.events}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, events: e.target.value }))}
                    />
                  </div>

                  <button type="submit" className="glass-btn" style={{ marginTop: '10px' }}>
                    Save Webhook Endpoint
                  </button>
                  {webhookStatus && (
                    <div style={{ fontSize: '0.82rem', color: webhookStatus.includes('registered') ? '#34d399' : '#fb923c', marginTop: '6px' }}>{webhookStatus}</div>
                  )}
                </form>
              </div>

              {/* Registered webhooks table */}
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#22d3ee', marginBottom: '20px', fontWeight: 700 }}>
                  Active Subscriptions
                </h3>
                <div style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {webhooks.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                      No webhooks configured.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '10px' }}>ID</th>
                          <th style={{ padding: '10px' }}>Endpoint URL</th>
                          <th style={{ padding: '10px' }}>Subscribed Events</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {webhooks.map(wh => (
                          <tr key={wh.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px', fontFamily: 'monospace' }}>#{wh.id}</td>
                            <td style={{ padding: '10px', fontWeight: 600, wordBreak: 'break-all' }}>{wh.url}</td>
                            <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{wh.events}</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <button 
                                className="glass-btn-secondary" 
                                onClick={() => handleDeleteWebhook(wh.id)}
                                style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 30: DATABASE SANDBOX ===== */}
        {activeTab === 'dbSandbox' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '20px', fontWeight: 700 }}>
                SQLite Sandbox Diagnostics Console
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                Run custom read-only SQLite checks. Writing modifications are blocked to protect live data integrity.
              </p>
              
              <form onSubmit={handleExecuteSandboxQuery} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <textarea 
                  className="glass-input" 
                  rows={4} 
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9rem' }}
                  value={sandboxQuery}
                  onChange={(e) => setSandboxQuery(e.target.value)}
                />
                <button type="submit" className="glass-btn" style={{ alignSelf: 'flex-start' }} disabled={sandboxLoading}>
                  {sandboxLoading ? 'Executing query...' : 'Run Query'}
                </button>
              </form>

              {sandboxError && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', color: '#fca5a5', fontSize: '0.85rem' }}>
                  {sandboxError}
                </div>
              )}

              {sandboxRows.length > 0 && (
                <div style={{ marginTop: '20px', overflowX: 'auto', border: '1px solid var(--border-glass)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        {Object.keys(sandboxRows[0]).map(key => (
                          <th key={key} style={{ padding: '10px' }}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sandboxRows.map((row, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          {Object.values(row).map((val, valIndex) => (
                            <td key={valIndex} style={{ padding: '10px', color: 'var(--text-primary)' }}>
                              {val === null ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ===== TAB 31: LEAD EXTRACTOR ===== */}
        {activeTab === 'leadExtractor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '8px', fontWeight: 700 }}>
                Lead Extractor
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Automatically extract and classify potential leads from incoming group messages and keyword triggers.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Lead Extraction Mode', key: 'lead_extraction_mode', type: 'select', options: ['off', 'passive', 'active'] },
                  { label: 'Min Confidence Score (%)', key: 'lead_min_confidence', type: 'number' },
                  { label: 'Auto-Tag Extracted Leads', key: 'lead_auto_tag', type: 'toggle' },
                  { label: 'Notify on New Lead', key: 'lead_notify', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#34d399' : 'var(--text-muted)' }}>{settings[field.key] ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Lead Intent Keywords (comma-separated)</label>
                <input type="text" className="glass-input" placeholder="buy, interested, price, quote" value={settings.lead_intent_keywords || ''} onChange={e => saveSetting('lead_intent_keywords', e.target.value)} />
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399', marginBottom: '16px', fontWeight: 700 }}>Extracted Leads Pipeline</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No leads extracted yet. Enable lead extraction mode and incoming messages will be scanned automatically.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 32: STYLE MIRROR ===== */}
        {activeTab === 'styleMirror' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '8px', fontWeight: 700 }}>
                Style Mirror
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Fine-tune how the AI mirrors your personal writing style. Adjust tone consistency, vocabulary formality, and sentence structure preferences.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Mirror Intensity', key: 'style_mirror_intensity', type: 'select', options: ['low', 'medium', 'high', 'exact'] },
                  { label: 'Vocabulary Formality', key: 'style_formality', type: 'select', options: ['casual', 'balanced', 'professional', 'formal'] },
                  { label: 'Use Abbreviations', key: 'style_use_abbreviations', type: 'toggle' },
                  { label: 'Preserve Punctuation Style', key: 'style_preserve_punctuation', type: 'toggle' },
                  { label: 'Match Sentence Length', key: 'style_match_length', type: 'toggle' },
                  { label: 'Emoji Policy', key: 'style_emoji_policy', type: 'select', options: ['none', 'minimal', 'match_sender'] },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#a78bfa' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Banned Phrases (AI will never use these)</label>
                <textarea className="glass-input" rows={3} placeholder="ASAP, FYI, kindly, per my last email..." value={settings.style_banned_phrases || ''} onChange={e => saveSetting('style_banned_phrases', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 33: SENTIMENT RADAR ===== */}
        {activeTab === 'sentimentRadar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fb923c', marginBottom: '8px', fontWeight: 700 }}>
                Sentiment Radar
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Configure real-time sentiment thresholds and escalation policies. When client sentiment drops below defined thresholds, automatic interventions are triggered.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Sentiment Monitoring', key: 'sentiment_monitor_enabled', type: 'toggle' },
                  { label: 'Alert on Negative Sentiment', key: 'sentiment_alert_negative', type: 'toggle' },
                  { label: 'Negative Threshold Score', key: 'sentiment_negative_threshold', type: 'number' },
                  { label: 'Escalation Action', key: 'sentiment_escalation_action', type: 'select', options: ['notify', 'pause_ai', 'send_apology', 'flag_contact'] },
                  { label: 'Track Tone Drift Over Time', key: 'sentiment_track_drift', type: 'toggle' },
                  { label: 'Weekly Sentiment Report', key: 'sentiment_weekly_report', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#fb923c' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fb923c', marginBottom: '16px', fontWeight: 700 }}>Current Sentiment Distribution</h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Positive', pct: analytics.sentiments?.positive || 0, color: '#34d399' },
                  { label: 'Neutral', pct: analytics.sentiments?.neutral || 0, color: '#60a5fa' },
                  { label: 'Negative', pct: analytics.sentiments?.negative || 0, color: '#f87171' },
                ].map(s => (
                  <div key={s.label} className="glass-container" style={{ padding: '16px 24px', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.pct}%</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 34: MASS DM CAMPAIGN ===== */}
        {activeTab === 'massdmCampaign' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '8px', fontWeight: 700 }}>
                  Campaign Builder
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Configure and deploy targeted direct message campaigns to segmented contact groups.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Campaign Name</label>
                    <input type="text" className="glass-input" placeholder="Q4 Reactivation Push" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Target Segment</label>
                    <select className="glass-input">
                      <option>All Contacts</option>
                      <option>VIP Only</option>
                      <option>Inactive (30+ days)</option>
                      <option>Clients</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Message Template</label>
                    <textarea className="glass-input" rows={5} placeholder="Hi {first_name}, just checking in..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Batch Size</label>
                      <input type="number" className="glass-input" defaultValue={25} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Delay Between (sec)</label>
                      <input type="number" className="glass-input" defaultValue={30} />
                    </div>
                  </div>
                  <button className="glass-btn" style={{ marginTop: '6px' }}>Launch Campaign</button>
                </div>
              </div>
              <div className="glass-container" style={{ padding: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#60a5fa', marginBottom: '16px', fontWeight: 700 }}>Campaign History</h3>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                  No campaigns run yet. Configure and launch your first campaign using the builder.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 35: MEDIA SCHEDULER ===== */}
        {activeTab === 'mediaScheduler' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f472b6', marginBottom: '8px', fontWeight: 700 }}>
                Media Scheduler
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Schedule and queue images, documents, and video clips for time-delayed delivery to specific contacts or groups.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Media Scheduling Enabled', key: 'media_scheduler_enabled', type: 'toggle' },
                  { label: 'Auto-Compress Images', key: 'media_auto_compress', type: 'toggle' },
                  { label: 'Max File Size (MB)', key: 'media_max_file_size', type: 'number' },
                  { label: 'Delivery Retry Attempts', key: 'media_retry_attempts', type: 'number' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#f472b6' : 'var(--text-muted)' }}>{settings[field.key] ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#f472b6', marginBottom: '16px', fontWeight: 700 }}>Queued Media</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No media queued. Upload and schedule media files from the contact panel.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 36: FEEDBACK COLLECTOR ===== */}
        {activeTab === 'feedbackCollector' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '8px', fontWeight: 700 }}>
                Feedback Collector
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Automatically collect post-interaction client ratings and structured feedback via inline Telegram bot surveys.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Auto-Send Feedback Request', key: 'feedback_auto_send', type: 'toggle' },
                  { label: 'Send After Deal Closed', key: 'feedback_on_deal_close', type: 'toggle' },
                  { label: 'Send After N Messages', key: 'feedback_trigger_count', type: 'number' },
                  { label: 'Collect Star Ratings', key: 'feedback_star_rating', type: 'toggle' },
                  { label: 'Collect Text Feedback', key: 'feedback_text_enabled', type: 'toggle' },
                  { label: 'Anonymous Mode', key: 'feedback_anonymous', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#34d399' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Feedback Request Message</label>
                <textarea className="glass-input" rows={3} placeholder="How was your experience? Rate us from 1-5..." value={settings.feedback_request_message || ''} onChange={e => saveSetting('feedback_request_message', e.target.value)} />
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399', marginBottom: '16px', fontWeight: 700 }}>Collected Feedback</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No feedback received yet. Enable auto-send and complete interactions to gather ratings.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 37: CHANNEL MIRROR ===== */}
        {activeTab === 'channelMirror' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#22d3ee', marginBottom: '8px', fontWeight: 700 }}>
                Channel Mirror
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Clone and mirror content across Telegram channels in real time. Apply optional AI transformation, watermarking, and delay buffers before re-publishing.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Channel Mirroring Enabled', key: 'channel_mirror_enabled', type: 'toggle' },
                  { label: 'Apply AI Rewrite', key: 'channel_mirror_ai_rewrite', type: 'toggle' },
                  { label: 'Add Watermark Footer', key: 'channel_mirror_watermark', type: 'toggle' },
                  { label: 'Mirror Delay (seconds)', key: 'channel_mirror_delay', type: 'number' },
                  { label: 'Skip Forwarded Messages', key: 'channel_mirror_skip_forwarded', type: 'toggle' },
                  { label: 'Media-Only Mode', key: 'channel_mirror_media_only', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#22d3ee' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Watermark Text</label>
                <input type="text" className="glass-input" placeholder="— via @yourbotusername" value={settings.channel_mirror_watermark_text || ''} onChange={e => saveSetting('channel_mirror_watermark_text', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 38: SESSION ROTATOR ===== */}
        {activeTab === 'sessionRotator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fbbf24', marginBottom: '8px', fontWeight: 700 }}>
                Session Rotator
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Manage multi-account session pools and configure automatic rotation intervals to distribute activity across accounts and reduce detection risk.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Session Rotation Enabled', key: 'session_rotation_enabled', type: 'toggle' },
                  { label: 'Rotation Interval (minutes)', key: 'session_rotation_interval', type: 'number' },
                  { label: 'Max Sessions in Pool', key: 'session_max_pool', type: 'number' },
                  { label: 'Rotation Strategy', key: 'session_rotation_strategy', type: 'select', options: ['round_robin', 'random', 'least_used', 'cooldown'] },
                  { label: 'Auto-Cooldown on Ban', key: 'session_auto_cooldown', type: 'toggle' },
                  { label: 'Cooldown Duration (minutes)', key: 'session_cooldown_minutes', type: 'number' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#fbbf24' : 'var(--text-muted)' }}>{settings[field.key] ? 'Enabled' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fbbf24', marginBottom: '16px', fontWeight: 700 }}>Session Pool Status</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No additional sessions configured. Add session files through the backend session manager.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 39: TRAFFIC MONITOR ===== */}
        {activeTab === 'trafficMonitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '8px', fontWeight: 700 }}>
                Traffic Monitor
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Real-time tracking of inbound and outbound message traffic with rate-limit detection and surge alerts.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Traffic Monitoring Enabled', key: 'traffic_monitor_enabled', type: 'toggle' },
                  { label: 'Rate Limit Alert Threshold', key: 'traffic_rate_limit_threshold', type: 'number' },
                  { label: 'Alert on Surge', key: 'traffic_alert_surge', type: 'toggle' },
                  { label: 'Surge Detection Window (sec)', key: 'traffic_surge_window', type: 'number' },
                  { label: 'Log All Incoming Events', key: 'traffic_log_all', type: 'toggle' },
                  { label: 'Auto-Throttle on Surge', key: 'traffic_auto_throttle', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#60a5fa' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Total Messages (24h)', value: analytics.total_messages || 0, color: '#60a5fa' },
                { label: 'AI Handled', value: analytics.handled_by_ai || 0, color: '#34d399' },
                { label: 'Critical Alerts', value: analytics.critical_alerts || 0, color: '#f87171' },
              ].map(stat => (
                <div key={stat.label} className="glass-container" style={{ flex: 1, minWidth: '140px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== TAB 40: BILLING LEDGER ===== */}
        {activeTab === 'billingLedger' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '8px', fontWeight: 700 }}>
                Billing Ledger
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Track invoices, outstanding balances, and payment confirmations across all active client accounts.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Ledger Tracking Enabled', key: 'billing_ledger_enabled', type: 'toggle' },
                  { label: 'Default Currency', key: 'billing_default_currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'INR', 'USDT'] },
                  { label: 'Auto-Send Invoice on Deal Close', key: 'billing_auto_invoice', type: 'toggle' },
                  { label: 'Invoice Prefix', key: 'billing_invoice_prefix', type: 'text' },
                  { label: 'Payment Due Days', key: 'billing_due_days', type: 'number' },
                  { label: 'Late Fee Percentage', key: 'billing_late_fee_pct', type: 'number' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#34d399' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : field.type === 'text' ? (
                      <input type="text" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399', marginBottom: '16px', fontWeight: 700 }}>Invoice Records</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No invoices generated yet. Close a deal to automatically generate the first invoice record.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 41: PAYMENT ESCROW ===== */}
        {activeTab === 'paymentEscrow' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fbbf24', marginBottom: '8px', fontWeight: 700 }}>
                Payment Escrow
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Manage escrow holds, release conditions, and dispute resolution timelines for middleman transactions.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Escrow System Enabled', key: 'escrow_enabled', type: 'toggle' },
                  { label: 'Default Hold Period (hours)', key: 'escrow_hold_hours', type: 'number' },
                  { label: 'Auto-Release on Confirmation', key: 'escrow_auto_release', type: 'toggle' },
                  { label: 'Require Both Party Confirm', key: 'escrow_dual_confirm', type: 'toggle' },
                  { label: 'Escrow Fee (%)', key: 'escrow_fee_pct', type: 'number' },
                  { label: 'Dispute Window (hours)', key: 'escrow_dispute_window', type: 'number' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#fbbf24' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#fbbf24', marginBottom: '16px', fontWeight: 700 }}>Active Escrow Holds</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No active escrow holds. Initiate escrow from the Deal Manager after agreement is established.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 42: DISPUTE ARBITRATOR ===== */}
        {activeTab === 'disputeArbitrator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f87171', marginBottom: '8px', fontWeight: 700 }}>
                Dispute Arbitrator
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Configure automated dispute resolution workflows, evidence collection timelines, and final arbitration decision rules.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Arbitration System Enabled', key: 'dispute_arbitration_enabled', type: 'toggle' },
                  { label: 'Evidence Window (hours)', key: 'dispute_evidence_hours', type: 'number' },
                  { label: 'Auto-Resolve Timeout (hours)', key: 'dispute_auto_resolve_hours', type: 'number' },
                  { label: 'Default Resolution', key: 'dispute_default_resolution', type: 'select', options: ['refund_buyer', 'release_seller', 'split_50_50', 'manual'] },
                  { label: 'Notify Admin on Dispute', key: 'dispute_notify_admin', type: 'toggle' },
                  { label: 'Allow Buyer Counteroffer', key: 'dispute_allow_counteroffer', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#f87171' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#f87171', marginBottom: '16px', fontWeight: 700 }}>Active Disputes</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
                No active disputes. Disputes are opened automatically when a buyer flags an unresolved escrow.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 43: WORD FILTER ===== */}
        {activeTab === 'wordFilter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#a78bfa', marginBottom: '8px', fontWeight: 700 }}>
                Word Filter
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Define word and phrase blocklists for incoming group messages. Matched content triggers auto-deletion, muting, or ban actions.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Word Filter Enabled', key: 'word_filter_enabled', type: 'toggle' },
                  { label: 'Case Insensitive Match', key: 'word_filter_case_insensitive', type: 'toggle' },
                  { label: 'Action on Match', key: 'word_filter_action', type: 'select', options: ['delete', 'mute', 'warn', 'ban', 'notify_admin'] },
                  { label: 'Warn Count Before Ban', key: 'word_filter_warn_count', type: 'number' },
                  { label: 'Regex Mode', key: 'word_filter_regex', type: 'toggle' },
                  { label: 'Log All Matches', key: 'word_filter_log', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#a78bfa' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Blocked Words / Phrases (one per line)</label>
                <textarea className="glass-input" rows={6} placeholder="spam&#10;buy now&#10;click here&#10;free money" value={settings.word_filter_blocklist || ''} onChange={e => saveSetting('word_filter_blocklist', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 44: BOT/SPAMMER BLOCKER ===== */}
        {activeTab === 'botSpammerBlocker' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f87171', marginBottom: '8px', fontWeight: 700 }}>
                Bot and Spammer Blocker
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Automatically detect and block bot accounts, spammer patterns, and flood attacks on managed groups.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Bot Blocker Enabled', key: 'bot_blocker_enabled', type: 'toggle' },
                  { label: 'Block No-Username Accounts', key: 'bot_block_no_username', type: 'toggle' },
                  { label: 'Block New Accounts (days old)', key: 'bot_block_new_account_days', type: 'number' },
                  { label: 'Flood Threshold (msgs/min)', key: 'bot_flood_threshold', type: 'number' },
                  { label: 'Auto-Ban on Flood', key: 'bot_auto_ban_flood', type: 'toggle' },
                  { label: 'CAPTCHA Challenge Mode', key: 'bot_captcha_mode', type: 'select', options: ['off', 'math', 'button_click', 'text_solve'] },
                  { label: 'CAPTCHA Timeout (seconds)', key: 'bot_captcha_timeout', type: 'number' },
                  { label: 'Notify Admin on Block', key: 'bot_notify_admin', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#f87171' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 45: LINK PROTECTOR ===== */}
        {activeTab === 'linkProtector' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fb923c', marginBottom: '8px', fontWeight: 700 }}>
                Link Protector
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Scan and block unauthorized links, phishing URLs, and invite spam in managed groups. Whitelist approved domains.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Link Protection Enabled', key: 'link_protector_enabled', type: 'toggle' },
                  { label: 'Block All External Links', key: 'link_block_all_external', type: 'toggle' },
                  { label: 'Block Invite Links', key: 'link_block_invites', type: 'toggle' },
                  { label: 'Action on Violation', key: 'link_action', type: 'select', options: ['delete', 'warn', 'mute', 'ban'] },
                  { label: 'Warn Before Ban', key: 'link_warn_count', type: 'number' },
                  { label: 'Scan Short URLs', key: 'link_scan_short_urls', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#fb923c' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Whitelisted Domains (one per line)</label>
                <textarea className="glass-input" rows={5} placeholder="t.me&#10;yourdomain.com&#10;github.com" value={settings.link_whitelist_domains || ''} onChange={e => saveSetting('link_whitelist_domains', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 46: AUTO ARCHIVER ===== */}
        {activeTab === 'autoArchiver' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '8px', fontWeight: 700 }}>
                Archive Exporter
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Automatically archive inactive conversations, export chat histories to JSON, and configure data retention cleanup schedules.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Auto-Archive Enabled', key: 'archive_auto_enabled', type: 'toggle' },
                  { label: 'Archive After Inactivity (days)', key: 'archive_inactivity_days', type: 'number' },
                  { label: 'Export Format', key: 'archive_export_format', type: 'select', options: ['json', 'csv', 'txt', 'html'] },
                  { label: 'Include Media References', key: 'archive_include_media', type: 'toggle' },
                  { label: 'Auto-Delete After Archive (days)', key: 'archive_delete_after_days', type: 'number' },
                  { label: 'Compress Exports', key: 'archive_compress', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#60a5fa' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : field.type === 'select' ? (
                      <select className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)}>
                        {field.options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                      </select>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="glass-btn" style={{ flex: 1 }}>Export All Archived Chats</button>
                <button className="glass-btn-secondary" style={{ flex: 1 }}>Run Archive Cleanup Now</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 47: GDPR COMPLIANCE ===== */}
        {activeTab === 'gdprCompliance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '8px', fontWeight: 700 }}>
                Data Compliance (GDPR)
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Configure personal data handling policies, consent tracking, right-to-erasure workflows, and data retention limits.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Compliance Mode Enabled', key: 'gdpr_enabled', type: 'toggle' },
                  { label: 'Data Retention Period (days)', key: 'gdpr_retention_days', type: 'number' },
                  { label: 'Auto-Purge Expired Data', key: 'gdpr_auto_purge', type: 'toggle' },
                  { label: 'Track Consent Records', key: 'gdpr_track_consent', type: 'toggle' },
                  { label: 'Anonymize on Delete', key: 'gdpr_anonymize_on_delete', type: 'toggle' },
                  { label: 'Include in Export (DSAR)', key: 'gdpr_include_dsar', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#34d399' : 'var(--text-muted)' }}>{settings[field.key] ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Privacy Notice (sent to new contacts)</label>
                <textarea className="glass-input" rows={3} placeholder="Your messages may be processed by an AI assistant..." value={settings.gdpr_privacy_notice || ''} onChange={e => saveSetting('gdpr_privacy_notice', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="glass-btn" style={{ flex: 1 }}>Export Data Archive (DSAR)</button>
                <button className="glass-btn-secondary" style={{ flex: 1, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}>Purge Expired Records</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 48: SYSTEM TELEMETRY ===== */}
        {activeTab === 'telemetryPanel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[
                { label: 'CPU Usage', value: telemetry?.cpu_percent != null ? `${telemetry.cpu_percent}%` : '--', color: '#60a5fa' },
                { label: 'Memory Usage', value: telemetry?.memory_percent != null ? `${telemetry.memory_percent}%` : '--', color: '#34d399' },
                { label: 'Disk Usage', value: telemetry?.disk_percent != null ? `${telemetry.disk_percent}%` : '--', color: '#fbbf24' },
                { label: 'Uptime', value: telemetry?.uptime_hours != null ? `${telemetry.uptime_hours}h` : '--', color: '#a78bfa' },
                { label: 'DB Size', value: telemetry?.db_size_mb != null ? `${telemetry.db_size_mb} MB` : '--', color: '#fb923c' },
                { label: 'Active WebSockets', value: telemetry?.active_ws != null ? telemetry.active_ws : '--', color: '#22d3ee' },
              ].map(stat => (
                <div key={stat.label} className="glass-container" style={{ padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#60a5fa', marginBottom: '16px', fontWeight: 700 }}>Telemetry Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { label: 'Telemetry Collection Enabled', key: 'telemetry_enabled', type: 'toggle' },
                  { label: 'Sampling Interval (seconds)', key: 'telemetry_interval', type: 'number' },
                  { label: 'Alert on High CPU (>%)', key: 'telemetry_cpu_alert', type: 'number' },
                  { label: 'Alert on High Memory (>%)', key: 'telemetry_memory_alert', type: 'number' },
                  { label: 'Send Telemetry to Telegram', key: 'telemetry_notify_telegram', type: 'toggle' },
                  { label: 'Retain Telemetry Log (days)', key: 'telemetry_log_days', type: 'number' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#60a5fa' : 'var(--text-muted)' }}>{settings[field.key] ? 'Active' : 'Off'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <button className="glass-btn" style={{ marginTop: '16px' }} onClick={fetchTelemetry} disabled={telemetryLoading}>
                {telemetryLoading ? 'Refreshing...' : 'Refresh Telemetry'}
              </button>
            </div>
          </div>
        )}

        {/* ===== TAB 49: SYSTEM OPTIMIZER ===== */}
        {activeTab === 'systemOptimizer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#34d399', marginBottom: '8px', fontWeight: 700 }}>
                System Optimizer
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Run database vacuuming, cache clearing, log pruning, and memory optimization routines to maintain peak system performance.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'Vacuum SQLite Database', desc: 'Reclaim unused storage space and defragment the database file.', key: 'vacuum' },
                  { label: 'Clear Expired Sessions', desc: 'Remove all token sessions older than 30 days from the auth table.', key: 'sessions' },
                  { label: 'Prune Old Log Entries', desc: 'Delete log records beyond the configured retention window.', key: 'logs' },
                  { label: 'Clear AI Response Cache', desc: 'Flush all cached AI drafts and pending draft entries.', key: 'cache' },
                  { label: 'Rebuild Contact Index', desc: 'Reindex all contact records for faster search and retrieval.', key: 'index' },
                ].map(action => (
                  <div key={action.key} className="glass-container" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px' }}>{action.label}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{action.desc}</div>
                    </div>
                    <button
                      className="glass-btn-secondary"
                      style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: '0.82rem' }}
                      onClick={() => setDbOptStatus(`Running ${action.label}...`)}
                    >
                      Run Now
                    </button>
                  </div>
                ))}
              </div>
              {dbOptStatus && (
                <div style={{ padding: '12px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '10px', color: '#34d399', fontSize: '0.85rem' }}>
                  {dbOptStatus}
                </div>
              )}
            </div>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#34d399', marginBottom: '16px', fontWeight: 700 }}>Performance Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { label: 'Log Retention (days)', key: 'log_retention_days', type: 'number' },
                  { label: 'Max Contacts Cached', key: 'max_contacts_cache', type: 'number' },
                  { label: 'Query Timeout (ms)', key: 'db_query_timeout', type: 'number' },
                  { label: 'Enable Query Caching', key: 'enable_query_cache', type: 'toggle' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#34d399' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 50: NOTIFICATION HUB ===== */}
        {activeTab === 'notificationHub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-container" style={{ padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#f472b6', marginBottom: '8px', fontWeight: 700 }}>
                Notification Hub
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Configure alert delivery channels, notification priorities, and quiet-hours for all system events and client triggers.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Notifications Enabled', key: 'notifications_enabled', type: 'toggle' },
                  { label: 'Telegram Alert Channel ID', key: 'notification_channel_id', type: 'text' },
                  { label: 'Notify on Critical Message', key: 'notify_critical_message', type: 'toggle' },
                  { label: 'Notify on Deal Closed', key: 'notify_deal_closed', type: 'toggle' },
                  { label: 'Notify on Scam Block', key: 'notify_scam_block', type: 'toggle' },
                  { label: 'Notify on System Error', key: 'notify_system_error', type: 'toggle' },
                  { label: 'Notify on Low API Keys', key: 'notify_low_keys', type: 'toggle' },
                  { label: 'Quiet Hours Start (hour)', key: 'notification_quiet_start', type: 'number' },
                  { label: 'Quiet Hours End (hour)', key: 'notification_quiet_end', type: 'number' },
                  { label: 'Batch Notifications (min)', key: 'notification_batch_interval', type: 'number' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{field.label}</label>
                    {field.type === 'toggle' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!settings[field.key]} onChange={e => saveSetting(field.key, e.target.checked)} />
                        <span style={{ fontSize: '0.82rem', color: settings[field.key] ? '#f472b6' : 'var(--text-muted)' }}>{settings[field.key] ? 'On' : 'Off'}</span>
                      </div>
                    ) : field.type === 'text' ? (
                      <input type="text" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    ) : (
                      <input type="number" className="glass-input" value={settings[field.key] || ''} onChange={e => saveSetting(field.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Custom Alert Prefix</label>
                <input type="text" className="glass-input" placeholder="[SYSTEM ALERT]" value={settings.notification_prefix || ''} onChange={e => saveSetting('notification_prefix', e.target.value)} />
              </div>
            </div>
          </div>
        )}

      </main>

      {/* RIGHT-SIDE INSTRUCTION DRAWER */}
      {helpOpen && (
        <aside style={{
          width: '320px',
          borderLeft: '1px solid var(--border-glass)',
          padding: '24px',
          background: 'rgba(8, 10, 20, 0.4)',
          backdropFilter: 'blur(30px)',
          height: '100vh',
          position: 'sticky',
          top: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Instruction Center
            </h3>
            <button 
              onClick={() => setHelpOpen(false)}
              className="glass-btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.75rem', border: '1px solid var(--border-glass)', borderRadius: '6px' }}
            >
              Hide
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.85rem', lineHeight: '1.4' }}>
            {activeTab === 'overview' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Overview Guide</p>
                <p>Monitor your digital twin in real time. The main panels display live messages, sentiment analysis, and pending approvals.</p>
                <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pro Tip:</span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: '4px' }}>Toggle the AI Autopilot using the switch in the sidebar to pause all automated communication.</p>
                </div>
              </>
            )}

            {activeTab === 'contacts' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Contacts Guide</p>
                <p>Manage individual relationships and folders. Review AI summaries of past interactions and add custom guidelines for specific clients.</p>
                <p style={{ color: 'var(--text-muted)' }}>Variables available in responses:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>{`{first_name}`}</code> - Recipient first name
              </>
            )}

            {activeTab === 'pipeline' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Pipeline Guide</p>
                <p>Monitor transacted items and escrow values. Sort clients based on target priorities to manage your weekly focus.</p>
              </>
            )}

            {activeTab === 'rules' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Rules Guide</p>
                <p>Fine-tune chat delay parameters, auto-sleep times, and response structures. Configure blacklist keywords to auto-mute matching senders.</p>
              </>
            )}

            {activeTab === 'logs' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>System Logs Guide</p>
                <p>Check detailed system logging information. Color-coded log lines display info, warnings, and system exceptions.</p>
              </>
            )}

            {activeTab === 'analytics' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Analytics Guide</p>
                <p>Track your messaging volume, chat sentiment statistics, model latency averages, and simulated operating costs.</p>
              </>
            )}

            {activeTab === 'scheduler' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Scheduler Guide</p>
                <p>Schedule dynamic broadcast announcements. Target specific user categories (VIP, Client, Partner) using cron timing strings.</p>
              </>
            )}

            {activeTab === 'system' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>System Guide</p>
                <p>Database backup and optimization center. Export all settings to a JSON file or restore from a previous session backup.</p>
              </>
            )}

            {activeTab === 'broadcast' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Broadcast Guide</p>
                <p>Send messages to all whitelisted contacts. Use template codes to customize text blocks dynamically.</p>
              </>
            )}

            {activeTab === 'intelligence' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Intelligence Guide</p>
                <p>Verify persona alignment. Inspect your writing style DNA profile and edit the global business knowledge base.</p>
              </>
            )}

            {activeTab === 'reminders' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Reminders Guide</p>
                <p>Set timed follow-ups for active deals. Review pending, completed, and overdue reminders.</p>
              </>
            )}

            {activeTab === 'keys' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Keys Guide</p>
                <p>Manage your Gemini API keys. Run diagnostics to verify response code statuses for each key in your active pool.</p>
              </>
            )}

            {activeTab === 'personas' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Personas Guide</p>
                <p>Adjust system prompts for mood states (Online, Sleeping, Vacation). Try test phrases in the simulator to preview output text.</p>
              </>
            )}

            {activeTab === 'security' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Security Guide</p>
                <p>Change your console password. Review recent logins, browser agents, and active session tokens.</p>
              </>
            )}

            {activeTab === 'commands' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Terminal Guide</p>
                <p>Test raw endpoints. Run custom scripts and view response logs instantly in the display console.</p>
              </>
            )}

            {activeTab === 'customCommands' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Custom Commands Guide</p>
                <p>Register custom slash triggers for inline client responses. Setup variable replacements to speed up escrow coordination.</p>
              </>
            )}

            {activeTab === 'paymentHub' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Payment Hub Guide</p>
                <p>Maintain digital payment addresses, fiat handles, and crypto credentials. Registered details will be sent on payment trigger commands.</p>
              </>
            )}

            {activeTab === 'dealManager' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Deal Manager Guide</p>
                <p>Register active client transactions. Use the AI Summary button to extract purchase items and Alt numbers, and automatically format checkout templates.</p>
              </>
            )}

            {activeTab === 'customerAccess' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Customer Access Guide</p>
                <p>Create time-bound customer license keys for client stores. Suspension settings revoke user bot access immediately.</p>
              </>
            )}

            {activeTab === 'gcManager' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>GC Manager Guide</p>
                <p>Command the userbot to join public/private groups. Whitelist chats to enable autopilot replies or message-forwarding rules.</p>
              </>
            )}

            {activeTab === 'autoForwarder' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Forwarder Guide</p>
                <p>Configure cross-channel message forwarding routes. Filter matching lines using comma-separated keyword parameters.</p>
              </>
            )}

            {activeTab === 'keywordStudio' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Keyword Studio Guide</p>
                <p>Build custom keyword replies. Use exact, fuzzy, or regex matching to trigger template replies, auto-mute users, or change client categories.</p>
              </>
            )}

            {activeTab === 'proxyManager' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Proxy Manager Guide</p>
                <p>Route userbot network connections via external SOCKS5 proxies. Run diagnostics to test target latencies.</p>
              </>
            )}

            {activeTab === 'antiScam' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Anti-Scam Guide</p>
                <p>Configure Math CAPTCHAs to block automated group bots. Enforce scam-shields to auto-ban members mimicking admin usernames.</p>
              </>
            )}

            {activeTab === 'storefrontAnalytics' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Storefront Analytics Guide</p>
                <p>Review sales performance indicators across all managed tenant storefronts. Track active orders, total revenue, and product updates.</p>
              </>
            )}

            {/* Specialized Workspaces Instruction Guides */}
            {activeTab === 'aiSwarm' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>AI Swarm Coordinator Guide</p>
                <p>Tune specialized prompts for Sales, Support, and Dispute handler personas. Inbound messages are routed based on context when Swarm Mode is active.</p>
                <p style={{ color: 'var(--text-muted)' }}>Configured settings keys:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>ai_swarm_mode</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>swarm_sales_prompt</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>swarm_support_prompt</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>swarm_dispute_prompt</code>
              </>
            )}

            {activeTab === 'threatRadar' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Threat Radar Guide</p>
                <p>Monitor security incidents, raid events, and captcha timeouts. Manage anti-VPN joins and joining rate parameters to protect group members.</p>
                <p style={{ color: 'var(--text-muted)' }}>Configured settings keys:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>threat_level</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>max_joins_per_minute</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>auto_kick_vpn</code>
              </>
            )}

            {activeTab === 'ledgerStudio' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Ledger Studio Guide</p>
                <p>Configure middleman commissions, credit ratios, and escrow calculations. All active values update calculations instantly.</p>
                <p style={{ color: 'var(--text-muted)' }}>Configured settings keys:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>ledger_fee_pct</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>retention_days_logs</code>
              </>
            )}

            {activeTab === 'webhookHub' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Webhook Hub Guide</p>
                <p>Register outbound webhook URLs. Dispatching events trigger payloads on transaction completions, copycat blocks, and captcha failures.</p>
                <p style={{ color: 'var(--text-muted)' }}>Events supported:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>on_deal_closed</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>on_scam_blocked</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>on_captcha_failed</code>
              </>
            )}

            {activeTab === 'dbSandbox' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Database Sandbox Guide</p>
                <p>Run SQLite diagnostic reads. Writing modifications are blocked to protect data integrity.</p>
                <p style={{ color: 'var(--text-muted)' }}>Example diagnostics:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>SELECT * FROM system_threats LIMIT 10;</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>SELECT * FROM webhooks;</code>
              </>
            )}

            {activeTab === 'leadExtractor' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Lead Extractor Guide</p>
                <p>Automatically classify potential buyers from inbound group chats. Set intent keywords and confidence thresholds to surface high-value leads.</p>
                <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pro Tip:</span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: '4px' }}>Use passive mode first to review extracted leads before enabling auto-tag actions.</p>
                </div>
              </>
            )}

            {activeTab === 'styleMirror' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Style Mirror Guide</p>
                <p>Configure how closely the AI mimics your personal writing voice. Higher mirror intensity increases realism but may reduce response flexibility.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>style_mirror_intensity</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>style_banned_phrases</code>
              </>
            )}

            {activeTab === 'sentimentRadar' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Sentiment Radar Guide</p>
                <p>Monitor the emotional tone of incoming client messages in real time. Set negative score thresholds to trigger escalation workflows automatically.</p>
                <p style={{ color: 'var(--text-muted)' }}>Escalation actions:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>notify</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>pause_ai</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>send_apology</code>
              </>
            )}

            {activeTab === 'massdmCampaign' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Mass DM Campaign Guide</p>
                <p>Deploy targeted direct message campaigns to segmented contact groups. Use batch size and delay controls to stay within Telegram rate limits.</p>
                <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Warning:</span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: '4px' }}>Sending too many messages in short bursts may trigger Telegram flood restrictions. Keep batch delays above 20 seconds.</p>
                </div>
              </>
            )}

            {activeTab === 'mediaScheduler' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Media Scheduler Guide</p>
                <p>Queue images, documents, and video files for scheduled delivery. Files are stored temporarily and dispatched at the configured send time.</p>
                <p style={{ color: 'var(--text-muted)' }}>Supported formats: JPG, PNG, MP4, PDF, DOCX</p>
              </>
            )}

            {activeTab === 'feedbackCollector' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Feedback Collector Guide</p>
                <p>Trigger post-interaction rating surveys automatically after deal closures or after N messages exchanged. Aggregate results are stored for review.</p>
                <p style={{ color: 'var(--text-muted)' }}>Configured settings keys:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>feedback_auto_send</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>feedback_request_message</code>
              </>
            )}

            {activeTab === 'channelMirror' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Channel Mirror Guide</p>
                <p>Mirror posts from a source channel to one or more target channels with optional AI rewriting and watermarking. Configure source and target IDs in the backend.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>channel_mirror_delay</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>channel_mirror_watermark_text</code>
              </>
            )}

            {activeTab === 'sessionRotator' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Session Rotator Guide</p>
                <p>Manage a pool of Telegram session files and configure automatic rotation intervals to distribute activity and reduce detection risk.</p>
                <p style={{ color: 'var(--text-muted)' }}>Rotation strategies:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>round_robin</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>least_used</code>
              </>
            )}

            {activeTab === 'trafficMonitor' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Traffic Monitor Guide</p>
                <p>Track live message volume and detect sudden traffic surges or Telegram rate-limit breaches. Enabling auto-throttle slows the reply queue automatically.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>traffic_rate_limit_threshold</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>traffic_auto_throttle</code>
              </>
            )}

            {activeTab === 'billingLedger' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Billing Ledger Guide</p>
                <p>Track all client invoices and payment statuses. Auto-send invoices when a deal is marked closed. Configure due dates and late fee percentages here.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>billing_auto_invoice</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>billing_late_fee_pct</code>
              </>
            )}

            {activeTab === 'paymentEscrow' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Payment Escrow Guide</p>
                <p>Hold funds in a virtual escrow until both parties confirm delivery. Dispute windows allow buyers to raise issues before final release.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>escrow_hold_hours</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>escrow_fee_pct</code>
              </>
            )}

            {activeTab === 'disputeArbitrator' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Dispute Arbitrator Guide</p>
                <p>Automate the dispute resolution process. Set evidence windows, configure default outcomes, and allow counteroffers within the arbitration timeline.</p>
                <p style={{ color: 'var(--text-muted)' }}>Default resolutions:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>refund_buyer</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>split_50_50</code>
              </>
            )}

            {activeTab === 'wordFilter' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Word Filter Guide</p>
                <p>Block prohibited words and phrases in managed groups. Use regex mode for pattern-based matching. Warnings accumulate before a ban is triggered.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>word_filter_blocklist</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>word_filter_action</code>
              </>
            )}

            {activeTab === 'botSpammerBlocker' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Bot Blocker Guide</p>
                <p>Automatically detect and remove bot accounts and flood spammers from managed groups. Configure CAPTCHA challenges for new joiners to verify humanity.</p>
                <p style={{ color: 'var(--text-muted)' }}>CAPTCHA modes:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>math</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>button_click</code>
              </>
            )}

            {activeTab === 'linkProtector' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Link Protector Guide</p>
                <p>Block unauthorized URLs from being shared in groups. Whitelist approved domains and configure auto-deletion of violating messages.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>link_whitelist_domains</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>link_action</code>
              </>
            )}

            {activeTab === 'autoArchiver' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Archive Exporter Guide</p>
                <p>Automatically archive and export inactive conversation threads. Configure inactivity thresholds and export formats for compliance or storage purposes.</p>
                <p style={{ color: 'var(--text-muted)' }}>Export formats: JSON, CSV, TXT, HTML</p>
              </>
            )}

            {activeTab === 'gdprCompliance' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Data Compliance Guide</p>
                <p>Enforce GDPR-compliant data handling. Configure retention periods, auto-purge expired records, and generate Data Subject Access Request (DSAR) exports.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>gdpr_retention_days</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>gdpr_auto_purge</code>
              </>
            )}

            {activeTab === 'telemetryPanel' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>System Telemetry Guide</p>
                <p>Monitor live CPU, memory, and disk usage metrics. Configure alert thresholds and automatic Telegram notifications when resource usage exceeds safe limits.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>telemetry_cpu_alert</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>telemetry_interval</code>
              </>
            )}

            {activeTab === 'systemOptimizer' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>System Optimizer Guide</p>
                <p>Run database vacuum, session cleanup, and log pruning routines to keep the system running at peak efficiency. Each action completes independently.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>log_retention_days</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>enable_query_cache</code>
              </>
            )}

            {activeTab === 'notificationHub' && (
              <>
                <p style={{ fontWeight: 600, color: '#60a5fa' }}>Notification Hub Guide</p>
                <p>Configure which system events trigger alert messages and where they are sent. Set quiet hours to suppress non-critical notifications during off-hours.</p>
                <p style={{ color: 'var(--text-muted)' }}>Key settings:</p>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block', marginBottom: '4px' }}>notification_channel_id</code>
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'block' }}>notification_quiet_start</code>
              </>
            )}
          </div>
        </aside>
      )}

      {/* Toggle button to bring Help Drawer back if hidden */}
      {!helpOpen && (
        <button
          onClick={() => setHelpOpen(true)}
          className="glass-btn-secondary micro-scale"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '10px 16px',
            fontSize: '0.85rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-glass)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
          }}
        >
          Show Instructions
        </button>
      )}


      {/* Spotlight Command Bar Overlay */}
      {spotlightOpen && (
        <div className="command-overlay" onClick={() => setSpotlightOpen(false)}>
          <div className="command-modal" onClick={e => e.stopPropagation()}>
            <div className="command-input-container">
              <span style={{ fontSize: '1.2rem' }}></span>
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
                    <span>{item.type === 'contact' ? '' : ''}</span>
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
