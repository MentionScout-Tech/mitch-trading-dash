'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface Conditions {
  trend: string;
  trendStrength: number;
  bias: string;
  vwap: number | null;
  sma20: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
  rangePct: number;
  momentum: number;
  priceVsVwap: number;
  aboveVwap: boolean;
  aboveSma20: boolean;
  barsAnalyzed: number;
}

interface CreditSpread {
  type: string;
  shortStrike: number;
  longStrike: number;
  shortDelta: number;
  credit: number;
  maxRisk: number;
  creditPct: number;
  rrRatio: number;
  distFromPrice: number;
  distPct: number;
  emMultiple: number;
  shortOI: number;
  shortVol: number;
  score: number;
}

interface IronCondor {
  type: string;
  putShortStrike: number;
  putLongStrike: number;
  callShortStrike: number;
  callLongStrike: number;
  putCredit: number;
  callCredit: number;
  combinedCredit: number;
  maxRisk: number;
  creditPct: number;
  rrRatio: number;
  putDelta: number;
  callDelta: number;
  putEMMultiple: number;
  callEMMultiple: number;
  score: number;
}

interface TodaySignal {
  key: string;
  type: string;
  timestamp: string;
  spxPrice: number;
  score: number;
  shortStrike?: number;
  longStrike?: number;
  putShortStrike?: number;
  callShortStrike?: number;
  credit?: number;
  combinedCredit?: number;
  currentSpx: number | null;
  pnl: number | null;
}

interface SignalHistoryEntry {
  key: string;
  type: string;
  timestamp: string;
  spxPrice: number;
  score: number;
  shortStrike?: number;
  longStrike?: number;
  putShortStrike?: number;
  putLongStrike?: number;
  callShortStrike?: number;
  callLongStrike?: number;
  credit?: number;
  combinedCredit?: number;
  putCredit?: number;
  callCredit?: number;
  spxClose: number;
  result: string;
  pnlPerContract: number;
  pnlPct: number;
  settledAt: string;
}

interface SignalStats {
  wins: number;
  losses: number;
  partials: number;
  total: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  avgCredit: number;
  bestTrade: number;
  worstTrade: number;
}

interface HistoryEntry {
  date: string;
  time: string;
  spxPrice: number;
  vix: number;
  expectedMove: number;
  bias: string;
  trendStrength: number;
  alertsSent: number;
  topSpreadScore: number;
  topCondorScore: number;
}

