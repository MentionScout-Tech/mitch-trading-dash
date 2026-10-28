'use client';
import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface Zone { price: number; type: string; why: string; source: string; }
interface Analysis {
  bias: string; confidence: number; headline: string; summary: string;
  patternRead: string; keyLevels: any[]; watchFor: string[]; risk: string;
}
interface ChartAnalysis {
  ticker: string; range: string; lastClose: number; structure: any;
  zones: Zone[]; analysis: Analysis | null; aiError: string | null; generatedAt: string;
}

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
  const candleSeriesRef = useRef<any>(null);
  const priceLines = useRef<any[]>([]);

  // AI analysis state
  const [aiData, setAiData] = useState<ChartAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('dash_token')) {
      router.push('/login');
    }
  }, []);

  useEffect(() => { loadChart(); setAiData(null); setScreenshot(null); }, [ticker, range]);

  async function loadChart() {
    setLoading(true); setErr('');
    try {
      const data = await api(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=${range}`);
      setCandles(data.candles || []);
    } catch (e: any) { setErr(e.message); setCandles([]); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode }) => {
      if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; }
      priceLines.current = [];

      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth, height: 500,
        layout: { background: { type: ColorType.Solid, color: '#11161e' }, textColor: '#8b949e' },
        grid: { vertLines: { color: '#222a35' }, horzLines: { color: '#222a35' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#222a35' },
        timeScale: { borderColor: '#222a35', timeVisible: range === '1d' || range === '5d' },
      });

      const cs = chart.addCandlestickSeries({
        upColor: '#3fb950', downColor: '#f85149',
        borderDownColor: '#f85149', borderUpColor: '#3fb950',
        wickDownColor: '#f85149', wickUpColor: '#3fb950',
      });
      cs.setData(candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
      candleSeriesRef.current = cs;

      const vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vs.setData(candles.map(c => ({ time: c.time as any, value: c.volume, color: c.close >= c.open ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)' })));

      chart.timeScale().fitContent();
      chartInstance.current = chart;

      const handleResize = () => { if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth }); };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    });
    return () => { if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; } };
  }, [candles, range]);

  // Draw zones on chart
  const drawZones = useCallback((zones: Zone[]) => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    // Clear old lines
    for (const pl of priceLines.current) { try { cs.removePriceLine(pl); } catch {} }
    priceLines.current = [];
    for (const z of zones) {
      const pl = cs.createPriceLine({
        price: z.price,
        color: z.type === 'support' ? '#3fb950' : '#f85149',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${z.type === 'support' ? 'S' : 'R'}: ${z.why}`,
      });
      priceLines.current.push(pl);
    }
  }, []);

  async function runAnalysis() {
    setAiLoading(true); setAiErr(''); setAiData(null); setScreenshot(null);
    try {
      const data: ChartAnalysis = await api(`/api/chart-analysis?ticker=${encodeURIComponent(ticker)}&range=${range}`);
      setAiData(data);
      if (data.zones?.length) drawZones(data.zones);
      // Take screenshot after zones drawn
      setTimeout(() => {
        try {
          const img = chartInstance.current?.takeScreenshot();
          if (img) setScreenshot(img);
        } catch {}
      }, 500);
    } catch (e: any) { setAiErr(e.message); }
    finally { setAiLoading(false); }
  }

  function go() { const t = input.trim().toUpperCase(); if (t) setTicker(t); }

  const biasColor = (b: string) => b === 'bullish' ? 'text-green' : b === 'bearish' ? 'text-red' : 'text-yellow';
  const biasBg = (b: string) => b === 'bullish' ? 'bg-green/20 border-green/40' : b === 'bearish' ? 'bg-red/20 border-red/40' : 'bg-yellow/20 border-yellow/40';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">📊 Charts</h1>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && go()} placeholder="Ticker..."
          className="bg-panel border border-border rounded px-3 py-2 text-sm w-32 focus:outline-none focus:border-accent" />
        <button onClick={go} className="bg-accent text-[#0d1117] px-4 py-2 rounded text-sm font-semibold hover:opacity-90">Go</button>
        <div className="flex gap-1 ml-2">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-xs px-3 py-1.5 rounded ${range === r ? 'bg-accent text-[#0d1117]' : 'bg-panel border border-border text-muted hover:text-text'}`}>{r}</button>
          ))}
        </div>
        <button onClick={loadChart} className="text-sm bg-panel border border-border px-3 py-1.5 rounded hover:bg-panel2 ml-auto">🔄</button>
      </div>

      <div className="text-xl font-bold mb-2">{ticker}</div>

      {err && <div className="bg-red/10 border border-red text-red p-3 rounded mb-4">{err}</div>}
      {loading && <div className="text-muted mb-4">Loading chart...</div>}

      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div ref={chartRef} style={{ width: '100%', minHeight: 500 }} />
        {candles.length === 0 && !loading && <div className="p-8 text-center text-muted">No chart data</div>}
      </div>

      {/* AI Analysis button */}
      {candles.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={runAnalysis} disabled={aiLoading}
            className={`px-4 py-2 rounded text-sm font-semibold ${aiLoading ? 'bg-panel border border-border text-muted cursor-wait' : 'bg-accent hover:bg-accent/80 text-bg'}`}>
            {aiLoading ? '⏳ Analysing...' : '🤖 Run AI Analysis'}
          </button>
          {aiLoading && <span className="text-xs text-muted animate-pulse">This takes ~30-60s</span>}
        </div>
      )}

      {aiErr && <div className="bg-red/10 border border-red text-red p-3 rounded mt-3">{aiErr}</div>}

      {/* AI Analysis results */}
      {aiData && (
        <div className="mt-4 space-y-4">
          {/* Bias + headline */}
          <div className={`border rounded-lg p-4 ${biasBg(aiData.analysis?.bias || 'neutral')}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-2xl font-bold uppercase ${biasColor(aiData.analysis?.bias || 'neutral')}`}>
                {aiData.analysis?.bias === 'bullish' ? '🟢' : aiData.analysis?.bias === 'bearish' ? '🔴' : '🟡'} {aiData.analysis?.bias || 'Neutral'}
              </span>
              {aiData.analysis?.confidence != null && (
                <span className="text-sm text-muted">({aiData.analysis.confidence}% confidence)</span>
              )}
            </div>
            {aiData.analysis?.headline && <div className="text-lg font-semibold">{aiData.analysis.headline}</div>}
            {aiData.analysis?.summary && <p className="text-sm text-muted mt-2">{aiData.analysis.summary}</p>}
            {aiData.analysis?.patternRead && (
              <p className="text-sm mt-2 italic text-[#c9d1d9]">📐 {aiData.analysis.patternRead}</p>
            )}
          </div>

          {/* Key levels + structure */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Zones table */}
            <div className="bg-panel border border-border rounded-lg p-4">
              <h3 className="font-semibold mb-2">📍 Key Levels</h3>
              <div className="space-y-1.5">
                {aiData.zones?.map((z, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={z.type === 'support' ? 'text-green' : 'text-red'}>
                        {z.type === 'support' ? '▼' : '▲'} ${z.price.toFixed(2)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel2 text-muted uppercase">{z.source}</span>
                    </div>
                    <span className="text-xs text-muted">{z.why}</span>
                  </div>
                ))}
                {(!aiData.zones || aiData.zones.length === 0) && <div className="text-sm text-muted">No key levels detected</div>}
              </div>
            </div>

            {/* Watch for + risk */}
            <div className="bg-panel border border-border rounded-lg p-4">
              {aiData.analysis?.watchFor && aiData.analysis.watchFor.length > 0 && (
                <div className="mb-3">
                  <h3 className="font-semibold mb-2">👀 Watch For</h3>
                  <ul className="text-sm text-muted space-y-1">
                    {aiData.analysis.watchFor.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}
              {aiData.analysis?.risk && (
                <div>
                  <h3 className="font-semibold mb-1">⚠️ Risk</h3>
                  <p className="text-sm text-yellow/70">{aiData.analysis.risk}</p>
                </div>
              )}
              {/* Trend info */}
              {aiData.structure?.trend && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs text-muted">
                    Trend: <span className="font-semibold text-text capitalize">{aiData.structure.trend.label}</span>
                    {aiData.structure.trend.sma20 && <> · SMA20: ${aiData.structure.trend.sma20}</>}
                    {aiData.structure.trend.sma50 && <> · SMA50: ${aiData.structure.trend.sma50}</>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {aiData.aiError && (
            <div className="bg-yellow/10 border border-yellow/40 text-yellow p-3 rounded text-sm">
              ⚠️ AI narrative unavailable: {aiData.aiError} — showing computed zones only.
            </div>
          )}

          {/* Screenshot */}
          {screenshot && (
            <div className="bg-panel border border-border rounded-lg p-4">
              <h3 className="font-semibold mb-2">📸 Chart Snapshot</h3>
              <img src={screenshot} alt="Chart with analysis" className="w-full rounded border border-border" />
            </div>
          )}

          <div className="text-xs text-muted text-right">Generated: {new Date(aiData.generatedAt).toLocaleString()}</div>
        </div>
      )}

      {/* Mini stats */}
      {candles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <MiniStat label="Open" value={`$${candles[candles.length - 1].open.toFixed(2)}`} />
          <MiniStat label="Close" value={`$${candles[candles.length - 1].close.toFixed(2)}`} />
          <MiniStat label="High" value={`$${candles[candles.length - 1].high.toFixed(2)}`} />
          <MiniStat label="Low" value={`$${candles[candles.length - 1].low.toFixed(2)}`} />
          <MiniStat label="Period change" value={(() => {
            const first = candles[0].open; const last = candles[candles.length - 1].close;
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
