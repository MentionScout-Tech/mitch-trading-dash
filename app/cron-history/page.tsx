'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface Run {
  id: string;
  scanner: string;
  started: string;
  completed: string | null;
  status: string;
  exitCode: number | null;
  log_tail?: string;
}

interface Summary {
  scanner: string;
  total_runs: number;
  successes: number;
  failures: number;
  last_run: string | null;
  avg_duration_s: number | null;
}

export default function CronHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [filter, setFilter] = useState('');
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logText, setLogText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    load();
  }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const q = filter ? `?scanner=${filter}&limit=100` : '?limit=100';
      const data = await api(`/api/cron-history${q}`);
      setRuns(data.runs || []);
      setSummary(data.summary || []);
    } catch {}
    setLoading(false);
  }

  async function showLog(runId: string) {
    setLogFor(runId);
    setLogText('Loading...');
    try {
      const data = await api(`/api/scanners/log?runId=${runId}`);
      setLogText(data.log || '(empty)');
    } catch (e: any) {
      setLogText('Error: ' + e.message);
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function duration(r: Run) {
    if (!r.completed || !r.started) return '—';
    const s = Math.round((new Date(r.completed).getTime() - new Date(r.started).getTime()) / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }

  const scannerNames = [...new Set(summary.map(s => s.scanner))];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">🕐 Cron History</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {summary.map(s => (
          <div key={s.scanner} className="bg-panel border border-border rounded-lg p-4 cursor-pointer hover:border-accent"
            onClick={() => setFilter(filter === s.scanner ? '' : s.scanner)}>
            <div className="text-xs text-muted mb-1">{s.scanner}</div>
            <div className="text-xl font-bold">{s.total_runs}</div>
            <div className="flex gap-2 text-xs mt-1">
              <span className="text-green">✓ {s.successes}</span>
              <span className="text-red">✗ {s.failures}</span>
            </div>
            <div className="text-xs text-muted mt-1">
              Avg: {s.avg_duration_s ? `${s.avg_duration_s}s` : '—'}
            </div>
            {s.last_run && (
              <div className="text-[10px] text-muted mt-1">Last: {fmtDate(s.last_run)}</div>
            )}
            {filter === s.scanner && (
              <div className="text-[10px] text-accent mt-1">● Filtered</div>
            )}
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1">
          <button onClick={() => setFilter('')}
            className={`text-xs px-3 py-1.5 rounded ${!filter ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted'}`}>
            All
          </button>
          {scannerNames.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded ${filter === s ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted'}`}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={load} className="text-sm bg-panel border border-border px-3 py-1.5 rounded hover:bg-panel2 ml-auto">
          🔄
        </button>
      </div>

      {/* Runs table */}
      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : (
        <div className="bg-panel border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel2 border-b border-border text-muted text-left">
              <tr>
                <th className="px-4 py-2">Scanner</th>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Exit</th>
                <th className="px-4 py-2">Log Preview</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-panel2/50">
                  <td className="px-4 py-2 font-semibold">{r.scanner}</td>
                  <td className="px-4 py-2 text-muted whitespace-nowrap">{fmtDate(r.started)}</td>
                  <td className="px-4 py-2 text-muted">{duration(r)}</td>
                  <td className="px-4 py-2">
                    <span className={
                      r.status === 'running' ? 'text-yellow animate-pulse' :
                      r.exitCode === 0 ? 'text-green' : 'text-red'
                    }>
                      {r.status === 'running' ? '● Running' : r.exitCode === 0 ? '✓ OK' : '✗ Failed'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.exitCode ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-muted max-w-[200px] truncate">
                    {r.log_tail ? r.log_tail.split('\n').slice(-1)[0] : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={() => showLog(r.id)} className="text-xs text-accent hover:underline">
                      View log
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <div className="p-6 text-center text-muted">No runs found</div>}
        </div>
      )}

      {/* Log modal */}
      {logFor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setLogFor(null)}>
          <div className="bg-panel border border-border rounded-lg p-4 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">{logFor}</div>
              <button onClick={() => setLogFor(null)} className="text-muted hover:text-text">✕</button>
            </div>
            <pre className="text-xs bg-bg p-3 rounded overflow-auto flex-1 whitespace-pre-wrap">{logText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
