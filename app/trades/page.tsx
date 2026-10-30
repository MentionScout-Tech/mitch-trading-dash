'use client';
import { Fragment, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, Trade } from '../../lib/api';

const TRADE_TYPES = [
  { value: 'put_credit_spread', label: 'Put Credit Spread' },
  { value: 'call_credit_spread', label: 'Call Credit Spread' },
  { value: 'iron_condor', label: 'Iron Condor' },
];

const SPREAD_WIDTH = 5;

type FilterType = 'all' | 'open' | 'closed';

/* ── helpers ─────────────────────────────────────────── */

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    put_credit_spread: '🟢 Put CS',
    call_credit_spread: '🔴 Call CS',
    iron_condor: '🦅 IC',
  };
  return labels[type] || type;
}

function typeFullLabel(type: string): string {
  const labels: Record<string, string> = {
    put_credit_spread: 'Put Credit Spread',
    call_credit_spread: 'Call Credit Spread',
    iron_condor: 'Iron Condor',
  };
  return labels[type] || type;
}

function calcPnl(trade: Trade) {
  if (trade.status !== 'closed' || trade.exitCost == null) return null;
  const pnlPerContract = (trade.credit - trade.exitCost) * 100;
  const totalPnl = pnlPerContract * trade.contracts;
  const pnlPct = ((trade.credit - trade.exitCost) / SPREAD_WIDTH) * 100;
  return { pnlPerContract, totalPnl, pnlPct };
}

function strikeStr(trade: Trade): string {
  if (trade.type === 'iron_condor') {
    const s = trade.strikes;
    if (!s.putShortStrike && !s.callShortStrike) return '—';
    return `${s.putShortStrike ?? '—'}P/${s.putLongStrike ?? '—'}P · ${s.callShortStrike ?? '—'}C/${s.callLongStrike ?? '—'}C`;
  }
  if (!trade.strikes.shortStrike && !trade.strikes.longStrike) return '—';
  return `${trade.strikes.shortStrike ?? '—'}/${trade.strikes.longStrike ?? '—'}`;
}

function pnlColor(n: number): string {
  return n >= 0 ? 'text-green' : 'text-red';
}

/* ── StatCard (matches SPX 0DTE style) ───────────────── */

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

/* ── main page ───────────────────────────────────────── */

