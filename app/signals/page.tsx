'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, Signal } from '../../lib/api';

const METHOD_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  social_arb: { label: 'Social Arb', emoji: '🔥', color: 'bg-orange-500/20 text-orange-300' },
  earnings: { label: 'Earnings', emoji: '📅', color: 'bg-blue-500/20 text-blue-300' },
  insider: { label: 'Insider', emoji: '👤', color: 'bg-purple-500/20 text-purple-300' },
  '8k': { label: '8-K', emoji: '📄', color: 'bg-yellow-500/20 text-yellow-300' },
  sector_alert: { label: 'Sector', emoji: '🎯', color: 'bg-pink-500/20 text-pink-300' },
  smart_money: { label: 'Congress', emoji: '🏛️', color: 'bg-emerald-500/20 text-emerald-300' },
  wheel: { label: 'Wheel', emoji: '🎡', color: 'bg-green-500/20 text-green-300' }
};

type SortKey = 'date_found' | 'ticker' | 'method' | 'price_found' | 'change_1d' | 'change_7d' | 'live_price' | 'total_return';
type SortDir = 'asc' | 'desc';

interface LiveQuote { price: number; change: number; changePercent: number; }

export default function SignalsPage() {
  const router = useRouter();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [err, setErr] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date_found');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    loadSignals();
    const i = setInterval(loadSignals, 60000);
    return () => clearInterval(i);
  }, [filter]);

  // Fetch live quotes for unique tickers
  const fetchQuotes = useCallback(async (sigs: Signal[]) => {
    const tickers = [...new Set(sigs.map(s => s.ticker))];
    if (!tickers.length) return;
    // Batch in groups of 40
    for (let i = 0; i < tickers.length; i += 40) {
      const batch = tickers.slice(i, i + 40).join(',');
      try {
        const data = await api(`/api/quotes-batch?tickers=${batch}`);
        if (data.quotes) setQuotes(prev => ({ ...prev, ...data.quotes }));
      } catch { /* ignore quote errors */ }
    }
  }, []);

  async function loadSignals() {
    try {
      const q = filter ? `?method=${filter}&limit=200` : '?limit=200';
      const data = await api(`/api/signals${q}`);
      setSignals(data.signals);
      setErr('');
      fetchQuotes(data.signals);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'date_found' ? 'desc' : key === 'ticker' || key === 'method' ? 'asc' : 'desc');
    }
  }

  const enriched = useMemo(() => {
    return signals.map(s => {
      const q = quotes[s.ticker];
      const livePrice = q?.price ?? null;
      const totalReturn = (livePrice !== null && livePrice !== undefined && s.price_found !== null && s.price_found !== undefined)
        ? ((livePrice - s.price_found) / s.price_found) * 100
        : null;
      return { ...s, live_price: livePrice, total_return: totalReturn };
    });
  }, [signals, quotes]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a: any, b: any) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) av = sortDir === 'asc' ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
    return arr;
  }, [enriched, sortKey, sortDir]);

  function fmtChange(v: number | null) {
    if (v === null || v === undefined) return <span className="text-muted">—</span>;
    const cls = v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-muted';
    return <span className={cls}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
  }

  function fmtPrice(v: number | null) {
    if (v === null || v === undefined) return <span className="text-muted">—</span>;
    return <span>${Number(v).toFixed(2)}</span>;
  }

  function SortHead({ k, label, right }: { k: SortKey; label: string; right?: boolean }) {
    const active = sortKey === k;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <th
        className={`px-3 py-3 cursor-pointer select-none hover:text-text transition-colors whitespace-nowrap ${right ? 'text-right' : ''} ${active ? 'text-accent' : ''}`}
        onClick={() => toggleSort(k)}
      >
        {label}{arrow}
      </th>
    );
  }

  const methodCounts = useMemo(() => {
    const c: Record<string, number> = {};
    signals.forEach(s => { c[s.method] = (c[s.method] || 0) + 1; });
    return c;
  }, [signals]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Signals</h1>
        <button onClick={loadSignals} className="text-sm bg-panel border border-border px-3 py-1 rounded hover:bg-panel2">
          🔄 Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`text-xs px-3 py-1 rounded ${!filter ? 'bg-accent text-bg' : 'bg-panel border border-border'}`}>
          All ({signals.length})
        </button>
        {Object.entries(METHOD_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`text-xs px-3 py-1 rounded ${filter === k ? 'bg-accent text-bg' : 'bg-panel border border-border'}`}>
            {v.emoji} {v.label} {methodCounts[k] ? `(${methodCounts[k]})` : ''}
          </button>
        ))}
      </div>

      {err && <div className="bg-red/10 border border-red text-red p-3 rounded mb-4">{err}</div>}
      {loading && <div className="text-muted">Loading...</div>}

      <div className="bg-panel border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel2 border-b border-border">
            <tr className="text-left text-muted">
              <SortHead k="date_found" label="Date" />
              <SortHead k="ticker" label="Ticker" />
              <SortHead k="method" label="Type" />
              <th className="px-3 py-3">Trigger</th>
              <SortHead k="price_found" label="Entry" right />
              <SortHead k="live_price" label="Now" right />
              <SortHead k="change_1d" label="1d" right />
              <SortHead k="change_7d" label="7d" right />
              <SortHead k="total_return" label="Total" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const m = METHOD_LABELS[s.method] || { label: s.method, emoji: '•', color: 'bg-gray-500/20' };
              return (
                <tr key={s.id} className="border-t border-border hover:bg-panel2/50">
                  <td className="px-3 py-3 text-muted whitespace-nowrap">{s.date_found}</td>
                  <td className="px-3 py-3 font-bold">{s.ticker}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${m.color}`}>{m.emoji} {m.label}</span>
                  </td>
                  <td className="px-3 py-3 text-muted max-w-xs truncate" title={s.trigger}>{s.trigger}</td>
                  <td className="px-3 py-3 text-right">{fmtPrice(s.price_found)}</td>
                  <td className="px-3 py-3 text-right font-medium">{fmtPrice(s.live_price)}</td>
                  <td className="px-3 py-3 text-right">{fmtChange(s.change_1d)}</td>
                  <td className="px-3 py-3 text-right">{fmtChange(s.change_7d)}</td>
                  <td className="px-3 py-3 text-right font-medium">{fmtChange(s.total_return)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && signals.length === 0 && (
          <div className="p-8 text-center text-muted">No signals</div>
        )}
      </div>
    </div>
  );
}
