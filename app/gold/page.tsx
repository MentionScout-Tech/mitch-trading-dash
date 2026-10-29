'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../../lib/api';

interface GoldSignal {
  id: string;
  date_found: string;
  ticker: string;
  name: string;
  method: string;
  trigger: string;
  confidence: number;
  price_found: number;
  notes: string;
  stop_loss: number;
  take_profit: number;
  direction: string;
  setup_type: string;
  result?: string;
  exit_price?: number;
}

interface GoldStats {
  total: number;
  wins: number;
  losses: number;
  tracking: number;
  winRate: string;
  totalPL: number;
  totalPips: number;
  avgRR: string;
  bySetup: Record<string, { wins: number; losses: number; tracking: number; pl: number }>;
}

/* ── GLD Weekly Credit Spread types ─────────────────────── */

interface GLDActiveSignal {
  key: string;
  type: string; // 'put_credit' | 'call_credit' | 'iron_condor'
  timestamp: string;
  gldPrice: number;
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
  maxRisk: number;
  rrRatio: number;
  shortDelta?: number;
  putDelta?: number;
  callDelta?: number;
  score: number;
  status: string;
  currentGld: number | null;
  pnl: number | null;
}

interface GLDSettlementEntry {
  key: string;
  type: string;
  timestamp: string;
  gldPrice: number;
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
  gldClose: number;
  result: string; // 'win' | 'loss' | 'partial'
  pnlPerContract: number;
  pnlPct: number;
  settledAt: string;
}

interface GLDWeeklyData {
  live: {
    gldPrice: number | null;
    gldChange: number | null;
    gldChangePct: number | null;
    gvz: number | null;
    gvzChange: number | null;
    expectedMove: number | null;
    bias: string | null;
  };
  lastRun: string | null;
  activeSignals: GLDActiveSignal[];
  settlementHistory: GLDSettlementEntry[];
  stats: {
    totalPremiums: number;
  };
}

/* ── GLD helpers (mirroring SPX 0DTE patterns) ───────── */

function gldFmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function gldTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function gldBiasColor(bias: string | null): string {
  if (bias === 'bullish') return 'text-green';
  if (bias === 'bearish') return 'text-red';
  return 'text-yellow';
}

function gldBiasEmoji(bias: string | null): string {
  if (bias === 'bullish') return '📈';
  if (bias === 'bearish') return '📉';
  return '⚖️';
}

function gldScoreColor(score: number): string {
  if (score >= 80) return 'text-green font-bold';
  if (score >= 60) return 'text-yellow';
  if (score >= 40) return 'text-yellow';
  return 'text-muted';
}

function gldResultRowClass(result: string): string {
  if (result === 'win') return 'bg-green/10 border-l-2 border-l-green';
  if (result === 'loss') return 'bg-red/10 border-l-2 border-l-red';
  if (result === 'partial') return 'bg-yellow/10 border-l-2 border-l-yellow';
  return '';
}

