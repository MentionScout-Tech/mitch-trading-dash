'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Quote } from '../../lib/api';

export default function WatchlistPage() {
  const router = useRouter();
  const [tickers, setTickers] = useState<Quote[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

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
      const data = await api('/api/watchlist');
      setTickers(data.tickers);
    } catch {} finally { setLoading(false); }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ ticker: input.trim() }) });
    setInput('');
    load();
  }

  async function remove(t: string) {
    await api('/api/watchlist', { method: 'DELETE', body: JSON.stringify({ ticker: t }) });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Watchlist</h1>

      <form onSubmit={add} className="flex gap-2 mb-6">
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="Add ticker (e.g. AMZN)"
          className="flex-1 max-w-xs px-3 py-2 bg-panel border border-border rounded text-text focus:border-accent outline-none" />
        <button className="bg-accent text-bg px-4 py-2 rounded font-semibold">Add</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tickers.map(t => {
          const change = t.changePercent || 0;
          const cls = change > 0 ? 'text-green' : change < 0 ? 'text-red' : 'text-muted';
          return (
            <div key={t.symbol} className="bg-panel border border-border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold text-lg">{t.symbol}</div>
                  <div className="text-xs text-muted truncate">{t.name}</div>
                </div>
                <button onClick={() => remove(t.symbol)} className="text-muted hover:text-red text-xs">✕</button>
              </div>
              <div className="text-2xl font-bold">${t.price?.toFixed(2) || '—'}</div>
              <div className={`text-sm ${cls}`}>
                {change > 0 ? '+' : ''}{change?.toFixed(2)}% ({t.change > 0 ? '+' : ''}{t.change?.toFixed(2)})
              </div>
              <div className="text-xs text-muted mt-2">
                52w: ${t.yearLow?.toFixed(2)} – ${t.yearHigh?.toFixed(2)}
              </div>
              <div className="text-xs text-muted">
                Cap: ${t.marketCap ? (t.marketCap / 1e9).toFixed(1) + 'B' : '—'}
              </div>
            </div>
          );
        })}
      </div>
      {!loading && tickers.length === 0 && (
        <div className="text-center text-muted py-12">No tickers yet — add some above</div>
      )}
    </div>
  );
}
