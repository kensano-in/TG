// Centralized API configuration and helpers

export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://tg-5o6r.onrender.com');

export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export const apiFetch = async (path, options = {}) => {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
};

export const makeHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});
