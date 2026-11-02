'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../../lib/api';

/* ── NEM Weekly Credit Spread types ─────────────────────── */

interface NEMActiveSignal {
  key: string;
  type: string; // 'put_credit' | 'call_credit' | 'iron_condor'
  timestamp: string;
  nemPrice: number;
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
  currentNem: number | null;
  pnl: number | null;
}

interface NEMSettlementEntry {
  key: string;
  type: string;
  timestamp: string;
  nemPrice: number;
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
  nemClose: number;
  result: string; // 'win' | 'loss' | 'partial'
  pnlPerContract: number;
  pnlPct: number;
  settledAt: string;
}

interface NEMWeeklyData {
  live: {
    nemPrice: number | null;
    nemChange: number | null;
    nemChangePct: number | null;
    vix: number | null;
    vixChange: number | null;
    expectedMove: number | null;
    bias: string | null;
  };
  lastRun: string | null;
  activeSignals: NEMActiveSignal[];
  settlementHistory: NEMSettlementEntry[];
  stats: {
    totalPremiums: number;
  };
}

/* ── Helpers ───────────────────────────────────────────── */

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

function biasColor(bias: string | null): string {
  if (bias === 'bullish') return 'text-green';
  if (bias === 'bearish') return 'text-red';
  return 'text-yellow';
}