function gldResultBadge(result: string): React.ReactNode {
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

function gldStrikeDisplay(s: GLDSettlementEntry | GLDActiveSignal): string {
  if (s.type === 'iron_condor') {
    return `${s.putShortStrike}P/${s.putLongStrike ?? ((s.putShortStrike || 0) - 1)}P · ${s.callShortStrike}C/${s.callLongStrike ?? ((s.callShortStrike || 0) + 1)}C`;
  }
  return `${s.shortStrike}/${s.longStrike}`;
}

function gldTypeLabel(type: string): string {
  if (type === 'put_credit') return '🟢 Put CS';
  if (type === 'call_credit') return '🔴 Call CS';
  if (type === 'iron_condor') return '🦅 IC';
  return type;
}

const GLD_CONTRACT_OPTIONS = [1, 2, 3, 5, 10, 15, 20];

export default function GoldPage() {
  const router = useRouter();
  const [signals, setSignals] = useState<GoldSignal[]>([]);
  const [stats, setStats] = useState<GoldStats | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // GLD weekly credit spread state
  const [gldData, setGldData] = useState<GLDWeeklyData | null>(null);
  const [gldLoading, setGldLoading] = useState(true);
  const [gldContracts, setGldContracts] = useState(1);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push('/login'); return; }

    Promise.all([
      api('/api/gold'),
      api('/api/gold/stats'),
      api('/api/quote?ticker=GC%3DF'),
    ])
      .then(([goldData, statsData, quoteData]) => {
        setSignals(goldData.signals || []);
        setStats(statsData);
        setPrice(quoteData.price || null);
        setPriceChange(quoteData.changePercent || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch GLD weekly data
    api('/api/gld-weekly')
      .then((d) => setGldData(d))
      .catch(() => {})
      .finally(() => setGldLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-[#FFD700] text-lg animate-pulse">Loading gold data...</div>
      </div>
    );
  }

  const tracking = signals.filter((s) => s.result === 'TRACKING' || !s.result);
  const completed = signals.filter((s) => s.result === 'WIN' || s.result === 'LOSS');

  const setupLabels: Record<string, string> = {
    asian_breakout: 'Asian Range Breakout',
    ema_bounce: '20 EMA Bounce',
    zone_rejection: 'S/D Zone Rejection',
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 p-6">
      {/* Header with live price */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#FFD700]">🥇 Gold Day Trading</h1>
            <p className="text-gray-400 text-sm mt-1">XAU/USD Scanner — 3 Setups</p>
          </div>
          <div className="text-right">
            {price && (
              <>
                <div className="text-3xl font-mono font-bold text-[#FFD700]">
                  ${price.toFixed(2)}
                </div>
                <div className={`text-sm ${(priceChange ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                  {(priceChange ?? 0) >= 0 ? '+' : ''}{priceChange?.toFixed(2)}%
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard label="Total Trades" value={stats.total.toString()} />
            <StatCard label="Win Rate" value={`${stats.winRate}%`} color={Number(stats.winRate) >= 50 ? '#22c55e' : '#ef4444'} />
            <StatCard label="P&L ($)" value={`$${stats.totalPL >= 0 ? '+' : ''}${stats.totalPL.toFixed(2)}`} color={stats.totalPL >= 0 ? '#22c55e' : '#ef4444'} />
            <StatCard label="Total Pips" value={stats.totalPips.toString()} color={stats.totalPips >= 0 ? '#22c55e' : '#ef4444'} />
            <StatCard label="Avg R:R" value={stats.avgRR} />
          </div>
        )}

        {/* Setup Breakdown */}
        {stats && stats.bySetup && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-[#FFD700] mb-4">Setup Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(stats.bySetup).map(([type, data]) => (
                <div key={type} className="bg-[#12121a] border border-[#FFD700]/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-[#FFD700] mb-2">{setupLabels[type] || type}</h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-green">W: {data.wins}</span>
                    <span className="text-red">L: {data.losses}</span>
                    <span className="text-yellow">T: {data.tracking}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    Win Rate: {(data.wins + data.losses) > 0
                      ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(0)
                      : '—'}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Signals */}
        {tracking.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-[#FFD700] mb-4">🔴 Active Signals ({tracking.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tracking.map((s) => (
                <SignalCard key={s.id} signal={s} setupLabels={setupLabels} />
              ))}
            </div>
          </div>
        )}

        {/* Completed Signals Table */}
        {completed.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-[#FFD700] mb-4">📊 Completed Trades ({completed.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#FFD700]/20 text-[#FFD700]/80">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Setup</th>
                    <th className="text-left py-2 px-3">Direction</th>
                    <th className="text-right py-2 px-3">Entry</th>
                    <th className="text-right py-2 px-3">Stop</th>
                    <th className="text-right py-2 px-3">Target</th>
                    <th className="text-center py-2 px-3">Result</th>
                    <th className="text-right py-2 px-3">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((s) => {
                    const pl = s.result === 'WIN'
                      ? (s.direction === 'LONG' ? s.take_profit - s.price_found : s.price_found - s.take_profit)
                      : (s.direction === 'LONG' ? s.stop_loss - s.price_found : s.price_found - s.stop_loss);
                    return (
                      <tr key={s.id} className="border-b border-gray-800 hover:bg-[#1a1a2e]">
                        <td className="py-2 px-3 text-gray-400">{s.date_found}</td>
                        <td className="py-2 px-3">{setupLabels[s.setup_type] || s.setup_type}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.direction === 'LONG' ? 'bg-green/15 text-green' : 'bg-red/15 text-red'}`}>
                            {s.direction}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">${s.price_found.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-mono text-red">${s.stop_loss.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-mono text-green">${s.take_profit.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.result === 'WIN' ? 'bg-green/15 text-green' : 'bg-red/15 text-red'}`}>
                            {s.result}
                          </span>
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${pl >= 0 ? 'text-green' : 'text-red'}`}>
                          {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {signals.length === 0 && !gldData && (
          <div className="text-center py-20 text-gray-500">
            <div className="text-4xl mb-4">🥇</div>
            <p>No gold signals yet. Scanner runs every 30 min during market hours (07:00-21:00 UTC).</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            GLD Weekly Credit Spreads Section
            ═══════════════════════════════════════════════════════ */}
        <div className="mt-12 border-t border-border pt-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#FFD700]">🥇 GLD Weekly Credit Spreads</h2>
              <p className="text-muted text-sm mt-1">GLD options — weekly expiry credit spread signals</p>
            </div>
            <div className="flex items-center gap-3">
              {gldData?.lastRun && (
                <span className="text-xs text-muted">Last scan: {gldTimeAgo(gldData.lastRun)}</span>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted">Contracts:</label>
                <select
                  value={gldContracts}
                  onChange={e => setGldContracts(Number(e.target.value))}
                  className="text-sm bg-panel border border-border px-2 py-1.5 rounded hover:bg-panel2 text-text"
                >
                  {GLD_CONTRACT_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {gldLoading && <div className="text-muted py-8 text-center">Loading GLD weekly data...</div>}

          {!gldLoading && gldData && (
            <>
              {/* Live Market Strip */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                <GLDStatCard label="GLD" value={gldData.live.gldPrice ? `$${gldFmt(gldData.live.gldPrice)}` : '—'}
                  sub={gldData.live.gldChangePct != null ? `${gldData.live.gldChangePct >= 0 ? '+' : ''}${gldFmt(gldData.live.gldChangePct)}%` : undefined}
                  subColor={gldData.live.gldChangePct != null ? (gldData.live.gldChangePct >= 0 ? 'text-green' : 'text-red') : undefined} />
                <GLDStatCard label="GVZ" value={gldData.live.gvz ? gldFmt(gldData.live.gvz, 1) : '—'}
                  sub={gldData.live.gvzChange != null ? `${gldData.live.gvzChange >= 0 ? '+' : ''}${gldFmt(gldData.live.gvzChange, 1)}` : undefined}
                  subColor={gldData.live.gvzChange != null ? (gldData.live.gvzChange >= 0 ? 'text-red' : 'text-green') : undefined} />
                <GLDStatCard label="Expected Move" value={gldData.live.expectedMove ? `±$${gldFmt(gldData.live.expectedMove)}` : '—'} />
                <GLDStatCard label="Bias" value={gldData.live.bias ? `${gldBiasEmoji(gldData.live.bias)} ${gldData.live.bias.toUpperCase()}` : '—'}
                  color={gldData.live.bias ? gldBiasColor(gldData.live.bias) : undefined} />
                <GLDStatCard label="Active Signals" value={String(gldData.activeSignals.length)} />
                <GLDStatCard label="Total Settled" value={String(gldData.settlementHistory.length)} />
              </div>

              {/* Active Signals Table */}
              {gldData.activeSignals.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">🔔 Active Signals</h3>
                  <div className="bg-panel border border-border rounded-lg p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted text-left text-xs">
                            <th className="py-2 px-2">Time</th>
                            <th className="py-2 px-2">Type</th>
                            <th className="py-2 px-2">Strikes</th>
                            <th className="py-2 px-2 text-right">Credit</th>
                            <th className="py-2 px-2 text-right">R:R</th>
                            <th className="py-2 px-2 text-right">Delta</th>
                            <th className="py-2 px-2 text-center">Score</th>
                            <th className="py-2 px-2 text-center">Status</th>
                            <th className="py-2 px-2 text-right">P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gldData.activeSignals.map((s, i) => {
                            const credit = s.type === 'iron_condor' ? s.combinedCredit : s.credit;
                            const delta = s.type === 'iron_condor'
                              ? `${((s.putDelta || 0) * 100).toFixed(0)}/${((s.callDelta || 0) * 100).toFixed(0)}`
                              : `${((s.shortDelta || 0) * 100).toFixed(0)}%`;
                            return (
                              <tr key={i} className="border-b border-border/30 text-xs hover:bg-panel2">
                                <td className="py-2 px-2 text-muted">{gldTimeAgo(s.timestamp)}</td>
                                <td className="py-2 px-2 whitespace-nowrap">{gldTypeLabel(s.type)}</td>
                                <td className="py-2 px-2 font-mono whitespace-nowrap">{gldStrikeDisplay(s)}</td>
                                <td className="py-2 px-2 text-right font-mono text-green">${gldFmt(credit)}</td>
                                <td className="py-2 px-2 text-right font-mono">{s.rrRatio}</td>
                                <td className="py-2 px-2 text-right font-mono">{delta}</td>
                                <td className={`py-2 px-2 text-center ${gldScoreColor(s.score)}`}>{s.score}</td>
                                <td className="py-2 px-2 text-center">
                                  <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent">{s.status}</span>
                                </td>
                                <td className={`py-2 px-2 text-right font-mono font-semibold ${(s.pnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                                  {s.pnl != null ? `${s.pnl >= 0 ? '+' : ''}${gldFmt(s.pnl * gldContracts)}` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Settlement History */}
              {gldData.settlementHistory.length > 0 && (
                <GLDSettlementSection
                  entries={gldData.settlementHistory}
                  contracts={gldContracts}
                  totalPremiums={gldData.stats?.totalPremiums ?? 0}
                />
              )}

              {gldData.activeSignals.length === 0 && gldData.settlementHistory.length === 0 && (
                <div className="text-center py-12 text-muted">
                  <div className="text-4xl mb-4">🥇</div>
                  <p>No GLD weekly credit spread signals yet. Scanner analyses GLD options chain for weekly expiries.</p>
                </div>
              )}

              {/* Disclaimer */}
              <div className="text-xs text-muted mt-6 text-center">
                ⚠️ Options carry significant risk. Informational only — not financial advice. Size appropriately.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Spot Gold components (original) ────────────────────── */

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#12121a] border border-[#FFD700]/20 rounded-lg p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color: color || '#FFD700' }}>
        {value}
      </div>
    </div>
  );
}

function SignalCard({ signal, setupLabels }: { signal: GoldSignal; setupLabels: Record<string, string> }) {
  return (
    <div className="bg-[#12121a] border border-[#FFD700]/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#FFD700]/80">{setupLabels[signal.setup_type] || signal.setup_type}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${signal.direction === 'LONG' ? 'bg-green/15 text-green' : 'bg-red/15 text-red'}`}>
          {signal.direction}
        </span>
      </div>
      <div className="text-lg font-mono font-bold text-white mb-2">${signal.price_found.toFixed(2)}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Stop:</span>{' '}
          <span className="text-red font-mono">${signal.stop_loss.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Target:</span>{' '}
          <span className="text-green font-mono">${signal.take_profit.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-400">{signal.trigger}</div>
      <div className="mt-1 text-xs text-gray-600">{signal.date_found}</div>
    </div>
  );
}

/* ── GLD Weekly Credit Spread components ────────────────── */

function GLDStatCard({ label, value, sub, color = 'text-text', subColor }: {
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

function GLDSettlementSection({ entries, contracts, totalPremiums }: {
  entries: GLDSettlementEntry[]; contracts: number; totalPremiums: number;
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

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3">💰 Settlement History</h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <GLDStatCard label="Total Trades" value={String(entries.length)} />
        <GLDStatCard label={`Wins (${wins})`}
          value={`+$${gldFmt(winTotal * contracts)}`}
          color="text-green"
          sub={contracts > 1 ? `$${gldFmt(winTotal)}/ct` : undefined} />
        <GLDStatCard label={`Losses (${losses})`}
          value={`-$${gldFmt(Math.abs(lossTotal) * contracts)}`}
          color="text-red"
          sub={contracts > 1 ? `-$${gldFmt(Math.abs(lossTotal))}/ct` : undefined} />
        <GLDStatCard label="Win Rate"
          value={`${winRate}%`}
          color={winRate >= 50 ? 'text-green' : 'text-red'} />
        <GLDStatCard label="Net P&L"
          value={`${totalPnl >= 0 ? '+' : '-'}$${gldFmt(Math.abs(totalPnl) * contracts)}`}
          color={totalPnl >= 0 ? 'text-green' : 'text-red'}
          sub={contracts > 1 ? `${totalPnl >= 0 ? '+' : ''}$${gldFmt(totalPnl)}/ct` : 'per contract'} />
        <GLDStatCard label="Premiums Collected" value={`$${gldFmt(totalPremiums * contracts)}`}
          sub={contracts > 1 ? `$${gldFmt(totalPremiums)}/ct` : undefined} />
        <GLDStatCard label="Avg Credit" value={`$${gldFmt(avgCredit * contracts)}`}
          sub={contracts > 1 ? `$${gldFmt(avgCredit)}/ct` : undefined} />
      </div>

      {/* History Table */}
      <div className="bg-panel border border-border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-left text-xs">
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">Strikes</th>
                <th className="py-2 px-2 text-right">Credit</th>
                <th className="py-2 px-2 text-right">GLD @ Alert</th>
                <th className="py-2 px-2 text-right">GLD Close</th>
                <th className="py-2 px-2 text-center">Result</th>
                <th className="py-2 px-2 text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((s, i) => {
                const credit = s.type === 'iron_condor' ? s.combinedCredit : s.credit;
                const dateStr = new Date(s.settledAt || s.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <tr key={i} className={`text-xs ${gldResultRowClass(s.result)}`}>
                    <td className="py-2 px-2 text-muted">{dateStr}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{gldTypeLabel(s.type)}</td>
                    <td className="py-2 px-2 font-mono whitespace-nowrap">{gldStrikeDisplay(s)}</td>
                    <td className="py-2 px-2 text-right font-mono text-green">${gldFmt(credit)}</td>
                    <td className="py-2 px-2 text-right font-mono">${gldFmt(s.gldPrice)}</td>
                    <td className="py-2 px-2 text-right font-mono">${gldFmt(s.gldClose)}</td>
                    <td className="py-2 px-2 text-center">{gldResultBadge(s.result)}</td>
                    <td className={`py-2 px-2 text-right font-mono font-semibold ${s.pnlPerContract >= 0 ? 'text-green' : 'text-red'}`}>
                      {s.pnlPerContract >= 0 ? '+' : ''}{gldFmt(s.pnlPerContract * contracts)}
                      {contracts === 1 && <span className="text-muted font-normal"> ({s.pnlPct}%)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
