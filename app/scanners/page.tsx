'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface Scanner { id: string; name: string; }
interface Run {
  id: string;
  scanner: string;
  started: string;
  completed: string | null;
  status: string;
  exitCode: number | null;
  log_tail?: string;
}

export default function ScannersPage() {
  const router = useRouter();
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logText, setLogText] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
      return;
    }
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  async function load() {
    try {
      const data = await api('/api/scanners');
      setScanners(data.scanners);
      setRuns(data.recent_runs);
      // Auto-clear running set if run finished
      const active = new Set(data.recent_runs.filter((r: Run) => r.status === 'running').map((r: Run) => r.scanner));
      setRunning(active as Set<string>);
    } catch {}
  }

  async function trigger(scanner: string) {
    try {
      setRunning(prev => new Set(prev).add(scanner));
      await api('/api/scanners/run', { method: 'POST', body: JSON.stringify({ scanner }) });
      await load();
    } catch (e: any) {
      alert(e.message);
      setRunning(prev => { const n = new Set(prev); n.delete(scanner); return n; });
    }
  }

  async function showLog(runId: string) {
    setLogFor(runId);
    setLogText('Loading...');
    try {
      const data = await api(`/api/scanners/log?runId=${runId}`);
      setLogText(data.log || '(empty)');
    } catch (e: any) { setLogText('Error: ' + e.message); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Scanners</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {scanners.map(s => {
          const isRunning = running.has(s.id);
          return (
            <div key={s.id} className="bg-panel border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-muted">{s.id}</div>
                </div>
                {isRunning && <span className="text-xs text-yellow animate-pulse">● Running</span>}
              </div>
              <button
                disabled={isRunning}
                onClick={() => trigger(s.id)}
                className="w-full bg-accent text-bg py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-30">
                {isRunning ? 'Running...' : '▶ Run now'}
              </button>
            </div>
          );
        })}
      </div>

      <h2 className="text-lg font-bold mb-3">Recent Runs</h2>
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel2 border-b border-border text-muted text-left">
            <tr>
              <th className="px-4 py-2">Scanner</th>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Duration</th>
              <th className="px-4 py-2">Exit</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const dur = r.completed
                ? Math.round((new Date(r.completed).getTime() - new Date(r.started).getTime()) / 1000) + 's'
                : '...';
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">{r.scanner}</td>
                  <td className="px-4 py-2 text-muted">{new Date(r.started).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className={r.status === 'running' ? 'text-yellow' : r.exitCode === 0 ? 'text-green' : 'text-red'}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted">{dur}</td>
                  <td className="px-4 py-2">{r.exitCode ?? '—'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => showLog(r.id)} className="text-xs text-accent hover:underline">View log</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {runs.length === 0 && <div className="p-6 text-center text-muted">No runs yet</div>}
      </div>

      {logFor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setLogFor(null)}>
          <div className="bg-panel border border-border rounded-lg p-4 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">{logFor}</div>
              <button onClick={() => setLogFor(null)} className="text-muted">✕</button>
            </div>
            <pre className="text-xs bg-bg p-3 rounded overflow-auto flex-1 whitespace-pre-wrap">{logText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
