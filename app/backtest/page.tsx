'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface Trade {
  id: string; ticker: string; method: string; date_found: string;
  price_found: number | null; alpha: number; raw: number; trigger: string;
}
interface BacktestResult {
  horizon: string; total_signals: number; tracked: number;
  wins: number; losses: number; winRate: number;
  cumAlpha: number; cumRaw: number; avgAlpha: number; avgRaw: number;
  maxDrawdown: number;
  bestTrade: Trade | null; worstTrade: Trade | null;
  equityCurve: { date: string; ticker: string; alpha: number; cumAlpha: number; cumRaw: number }[];
  trades: Trade[];
}

const METHODS = ['', 'social_arb', 'earnings', 'insider', '8k', 'sector_alert', 'wheel'];
const HORIZONS = ['1d', '7d', '30d'];
const METHOD_LABELS: Record<string, string> = {
  '': 'All Strategies', social_arb: 'Social Arb', earnings: 'Earnings',
  insider: 'Insider', '8k': '8-K', sector_alert: 'Sector', wheel: 'Wheel'
};

function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  const cls = v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-muted';
  return <span className={cls}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>;
}

export default function BacktestPage() {
  const router = useRouter();
  const [method, setMethod] = useState('');
  const [horizon, setHorizon] = useState('7d');
  const [mode, setMode] = useState<'realistic' | 'theoretical'>('realistic');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [data, setData] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [sortField, setSortField] = useState('alpha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    run();
  }, []);

  async function run() {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({ horizon, mode });
      if (method) params.set('method', method);
      if (since) params.set('since', since);
      if (until) params.set('until', until);
      const d = await api(`/api/backtest?${params}`);
      setData(d);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }

  const sortedTrades = useMemo(() => {
    if (!data) return [];
    const sign = sortDir === 'desc' ? -1 : 1;
    return [...data.trades].sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * sign;
      return (av - bv) * sign;
    });
  }, [data, sortField, sortDir]);

  function toggleSort(f: string) {
    if (sortField === f) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(f); setSortDir('desc'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">🧪 Backtest</h1>
      <p className="text-sm text-muted mb-2">Simulate equal-weight portfolio from scanner signals. Not financial advice.</p>
      <p className="text-xs mb-6">
        {mode === 'realistic'
          ? <span className="text-green">💰 Realistic mode: entry at next-day open price (what you could actually buy at)</span>
          : <span className="text-yellow">📐 Theoretical mode: entry at signal price (often unachievable in practice)</span>}
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="text-xs text-muted block mb-1">Strategy</label>
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="bg-panel border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent">
            {METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m] || m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Mode</label>
          <div className="flex gap-1">
            <button onClick={() => setMode('realistic')}
              className={`text-xs px-3 py-2 rounded ${mode === 'realistic' ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted'}`}>
              💰 Realistic
            </button>
            <button onClick={() => setMode('theoretical')}
              className={`text-xs px-3 py-2 rounded ${mode === 'theoretical' ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted'}`}>
              📐 Theoretical
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Horizon</label>
          <div className="flex gap-1">
            {HORIZONS.map(h => (
              <button key={h} onClick={() => setHorizon(h)}
                className={`text-xs px-3 py-2 rounded ${horizon === h ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted'}`}>
                {h}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">From</label>
          <input type="date" value={since} onChange={e => setSince(e.target.value)}
            className="bg-panel border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">To</label>
          <input type="date" value={until} onChange={e => setUntil(e.target.value)}
            className="bg-panel border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <button onClick={run} disabled={loading}
          className="bg-accent text-bg px-5 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {loading ? 'Running...' : '▶ Run Backtest'}
        </button>
      </div>

      {err && <div className="bg-red/10 border border-red text-red p-3 rounded mb-4">{err}</div>}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Stat label="Total Signals" value={data.total_signals} />
            <Stat label="Tracked" value={data.tracked} />
            <Stat label="Win Rate" value={`${data.winRate}%`}
              color={data.winRate >= 50 ? 'text-green' : 'text-red'} />
            <Stat label={`Cum. Alpha (${data.horizon})`}
              value={`${data.cumAlpha > 0 ? '+' : ''}${data.cumAlpha}%`}
              color={data.cumAlpha > 0 ? 'text-green' : 'text-red'} />
            <Stat label={`Cum. Raw (${data.horizon})`}
              value={`${data.cumRaw > 0 ? '+' : ''}${data.cumRaw}%`}
              color={data.cumRaw > 0 ? 'text-green' : 'text-red'} />
            <Stat label="Avg Alpha" value={`${data.avgAlpha > 0 ? '+' : ''}${data.avgAlpha}%`}
              color={data.avgAlpha > 0 ? 'text-green' : 'text-red'} />
            <Stat label="Avg Raw" value={`${data.avgRaw > 0 ? '+' : ''}${data.avgRaw}%`}
              color={data.avgRaw > 0 ? 'text-green' : 'text-red'} />
            <Stat label="Max Drawdown" value={`-${data.maxDrawdown}%`} color="text-red" />
            <Stat label="Best Trade"
              value={data.bestTrade ? `${data.bestTrade.ticker} +${data.bestTrade.alpha.toFixed(1)}%` : '—'}
              color="text-green" />
            <Stat label="Worst Trade"
              value={data.worstTrade ? `${data.worstTrade.ticker} ${data.worstTrade.alpha.toFixed(1)}%` : '—'}
              color="text-red" />
          </div>

          {/* Equity curve (text-based) */}
          {data.equityCurve.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">📈 Equity Curve (Cumulative Alpha)</h2>
              <div className="bg-panel border border-border rounded-lg p-4 overflow-x-auto">
                <div className="flex items-end gap-[2px] h-40">
                  {data.equityCurve.map((p, i) => {
                    const max = Math.max(...data.equityCurve.map(e => Math.abs(e.cumAlpha)), 1);
                    const h = Math.abs(p.cumAlpha) / max * 100;
                    return (
                      <div key={i} className="flex-1 min-w-[3px] flex flex-col justify-end items-center h-full relative group">
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-panel2 border border-border rounded px-2 py-1 text-[10px] whitespace-nowrap z-10">
                          {p.ticker} · {p.date} · α {p.cumAlpha > 0 ? '+' : ''}{p.cumAlpha}%
                        </div>
                        <div
                          className={`w-full rounded-t ${p.cumAlpha >= 0 ? 'bg-green' : 'bg-red'}`}
                          style={{ height: `${Math.max(h, 2)}%`, opacity: 0.7 }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>{data.equityCurve[0]?.date}</span>
                  <span>{data.equityCurve[data.equityCurve.length - 1]?.date}</span>
                </div>
              </div>
            </div>
          )}

          {/* Trades table */}
          <div className="mb-6">
            <h2 className="text-lg font-bold mb-3">📋 All Trades ({data.trades.length})</h2>
            <div className="bg-panel border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-panel2 border-b border-border text-muted text-left">
                  <tr>
                    {[
                      { f: 'ticker', l: 'Ticker' }, { f: 'method', l: 'Strategy' },
                      { f: 'date_found', l: 'Date' }, { f: 'price_found', l: 'Entry', a: 'right' },
                      { f: 'alpha', l: `Alpha (${data.horizon})`, a: 'right' },
                      { f: 'raw', l: `Raw (${data.horizon})`, a: 'right' }
                    ].map(col => (
                      <th key={col.f}
                        className={`px-4 py-2 cursor-pointer select-none hover:bg-panel/60 ${col.a === 'right' ? 'text-right' : ''}`}
                        onClick={() => toggleSort(col.f)}>
                        {col.l}
                        <span className="ml-1 text-xs">
                          {sortField === col.f ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-2 text-left">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map(t => (
                    <tr key={t.id} className="border-t border-border hover:bg-panel2/50">
                      <td className="px-4 py-2 font-bold">{t.ticker}</td>
                      <td className="px-4 py-2 text-muted">{t.method}</td>
                      <td className="px-4 py-2 text-muted text-xs">{t.date_found}</td>
                      <td className="px-4 py-2 text-right">{t.price_found ? `$${t.price_found.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmtPct(t.alpha)}</td>
                      <td className="px-4 py-2 text-right">{fmtPct(t.raw)}</td>
                      <td className="px-4 py-2 text-xs text-muted max-w-[250px] truncate">{t.trigger}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedTrades.length === 0 && <div className="p-6 text-center text-muted">No tracked trades for this filter</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'text-text' }: { label: string; value: any; color?: string }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