function biasEmoji(bias: string | null): string {
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

function strikeDisplay(s: NEMSettlementEntry | NEMActiveSignal): string {
  if (s.type === 'iron_condor') {
    return `${s.putShortStrike}P/${s.putLongStrike ?? ((s.putShortStrike || 0) - 2.5)}P · ${s.callShortStrike}C/${s.callLongStrike ?? ((s.callShortStrike || 0) + 2.5)}C`;
  }
  return `${s.shortStrike}/${s.longStrike}`;
}

function typeLabel(type: string): string {
  if (type === 'put_credit') return '🟢 Put CS';
  if (type === 'call_credit') return '🔴 Call CS';
  if (type === 'iron_condor') return '🦅 IC';
  return type;
}

const CONTRACT_OPTIONS = [1, 2, 3, 5, 10, 15, 20];

export default function NEMPage() {
  const router = useRouter();

  // NEM weekly credit spread state
  const [nemData, setNemData] = useState<NEMWeeklyData | null>(null);
  const [nemLoading, setNemLoading] = useState(true);
  const [nemContracts, setNemContracts] = useState(1);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push('/login'); return; }

    // Fetch NEM weekly data
    api('/api/nem-weekly')
      .then((d) => setNemData(d))
      .catch(() => {})
      .finally(() => setNemLoading(false));
  }, [router]);

  if (nemLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-accent text-lg animate-pulse">Loading NEM data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-accent">⛏️ NEM Weekly Credit Spreads</h2>
            <p className="text-muted text-sm mt-1">Newmont Mining — weekly expiry credit spread signals</p>
          </div>
          <div className="flex items-center gap-3">
            {nemData?.lastRun && (
              <span className="text-xs text-muted">Last scan: {timeAgo(nemData.lastRun)}</span>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted">Contracts:</label>
              <select
                value={nemContracts}
                onChange={e => setNemContracts(Number(e.target.value))}
                className="text-sm bg-panel border border-border px-2 py-1.5 rounded hover:bg-panel2 text-text"
              >
                {CONTRACT_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {!nemData && (
          <div className="text-center py-20 text-muted">
            <div className="text-4xl mb-4">⛏️</div>
            <p>No NEM weekly data available. Scanner analyses NEM options chain for weekly expiries.</p>
          </div>
        )}

        {nemData && (
          <>
            {/* Live Market Strip */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              <StatCard label="NEM" value={nemData.live?.nemPrice ? `$${fmt(nemData.live?.nemPrice)}` : '—'}
                sub={nemData.live?.nemChangePct != null ? `${nemData.live?.nemChangePct >= 0 ? '+' : ''}${fmt(nemData.live?.nemChangePct)}%` : undefined}
                subColor={nemData.live?.nemChangePct != null ? (nemData.live?.nemChangePct >= 0 ? 'text-green' : 'text-red') : undefined} />
              <StatCard label="VIX" value={nemData.live?.vix ? fmt(nemData.live.vix, 1) : '—'}
                sub={nemData.live?.vixChange != null ? `${nemData.live?.vixChange >= 0 ? '+' : ''}${fmt(nemData.live?.vixChange, 1)}` : undefined}
                subColor={nemData.live?.vixChange != null ? (nemData.live?.vixChange >= 0 ? 'text-red' : 'text-green') : undefined} />
              <StatCard label="Expected Move" value={nemData.live?.expectedMove ? `±$${fmt(nemData.live?.expectedMove)}` : '—'} />
              <StatCard label="Bias" value={nemData.live?.bias ? `${biasEmoji(nemData.live?.bias)} ${nemData.live?.bias.toUpperCase()}` : '—'}
                color={nemData.live?.bias ? biasColor(nemData.live?.bias) : undefined} />
              <StatCard label="Active Signals" value={String((nemData.activeSignals || []).length)} />
              <StatCard label="Total Settled" value={String((nemData.settlementHistory || []).length)} />
            </div>

            {/* Active Signals Table */}
            {(nemData.activeSignals || []).length > 0 && (
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
                        {(nemData.activeSignals || []).map((s, i) => {
                          const credit = s.type === 'iron_condor' ? s.combinedCredit : s.credit;
                          const delta = s.type === 'iron_condor'
                            ? `${((s.putDelta || 0) * 100).toFixed(0)}/${((s.callDelta || 0) * 100).toFixed(0)}`
                            : `${((s.shortDelta || 0) * 100).toFixed(0)}%`;
                          return (
                            <tr key={i} className="border-b border-border/30 text-xs hover:bg-panel2">
                              <td className="py-2 px-2 text-muted">{timeAgo(s.timestamp)}</td>
                              <td className="py-2 px-2 whitespace-nowrap">{typeLabel(s.type)}</td>
                              <td className="py-2 px-2 font-mono whitespace-nowrap">{strikeDisplay(s)}</td>
                              <td className="py-2 px-2 text-right font-mono text-green">${fmt(credit)}</td>
                              <td className="py-2 px-2 text-right font-mono">{s.rrRatio}</td>
                              <td className="py-2 px-2 text-right font-mono">{delta}</td>
                              <td className={`py-2 px-2 text-center ${scoreColor(s.score)}`}>{s.score}</td>
                              <td className="py-2 px-2 text-center">
                                <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent">{s.status}</span>
                              </td>
                              <td className={`py-2 px-2 text-right font-mono font-semibold ${(s.pnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                                {s.pnl != null ? `${s.pnl >= 0 ? '+' : ''}${fmt(s.pnl * nemContracts)}` : '—'}
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
            {(nemData.settlementHistory || []).length > 0 && (
              <SettlementSection
                entries={nemData.settlementHistory}
                contracts={nemContracts}
                totalPremiums={nemData.stats?.totalPremiums ?? 0}
              />
            )}

            {(nemData.activeSignals || []).length === 0 && (nemData.settlementHistory || []).length === 0 && (
              <div className="text-center py-12 text-muted">
                <div className="text-4xl mb-4">⛏️</div>
                <p>No NEM weekly credit spread signals yet. Scanner analyses NEM options chain for weekly expiries.</p>
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
  );
}

/* ── Components ─────────────────────────────────────────── */

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

function SettlementSection({ entries, contracts, totalPremiums }: {
  entries: NEMSettlementEntry[]; contracts: number; totalPremiums: number;
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
        <StatCard label="Total Trades" value={String(entries.length)} />
        <StatCard label={`Wins (${wins})`}
          value={`+$${fmt(winTotal * contracts)}`}
          color="text-green"
          sub={contracts > 1 ? `$${fmt(winTotal)}/ct` : undefined} />
        <StatCard label={`Losses (${losses})`}
          value={`-$${fmt(Math.abs(lossTotal) * contracts)}`}
          color="text-red"
          sub={contracts > 1 ? `-$${fmt(Math.abs(lossTotal))}/ct` : undefined} />
        <StatCard label="Win Rate"
          value={`${winRate}%`}
          color={winRate >= 50 ? 'text-green' : 'text-red'} />
        <StatCard label="Net P&L"
          value={`${totalPnl >= 0 ? '+' : '-'}$${fmt(Math.abs(totalPnl) * contracts)}`}
          color={totalPnl >= 0 ? 'text-green' : 'text-red'}
          sub={contracts > 1 ? `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}/ct` : 'per contract'} />
        <StatCard label="Premiums Collected" value={`$${fmt(totalPremiums * contracts)}`}
          sub={contracts > 1 ? `$${fmt(totalPremiums)}/ct` : undefined} />
        <StatCard label="Avg Credit" value={`$${fmt(avgCredit * contracts)}`}
          sub={contracts > 1 ? `$${fmt(avgCredit)}/ct` : undefined} />
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
                <th className="py-2 px-2 text-right">NEM @ Alert</th>
                <th className="py-2 px-2 text-right">NEM Close</th>
                <th className="py-2 px-2 text-center">Result</th>
                <th className="py-2 px-2 text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((s, i) => {
                const credit = s.type === 'iron_condor' ? s.combinedCredit : s.credit;
                const dateStr = new Date(s.settledAt || s.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <tr key={i} className={`text-xs ${resultRowClass(s.result)}`}>
                    <td className="py-2 px-2 text-muted">{dateStr}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{typeLabel(s.type)}</td>
                    <td className="py-2 px-2 font-mono whitespace-nowrap">{strikeDisplay(s)}</td>
                    <td className="py-2 px-2 text-right font-mono text-green">${fmt(credit)}</td>
                    <td className="py-2 px-2 text-right font-mono">${fmt(s.nemPrice)}</td>
                    <td className="py-2 px-2 text-right font-mono">${fmt(s.nemClose)}</td>
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
    </div>
  );
}
