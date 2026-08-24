'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await login(password);
      router.push('/');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="bg-panel border border-border rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">📈 Mitch Trading Dash</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-text mb-4 focus:border-accent outline-none"
          autoFocus
        />
        {err && <div className="text-red text-sm mb-4">{err}</div>}
        <button type="submit" disabled={loading}
          className="w-full bg-accent text-bg py-2 rounded font-semibold hover:opacity-90 disabled:opacity-50">
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
