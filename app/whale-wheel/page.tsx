'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

/* ── Types ─────────────────────────────────────────────── */

interface WhaleEntry {
  whale: string;
  entryPrice: number;
  shares: number;
}

interface WhaleApproved {
  ticker: string;
  whaleCount: number;
  whales: string[];
  avgWhaleEntry: number | null;
  whaleEntries: WhaleEntry[];
}

interface WheelSignal {
  ticker: string;
  entryPrice: number;
  entryDate: string;
  score: number;
  reasons: string[];
  whaleCount: number;
  whales: string[];
  currentPrice: number | null;
  pnlStatus?: 'green' | 'yellow' | null;
  hit10?: boolean;
  avgWhaleEntry: number | null;
  whaleEntries: WhaleEntry[];
  iv: number | null;
}

interface ScanResult {
  ticker: string;
  score: number;
  reasons: string[];
  price: number;
  whaleCount: number;
}

interface LastScan {
  timestamp: string;
  results: ScanResult[];
}

interface WheelData {
  whaleApproved: WhaleApproved[];
  signals: WheelSignal[];
  lastScan: LastScan | null;
  lastRun: string | null;
  totalWatchlist: number;
}

type SortField = 'ticker' | 'whales' | 'score';
type SortDir = 'asc' | 'desc';

/* ── Helpers ───────────────────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 35) return 'text-green';
  if (score >= 25) return 'text-yellow';
  if (score >= 15) return 'text-yellow/70';
  return 'text-muted';
}

function scoreBg(score: number): string {
  if (score >= 35) return 'bg-green/20 text-green border-green/30';
  if (score >= 25) return 'bg-yellow/15 text-yellow border-yellow/25';
  if (score >= 15) return 'bg-yellow/15 text-yellow/70 border-yellow/25';
  return 'bg-panel2 text-muted border-border';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Extract RSI value from reasons array */
function extractRSI(reasons: string[]): string | null {
  for (const r of reasons) {
    const m = r.match(/RSI[:\s]*([0-9.]+)/i);
    if (m) return m[1];
  }
  return null;
}

/** Extract Lower BB price from reasons array */
function extractLowerBB(reasons: string[]): string | null {
  for (const r of reasons) {
    const m = r.match(/(?:Lower\s*BB|lower\s*bollinger)[:\s]*\$?([0-9.,]+)/i);
    if (m) return m[1];
  }
  return null;
}

/* ── Components ────────────────────────────────────────── */

