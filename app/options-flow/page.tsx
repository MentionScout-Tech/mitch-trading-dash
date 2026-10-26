'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import Link from 'next/link';

interface Signal {
  ticker: string;
  contract: string;
  type: string;
  strike: number;
  expiration: string;
  daysToExpiry: number;
  volume: number;
  openInterest: number;
  volOiRatio: number;
  lastPrice: number;
  notional: number;
  sentiment: string;
  otm: boolean;
  reasons: string[];
  stockPrice: number;
  impliedVolatility: number | null;
  whaleCount: number;
  whales: string[];
  entryPrice: number;
  detectedAt: string;
  detectedDate: string;
  currentPrice: number | null;
  pnlPct: number | null;
  pnlStatus: string | null;
  changePercent: number | null;
}

interface Stats {
  total: number;
  bullish: number;
  bearish: number;
  avgPnlPct: number | null;
  notionalTraded: number;
}

interface FlowData {
  signals: Signal[];
  stats: Stats;
  lastRun: string | null;
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function pnlColor(pct: number | null): string {
  if (pct == null) return 'text-muted';
  if (pct >= 10) return 'text-green-400 font-bold';
  if (pct >= 5) return 'text-lime-300';
  if (pct >= 0) return 'text-green-400';
  if (pct >= -5) return 'text-orange-300';
  return 'text-red-400';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OptionsFlowPage() {
  const router = useRouter();
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
    }
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const d = await api('/api/options-flow');
      setData(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = data?.signals?.filter(s =>
    filter === 'all' ? true : s.sentiment === filter
  ) || [];

  const stats = data?.stats;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">🔥 Options Flow</h1>
        <div className="flex items-center gap-3">
          {data?.lastRun && (
            <span className="text-xs text-muted">Last scan: {timeAgo(data.lastRun)}</span>
          )}
          <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1.5 rounded hover:bg-panel2">
            🔄 Refresh
          </button>
        </div>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded mb-4">{err}</div>}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Signals" value={String(stats.total)} />
          <StatCard label="Bullish" value={String(stats.bullish)} color="text-green-400" />
          <StatCard label="Bearish" value={String(stats.bearish)} color="text-red-400" />
          <StatCard label="Avg P&L" value={stats.avgPnlPct != null ? `${stats.avgPnlPct > 0 ? '+' : ''}${stats.avgPnlPct}%` : '—'}
            color={stats.avgPnlPct != null ? (stats.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400') : 'text-muted'} />
          <StatCard label="Premium Traded" value={fmtK(stats.notionalTraded)} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'bullish', 'bearish'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded capitalize ${filter === f ? 'bg-accent text-[#0d1117]' : 'bg-panel border border-border text-muted hover:text-text'}`}>
            {f === 'all' ? `All (${data?.stats?.total || 0})` : f === 'bullish' ? `🟢 Bullish (${data?.stats?.bullish || 0})` : `🔴 Bearish (${data?.stats?.bearish || 0})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-muted py-8 text-center">Loading options flow...</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-muted py-8 text-center">No signals yet. Run the scanner to populate.</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-left">
                <th className="py-2 px-2">Signal</th>
                <th className="py-2 px-2">Contract</th>
                <th className="py-2 px-2 text-right">Vol/OI</th>
                <th className="py-2 px-2 text-right">Premium</th>
                <th className="py-2 px-2 text-right">Entry</th>
                <th className="py-2 px-2 text-right">Current</th>
                <th className="py-2 px-2 text-right">P&L</th>
                <th className="py-2 px-2">Whales</th>
                <th className="py-2 px-2">Why</th>
                <th className="py-2 px-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-panel2/50">
                  <td className="py-2 px-2">
                    <span className="mr-1">{s.sentiment === 'bullish' ? '🟢' : '🔴'}</span>
                    <Link href={`/chart?ticker=${s.ticker}`} className="text-accent hover:underline font-semibold">
                      {s.ticker}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-muted text-xs font-mono">
                    ${s.strike} {s.type.toUpperCase()} {s.expiration}
                    {s.otm && <span className="ml-1 text-yellow-500 text-[10px]">OTM</span>}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    <span className={s.volOiRatio >= 10 ? 'text-yellow-400 font-bold' : ''}>{s.volOiRatio}x</span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{fmtK(s.notional)}</td>
                  <td className="py-2 px-2 text-right font-mono">${fmt(s.entryPrice)}</td>
                  <td className="py-2 px-2 text-right font-mono">{s.currentPrice ? `$${fmt(s.currentPrice)}` : '—'}</td>
                  <td className={`py-2 px-2 text-right font-mono ${pnlColor(s.pnlPct)}`}>
                    {s.pnlPct != null ? `${s.pnlPct > 0 ? '+' : ''}${s.pnlPct}%` : '—'}
                  </td>
                  <td className="py-2 px-2 text-xs text-muted max-w-[120px] truncate" title={s.whales?.join(', ')}>
                    {s.whaleCount}🐋
                  </td>
                  <td className="py-2 px-2 text-xs text-muted max-w-[200px]">
                    {s.reasons?.slice(0, 2).join(' · ')}
                  </td>
                  <td className="py-2 px-2 text-right text-xs text-muted whitespace-nowrap">
                    {s.detectedAt ? timeAgo(s.detectedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'text-text' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