interface SpxData {
  live: {
    spxPrice: number | null;
    spxChange: number | null;
    spxChangePct: number | null;
    vix: number | null;
    vixChange: number | null;
    expectedMove: number | null;
  };
  conditions: Conditions | null;
  lastScan: {
    timestamp: string;
    topCreditSpreads: CreditSpread[];
    topIronCondors: IronCondor[];
    alertsSent: number;
  } | null;
  lastRun: string | null;
  todaySignals: TodaySignal[];
  signalHistory: SignalHistoryEntry[];
  signalStats: SignalStats;
  stats: {
    totalScans: number;
    totalAlerts: number;
    avgAlertsPerDay: number;
  };
  history: HistoryEntry[];
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function biasColor(bias: string): string {
  if (bias === 'bullish') return 'text-green';
  if (bias === 'bearish') return 'text-red';
  return 'text-yellow';
}

function biasEmoji(bias: string): string {
  if (bias === 'bullish') return '📈';
  if (bias === 'bearish') return '📉';
  return '⚖️';
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green font-bold';
  if (score >= 60) return 'text-yellow';
  if (score >= 40) return 'text-yellow';
  return 'text-muted';
}

function resultRowClass(result: string): string {
  if (result === 'win') return 'bg-green/10 border-l-2 border-l-green';
  if (result === 'loss') return 'bg-red/10 border-l-2 border-l-red';
  if (result === 'partial') return 'bg-yellow/10 border-l-2 border-l-yellow';
  return '';
}

function resultBadge(result: string): React.ReactNode {
  const colors: Record<string, string> = {
    win: 'bg-green/20 text-green',
    loss: 'bg-red/20 text-red',
    partial: 'bg-yellow/20 text-yellow',
  };
  const labels: Record<string, string> = { win: '✅ WIN', loss: '❌ LOSS', partial: '🟡 PARTIAL' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colors[result] || 'bg-panel text-muted'}`}>
      {labels[result] || result.toUpperCase()}
    </span>
  );
}

function strikeDisplay(s: SignalHistoryEntry): string {
  if (s.type === 'iron_condor') {
    return `${s.putShortStrike}P/${s.putLongStrike ?? (s.putShortStrike! - 5)}P · ${s.callShortStrike}C/${s.callLongStrike ?? (s.callShortStrike! + 5)}C`;
  }
  return `${s.shortStrike}/${s.longStrike}`;
}

const CONTRACT_OPTIONS = [1, 2, 3, 5, 10, 15, 20];

export default function Spx0dtePage() {
  const router = useRouter();
  const [data, setData] = useState<SpxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [contracts, setContracts] = useState(1);

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
      const d = await api('/api/spx-0dte');
      setData(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const live = data?.live;
  const cond = data?.conditions;
  const scan = data?.lastScan;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">⚡ SPX 0DTE Scanner</h1>
        <div className="flex items-center gap-3">
          {data?.lastRun && (
            <span className="text-xs text-muted">Last scan: {timeAgo(data.lastRun)}</span>
          )}
          <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1.5 rounded hover:bg-panel2">
            🔄 Refresh
          </button>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">Contracts:</label>
            <select
              value={contracts}
              onChange={e => setContracts(Number(e.target.value))}
              className="text-sm bg-panel border border-border px-2 py-1.5 rounded hover:bg-panel2 text-text"
            >
              {CONTRACT_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {err && <div className="bg-red/10 border border-red text-red p-3 rounded mb-4">{err}</div>}

      {loading && <div className="text-muted py-8 text-center">Loading SPX 0DTE data...</div>}

      {!loading && data && (
        <>
          {/* Live Market Strip */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <StatCard label="SPX" value={live?.spxPrice ? `$${fmt(live.spxPrice)}` : '—'}
              sub={live?.spxChangePct != null ? `${live.spxChangePct >= 0 ? '+' : ''}${fmt(live.spxChangePct)}%` : undefined}
              subColor={live?.spxChangePct != null ? (live.spxChangePct >= 0 ? 'text-green' : 'text-red') : undefined} />
            <StatCard label="VIX" value={live?.vix ? fmt(live.vix, 1) : '—'}
              sub={live?.vixChange != null ? `${live.vixChange >= 0 ? '+' : ''}${fmt(live.vixChange, 1)}` : undefined}
              subColor={live?.vixChange != null ? (live.vixChange >= 0 ? 'text-red' : 'text-green') : undefined} />
            <StatCard label="Expected Move" value={live?.expectedMove ? `±$${fmt(live.expectedMove)}` : '—'} />
            <StatCard label="Bias" value={cond ? `${biasEmoji(cond.bias)} ${cond.bias.toUpperCase()}` : '—'}
              color={cond ? biasColor(cond.bias) : undefined} />
            <StatCard label="Trend Strength" value={cond ? `${cond.trendStrength}/100` : '—'}
              color={cond ? (cond.trendStrength >= 50 ? 'text-green' : cond.trendStrength >= 30 ? 'text-yellow' : 'text-muted') : undefined} />
            <StatCard label="Today Alerts" value={String(data.todaySignals.length)} />
          </div>

          {/* Market Conditions */}
          {cond && (
            <div className="bg-panel border border-border rounded-lg p-4 mb-6">
              <h2 className="text-sm font-semibold text-muted mb-3">📊 Market Conditions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted">VWAP: </span>
                  <span className="font-mono">${fmt(cond.vwap)}</span>
                  <span className={`ml-1 text-xs ${cond.aboveVwap ? 'text-green' : 'text-red'}`}>
                    {cond.aboveVwap ? '▲ above' : '▼ below'}
                  </span>
                </div>
                <div>
                  <span className="text-muted">SMA20: </span>
                  <span className="font-mono">${fmt(cond.sma20)}</span>
                  <span className={`ml-1 text-xs ${cond.aboveSma20 ? 'text-green' : 'text-red'}`}>
                    {cond.aboveSma20 ? '▲ above' : '▼ below'}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Range: </span>
                  <span className="font-mono">${fmt(cond.rangeLow)} – ${fmt(cond.rangeHigh)}</span>
                  <span className="text-muted text-xs ml-1">({fmt(cond.rangePct, 3)}%)</span>
                </div>
                <div>
                  <span className="text-muted">Momentum: </span>
                  <span className={`font-mono ${cond.momentum >= 0 ? 'text-green' : 'text-red'}`}>
                    {cond.momentum >= 0 ? '+' : ''}{fmt(cond.momentum, 4)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Today's Alerts */}
          {data.todaySignals.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">🔔 Today&apos;s Alerts</h2>
              <div className="space-y-3">
                {data.todaySignals.map((s, i) => (
                  <div key={i} className="bg-panel border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {s.type === 'iron_condor' ? '🦅' : s.type === 'put_credit' ? '🟢' : '🔴'}
                        </span>
                        <span className="font-bold">
                          {s.type === 'iron_condor' ? 'Iron Condor' :
                           s.type === 'put_credit' ? 'Put Credit Spread' : 'Call Credit Spread'}
                        </span>
                        <span className={`text-sm ${scoreColor(s.score)}`}>Score: {s.score}</span>
                      </div>
                      <span className="text-xs text-muted">{timeAgo(s.timestamp)}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {s.type === 'iron_condor' ? (
                        <>
                          <div><span className="text-muted">Put side:</span> {s.putShortStrike}P / {(s.putShortStrike || 0) - 5}P</div>
                          <div><span className="text-muted">Call side:</span> {s.callShortStrike}C / {(s.callShortStrike || 0) + 5}C</div>
                          <div><span className="text-muted">Credit:</span> <span className="text-green font-mono">${fmt(s.combinedCredit)}</span></div>
                        </>
                      ) : (
                        <>
                          <div><span className="text-muted">Strikes:</span> {s.shortStrike} / {s.longStrike}</div>
                          <div><span className="text-muted">Credit:</span> <span className="text-green font-mono">${fmt(s.credit)}</span></div>
                        </>
                      )}
                      <div>
                        <span className="text-muted">SPX at alert:</span> <span className="font-mono">${fmt(s.spxPrice)}</span>
                        {s.pnl != null && (
                          <span className={`ml-2 text-xs ${s.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                            ({s.pnl >= 0 ? '+' : ''}{fmt(s.pnl)} pts since)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal History — split by strategy */}
          {data.signalHistory?.length > 0 && (() => {
            const csHistory = data.signalHistory.filter(s => s.type !== 'iron_condor');
            const icHistory = data.signalHistory.filter(s => s.type === 'iron_condor');
            return (
              <>
                {/* Credit Spreads History */}
                {csHistory.length > 0 && (
                  <HistorySection
                    title="💰 Credit Spread Settlement History"
                    entries={csHistory}
                    showType={true}
                    contracts={contracts}
                  />
                )}

                {/* Iron Condor History */}
                {icHistory.length > 0 && (
                  <HistorySection
                    title="🦅 Iron Condor Settlement History"
                    entries={icHistory}
                    showType={false}
                    contracts={contracts}
                  />
                )}
              </>
            );
          })()}

          {/* Top Setups from Last Scan */}
          {scan && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Credit Spreads */}
              <div className="bg-panel border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-muted mb-3">💰 Top Credit Spreads</h3>
                {(scan.topCreditSpreads?.length || 0) === 0 ? (
                  <div className="text-muted text-sm py-4 text-center">No qualifying spreads found</div>
                ) : (
                  <div className="space-y-2">
                    {scan.topCreditSpreads.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span>{s.type === 'put_credit' ? '🟢' : '🔴'}</span>
                          <span className="font-mono">{s.shortStrike}/{s.longStrike}</span>
                          <span className="text-xs text-muted">{s.type === 'put_credit' ? 'PUT' : 'CALL'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green font-mono">${fmt(s.credit)}</span>
                          <span className="text-muted">{s.creditPct}%</span>
                          <span className="text-muted">Δ{(s.shortDelta * 100).toFixed(0)}%</span>
                          <span className="text-muted">{s.emMultiple}x EM</span>
                          <span className={scoreColor(s.score)}>{s.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Iron Condors */}
              <div className="bg-panel border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-muted mb-3">🦅 Top Iron Condors</h3>
                {(scan.topIronCondors?.length || 0) === 0 ? (
                  <div className="text-muted text-sm py-4 text-center">No qualifying condors found (need neutral bias + first hour passed)</div>
                ) : (
                  <div className="space-y-2">
                    {scan.topIronCondors.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span>🦅</span>
                          <span className="font-mono text-xs">
                            {c.putShortStrike}P / {c.callShortStrike}C
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green font-mono">${fmt(c.combinedCredit)}</span>
                          <span className="text-muted">{c.creditPct}%</span>
                          <span className="text-muted">R:R {c.rrRatio}</span>
                          <span className={scoreColor(c.score)}>{c.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scan History */}
          {data.history.length > 0 && (
            <div className="bg-panel border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted mb-3">📅 Scan History (Last 30 Days)</h3>
              <div className="flex items-center gap-4 text-sm mb-3">
                <StatMini label="Total Scans" value={String(data.stats.totalScans)} />
                <StatMini label="Total Alerts" value={String(data.stats.totalAlerts)} />
                <StatMini label="Avg/Day" value={fmt(data.stats.avgAlertsPerDay, 1)} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-left text-xs">
                      <th className="py-1.5 px-2">Date</th>
                      <th className="py-1.5 px-2 text-right">SPX</th>
                      <th className="py-1.5 px-2 text-right">VIX</th>
                      <th className="py-1.5 px-2 text-right">EM</th>
                      <th className="py-1.5 px-2">Bias</th>
                      <th className="py-1.5 px-2 text-right">Strength</th>
                      <th className="py-1.5 px-2 text-right">Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => (
                      <tr key={i} className="border-b border-border/30 text-xs">
                        <td className="py-1.5 px-2 text-muted">{h.time ? timeAgo(h.time) : h.date}</td>
                        <td className="py-1.5 px-2 text-right font-mono">${fmt(h.spxPrice)}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{fmt(h.vix, 1)}</td>
                        <td className="py-1.5 px-2 text-right font-mono">±${fmt(h.expectedMove)}</td>
                        <td className={`py-1.5 px-2 ${biasColor(h.bias)}`}>
                          {biasEmoji(h.bias)} {h.bias}
                        </td>
                        <td className="py-1.5 px-2 text-right">{h.trendStrength}</td>
                        <td className="py-1.5 px-2 text-right">
                          {h.alertsSent > 0 ? <span className="text-accent font-bold">{h.alertsSent}</span> : <span className="text-muted">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="text-xs text-muted mt-6 text-center">
            ⚠️ 0DTE options carry extreme gamma risk. Informational only — not financial advice. Size small.
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color = 'text-text', subColor }: {
  label: string; value: string; color?: string; sub?: string; subColor?: string;
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className={`text-xs ${subColor || 'text-muted'}`}>{sub}</div>}
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted">{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function HistorySection({ title, entries, showType, contracts }: {
  title: string; entries: SignalHistoryEntry[]; showType: boolean; contracts: number;
}) {
  const wins = entries.filter(s => s.result === 'win').length;
  const losses = entries.filter(s => s.result === 'loss').length;
  const partials = entries.filter(s => s.result === 'partial').length;
  const totalPnl = entries.reduce((sum, s) => sum + s.pnlPerContract, 0);
  const winTotal = entries.filter(s => s.pnlPerContract > 0).reduce((sum, s) => sum + s.pnlPerContract, 0);
  const lossTotal = entries.filter(s => s.pnlPerContract < 0).reduce((sum, s) => sum + s.pnlPerContract, 0);
  const winRate = entries.length > 0 ? +((wins / entries.length) * 100).toFixed(1) : 0;
  const credits = entries.map(s => s.type === 'iron_condor' ? (s.combinedCredit || 0) : (s.credit || 0));
  const avgCredit = credits.length > 0 ? credits.reduce((a, b) => a + b, 0) / credits.length : 0;
  const bestTrade = entries.length > 0 ? Math.max(...entries.map(s => s.pnlPerContract)) : 0;
  const worstTrade = entries.length > 0 ? Math.min(...entries.map(s => s.pnlPerContract)) : 0;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        <StatCard label="Trades" value={String(entries.length)} />
        <StatCard label={`Wins (${wins})`}
          value={`+$${fmt(winTotal * contracts)}`}
          color="text-green"
          sub={contracts > 1 ? `$${fmt(winTotal)}/ct` : undefined} />
        <StatCard label={`Losses (${losses})`}
          value={`-$${fmt(Math.abs(lossTotal) * contracts)}`}
          color="text-red"
          sub={contracts > 1 ? `-$${fmt(Math.abs(lossTotal))}/ct` : undefined} />
        <StatCard label="Net Profit"
          value={`${totalPnl >= 0 ? '+' : '-'}$${fmt(Math.abs(totalPnl) * contracts)}`}
          color={totalPnl >= 0 ? 'text-green' : 'text-red'}
          sub={contracts > 1 ? `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}/ct` : 'per contract'} />
        <StatCard label="Win Rate"
          value={`${winRate}%`}
          color={winRate >= 50 ? 'text-green' : 'text-red'} />
        <StatCard label="Avg Credit" value={`$${fmt(avgCredit * contracts)}`}
          sub={contracts > 1 ? `$${fmt(avgCredit)}/ct` : undefined} />
        <StatCard label="Best Trade" value={`+$${fmt(bestTrade * contracts)}`} color="text-green" />
        <StatCard label="Worst Trade" value={`-$${fmt(Math.abs(worstTrade) * contracts)}`} color="text-red" />
      </div>

      <div className="bg-panel border border-border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-left text-xs">
                <th className="py-2 px-2">Date</th>
                {showType && <th className="py-2 px-2">Type</th>}
                <th className="py-2 px-2">Strikes</th>
                <th className="py-2 px-2 text-right">Credit</th>
                <th className="py-2 px-2 text-right">SPX @ Alert</th>
                <th className="py-2 px-2 text-right">SPX Close</th>
                <th className="py-2 px-2 text-center">Result</th>
                <th className="py-2 px-2 text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((s, i) => {
                const credit = s.type === 'iron_condor' ? s.combinedCredit : s.credit;
                const typeLabel = s.type === 'put_credit' ? '🟢 Put CS' : '🔴 Call CS';
                const dateStr = new Date(s.settledAt || s.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <tr key={i} className={`text-xs ${resultRowClass(s.result)}`}>
                    <td className="py-2 px-2 text-muted">{dateStr}</td>
                    {showType && <td className="py-2 px-2 whitespace-nowrap">{typeLabel}</td>}
                    <td className="py-2 px-2 font-mono whitespace-nowrap">{strikeDisplay(s)}</td>
                    <td className="py-2 px-2 text-right font-mono text-green">${fmt(credit)}</td>
                    <td className="py-2 px-2 text-right font-mono">${fmt(s.spxPrice)}</td>
                    <td className="py-2 px-2 text-right font-mono">${fmt(s.spxClose)}</td>
                    <td className="py-2 px-2 text-center">{resultBadge(s.result)}</td>
                    <td className={`py-2 px-2 text-right font-mono font-semibold ${s.pnlPerContract >= 0 ? 'text-green' : 'text-red'}`}>
                      {s.pnlPerContract >= 0 ? '+' : ''}{fmt(s.pnlPerContract * contracts)}
                      {contracts === 1 && <span className="text-muted font-normal"> ({s.pnlPct}%)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scoring Methodology */}
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-xl font-bold mb-4">📐 How Scoring Works</h2>
        <p className="text-muted text-sm mb-4">Every signal is scored 0-100. Minimum <span className="text-accent font-semibold">55</span> to alert (credit spreads) or <span className="text-accent font-semibold">65</span> (iron condors). Here's the breakdown:</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Credit Spread Scoring */}
          <div className="bg-panel border border-border rounded-lg p-4">
            <h3 className="font-bold text-accent mb-3">Credit Spread Scoring (0-100)</h3>

            <div className="mb-3">
              <h4 className="text-sm font-semibold text-green mb-1">💰 Premium Quality (max 30 pts)</h4>
              <p className="text-xs text-muted mb-1">Credit as % of spread width ($5). Higher = better risk/reward.</p>
              <div className="text-xs space-y-0.5">
                <div>≥40% of width → <span className="text-green font-mono">30 pts</span></div>
                <div>≥35% → <span className="text-green font-mono">28 pts</span></div>
                <div>≥30% → <span className="text-green font-mono">25 pts</span></div>
                <div>≥25% → <span className="font-mono">20 pts</span></div>
                <div>≥20% → <span className="font-mono">15 pts</span></div>
                <div>≥15% (minimum) → <span className="font-mono">10 pts</span></div>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="text-sm font-semibold text-green mb-1">📏 Distance / Expected Move (max 30 pts)</h4>
              <p className="text-xs text-muted mb-1">How far the short strike is from SPX price vs expected move. Higher = safer.</p>
              <div className="text-xs space-y-0.5">
                <div>≥2.0x expected move → <span className="text-green font-mono">30 pts</span></div>
                <div>≥1.5x → <span className="text-green font-mono">25 pts</span></div>
                <div>≥1.2x → <span className="font-mono">20 pts</span></div>
                <div>≥1.0x → <span className="font-mono">15 pts</span></div>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="text-sm font-semibold text-yellow mb-1">📉 Delta Quality (max 20 pts)</h4>
              <p className="text-xs text-muted mb-1">Short strike delta — probability of expiring ITM. Sweet spot is 4-8 delta.</p>
              <div className="text-xs space-y-0.5">
                <div>4-8 delta (sweet spot) → <span className="text-green font-mono">20 pts</span></div>
                <div>≤10 delta → <span className="font-mono">15 pts</span></div>
                <div>{'>'} 10 delta → <span className="font-mono">10 pts</span></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-yellow mb-1">💧 Liquidity (max 20 pts)</h4>
              <p className="text-xs text-muted mb-1">Open interest + volume. Better liquidity = tighter fills.</p>
              <div className="text-xs space-y-0.5">
                <div>OI ≥500 + Vol ≥100 → <span className="text-green font-mono">20 pts</span></div>
                <div>OI ≥100 + Vol ≥20 → <span className="font-mono">15 pts</span></div>
                <div>Meets minimum → <span className="font-mono">10 pts</span></div>
              </div>
            </div>
          </div>

          {/* Iron Condor Scoring */}
          <div className="bg-panel border border-border rounded-lg p-4">
            <h3 className="font-bold text-accent mb-3">Iron Condor Scoring (0-100)</h3>
            <p className="text-xs text-muted mb-3">Only evaluated when market is <span className="font-semibold">neutral/range-bound</span>, VIX ≥16, and trend strength ≤30.</p>

            <div className="mb-3">
              <h4 className="text-sm font-semibold text-green mb-1">💰 Combined Premium (max 30 pts)</h4>
              <p className="text-xs text-muted mb-1">Both legs' credit combined as % of width. Min 40%.</p>
              <div className="text-xs space-y-0.5">
                <div>≥55% combined → <span className="text-green font-mono">30 pts</span></div>
                <div>≥45% → <span className="text-green font-mono">25 pts</span></div>
                <div>≥40% (minimum) → <span className="font-mono">20 pts</span></div>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="text-sm font-semibold text-green mb-1">📏 Both Legs vs Expected Move (max 30 pts)</h4>
              <p className="text-xs text-muted mb-1">Minimum of both legs' distance from price vs expected move.</p>
              <div className="text-xs space-y-0.5">
                <div>Both ≥1.5x EM → <span className="text-green font-mono">30 pts</span></div>
                <div>Both ≥1.2x → <span className="text-green font-mono">25 pts</span></div>
                <div>Both ≥1.0x → <span className="font-mono">20 pts</span></div>
                <div>Both ≥0.8x → <span className="font-mono">10 pts</span></div>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="text-sm font-semibold text-yellow mb-1">⚖️ Delta Balance (max 20 pts)</h4>
              <p className="text-xs text-muted mb-1">How symmetric the two sides are. Balanced = better.</p>
              <div className="text-xs space-y-0.5">
                <div>Delta ratio ≥0.7 → <span className="text-green font-mono">20 pts</span></div>
                <div>Ratio ≥0.5 → <span className="font-mono">15 pts</span></div>
                <div>Below 0.5 → <span className="font-mono">10 pts</span></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-yellow mb-1">💧 Liquidity (max 20 pts)</h4>
              <div className="text-xs space-y-0.5">
                <div>Min OI ≥200 → <span className="text-green font-mono">20 pts</span></div>
                <div>Min OI ≥50 → <span className="font-mono">15 pts</span></div>
                <div>Below 50 → <span className="font-mono">10 pts</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Scanner Config */}
        <div className="bg-panel border border-border rounded-lg p-4">
          <h3 className="font-bold text-accent mb-3">⚙️ Scanner Config</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted">Spread Width:</span> <span className="font-mono font-bold">$5</span></div>
            <div><span className="text-muted">Target Delta:</span> <span className="font-mono font-bold">5-8Δ</span> <span className="text-xs text-muted">(range: 3-20)</span></div>
            <div><span className="text-muted">Min Credit:</span> <span className="font-mono font-bold">15%</span> <span className="text-xs text-muted">of width</span></div>
            <div><span className="text-muted">CS Alert:</span> <span className="font-mono font-bold">Score ≥55</span></div>
            <div><span className="text-muted">IC Alert:</span> <span className="font-mono font-bold">Score ≥65</span></div>
            <div><span className="text-muted">IC Min VIX:</span> <span className="font-mono font-bold">16</span></div>
            <div><span className="text-muted">IC Max Trend:</span> <span className="font-mono font-bold">≤30/100</span></div>
            <div><span className="text-muted">Scan Cutoff:</span> <span className="font-mono font-bold">3:30pm ET</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