function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void;
}) {
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

function pnlColor(pct: number): string {
  if (pct > 0) return 'text-green';
  if (pct < 0) return 'text-red';
  return 'text-muted';
}

function pnlBg(pct: number, pnlStatus?: string | null): string {
  if (pnlStatus === 'green') return 'bg-green/25 border-green/50 ring-1 ring-green/30';
  if (pnlStatus === 'yellow') return 'bg-yellow/20 border-yellow/40';
  if (pct >= 5) return 'bg-green/15 border-green/30';
  if (pct > 0) return 'bg-green/10 border-green/20';
  if (pct <= -5) return 'bg-red/15 border-red/30';
  if (pct < 0) return 'bg-red/10 border-red/20';
  return 'bg-panel2 border-border';
}

function SignalCard({ signal, showPnl }: { signal: WheelSignal; showPnl?: boolean }) {
  const pnlPct = signal.currentPrice && signal.entryPrice
    ? ((signal.currentPrice - signal.entryPrice) / signal.entryPrice) * 100
    : null;

  const rsi = extractRSI(signal.reasons || []);
  const lowerBB = extractLowerBB(signal.reasons || []);

  return (
    <div className={`bg-panel border rounded-lg p-5 shadow-lg transition-colors ${
      showPnl && pnlPct !== null ? pnlBg(pnlPct, signal.pnlStatus) : 'border-accent/40 hover:border-accent/70'
    }`}>
      {/* Header row: Ticker + Score */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight">{signal.ticker}</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded border ${scoreBg(signal.score)}`}>
            {signal.score}
          </span>
          <span className="text-xs bg-accent/15 text-accent px-2 py-1 rounded border border-accent/25">
            🐋 {signal.whaleCount}
          </span>
        </div>
        {/* P&L badge */}
        {showPnl && pnlPct !== null && (
          <div className="flex items-center gap-2">
            {signal.pnlStatus === 'green' && <span className="text-xs font-bold bg-green/30 text-green px-2 py-0.5 rounded border border-green/40">🎯 10%+</span>}
            {signal.pnlStatus === 'yellow' && <span className="text-xs font-bold bg-yellow/30 text-yellow px-2 py-0.5 rounded border border-yellow/40">⚡ 5%+</span>}
          <span className={`text-lg font-bold ${pnlColor(pnlPct)}`}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </span>
          </div>
        )}
      </div>

      {/* Entry + Current price + RSI + Lower BB info */}
      <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
        <div>
          <span className="text-muted">Entry: </span>
          <span className="font-semibold text-text">${signal.entryPrice.toFixed(2)}</span>
        </div>
        {signal.currentPrice !== null && (
          <div>
            <span className="text-muted">Now: </span>
            <span className={`font-semibold ${pnlPct !== null ? pnlColor(pnlPct) : 'text-text'}`}>
              ${signal.currentPrice.toFixed(2)}
            </span>
          </div>
        )}
        {rsi && (
          <div>
            <span className="text-muted">RSI: </span>
            <span className={`font-semibold ${Number(rsi) <= 30 ? 'text-red' : Number(rsi) <= 40 ? 'text-yellow/70' : 'text-text'}`}>
              {rsi}
            </span>
          </div>
        )}
        {signal.iv != null && (
          <div>
            <span className="text-muted">IV: </span>
            <span className={`font-semibold ${signal.iv >= 60 ? 'text-red' : signal.iv >= 40 ? 'text-yellow/70' : 'text-accent'}`}>
              {signal.iv.toFixed(1)}%
            </span>
          </div>
        )}
        {lowerBB && (
          <div>
            <span className="text-muted">Lower BB: </span>
            <span className="font-semibold text-accent">${lowerBB}</span>
          </div>
        )}
        <div>
          <span className="text-muted">Date: </span>
          <span className="text-text">{formatDate(signal.entryDate)}</span>
        </div>
      </div>

      {/* Reasons */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1.5">
          {(signal.reasons || []).map((reason, i) => (
            <span key={i} className="text-xs bg-panel2 border border-border px-2 py-1 rounded-md text-muted">
              {reason}
            </span>
          ))}
        </div>
      </div>

      {/* Avg Whale Entry */}
      {signal.avgWhaleEntry != null && signal.avgWhaleEntry > 0 && (
        <div className="flex items-center gap-3 mb-3 text-sm">
          <div>
            <span className="text-muted">Avg Whale Entry: </span>
            <span className="font-semibold text-accent">${signal.avgWhaleEntry.toFixed(2)}</span>
          </div>
          {signal.currentPrice != null && (() => {
            const diff = ((signal.currentPrice - signal.avgWhaleEntry!) / signal.avgWhaleEntry!) * 100;
            return (
              <div className="flex items-center gap-1.5">
                <span>{diff >= 0 ? '🟢' : '🔴'}</span>
                <span className={`font-semibold ${diff >= 0 ? 'text-green' : 'text-red'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs whale cost
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Whale names */}
      <div className="text-xs text-muted">
        Backed by: {(signal.whales || []).join(', ')}
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export default function WhaleWheelPage() {
  const router = useRouter();
  const [data, setData] = useState<WheelData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('whales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [minWhales, setMinWhales] = useState(3);

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
      const d = await api('/api/whale-wheel');
      setData(d);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }

  /* Derive scan-based scores keyed by ticker for watchlist table */
  const scanScores = useMemo(() => {
    const map: Record<string, ScanResult> = {};
    if (data?.lastScan?.results) {
      for (const r of data.lastScan.results) {
        map[r.ticker] = r;
      }
    }
    return map;
  }, [data]);

  /* Derive active signal tickers set */
  const signalTickers = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.signals.map(s => s.ticker));
  }, [data]);

  const filteredWatchlist = useMemo(() => {
    if (!data) return [];
    return data.whaleApproved.filter(w => w.whaleCount >= minWhales);
  }, [data, minWhales]);

  const sortedWatchlist = useMemo(() => {
    const list = [...filteredWatchlist];
    list.sort((a, b) => {
      switch (sortField) {
        case 'ticker': {
          const cmp = a.ticker.localeCompare(b.ticker);
          return sortDir === 'asc' ? cmp : -cmp;
        }
        case 'whales': {
          const diff = a.whaleCount - b.whaleCount;
          return sortDir === 'desc' ? -diff : diff;
        }
        case 'score': {
          const aScore = scanScores[a.ticker]?.score || 0;
          const bScore = scanScores[b.ticker]?.score || 0;
          return sortDir === 'desc' ? bScore - aScore : aScore - bScore;
        }
        default:
          return b.whaleCount - a.whaleCount;
      }
    });
    return list;
  }, [filteredWatchlist, sortField, sortDir, scanScores]);

  /* Split signals into active (last 14 days) and past */
  const { activeSignals, pastSignals } = useMemo(() => {
    if (!data) return { activeSignals: [], pastSignals: [] };
    const cutoff = Date.now() - 14 * 86400000;
    const active: WheelSignal[] = [];
    const past: WheelSignal[] = [];
    for (const s of data.signals) {
      const entryMs = new Date(s.entryDate).getTime();
      if (entryMs > cutoff) active.push(s);
      else past.push(s);
    }
    active.sort((a, b) => b.score - a.score);
    past.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());
    return { activeSignals: active, pastSignals: past };
  }, [data]);

  if (loading) return <div className="text-muted p-8">Loading Whale Wheel scanner data...</div>;
  if (err) return <div className="bg-red/10 border border-red text-red p-3 rounded">{err}</div>;
  if (!data) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">🎡 Whale Wheel</h1>
          <div className="text-sm text-muted mt-1">
            Mean reversion entries on whale-backed stocks · oversold + lower Bollinger Band setups · {data.totalWatchlist} on watchlist
            {data.lastRun && <span> · Last scan {new Date(data.lastRun).toLocaleString()}</span>}
          </div>
        </div>
        <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1 rounded hover:bg-panel2 transition-colors">
          🔄 Refresh
        </button>
      </div>

      {/* ── Active Signals ──────────────────────────── */}
      {activeSignals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            🎯 Active Signals
            <span className="text-sm font-normal text-muted">({activeSignals.length} position{activeSignals.length !== 1 ? 's' : ''} · alert ≥ 25)</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {activeSignals.map((signal) => (
              <SignalCard key={signal.ticker + signal.entryDate} signal={signal} showPnl />
            ))}
          </div>
        </div>
      )}

      {activeSignals.length === 0 && (
        <div className="mb-8 bg-panel border border-border rounded-lg p-6 text-center">
          <div className="text-muted text-sm">No active signals. The Whale Wheel scanner will surface mean-reversion entries when oversold conditions align with whale holdings (score ≥ 25).</div>
        </div>
      )}

      {/* ── Past Signals (History + P&L) ────────────── */}
      {pastSignals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            📜 Signal History
            <span className="text-sm font-normal text-muted">
              ({pastSignals.length} past signal{pastSignals.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <div className="bg-panel border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-panel2 border-b border-border text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Ticker</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Entry</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2 text-center">Score</th>
                  <th className="px-3 py-2 text-center">Whales</th>
                  <th className="px-3 py-2 text-left">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {pastSignals.map((s, i) => {
                  const pnlPct = s.currentPrice && s.entryPrice
                    ? ((s.currentPrice - s.entryPrice) / s.entryPrice) * 100
                    : null;
                  return (
                    <tr key={s.ticker + s.entryDate + i} className={`border-t border-border hover:bg-panel2/50 ${
                      pnlPct !== null && pnlPct >= 0 ? 'bg-green/5' : pnlPct !== null ? 'bg-red/5' : ''
                    }`}>
                      <td className="px-3 py-2 font-bold">{s.ticker}</td>
                      <td className="px-3 py-2 text-muted">{formatDate(s.entryDate)}</td>
                      <td className="px-3 py-2 text-right font-mono">${s.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {s.currentPrice !== null ? `$${s.currentPrice.toFixed(2)}` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${
                        pnlPct !== null ? pnlColor(pnlPct) : 'text-muted'
                      }`}>
                        {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`${scoreColor(s.score)} font-bold`}>{s.score}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-accent">🐋 {s.whaleCount}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted max-w-xs truncate">
                        {(s.reasons || []).slice(0, 3).join(' · ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Last Scan Results ───────────────────────── */}
      {data.lastScan && data.lastScan.results.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            📡 Latest Scan
            <span className="text-sm font-normal text-muted">
              {formatDate(data.lastScan.timestamp)} · {data.lastScan.results.length} result{data.lastScan.results.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.lastScan.results
              .sort((a, b) => b.score - a.score)
              .map((r) => (
                <div key={r.ticker} className={`text-xs px-3 py-1.5 rounded-md border ${
                  signalTickers.has(r.ticker)
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-panel border-border text-muted'
                }`}>
                  <span className="font-bold">{r.ticker}</span>
                  <span className={`ml-1.5 ${scoreColor(r.score)}`}>{r.score}</span>
                  {r.whaleCount > 0 && <span className="ml-1.5 opacity-60">🐋{r.whaleCount}</span>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Watchlist Table ──────────────────────────── */}
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
          <span className="text-muted ml-1">({sortedWatchlist.length} shown)</span>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel2 border-b border-border text-muted">
            <tr>
              <SortHeader label="Ticker" field="ticker" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="# Whales" field="whales" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Wheel Score" field="score" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-right">Avg Whale Entry</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Backed By</th>
            </tr>
          </thead>
          <tbody>
            {sortedWatchlist.map((w) => {
              const scan = scanScores[w.ticker];
              const score = scan?.score || 0;
              const isSignal = signalTickers.has(w.ticker);
              return (
                <tr key={w.ticker} className={`border-t border-border hover:bg-panel2/50 ${isSignal ? 'bg-green/5' : ''}`}>
                  <td className="px-3 py-2 font-bold">{w.ticker}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-accent font-bold">{w.whaleCount}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {score > 0 ? (
                      <span className={`${scoreColor(score)} font-bold`}>{score}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {w.avgWhaleEntry != null && w.avgWhaleEntry > 0 ? (
                      <span className="text-accent">${w.avgWhaleEntry.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isSignal ? (
                      <span className="text-xs bg-green/20 text-green px-2 py-0.5 rounded font-bold">
                        🚨 ACTIVE SIGNAL
                      </span>
                    ) : score >= 25 ? (
                      <span className="text-xs bg-yellow/15 text-yellow px-2 py-0.5 rounded font-bold">
                        ⚡ Near Alert
                      </span>
                    ) : score > 0 ? (
                      <span className="text-xs bg-panel2 text-muted px-2 py-0.5 rounded">
                        Watching
                      </span>
                    ) : (
                      <span className="text-xs text-muted">No setup</span>
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

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-muted space-y-1">
        <div>Whale Wheel scanner monitors whale-approved stocks (3+ whales) for oversold mean-reversion entries at the lower Bollinger Band.</div>
        <div>Signals fire at score ≥ 25. Entry price and date tracked for P&L monitoring. Not financial advice.</div>
      </div>
    </div>
  );
}
