import './globals.css';
import type { Metadata } from 'next';
import Nav from '../components/Nav';
import ThemeProvider from '../components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Mitch Trading Dash',
  description: 'Personal signal dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              if (t === 'light') document.documentElement.classList.add('light');
            } catch(e){}
          })();
        `}} />
      </head>
      <body>
        <ThemeProvider>
          <Nav />
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
