'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Overview, OverviewSignal, StrategyStat } from '../lib/api';

const METHOD_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  social_arb:   { label: 'Social Arb',  emoji: '🔥', color: 'bg-yellow/20 text-yellow/70' },
  earnings:     { label: 'Earnings',    emoji: '📅', color: 'bg-accent/20 text-accent' },
  insider:      { label: 'Insider',     emoji: '👤', color: 'bg-accent/20 text-accent' },
  '8k':         { label: '8-K',         emoji: '📄', color: 'bg-yellow/20 text-yellow' },
  sector_alert: { label: 'Sector',      emoji: '🎯', color: 'bg-pink-500/20 text-pink-300' },
  wheel:        { label: 'Wheel',       emoji: '🎡', color: 'bg-green/20 text-green' }
};

interface LiveQuote { price: number; change: number; changePercent: number; }

function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  const cls = v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-muted';
  return <span className={cls}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
}

function fmtPrice(v: number | null | undefined) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  return <span>${Number(v).toFixed(2)}</span>;
}

function MethodBadge({ method }: { method: string }) {
  const m = METHOD_LABELS[method] || { label: method, emoji: '•', color: 'bg-gray-500/20' };
  return <span className={`text-xs px-2 py-0.5 rounded ${m.color}`}>{m.emoji} {m.label}</span>;
}

type SortDir = 'asc' | 'desc';

