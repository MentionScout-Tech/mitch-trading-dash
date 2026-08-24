// API client — talks to Hetzner dash API
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://128-140-102-107.nip.io';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dash_token');
}

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dash_token');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function login(password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Login failed');
  localStorage.setItem('dash_token', j.token);
  return j.token;
}

export interface Signal {
  id: string;
  date_found: string;
  ticker: string;
  name: string;
  method: string;
  sector?: string;
  trigger: string;
  confidence: number;
  price_found: number | null;
  spy_price_found: number | null;
  price_1d: number | null;
  price_7d: number | null;
  price_30d: number | null;
  change_1d: number | null;
  change_7d: number | null;
  change_30d: number | null;
  alpha_1d: number | null;
  alpha_7d: number | null;
  alpha_30d: number | null;
  notes: string;
}

export interface Stats {
  total: number;
  by_method: Record<string, number>;
  avg_alpha_7d: number | null;
  avg_alpha_30d: number | null;
  win_rate_7d: number | null;
  win_rate_30d: number | null;
  tracked_7d: number;
  tracked_30d: number;
}

export interface OverviewSignal {
  id: string;
  ticker: string;
  name: string;
  method: string;
  date_found: string;
  price_found: number | null;
  trigger: string;
  best_alpha: number | null;
  best_raw: number | null;
  best_horizon: string;
  alpha_1d: number | null;
  alpha_7d: number | null;
  alpha_30d: number | null;
  change_1d: number | null;
  change_7d: number | null;
  change_30d: number | null;
}

export interface StrategyStat {
  method: string;
  total: number;
  tracked_7d: number;
  tracked_30d: number;
  avg_alpha_7d: number | null;
  avg_alpha_30d: number | null;
  avg_raw_7d: number | null;
  avg_raw_30d: number | null;
  win_rate_7d: number | null;
  win_rate_30d: number | null;
  best: { ticker: string; alpha: number; date: string } | null;
  worst: { ticker: string; alpha: number; date: string } | null;
}

export interface Portfolio {
  total_signals: number;
  tracked_7d: number;
  tracked_30d: number;
  cum_alpha_7d: number | null;
  cum_alpha_30d: number | null;
  avg_alpha_7d: number | null;
  avg_alpha_30d: number | null;
  cum_raw_7d: number | null;
  cum_raw_30d: number | null;
  win_rate_7d: number | null;
  win_rate_30d: number | null;
}

export interface Overview {
  portfolio: Portfolio;
  strategies: StrategyStat[];
  top10Gainers: OverviewSignal[];
  top10Losers: OverviewSignal[];
  top10Raw: OverviewSignal[];
  recent: any[];
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  dayHigh: number;
  dayLow: number;
  yearHigh: number;
  yearLow: number;
  name: string;
}
