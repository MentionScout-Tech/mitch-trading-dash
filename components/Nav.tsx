'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useTheme } from './ThemeProvider';

const whaleSubLinks = [
  { href: '/whales', label: 'Overview' },
  { href: '/leap', label: 'LEAP' },
  { href: '/options-flow', label: 'Options Flow' },
  { href: '/whale-wheel', label: 'Whale Wheel' },
];

const whalePaths = whaleSubLinks.map(l => l.href);

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [authed, setAuthed] = useState(false);
  const [whaleOpen, setWhaleOpen] = useState(false);
  const whaleRef = useRef<HTMLDivElement>(null);

  const isOnWhalePage = whalePaths.includes(pathname);

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('dash_token') : null;
    setAuthed(!!t);
  }, [pathname]);

  // Close dropdown when clicking outside (only for hover-triggered dropdown)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (whaleRef.current && !whaleRef.current.contains(e.target as Node)) {
        setWhaleOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function logout() {
    localStorage.removeItem('dash_token');
    router.push('/login');
  }

  if (pathname === '/login') return null;

  const topLinks = [
    { href: '/', label: 'Overview' },
    { href: '/signals', label: 'Signals' },
    { href: '/scanners', label: 'Scanners' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/positions', label: 'Positions' },
    { href: '/stats', label: 'Stats' },
    { href: '/chart', label: 'Charts' },
    // Whales dropdown goes here (rendered separately)
    { href: '/spx-0dte', label: 'SPX 0DTE' },
    { href: '/trades', label: 'Trades' },
    { href: '/cron-history', label: 'Cron History' },
    { href: '/backtest', label: 'Backtest' },
    { href: '/gold', label: 'Gold' },
  ];

  // Split links around where Whales goes
  const beforeWhale = topLinks.slice(0, 7); // Overview through Charts
  const afterWhale = topLinks.slice(7);      // SPX 0DTE onward

  return (
    <nav className="border-b border-border bg-panel">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg">📈 Mitch Dash</Link>
          <div className="flex gap-4 items-center">
            {beforeWhale.map(l => (
              <Link key={l.href} href={l.href}
                className={`text-sm ${pathname === l.href ? 'text-accent font-semibold' : 'text-muted hover:text-text'}`}>
                {l.label}
              </Link>
            ))}

            {/* Whales dropdown */}
            <div ref={whaleRef} className="relative"
              onMouseEnter={() => setWhaleOpen(true)}
              onMouseLeave={() => { if (!isOnWhalePage) setWhaleOpen(false); }}>
              <button
                onClick={() => { setWhaleOpen(o => !o); router.push('/whales'); }}
                className={`text-sm flex items-center gap-1 ${
                  isOnWhalePage ? 'text-accent font-semibold' : 'text-muted hover:text-text'
                }`}>
                Whales
                <svg className="w-3 h-3 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {(whaleOpen || isOnWhalePage) && (
                <div className="absolute top-full left-0 mt-1 bg-panel2 border border-border rounded-md shadow-lg py-1 min-w-[160px] z-50">
                  {whaleSubLinks.map(sl => (
                    <Link key={sl.href} href={sl.href}
                      className={`block px-4 py-2 text-sm ${
                        pathname === sl.href
                          ? 'text-accent bg-panel font-semibold'
                          : 'text-muted hover:text-text hover:bg-panel'
                      }`}>
                      {sl.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {afterWhale.map(l => (
              <Link key={l.href} href={l.href}
                className={`text-sm ${pathname === l.href ? 'text-accent font-semibold' : 'text-muted hover:text-text'}`}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        {authed && (
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="text-sm hover:text-text text-muted" title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={logout} className="text-xs text-muted hover:text-text">Logout</button>
          </div>
        )}
      </div>
    </nav>
  );
}