export default function TradesPage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formType, setFormType] = useState('put_credit_spread');
  const [formShortStrike, setFormShortStrike] = useState('');
  const [formLongStrike, setFormLongStrike] = useState('');
  const [formPutShort, setFormPutShort] = useState('');
  const [formPutLong, setFormPutLong] = useState('');
  const [formCallShort, setFormCallShort] = useState('');
  const [formCallLong, setFormCallLong] = useState('');
  const [formContracts, setFormContracts] = useState('1');
  const [formCredit, setFormCredit] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit form
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState('');
  const [editShortStrike, setEditShortStrike] = useState('');
  const [editLongStrike, setEditLongStrike] = useState('');
  const [editPutShort, setEditPutShort] = useState('');
  const [editPutLong, setEditPutLong] = useState('');
  const [editCallShort, setEditCallShort] = useState('');
  const [editCallLong, setEditCallLong] = useState('');
  const [editContracts, setEditContracts] = useState('');
  const [editCredit, setEditCredit] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Close modal
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [closeExitCost, setCloseExitCost] = useState('');

  // Day grouping
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [dayComments, setDayComments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    loadTrades();
  }, []);

  async function loadTrades() {
    setLoading(true);
    try {
      const d = await api('/api/trades');
      setTrades(
        (d.trades || []).sort(
          (a: Trade, b: Trade) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      );
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }

  /* ── Add ────────────────────────────────────── */

  async function addTrade(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const isIC = formType === 'iron_condor';
      const strikes = isIC
        ? {
            putShortStrike: formPutShort ? Number(formPutShort) : null,
            putLongStrike: formPutLong ? Number(formPutLong) : null,
            callShortStrike: formCallShort ? Number(formCallShort) : null,
            callLongStrike: formCallLong ? Number(formCallLong) : null,
          }
        : { shortStrike: formShortStrike ? Number(formShortStrike) : null, longStrike: formLongStrike ? Number(formLongStrike) : null };

      await api('/api/trades', {
        method: 'POST',
        body: JSON.stringify({
          date: formDate,
          type: formType,
          strikes,
          contracts: Number(formContracts),
          credit: Number(formCredit),
          notes: formNotes,
        }),
      });

      setFormShortStrike('');
      setFormLongStrike('');
      setFormPutShort('');
      setFormPutLong('');
      setFormCallShort('');
      setFormCallLong('');
      setFormContracts('1');
      setFormCredit('');
      setFormNotes('');
      setShowForm(false);
      await loadTrades();
    } catch (e: any) {
      setErr(e.message);
    }
    setSubmitting(false);
  }

  /* ── Edit ───────────────────────────────────── */

  function startEdit(trade: Trade) {
    setEditingTrade(trade);
    setEditDate(trade.date);
    setEditType(trade.type);
    setEditContracts(String(trade.contracts));
    setEditCredit(String(trade.credit));
    setEditNotes(trade.notes || '');
    if (trade.type === 'iron_condor') {
      setEditPutShort(String(trade.strikes.putShortStrike || ''));
      setEditPutLong(String(trade.strikes.putLongStrike || ''));
      setEditCallShort(String(trade.strikes.callShortStrike || ''));
      setEditCallLong(String(trade.strikes.callLongStrike || ''));
      setEditShortStrike('');
      setEditLongStrike('');
    } else {
      setEditShortStrike(String(trade.strikes.shortStrike || ''));
      setEditLongStrike(String(trade.strikes.longStrike || ''));
      setEditPutShort('');
      setEditPutLong('');
      setEditCallShort('');
      setEditCallLong('');
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTrade) return;
    try {
      const isIC = editType === 'iron_condor';
      const strikes = isIC
        ? {
            putShortStrike: editPutShort ? Number(editPutShort) : null,
            putLongStrike: editPutLong ? Number(editPutLong) : null,
            callShortStrike: editCallShort ? Number(editCallShort) : null,
            callLongStrike: editCallLong ? Number(editCallLong) : null,
          }
        : { shortStrike: editShortStrike ? Number(editShortStrike) : null, longStrike: editLongStrike ? Number(editLongStrike) : null };

      await api(`/api/trades/${editingTrade.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: editDate,
          type: editType,
          strikes,
          contracts: Number(editContracts),
          credit: Number(editCredit),
          notes: editNotes,
        }),
      });
      setEditingTrade(null);
      await loadTrades();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  /* ── Close ──────────────────────────────────── */

  async function closeTrade() {
    if (!closingTrade) return;
    try {
      await api(`/api/trades/${closingTrade.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'closed', exitCost: Number(closeExitCost) }),
      });
      setClosingTrade(null);
      setCloseExitCost('');
      await loadTrades();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  /* ── Delete ─────────────────────────────────── */

  async function deleteTrade(id: string) {
    if (!confirm('Delete this trade?')) return;
    try {
      await api(`/api/trades/${id}`, { method: 'DELETE' });
      await loadTrades();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  /* ── Derived ────────────────────────────────── */

  const filtered = useMemo(() => {
    if (filter === 'all') return trades;
    return trades.filter((t) => t.status === filter);
  }, [trades, filter]);

  // Load day comments from localStorage
  useEffect(() => {
    const comments: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('trade_day_comment_')) {
        comments[key.replace('trade_day_comment_', '')] = localStorage.getItem(key) || '';
      }
    }
    setDayComments(comments);
  }, []);

  const groupedTrades = useMemo(() => {
    const groups: { date: string; trades: Trade[] }[] = [];
    const map = new Map<string, Trade[]>();
    for (const t of filtered) {
      if (!map.has(t.date)) {
        map.set(t.date, []);
        groups.push({ date: t.date, trades: map.get(t.date)! });
      }
      map.get(t.date)!.push(t);
    }
    return groups;
  }, [filtered]);

  function isDayCollapsed(date: string, index: number) {
    if (date in collapsedDays) return collapsedDays[date];
    return index > 0;
  }

  function toggleDay(date: string, index: number) {
    setCollapsedDays(prev => ({ ...prev, [date]: !(prev[date] ?? index > 0) }));
  }

  function updateDayComment(date: string, comment: string) {
    setDayComments(prev => ({ ...prev, [date]: comment }));
    if (comment) localStorage.setItem(`trade_day_comment_${date}`, comment);
    else localStorage.removeItem(`trade_day_comment_${date}`);
  }

  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.status === 'closed');
    const open = trades.filter((t) => t.status === 'open');
    let wins = 0;
    let totalPnl = 0;
    let totalPremiums = 0;

    for (const t of closed) {
      totalPremiums += t.credit * 100 * t.contracts;
      const pnl = calcPnl(t);
      if (pnl) {
        totalPnl += pnl.totalPnl;
        if (pnl.totalPnl >= 0) wins++;
      }
    }
    for (const t of open) {
      totalPremiums += t.credit * 100 * t.contracts;
    }

    return {
      total: trades.length,
      open: open.length,
      closed: closed.length,
      wins,
      winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
      totalPnl,
      totalPremiums,
      openExposure: open.reduce((sum, t) => sum + t.credit * 100 * t.contracts, 0),
    };
  }, [trades]);

  /* ── Render ─────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">📊 Trade Tracker</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={loadTrades}
            className="text-sm bg-panel border border-border px-3 py-1.5 rounded hover:bg-panel2"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className={`text-sm px-3 py-1.5 rounded font-semibold ${
              showForm
                ? 'bg-red/20 text-red border border-red/30 hover:bg-red/30'
                : 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
            }`}
          >
            {showForm ? '✕ Cancel' : '+ Add Trade'}
          </button>
        </div>
      </div>

      {err && (
        <div className="bg-red/10 border border-red text-red p-3 rounded mb-4">{err}</div>
      )}

      {loading && <div className="text-muted py-8 text-center">Loading trades...</div>}

      {!loading && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <StatCard label="Total Trades" value={String(stats.total)} />
            <StatCard
              label={`Open (${stats.open})`}
              value={`$${fmt(stats.openExposure)}`}
              color="text-accent"
              sub="max profit at risk"
            />
            <StatCard
              label="Win Rate"
              value={stats.closed > 0 ? `${fmt(stats.winRate, 1)}%` : '—'}
              color={stats.winRate >= 50 ? 'text-green' : stats.closed > 0 ? 'text-red' : 'text-text'}
              sub={stats.closed > 0 ? `${stats.wins}W / ${stats.closed - stats.wins}L` : 'no closed trades'}
            />
            <StatCard
              label="Net P&L"
              value={`${stats.totalPnl >= 0 ? '+' : '-'}$${fmt(Math.abs(stats.totalPnl))}`}
              color={pnlColor(stats.totalPnl)}
              sub={`${stats.closed} closed`}
            />
            <StatCard
              label="Total Premiums"
              value={`$${fmt(stats.totalPremiums)}`}
              color="text-green"
              sub="collected"
            />
            <StatCard
              label="Avg P&L / Trade"
              value={
                stats.closed > 0
                  ? `${stats.totalPnl / stats.closed >= 0 ? '+' : '-'}$${fmt(Math.abs(stats.totalPnl / stats.closed))}`
                  : '—'
              }
              color={stats.closed > 0 ? pnlColor(stats.totalPnl / stats.closed) : 'text-text'}
            />
          </div>

          {/* Add Trade Form */}
          {showForm && (
            <div className="bg-panel border border-accent/30 rounded-lg p-5 mb-6">
              <h3 className="text-sm font-semibold text-muted mb-4">New Trade</h3>
              <form onSubmit={addTrade}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="text-xs text-muted block mb-1">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Type</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                    >
                      {TRADE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Contracts</label>
                    <input
                      type="number"
                      min="1"
                      value={formContracts}
                      onChange={(e) => setFormContracts(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Credit (per ct)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formCredit}
                      onChange={(e) => setFormCredit(e.target.value)}
                      placeholder="0.50"
                      className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      required
                    />
                  </div>
                </div>

                {/* Strikes */}
                {formType === 'iron_condor' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-muted block mb-1">Put Short Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={formPutShort}
                        onChange={(e) => setFormPutShort(e.target.value)}
                        placeholder="5700"
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Put Long Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={formPutLong}
                        onChange={(e) => setFormPutLong(e.target.value)}
                        placeholder="5695"
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Call Short Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={formCallShort}
                        onChange={(e) => setFormCallShort(e.target.value)}
                        placeholder="5900"
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Call Long Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={formCallLong}
                        onChange={(e) => setFormCallLong(e.target.value)}
                        placeholder="5905"
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-muted block mb-1">Short Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={formShortStrike}
                        onChange={(e) => setFormShortStrike(e.target.value)}
                        placeholder="5700"
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Long Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={formLongStrike}
                        onChange={(e) => setFormLongStrike(e.target.value)}
                        placeholder="5695"
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-xs text-muted block mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. neutral bias, VIX 18"
                    className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-accent/20 text-accent border border-accent/30 px-5 py-2 rounded font-semibold text-sm hover:bg-accent/30 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Trade'}
                </button>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          {trades.length > 0 && (
            <div className="flex gap-2 mb-4">
              {(['all', 'open', 'closed'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded capitalize ${
                    filter === f
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-panel border border-border text-muted hover:text-text'
                  }`}
                >
                  {f}{' '}
                  {f === 'all'
                    ? `(${trades.length})`
                    : f === 'open'
                    ? `(${stats.open})`
                    : `(${stats.closed})`}
                </button>
              ))}
            </div>
          )}

          {/* Trade History Table */}
          {filtered.length === 0 ? (
            <div className="bg-panel border border-border rounded-lg p-8 text-center">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-muted text-sm">
                {trades.length === 0
                  ? 'No trades yet. Click + Add Trade to log your first trade.'
                  : 'No trades match this filter.'}
              </div>
            </div>
          ) : (
            <div className="bg-panel border border-border rounded-lg p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-left text-xs">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Type</th>
                      <th className="py-2 px-2">Strikes</th>
                      <th className="py-2 px-2 text-right">Contracts</th>
                      <th className="py-2 px-2 text-right">Credit</th>
                      <th className="py-2 px-2 text-center">Status</th>
                      <th className="py-2 px-2 text-right">Exit Cost</th>
                      <th className="py-2 px-2 text-right">P&L</th>
                      <th className="py-2 px-2">Notes</th>
                      <th className="py-2 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedTrades.map((group, gi) => {
                      const collapsed = isDayCollapsed(group.date, gi);
                      const dayPnl = group.trades.reduce((sum, t) => { const p = calcPnl(t); return sum + (p ? p.totalPnl : 0); }, 0);
                      const dayCredit = group.trades.reduce((sum, t) => sum + t.credit * 100 * t.contracts, 0);
                      const closedInDay = group.trades.filter(t => t.status === 'closed').length;
                      const dateLabel = new Date(group.date + 'T12:00:00').toLocaleDateString('en-GB', {
                        weekday: 'short', day: '2-digit', month: 'short', year: '2-digit',
                      });
                      return (
                        <Fragment key={group.date}>
                          <tr
                            className="bg-panel2/50 cursor-pointer hover:bg-panel2 select-none"
                            onClick={() => toggleDay(group.date, gi)}
                          >
                            <td colSpan={10} className="py-2 px-2">
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted w-4">{collapsed ? '▶' : '▼'}</span>
                                <span className="text-sm font-semibold">{dateLabel}</span>
                                <span className="text-xs text-muted">{group.trades.length} trade{group.trades.length !== 1 ? 's' : ''}</span>
                                {closedInDay > 0 && (
                                  <span className={`text-xs font-mono font-semibold ${dayPnl >= 0 ? 'text-green' : 'text-red'}`}>
                                    {dayPnl >= 0 ? '+' : ''}${fmt(dayPnl)}
                                  </span>
                                )}
                                <span className="text-xs text-green font-mono">${fmt(dayCredit)} credit</span>
                                <input
                                  type="text"
                                  value={dayComments[group.date] || ''}
                                  onChange={(e) => updateDayComment(group.date, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Day note..."
                                  className="ml-auto text-xs bg-transparent border-b border-border/50 focus:border-accent outline-none px-1 py-0.5 text-muted max-w-[200px]"
                                />
                              </div>
                            </td>
                          </tr>
                          {!collapsed && group.trades.map((trade) => {
                      const pnl = calcPnl(trade);
                      const isOpen = trade.status === 'open';
                      const dateStr = new Date(trade.date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      });
                      return (
                        <tr
                          key={trade.id}
                          className={`border-b border-border/30 text-xs ${
                            isOpen
                              ? ''
                              : pnl && pnl.totalPnl >= 0
                              ? 'bg-green/5'
                              : pnl
                              ? 'bg-red/5'
                              : ''
                          }`}
                        >
                          <td className="py-2 px-2 text-muted whitespace-nowrap">{dateStr}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{typeLabel(trade.type)}</td>
                          <td className="py-2 px-2 font-mono whitespace-nowrap">{strikeStr(trade)}</td>
                          <td className="py-2 px-2 text-right">{trade.contracts}</td>
                          <td className="py-2 px-2 text-right font-mono text-green">
                            ${fmt(trade.credit)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {isOpen ? (
                              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded font-semibold">
                                OPEN
                              </span>
                            ) : (
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-semibold ${
                                  pnl && pnl.totalPnl >= 0
                                    ? 'bg-green/20 text-green'
                                    : 'bg-red/20 text-red'
                                }`}
                              >
                                CLOSED
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {trade.exitCost != null ? `$${fmt(trade.exitCost)}` : '—'}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-mono font-semibold ${
                              pnl ? pnlColor(pnl.totalPnl) : 'text-muted'
                            }`}
                          >
                            {pnl
                              ? `${pnl.totalPnl >= 0 ? '+' : ''}$${fmt(pnl.totalPnl)} (${
                                  pnl.pnlPct >= 0 ? '+' : ''
                                }${fmt(pnl.pnlPct, 1)}%)`
                              : isOpen
                              ? `+$${fmt(trade.credit * 100 * trade.contracts)} max`
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-muted max-w-[160px] truncate">
                            {trade.notes || '—'}
                          </td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {isOpen && (
                                <button
                                  onClick={() => {
                                    setClosingTrade(trade);
                                    setCloseExitCost('');
                                  }}
                                  className="text-xs bg-yellow/20 text-yellow px-2 py-1 rounded hover:bg-yellow/30"
                                >
                                  Close
                                </button>
                              )}
                              <button
                                onClick={() => startEdit(trade)}
                                className="text-xs bg-panel2 text-muted px-2 py-1 rounded hover:text-text hover:bg-border"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteTrade(trade.id)}
                                className="text-xs bg-red/10 text-red px-2 py-1 rounded hover:bg-red/20"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Running total footer */}
              {filter !== 'open' && stats.closed > 0 && (
                <div className="border-t border-border mt-2 pt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {stats.closed} closed · {stats.wins}W / {stats.closed - stats.wins}L ·{' '}
                    {fmt(stats.winRate, 1)}% win rate
                  </span>
                  <span className={`font-bold font-mono ${pnlColor(stats.totalPnl)}`}>
                    Net: {stats.totalPnl >= 0 ? '+' : ''}${fmt(stats.totalPnl)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Close Trade Modal */}
          {closingTrade && (
            <div
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setClosingTrade(null)}
            >
              <div
                className="bg-panel border border-border rounded-lg p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold mb-3">Close Trade</h3>
                <p className="text-sm text-muted mb-1">
                  {typeFullLabel(closingTrade.type)} · {strikeStr(closingTrade)}
                </p>
                <p className="text-sm text-muted mb-4">
                  Credit: ${fmt(closingTrade.credit)} × {closingTrade.contracts} ct
                </p>
                <label className="text-xs text-muted block mb-1">Exit Cost (per contract)</label>
                <input
                  type="number"
                  step="0.01"
                  value={closeExitCost}
                  onChange={(e) => setCloseExitCost(e.target.value)}
                  placeholder="0.00 for full profit"
                  className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text mb-3"
                  autoFocus
                />
                {closeExitCost && (
                  <div className="text-sm mb-4">
                    <span className="text-muted">P&L preview: </span>
                    <span
                      className={
                        (closingTrade.credit - Number(closeExitCost)) * 100 * closingTrade.contracts >= 0
                          ? 'text-green font-bold'
                          : 'text-red font-bold'
                      }
                    >
                      {(closingTrade.credit - Number(closeExitCost)) * 100 * closingTrade.contracts >= 0
                        ? '+'
                        : ''}
                      $
                      {fmt(
                        (closingTrade.credit - Number(closeExitCost)) * 100 * closingTrade.contracts
                      )}
                    </span>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setClosingTrade(null)}
                    className="flex-1 py-2 bg-panel2 border border-border rounded text-sm hover:bg-bg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={closeTrade}
                    className="flex-1 py-2 bg-accent/20 text-accent border border-accent/30 rounded font-semibold text-sm hover:bg-accent/30"
                  >
                    Close Trade
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Trade Modal */}
          {editingTrade && (
            <div
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setEditingTrade(null)}
            >
              <div
                className="bg-panel border border-border rounded-lg p-6 w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold mb-4">Edit Trade</h3>
                <form onSubmit={saveEdit}>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-muted block mb-1">Date</label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                      >
                        {TRADE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {editType === 'iron_condor' ? (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs text-muted block mb-1">Put Short</label>
                        <input
                          type="number"
                          step="any"
                          value={editPutShort}
                          onChange={(e) => setEditPutShort(e.target.value)}
                          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">Put Long</label>
                        <input
                          type="number"
                          step="any"
                          value={editPutLong}
                          onChange={(e) => setEditPutLong(e.target.value)}
                          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">Call Short</label>
                        <input
                          type="number"
                          step="any"
                          value={editCallShort}
                          onChange={(e) => setEditCallShort(e.target.value)}
                          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">Call Long</label>
                        <input
                          type="number"
                          step="any"
                          value={editCallLong}
                          onChange={(e) => setEditCallLong(e.target.value)}
                          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs text-muted block mb-1">Short Strike</label>
                        <input
                          type="number"
                          step="any"
                          value={editShortStrike}
                          onChange={(e) => setEditShortStrike(e.target.value)}
                          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">Long Strike</label>
                        <input
                          type="number"
                          step="any"
                          value={editLongStrike}
                          onChange={(e) => setEditLongStrike(e.target.value)}
                          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-muted block mb-1">Contracts</label>
                      <input
                        type="number"
                        min="1"
                        value={editContracts}
                        onChange={(e) => setEditContracts(e.target.value)}
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Credit (per ct)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editCredit}
                        onChange={(e) => setEditCredit(e.target.value)}
                        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                        required
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs text-muted block mb-1">Notes</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingTrade(null)}
                      className="flex-1 py-2 bg-panel2 border border-border rounded text-sm hover:bg-bg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-accent/20 text-accent border border-accent/30 rounded font-semibold text-sm hover:bg-accent/30"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
