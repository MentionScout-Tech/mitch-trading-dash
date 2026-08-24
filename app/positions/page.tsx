'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface Position {
  id: string;
  ticker: string;
  type: string;
  entry_price: number;
  shares: number;
  entry_date: string;
  notes: string;
  status: string;
  current_price?: number;
  unrealized_pnl?: number;
}

export default function PositionsPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ticker: '', type: 'long', entry_price: '', shares: '', notes: '' });

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  async function load() {
    try {
      const d = await api('/api/positions');
      setPositions(d.positions);
    } catch {}
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/positions', { method: 'POST', body: JSON.stringify(form) });
    setForm({ ticker: '', type: 'long', entry_price: '', shares: '', notes: '' });
    setShowAdd(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remove position?')) return;
    await api('/api/positions', { method: 'DELETE', body: JSON.stringify({ id }) });
    load();
  }

  const totalPnl = positions.reduce((sum, p) =>
    sum + (p.shares * p.entry_price * (p.unrealized_pnl || 0) / 100), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Positions</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-accent text-bg px-4 py-2 rounded font-semibold">
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={add} className="bg-panel border border-border rounded-lg p-4 mb-6 grid grid-cols-2 gap-3">
          <input required value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})}
            placeholder="Ticker" className="px-3 py-2 bg-bg border border-border rounded" />
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
            className="px-3 py-2 bg-bg border border-border rounded">
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="leap">LEAP Call</option>
            <option value="csp">Cash Secured Put</option>
            <option value="cc">Covered Call</option>
          </select>
          <input required type="number" step="0.01" value={form.entry_price} onChange={e => setForm({...form, entry_price: e.target.value})}
            placeholder="Entry price" className="px-3 py-2 bg-bg border border-border rounded" />
          <input type="number" step="0.01" value={form.shares} onChange={e => setForm({...form, shares: e.target.value})}
            placeholder="Shares / contracts" className="px-3 py-2 bg-bg border border-border rounded" />
          <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
            placeholder="Notes" className="px-3 py-2 bg-bg border border-border rounded col-span-2" />
          <button className="bg-green text-bg py-2 rounded font-semibold col-span-2">Add Position</button>
        </form>
      )}

      <div className="bg-panel border border-border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-panel2 border-b border-border text-muted text-left">
            <tr>
              <th className="px-4 py-2">Ticker</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Entry</th>
              <th className="px-4 py-2 text-right">Current</th>
              <th className="px-4 py-2 text-right">Shares</th>
              <th className="px-4 py-2 text-right">P&L</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => {
              const pnl = p.unrealized_pnl || 0;
              const cls = pnl > 0 ? 'text-green' : pnl < 0 ? 'text-red' : 'text-muted';
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-bold">{p.ticker}</td>
                  <td className="px-4 py-2 text-muted">{p.type}</td>
                  <td className="px-4 py-2 text-right">${p.entry_price.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{p.current_price ? `$${p.current_price.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2 text-right">{p.shares}</td>
                  <td className={`px-4 py-2 text-right ${cls}`}>{pnl > 0 ? '+' : ''}{pnl.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-muted">{p.entry_date}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => remove(p.id)} className="text-muted hover:text-red text-xs">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {positions.length === 0 && <div className="p-6 text-center text-muted">No positions yet</div>}
      </div>
    </div>
  );
}
