'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface Holding {
  name: string;
  cusip: string;
  value: number;
  shares: number;
  putCall: string;
  change: 'NEW' | 'INCREASED' | 'REDUCED' | 'SOLD' | 'UNCHANGED';
  sharesDiff: number;
  prevShares: number;
  prevValue: number;
  portfolioWeight: number;
  ticker?: string;
  price?: number;
  currentPrice?: number;
  trailingPE?: number | null;
  forwardPE?: number | null;
}

interface Whale {
  cik: string;
  name: string;
  currentDate: string;
  previousDate: string;
  totalValue: number;
  holdingsCount: number;
  holdings: Holding[];
  totalHoldingsRaw?: number;
  error?: string;
}

interface WhaleData {
  timestamp: string;
  data: { whales: Whale[]; lastUpdated?: string };
}

type SortField = 'name' | 'whales' | 'totalValue' | 'estEntry' | 'currentPrice' | 'movePct' | 'pe' | 'status';
type SortDir = 'asc' | 'desc';

const CHANGE_STYLES: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  NEW: { label: 'NEW', emoji: '🆕', bg: 'bg-green/20', text: 'text-green' },
  INCREASED: { label: 'INCREASED', emoji: '📈', bg: 'bg-green/10', text: 'text-green' },
  REDUCED: { label: 'REDUCED', emoji: '📉', bg: 'bg-yellow/10', text: 'text-yellow/70' },
  SOLD: { label: 'SOLD', emoji: '🚫', bg: 'bg-red/15', text: 'text-red' },
  UNCHANGED: { label: 'UNCHANGED', emoji: '➖', bg: 'bg-gray-500/10', text: 'text-gray-400' },
};

function fmtMoney(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

function fmtShares(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v}`;
}

function fmtPrice(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `$${v.toFixed(v >= 100 ? 0 : 2)}`;
}

function pct(from?: number | null, to?: number | null): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

function avgEntryPrice(h: Holding): number | null {
  if (h.price && Number.isFinite(h.price) && h.price > 0) return h.price;
  if (h.shares > 0 && h.value > 0) return h.value / h.shares;
  return null;
}

function getCurrentPrice(h: Holding): number | null {
  if (h.currentPrice && Number.isFinite(h.currentPrice) && h.currentPrice > 0) return h.currentPrice;
  return null;
}

function getTrailingPE(h: Holding): number | null {
  if (h.trailingPE && Number.isFinite(h.trailingPE) && h.trailingPE > 0) return h.trailingPE;
  return null;
}

function getForwardPE(h: Holding): number | null {
  if (h.forwardPE && Number.isFinite(h.forwardPE) && h.forwardPE > 0) return h.forwardPE;
  return null;
}

function freshnessLabel(movePct: number | null): { label: string; cls: string } {
  if (movePct == null) return { label: 'Unknown', cls: 'bg-gray-500/10 text-gray-400' };
  if (movePct < 0) return { label: 'Below whale entry', cls: 'bg-cyan-500/10 text-cyan-300' };
  if (movePct <= 10) return { label: 'Fresh', cls: 'bg-green/20 text-green' };
  if (movePct <= 25) return { label: 'Working', cls: 'bg-green/15 text-yellow' };
  if (movePct <= 40) return { label: 'Extended', cls: 'bg-yellow/15 text-yellow/70' };
  return { label: 'Overextended', cls: 'bg-red/15 text-red' };
}

function scoreConsensusOpportunity(whaleCount: number, movePct: number | null): { label: string; cls: string } {
  if (movePct == null) return { label: 'Needs price data', cls: 'bg-gray-500/10 text-gray-400' };
  if (whaleCount >= 3 && movePct <= 10) return { label: 'Best setup', cls: 'bg-green/20 text-green' };
  if (whaleCount >= 2 && movePct <= 15) return { label: 'Still attractive', cls: 'bg-green/15 text-yellow' };
  if (movePct <= 30) return { label: 'Okay, not early', cls: 'bg-yellow/15 text-yellow/70' };
  return { label: 'Late / stretched', cls: 'bg-red/15 text-red' };
}

function ChangeBadge({ change }: { change: string }) {
  const s = CHANGE_STYLES[change] || CHANGE_STYLES.UNCHANGED;
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${s.bg} ${s.text} font-medium`}>
      {s.emoji} {s.label}
    </span>
  );
}

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



