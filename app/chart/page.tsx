'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y'];

export default function ChartPageWrapper() {
  return (
    <Suspense fallback={<div className="text-muted">Loading...</div>}>
      <ChartPage />
    </Suspense>
  );
}

function ChartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get('ticker') || 'NVDA');
  const [input, setInput] = useState(ticker);
  const [range, setRange] = useState(searchParams.get('range') || '3mo');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
    }
  }, []);

  useEffect(() => { loadChart(); }, [ticker, range]);

  async function loadChart() {
    setLoading(true);
    setErr('');
    try {
      const data = await api(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=${range}`);
      setCandles(data.candles || []);
    } catch (e: any) {
      setErr(e.message);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    // Dynamic import for lightweight-charts (client only)
    import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode }) => {
      // Clear previous
      if (chartInstance.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
      }

      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth,
        height: 500,
        layout: {
          background: { type: ColorType.Solid, color: '#11161e' },
          textColor: '#8b949e',
        },
        grid: {
          vertLines: { color: '#222a35' },
          horzLines: { color: '#222a35' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#222a35' },
        timeScale: { borderColor: '#222a35', timeVisible: range === '1d' || range === '5d' },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#3fb950',
        downColor: '#f85149',
        borderDownColor: '#f85149',
        borderUpColor: '#3fb950',
        wickDownColor: '#f85149',
        wickUpColor: '#3fb950',
      });

      const formatted = candles.map(c => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      candleSeries.setData(formatted);

      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeries.setData(
        candles.map(c => ({
          time: c.time as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)',
        }))
      );

      chart.timeScale().fitContent();
      chartInstance.current = chart;

      const handleResize = () => {
        if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
      }
    };
  }, [candles, range]);

  function go() {
    const t = input.trim().toUpperCase();
    if (t) setTicker(t);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">📊 Charts</h1>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="Ticker..."
          className="bg-panel border border-border rounded px-3 py-2 text-sm w-32 focus:outline-none focus:border-accent"
        />
        <button onClick={go} className="bg-accent text-bg px-4 py-2 rounded text-sm font-semibold hover:opacity-90">
          Go
        </button>
        <div className="flex gap-1 ml-2">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-xs px-3 py-1.5 rounded ${range === r ? 'bg-accent text-bg' : 'bg-panel border border-border text-muted hover:text-text'}`}>
              {r}
            </button>
          ))}
        </div>
        <button onClick={loadChart} className="text-sm bg-panel border border-border px-3 py-1.5 rounded hover:bg-panel2 ml-auto">
          🔄
        </button>
      </div>

      <div className="text-xl font-bold mb-2">{ticker}</div>

      {err && <div className="bg-red/10 border border-red text-red p-3 rounded mb-4">{err}</div>}
      {loading && <div className="text-muted mb-4">Loading chart...</div>}

      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div ref={chartRef} style={{ width: '100%', minHeight: 500 }} />
        {candles.length === 0 && !loading && (
          <div className="p-8 text-center text-muted">No chart data</div>
        )}
      </div>

      {candles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <MiniStat label="Open" value={`$${candles[candles.length - 1].open.toFixed(2)}`} />
          <MiniStat label="Close" value={`$${candles[candles.length - 1].close.toFixed(2)}`} />
          <MiniStat label="High" value={`$${candles[candles.length - 1].high.toFixed(2)}`} />
          <MiniStat label="Low" value={`$${candles[candles.length - 1].low.toFixed(2)}`} />
          <MiniStat label="Period change" value={(() => {
            const first = candles[0].open;
            const last = candles[candles.length - 1].close;
            const pct = ((last - first) / first * 100);
            return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
          })()} color={candles[candles.length - 1].close >= candles[0].open ? 'text-green' : 'text-red'} />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color = 'text-text' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
