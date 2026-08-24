'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Stats } from '../../lib/api';

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    api('/api/stats').then(setStats).catch(() => {});
  }, []);

  if (!stats) return <div className="text-muted">Loading...</div>;

  function StatCard({ label, value, color = 'text-text' }: { label: string; value: any; color?: string }) {
    return (
      <div className="bg-panel border border-border rounded-lg p-4">
        <div className="text-xs text-muted">{label}</div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </div>
    );
  }

  const a7 = stats.avg_alpha_7d;
  const a30 = stats.avg_alpha_30d;
  const w7 = stats.win_rate_7d;
  const w30 = stats.win_rate_30d;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Performance Stats</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Signals" value={stats.total} />
        <StatCard label="Tracked (7d)" value={stats.tracked_7d} />
        <StatCard label="Avg Alpha 7d" value={a7 !== null ? `${a7 > 0 ? '+' : ''}${a7}%` : '—'}
          color={a7 ? (a7 > 0 ? 'text-green' : 'text-red') : 'text-muted'} />
        <StatCard label="Win Rate 7d" value={w7 !== null ? `${w7}%` : '—'}
          color={w7 ? (w7 > 50 ? 'text-green' : 'text-red') : 'text-muted'} />
        <StatCard label="Tracked (30d)" value={stats.tracked_30d} />
        <StatCard label="Avg Alpha 30d" value={a30 !== null ? `${a30 > 0 ? '+' : ''}${a30}%` : '—'}
          color={a30 ? (a30 > 0 ? 'text-green' : 'text-red') : 'text-muted'} />
        <StatCard label="Win Rate 30d" value={w30 !== null ? `${w30}%` : '—'}
          color={w30 ? (w30 > 50 ? 'text-green' : 'text-red') : 'text-muted'} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-panel border border-border rounded-lg p-4">
          <div className="text-sm text-muted mb-3">Signals by Method</div>
          <div className="space-y-2">
            {Object.entries(stats.by_method).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span>{k}</span>
                <span className="font-bold">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