export default function WhalesPage() {
  const router = useRouter();
  const [data, setData] = useState<WhaleData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedWhale, setExpandedWhale] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'NEW' | 'INCREASED' | 'REDUCED' | 'SOLD'>('all');
  const [sortField, setSortField] = useState<SortField>('whales');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
      const d = await api('/api/whales');
      setData(d);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }

  const whales = useMemo(() => {
    if (!data) return [];
    const d = data as any;
    const list = d?.data?.whales || d?.whales || [];
    return [...list]
      .filter((w: any) => w.holdings && w.holdings.length > 0)
      .sort((a: Whale, b: Whale) => b.totalValue - a.totalValue);
  }, [data]);



  const consensusBuys = useMemo(() => {
    const counts: Record<string, {
      name: string;
      ticker?: string;
      whales: Set<string>;
      totalValue: number;
      holdings: Holding[];
      filingDates: string[];
    }> = {};

    for (const w of whales) {
      for (const h of w.holdings) {
        if ((h.change === 'NEW' || h.change === 'INCREASED') && !h.putCall) {
          const key = h.cusip || h.ticker || h.name;
          if (!counts[key]) {
            counts[key] = {
              name: h.name,
              ticker: h.ticker,
              whales: new Set(),
              totalValue: 0,
              holdings: [],
              filingDates: [],
            };
          }
          counts[key].holdings.push(h);
          counts[key].filingDates.push(w.currentDate);
          if (!counts[key].whales.has(w.name)) {
            counts[key].whales.add(w.name);
            counts[key].totalValue += h.value;
          }
        }
      }
    }

    return Object.values(counts)
      .map((c) => {
        const entries = c.holdings.map((h) => avgEntryPrice(h)).filter((v): v is number => v != null);
        const currentPrices = c.holdings.map((h) => getCurrentPrice(h)).filter((v): v is number => v != null);
        const trailingPEs = c.holdings.map((h) => getTrailingPE(h)).filter((v): v is number => v != null);
        const forwardPEs = c.holdings.map((h) => getForwardPE(h)).filter((v): v is number => v != null);
        const estEntry = entries.length ? entries.reduce((a, b) => a + b, 0) / entries.length : null;
        const currentPrice = currentPrices.length ? currentPrices[0] : null;
        const trailingPE = trailingPEs.length ? trailingPEs[0] : null;
        const forwardPE = forwardPEs.length ? forwardPEs[0] : null;
        const movePct = pct(estEntry, currentPrice);
        const freshness = freshnessLabel(movePct);
        const score = scoreConsensusOpportunity(c.whales.size, movePct);

        return {
          name: c.name,
          ticker: c.ticker,
          whales: Array.from(c.whales),
          totalValue: c.totalValue,
          estEntry,
          currentPrice,
          trailingPE,
          forwardPE,
          movePct,
          freshness,
          score,
          filings: Array.from(new Set(c.filingDates)).sort().join(', '),
        };
      })
      .filter((c) => c.whales.length >= 2);
  }, [whales]);

  const sortedConsensusBuys = useMemo(() => {
    const list = [...consensusBuys];
    list.sort((a, b) => {
      let aVal: number | null = null;
      let bVal: number | null = null;
      switch (sortField) {
        case 'name':
          const cmp = a.name.localeCompare(b.name);
          return sortDir === 'asc' ? cmp : -cmp;
        case 'whales':
          aVal = a.whales.length; bVal = b.whales.length; break;
        case 'totalValue':
          aVal = a.totalValue; bVal = b.totalValue; break;
        case 'estEntry':
          aVal = a.estEntry; bVal = b.estEntry; break;
        case 'currentPrice':
          aVal = a.currentPrice; bVal = b.currentPrice; break;
        case 'movePct':
          aVal = a.movePct; bVal = b.movePct; break;
        case 'pe':
          aVal = a.forwardPE ?? a.trailingPE; bVal = b.forwardPE ?? b.trailingPE; break;
        case 'status':
          aVal = a.movePct; bVal = b.movePct; break;
        default:
          aVal = a.whales.length; bVal = b.whales.length;
      }
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return list;
  }, [consensusBuys, sortField, sortDir]);



  if (loading) return <div className="text-muted p-8">Loading whale data from SEC EDGAR...</div>;
  if (err) return <div className="bg-red/10 border border-red text-red p-3 rounded">{err}</div>;
  if (!data) return null;

  const filteredHoldings = (holdings: Holding[]) => {
    if (filter === 'all') return holdings;
    return holdings.filter((h) => h.change === filter);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">🐋 Whale Tracker</h1>
          <div className="text-sm text-muted mt-1">
            13F holdings comparison · {whales.length} funds tracked
            {data.timestamp && <span> · Cached {new Date(data.timestamp).toLocaleDateString()}</span>}
          </div>
        </div>
        <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1 rounded hover:bg-panel2">🔄 Refresh</button>
      </div>



      {sortedConsensusBuys.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-3">🎯 Consensus Buys <span className="text-sm font-normal text-muted">(2+ whales buying/adding)</span></h2>
          <div className="bg-panel border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-panel2 border-b border-border text-muted">
                <tr>
                  <SortHeader label="Stock" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="# Whales" field="whales" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Combined Value" field="totalValue" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Est. Avg Entry" field="estEntry" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Current" field="currentPrice" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Since Entry" field="movePct" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="P/E" field="pe" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-left">Who&apos;s Buying</th>
                </tr>
              </thead>
              <tbody>
                {sortedConsensusBuys.slice(0, 25).map((c, i) => (
                  <tr key={i} className="border-t border-border hover:bg-panel2/50 align-top">
                    <td className="px-3 py-2 font-bold">
                      <div>{c.name}</div>
                      {c.ticker && <div className="text-[11px] text-muted font-normal">{c.ticker}</div>}
                    </td>
                    <td className="px-3 py-2 text-right"><span className="text-green font-bold">{c.whales.length}</span></td>
                    <td className="px-3 py-2 text-right">{fmtMoney(c.totalValue)}</td>
                    <td className="px-3 py-2 text-right">{fmtPrice(c.estEntry)}</td>
                    <td className="px-3 py-2 text-right">{fmtPrice(c.currentPrice)}</td>
                    <td className="px-3 py-2 text-right">
                      {c.movePct == null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={c.movePct <= 10 ? 'text-green' : c.movePct <= 25 ? 'text-yellow' : c.movePct <= 40 ? 'text-yellow/70' : 'text-red'}>
                          {c.movePct > 0 ? '+' : ''}{c.movePct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.forwardPE != null ? (
                        <div>
                          <span className={c.forwardPE < 20 ? 'text-green' : c.forwardPE < 35 ? 'text-yellow' : c.forwardPE < 60 ? 'text-yellow/70' : 'text-red'}>
                            {c.forwardPE.toFixed(1)}
                          </span>
                          <div className="text-[10px] text-muted">fwd</div>
                        </div>
                      ) : c.trailingPE != null ? (
                        <div>
                          <span className={c.trailingPE < 20 ? 'text-green' : c.trailingPE < 35 ? 'text-yellow' : c.trailingPE < 60 ? 'text-yellow/70' : 'text-red'}>
                            {c.trailingPE.toFixed(1)}
                          </span>
                          <div className="text-[10px] text-muted">ttm</div>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-left text-xs">
                      <div className={`inline-block px-2 py-1 rounded font-medium ${c.freshness.cls}`}>{c.freshness.label}</div>
                      <div className={`inline-block px-2 py-1 rounded font-medium mt-1 ${c.score.cls}`}>{c.score.label}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      <div>{c.whales.join(', ')}</div>
                      <div className="mt-1 text-[11px]">Filed: {c.filings}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}



      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'NEW', 'INCREASED', 'REDUCED', 'SOLD'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded ${filter === f ? 'bg-accent text-bg font-semibold' : 'bg-panel border border-border text-muted hover:text-text'}`}
          >
            {f === 'all' ? '🔍 All' : CHANGE_STYLES[f]?.emoji + ' ' + f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {whales.map((w) => {
          const isExpanded = expandedWhale === w.cik;
          const holdings = filteredHoldings(w.holdings);
          const newCount = w.holdings.filter((h: Holding) => h.change === 'NEW').length;
          const addedCount = w.holdings.filter((h: Holding) => h.change === 'INCREASED').length;
          const soldCount = w.holdings.filter((h: Holding) => h.change === 'SOLD').length;

          return (
            <div key={w.cik} className="bg-panel border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedWhale(isExpanded ? null : w.cik)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-panel2/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🐋</span>
                  <div>
                    <div className="font-bold text-lg">{w.name}</div>
                    <div className="text-xs text-muted">
                      {fmtMoney(w.totalValue)} · {w.holdingsCount} positions · Filed {w.currentDate}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {newCount > 0 && <span className="text-xs bg-green/20 text-green px-2 py-0.5 rounded">{newCount} new</span>}
                  {addedCount > 0 && <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{addedCount} added</span>}
                  {soldCount > 0 && <span className="text-xs bg-red/15 text-red px-2 py-0.5 rounded">{soldCount} sold</span>}
                  <span className="text-muted">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border">
                  {w.error ? (
                    <div className="p-4 text-red text-sm">{w.error}</div>
                  ) : holdings.length === 0 ? (
                    <div className="p-4 text-muted text-sm">No holdings match this filter</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-panel2 border-b border-border text-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">Stock</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-right">Value</th>
                            <th className="px-3 py-2 text-right">Shares</th>
                            <th className="px-3 py-2 text-right">Change</th>
                            <th className="px-3 py-2 text-right">Avg Price</th>
                            <th className="px-3 py-2 text-right">Current</th>
                            <th className="px-3 py-2 text-right">P/E</th>
                            <th className="px-3 py-2 text-right">% Port</th>
                            <th className="px-3 py-2 text-center">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdings.map((h, i) => {
                            const diffSign = h.sharesDiff > 0 ? '+' : '';
                            const hCurrentPrice = getCurrentPrice(h);
                            const hPE = getForwardPE(h) ?? getTrailingPE(h);
                            return (
                              <tr key={`${h.cusip}-${i}`} className="border-t border-border hover:bg-panel2/50">
                                <td className="px-3 py-2 font-bold whitespace-nowrap">
                                  {h.name}
                                  {h.ticker && <span className="text-[10px] text-muted ml-1">{h.ticker}</span>}
                                </td>
                                <td className="px-3 py-2"><ChangeBadge change={h.change} /></td>
                                <td className="px-3 py-2 text-right">{fmtMoney(h.value)}</td>
                                <td className="px-3 py-2 text-right">{fmtShares(h.shares)}</td>
                                <td className="px-3 py-2 text-right">
                                  {h.change !== 'UNCHANGED' && h.sharesDiff !== 0 ? (
                                    <span className={h.sharesDiff > 0 ? 'text-green' : 'text-red'}>
                                      {diffSign}{fmtShares(h.sharesDiff)}
                                    </span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {h.shares > 0 ? (
                                    <span>${(h.value / h.shares).toFixed(2)}</span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {hCurrentPrice != null ? fmtPrice(hCurrentPrice) : <span className="text-muted">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {hPE != null ? (
                                    <span className={hPE < 20 ? 'text-green' : hPE < 35 ? 'text-yellow' : hPE < 60 ? 'text-yellow/70' : 'text-red'}>
                                      {hPE.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">{h.portfolioWeight.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-center text-xs">
                                  {h.putCall ? (
                                    <span className={h.putCall === 'Put' ? 'text-red' : 'text-green'}>{h.putCall}</span>
                                  ) : (
                                    <span className="text-muted">Stock</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="px-4 py-2 text-xs text-muted border-t border-border">
                    Comparing {w.currentDate} vs {w.previousDate} · Source: SEC EDGAR 13F-HR
                    {w.totalHoldingsRaw && w.totalHoldingsRaw > w.holdings.length && <span> · Showing top {w.holdings.length} of {w.totalHoldingsRaw} holdings</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-center text-xs text-muted space-y-1">
        <div>Data from SEC EDGAR 13F filings. Holdings are ~45 days lagged. Not investment advice.</div>
        <div>&quot;Est. Avg Entry&quot; is an implied filing-date average price (holding value ÷ shares), not the whale&apos;s true cost basis. &quot;Current&quot; and &quot;Since Entry&quot; only show when live price data is present in the API.</div>
      </div>
    </div>
  );
}
