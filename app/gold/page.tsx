'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

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

export default function GoldPage() {
  const router = useRouter();
  const [signals, setSignals] = useState<GoldSignal[]>([]);
  const [stats, setStats] = useState<GoldStats | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

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
                <div className={`text-sm ${(priceChange ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
                    <span className="text-green-400">W: {data.wins}</span>
                    <span className="text-red-400">L: {data.losses}</span>
                    <span className="text-yellow-400">T: {data.tracking}</span>
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
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.direction === 'LONG' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                            {s.direction}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">${s.price_found.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-400">${s.stop_loss.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-mono text-green-400">${s.take_profit.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.result === 'WIN' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                            {s.result}
                          </span>
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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

        {signals.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <div className="text-4xl mb-4">🥇</div>
            <p>No gold signals yet. Scanner runs every 30 min during market hours (07:00-21:00 UTC).</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${signal.direction === 'LONG' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {signal.direction}
        </span>
      </div>
      <div className="text-lg font-mono font-bold text-white mb-2">${signal.price_found.toFixed(2)}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Stop:</span>{' '}
          <span className="text-red-400 font-mono">${signal.stop_loss.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Target:</span>{' '}
          <span className="text-green-400 font-mono">${signal.take_profit.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-400">{signal.trigger}</div>
      <div className="mt-1 text-xs text-gray-600">{signal.date_found}</div>
    </div>
  );
}
