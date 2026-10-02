'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface WhaleApproved {
  ticker: string;
  whaleCount: number;
  whales: string[];
}

interface CatalystSignal {
  ticker: string;
  score: number;
  catalysts: string[];
  price?: number;
  change24h?: number;
}

interface LeapData {
  whaleApproved: WhaleApproved[];
  alerts: Record<string, CatalystSignal>;
  lastRun: string | null;
  latestScan: any;
  totalWatchlist: number;
}

type SortField = 'ticker' | 'whales' | 'score';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, field, sortField, sortDir, onSort }: { label: string; field: SortField; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void }) {
  const isActive = sortField === field;
  return (
    <th
      className="px-3 py-2 cursor-pointer select-none hover:text-text transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <span className="text-accent">{sortDir === 'desc' ? '▼' : '▲'}</span>
        ) : (
          <span className="opacity-30">⇅</span>
        )}
      </span>
    </th>
  );
}

export default function LeapPage() {
  const router = useRouter();
  const [data, setData] = useState<LeapData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('whales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [minWhales, setMinWhales] = useState(2);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/leap');
      setData(d);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }

  const filteredWatchlist = useMemo(() => {
    if (!data) return [];
    return data.whaleApproved.filter(w => w.whaleCount >= minWhales);
  }, [data, minWhales]);

  const sortedWatchlist = useMemo(() => {
    const list = [...filteredWatchlist];
    list.sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;
      switch (sortField) {
        case 'ticker':
          const cmp = a.ticker.localeCompare(b.ticker);
          return sortDir === 'asc' ? cmp : -cmp;
        case 'whales':
          aVal = a.whaleCount;
          bVal = b.whaleCount;
          break;
        case 'score':
          aVal = data?.alerts[a.ticker]?.score || 0;
          bVal = data?.alerts[b.ticker]?.score || 0;
          break;
        default:
          aVal = a.whaleCount;
          bVal = b.whaleCount;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return list;
  }, [filteredWatchlist, sortField, sortDir, data]);

  const activeAlerts = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.alerts)
      .filter(([_, signal]) => signal.score >= 70)
      .map(([ticker, signal]) => {
        const whale = data.whaleApproved.find(w => w.ticker === ticker);
        return { ticker, signal, whaleCount: whale?.whaleCount || 0, whales: whale?.whales || [] };
      })
      .sort((a, b) => b.signal.score - a.signal.score);
  }, [data]);

  if (loading) return <div className="text-muted p-8">Loading LEAP scanner data...</div>;
  if (err) return <div className="bg-red/10 border border-red text-red p-3 rounded">{err}</div>;
  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">🚀 LEAP Scanner</h1>
          <div className="text-sm text-muted mt-1">
            Whale-approved stocks + catalyst timing · {data.totalWatchlist} on watchlist
            {data.lastRun && <span> · Last scan {new Date(data.lastRun).toLocaleString()}</span>}
          </div>
        </div>
        <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1 rounded hover:bg-panel2">🔄 Refresh</button>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-3">🎯 Active Signals <span className="text-sm font-normal text-muted">(Score ≥70)</span></h2>
          <div className="space-y-3">
            {activeAlerts.map(({ ticker, signal, whaleCount, whales }) => (
              <div key={ticker} className="bg-panel border border-accent/50 rounded-lg p-4 shadow-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{ticker}</span>
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded font-bold">
                        Score: {signal.score}
                      </span>
                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
                        {whaleCount} whale{whaleCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {signal.price && (
                      <div className="text-sm text-muted mt-1">
                        ${signal.price.toFixed(2)}
                        {signal.change24h != null && (
                          <span className={signal.change24h >= 0 ? 'text-green-400 ml-2' : 'text-red-400 ml-2'}>
                            {signal.change24h >= 0 ? '+' : ''}{signal.change24h.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-sm font-semibold mb-1">Catalysts:</div>
                  <div className="flex flex-wrap gap-2">
                    {signal.catalysts.map((cat, i) => (
                      <span key={i} className="text-xs bg-panel2 border border-border px-2 py-1 rounded">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted">
                  Backed by: {whales.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watchlist */}
      <div className="mb-4 flex items-center gap-4">
        <h2 className="text-xl font-bold">📋 Watchlist</h2>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted">Min whales:</label>
          <select 
            value={minWhales} 
            onChange={(e) => setMinWhales(Number(e.target.value))}
            className="bg-panel border border-border rounded px-2 py-1"
          >
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5+</option>
          </select>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel2 border-b border-border text-muted">
            <tr>
              <SortHeader label="Ticker" field="ticker" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="# Whales" field="whales" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Catalyst Score" field="score" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Backed By</th>
            </tr>
          </thead>
          <tbody>
            {sortedWatchlist.map((w) => {
              const alert = data.alerts[w.ticker];
              const score = alert?.score || 0;
              const hasAlert = score >= 70;
              return (
                <tr key={w.ticker} className={`border-t border-border hover:bg-panel2/50 ${hasAlert ? 'bg-green-500/5' : ''}`}>
                  <td className="px-3 py-2 font-bold">{w.ticker}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-accent font-bold">{w.whaleCount}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {score > 0 ? (
                      <span className={
                        score >= 70 ? 'text-green-400 font-bold' :
                        score >= 50 ? 'text-lime-300' :
                        score >= 30 ? 'text-orange-300' :
                        'text-muted'
                      }>
                        {score}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {hasAlert ? (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded font-bold">
                        🚨 ACTIVE SIGNAL
                      </span>
                    ) : score > 0 ? (
                      <span className="text-xs bg-panel2 text-muted px-2 py-0.5 rounded">
                        Watching
                      </span>
                    ) : (
                      <span className="text-xs text-muted">No catalysts</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted max-w-md truncate">
                    {w.whales.join(', ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-center text-xs text-muted space-y-1">
        <div>LEAP scanner monitors whale-approved stocks for high-conviction catalyst setups.</div>
        <div>Signals trigger when catalyst score ≥70. Not financial advice.</div>
      </div>
    </div>
  );
}
