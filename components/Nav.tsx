'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('dash_token') : null;
    setAuthed(!!t);
  }, [pathname]);

  function logout() {
    localStorage.removeItem('dash_token');
    router.push('/login');
  }

  if (pathname === '/login') return null;

  const links = [
    { href: '/', label: 'Overview' },
    { href: '/signals', label: 'Signals' },
    { href: '/scanners', label: 'Scanners' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/positions', label: 'Positions' },
    { href: '/stats', label: 'Stats' },
    { href: '/chart', label: 'Charts' },
    { href: '/whales', label: 'Whales' },
    { href: '/cron-history', label: 'Cron History' },
    { href: '/backtest', label: 'Backtest' },
    { href: '/gold', label: 'Gold' }
  ];

  return (
    <nav className="border-b border-border bg-panel">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg">📈 Mitch Dash</Link>
          <div className="flex gap-4">
            {links.map(l => (
              <Link key={l.href} href={l.href}
                className={`text-sm ${pathname === l.href ? 'text-accent font-semibold' : 'text-muted hover:text-text'}`}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        {authed && (
          <button onClick={logout} className="text-xs text-muted hover:text-text">Logout</button>
        )}
      </div>
    </nav>
  );
}