function SortHeader({
  label, field, currentField, currentDir, onClick, align = 'left'
}: { label: string; field: string; currentField: string; currentDir: SortDir; onClick: (f: string) => void; align?: 'left' | 'right' }) {
  const active = field === currentField;
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-text transition-colors whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-accent' : ''}`} onClick={() => onClick(field)}>
      {label}{active ? (currentDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const [topSort, setTopSort] = useState<{ f: string; d: SortDir }>({ f: 'total_return', d: 'desc' });
  const [stratSort, setStratSort] = useState<{ f: string; d: SortDir }>({ f: 'avg_raw_7d', d: 'desc' });
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    const unique = [...new Set(tickers)];
    for (let i = 0; i < unique.length; i += 40) {
      const batch = unique.slice(i, i + 40).join(',');
      try {
        const d = await api(`/api/quotes-batch?tickers=${batch}`);
        if (d.quotes) setQuotes(prev => ({ ...prev, ...d.quotes }));
      } catch {}
    }
  }, []);

  async function load() {
    try {
      const d = await api('/api/overview');
      setData(d);
      setErr('');
      // Fetch live quotes for top performers
      const allTickers = [
        ...(d.top10Gainers || []).map((s: any) => s.ticker),
        ...(d.top10Losers || []).map((s: any) => s.ticker),
      ];
      fetchQuotes(allTickers);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function toggleSort(curr: { f: string; d: SortDir }, setter: (v: { f: string; d: SortDir }) => void, f: string, defaultDir: SortDir = 'desc') {
    if (curr.f === f) setter({ f, d: curr.d === 'desc' ? 'asc' : 'desc' });
    else setter({ f, d: defaultDir });
  }

  function sortBy<T>(arr: T[], field: string, dir: SortDir): T[] {
    const sign = dir === 'desc' ? -1 : 1;
    return [...arr].sort((a: any, b: any) => {
      const av = a[field], bv = b[field];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * sign;
      return (av - bv) * sign;
    });
  }

  // Enrich top performers with live prices + total return
  const enrichTop = useCallback((list: any[]) => {
    return list.map(s => {
      const q = quotes[s.ticker];
      const livePrice = q?.price ?? null;
      const entry = s.price_found;
      const totalReturn = (livePrice && entry) ? ((livePrice - entry) / entry) * 100 : null;
      return { ...s, live_price: livePrice, total_return: totalReturn };
    });
  }, [quotes]);

  const sortedStrategies = useMemo(() => {
    if (!data) return [];
    const mapped = data.strategies.map((s: any) => ({
      ...s,
      avg_raw_7d: s.avg_raw_real_7d ?? s.avg_raw_7d,
      win_rate_1d: s.raw_win_rate_1d ?? null,
      win_rate_7d: s.raw_win_rate_7d ?? s.win_rate_real_7d ?? s.win_rate_7d,
      win_rate_30d: s.raw_win_rate_30d ?? null,
      tracked_7d: s.tracked_real_7d ?? s.tracked_7d,
    }));
    return sortBy(mapped, stratSort.f, stratSort.d);
  }, [data, stratSort]);

  const sortedTop = useMemo(() => {
    if (!data) return [];
    const base = tab === 'gainers' ? data.top10Gainers : data.top10Losers;
    const enriched = enrichTop(base);
    // Default sort by total return
    enriched.sort((a, b) => {
      if (tab === 'gainers') return (b.total_return ?? -Infinity) - (a.total_return ?? -Infinity);
      return (a.total_return ?? Infinity) - (b.total_return ?? Infinity);
    });
    return sortBy(enriched, topSort.f, topSort.d);
  }, [data, tab, topSort, quotes, enrichTop]);

  if (err) return <div className="bg-red/10 border border-red text-red p-3 rounded">{err}</div>;
  if (!data) return <div className="text-muted">Loading dashboard...</div>;

  const p: any = data.portfolio;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">📈 Overview</h1>
          <div className="text-sm text-muted mt-1">All scanners · live performance</div>
        </div>
        <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1 rounded hover:bg-panel2">🔄</button>
      </div>

      {/* Hero stats — raw win rates */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Signals" value={p.total_signals} />
        <StatCard
          label="Win Rate (1d)"
          value={p.raw_win_rate_1d !== null && p.raw_win_rate_1d !== undefined ? `${p.raw_win_rate_1d}%` : '—'}
          color={p.raw_win_rate_1d > 50 ? 'text-green' : p.raw_win_rate_1d < 50 ? 'text-red' : 'text-muted'}
        />
        <StatCard
          label="Win Rate (7d)"
          value={p.raw_win_rate_7d !== null && p.raw_win_rate_7d !== undefined ? `${p.raw_win_rate_7d}%` : '—'}
          color={p.raw_win_rate_7d > 50 ? 'text-green' : p.raw_win_rate_7d < 50 ? 'text-red' : 'text-muted'}
        />
        <StatCard
          label="Win Rate (30d)"
          value={p.raw_win_rate_30d !== null && p.raw_win_rate_30d !== undefined ? `${p.raw_win_rate_30d}%` : '—'}
          color={p.raw_win_rate_30d > 50 ? 'text-green' : p.raw_win_rate_30d < 50 ? 'text-red' : 'text-muted'}
        />
      </div>

      {/* Strategy leaderboard */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-3">🏆 Strategy Leaderboard</h2>
        <div className="bg-panel border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel2 border-b border-border text-muted">
              <tr>
                <SortHeader label="Strategy" field="method" currentField={stratSort.f} currentDir={stratSort.d} onClick={f => toggleSort(stratSort, setStratSort, f, 'asc')} />
                <SortHeader label="Signals" field="total" currentField={stratSort.f} currentDir={stratSort.d} onClick={f => toggleSort(stratSort, setStratSort, f)} align="right" />
                <SortHeader label="Tracked" field="tracked_7d" currentField={stratSort.f} currentDir={stratSort.d} onClick={f => toggleSort(stratSort, setStratSort, f)} align="right" />
                <SortHeader label="Win 1d" field="win_rate_1d" currentField={stratSort.f} currentDir={stratSort.d} onClick={f => toggleSort(stratSort, setStratSort, f)} align="right" />
                <SortHeader label="Win 7d" field="win_rate_7d" currentField={stratSort.f} currentDir={stratSort.d} onClick={f => toggleSort(stratSort, setStratSort, f)} align="right" />
                <SortHeader label="Win 30d" field="win_rate_30d" currentField={stratSort.f} currentDir={stratSort.d} onClick={f => toggleSort(stratSort, setStratSort, f)} align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedStrategies.map((s: any) => (
                <tr key={s.method} className="border-t border-border hover:bg-panel2/50">
                  <td className="px-3 py-3"><MethodBadge method={s.method} /></td>
                  <td className="px-3 py-3 text-right">{s.total}</td>
                  <td className="px-3 py-3 text-right text-muted">{s.tracked_7d}</td>
                  <td className="px-3 py-3 text-right">
                    {s.win_rate_1d !== null ? (
                      <span className={s.win_rate_1d >= 50 ? 'text-green' : 'text-red'}>{s.win_rate_1d}%</span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {s.win_rate_7d !== null ? (
                      <span className={s.win_rate_7d >= 50 ? 'text-green' : 'text-red'}>{s.win_rate_7d}%</span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {s.win_rate_30d !== null ? (
                      <span className={s.win_rate_30d >= 50 ? 'text-green' : 'text-red'}>{s.win_rate_30d}%</span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Performers */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xl font-bold">🏅 Top Performers</h2>
          <div className="flex gap-1">
            {(['gainers','losers'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-xs px-3 py-1 rounded ${tab === t ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted'}`}>
                {t === 'gainers' ? '📈 Winners' : '📉 Losers'}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-panel border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel2 border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 w-8">#</th>
                <SortHeader label="Ticker" field="ticker" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f, 'asc')} />
                <SortHeader label="Type" field="method" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f, 'asc')} />
                <SortHeader label="Found" field="date_found" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f)} />
                <SortHeader label="Entry" field="price_found" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f)} align="right" />
                <SortHeader label="Now" field="live_price" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f)} align="right" />
                <SortHeader label="1d" field="change_1d" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f)} align="right" />
                <SortHeader label="7d" field="change_7d" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f)} align="right" />
                <SortHeader label="Total" field="total_return" currentField={topSort.f} currentDir={topSort.d} onClick={f => toggleSort(topSort, setTopSort, f)} align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedTop.map((s: any, i: number) => (
                <tr key={s.id} className="border-t border-border hover:bg-panel2/50">
                  <td className="px-3 py-3 text-muted">{i + 1}</td>
                  <td className="px-3 py-3 font-bold">{s.ticker}</td>
                  <td className="px-3 py-3"><MethodBadge method={s.method} /></td>
                  <td className="px-3 py-3 text-muted text-xs whitespace-nowrap">{s.date_found}</td>
                  <td className="px-3 py-3 text-right">{fmtPrice(s.price_found)}</td>
                  <td className="px-3 py-3 text-right font-medium">{fmtPrice(s.live_price)}</td>
                  <td className="px-3 py-3 text-right">{fmtPct(s.change_1d)}</td>
                  <td className="px-3 py-3 text-right">{fmtPct(s.change_7d)}</td>
                  <td className="px-3 py-3 text-right font-bold">{fmtPct(s.total_return)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedTop.length === 0 && <div className="p-6 text-center text-muted">No tracked signals yet</div>}
        </div>
      </div>

      <div className="text-center">
        <Link href="/signals" className="text-accent hover:underline text-sm">View all signals →</Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-text', hint }: { label: string; value: any; color?: string; hint?: string }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted mt-1">{hint}</div>}
    </div>
  );
}
