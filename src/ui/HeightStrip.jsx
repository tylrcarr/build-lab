import React, { useEffect, useRef, useState } from 'react';
import { feet } from '../engine.js';

// Runs a job in a fresh worker a moment after its inputs change; the last answer stays until the next one.
export function useWorkerJob(kind, options, delay = 150) {
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const worker = useRef(null), key = JSON.stringify(options);
  useEffect(() => {
    const t = setTimeout(() => {
      worker.current?.terminate();
      const w = new Worker(new URL('../optimize-worker.js', import.meta.url), { type: 'module' });
      worker.current = w; setBusy(true);
      w.onmessage = ({ data }) => { if (data.progress) return; if (data.result) setResult(data.result); setBusy(false); w.terminate(); };
      w.onerror = () => { setBusy(false); w.terminate(); };
      w.postMessage({ kind, options });
    }, delay);
    return () => clearTimeout(t);
  }, [kind, key]);
  useEffect(() => () => worker.current?.terminate(), []);
  return [result, busy];
}

const WHY = {
  body: 'No weight and wingspan here has the caps for this',
  breakers: 'Fits only with more Cap Breakers',
  budget: "Doesn't fit in 99 Overall, even with every Cap Breaker",
};

// The height heat map: one bar per height, taller = more Overall left after your picks/minimums, hatched = doesn't fit.
// Click a height to search just it; click a second one to search the range between. rows: heightHeat() output.
export function HeightStrip({ rows, value, onChange, onAll, busy = false, allLabel = 'all heights' }) {
  const [anchor, setAnchor] = useState(null);
  const [lo, hi] = value;
  const fit = (rows ?? []).filter(x => x.room != null);
  // Every height in range = nothing narrowed: no outline on all of them.
  const every = !!rows?.length && lo <= rows[0].height && hi >= rows[rows.length - 1].height;
  const maxRoom = Math.max(1, ...fit.map(x => x.room));
  const click = h => {
    if (anchor == null) { setAnchor(h); onChange([h, h]); }
    else { onChange([Math.min(anchor, h), Math.max(anchor, h)]); setAnchor(null); }
  };
  return <div className="hstrip">
    <div className={'height-strip' + (busy ? ' busy' : '')} role="group" aria-label="Heights">
      {(rows ?? []).map(x => { const on = !every && x.height >= lo && x.height <= hi, fits = x.status === 'ok';
        // Bar height = Overall left, as a share of the most any height has (not stretched min-to-max: 65 vs 67 Overall left
        // is nearly the same, and used to look like a quarter bar next to a full one).
        const pct = fits ? Math.max(8, 100 * x.room / maxRoom) : 0;
        return <button key={x.height} className={'hs' + (fits ? ' fits' : ' no') + (on ? ' on' : '') + (anchor === x.height ? ' anchor' : '')}
          title={fits ? `${feet(x.height)}: fits · ${x.room.toFixed(0)} Overall left for the rest${x.frame ? ` · needs ${x.frame}` : ''}` : `${feet(x.height)}: ${WHY[x.status] ?? "doesn't fit"}`}
          onClick={() => click(x.height)}>
          <span className="hs-bar"><i style={{ height: `${pct}%` }} /></span>
          <b>{feet(x.height)}</b><small>{x.frame ? x.frame.replace('short arms', 'short').replace('long arms', 'long') : ' '}</small></button>; })}
      {!rows && <span className="muted small">Checking heights…</span>}
    </div>
    <p className="muted small quick-strip-note">Searching {lo === hi ? feet(lo) : every ? 'every height' : `${feet(lo)}–${feet(hi)}`}
      {anchor != null ? ' · click another height for a range' : ' · click one height, or two for a range'}
      {onAll && <> · <button className="linkish" onClick={() => { setAnchor(null); onAll(); }}>{allLabel}</button></>}</p>
  </div>;
}
