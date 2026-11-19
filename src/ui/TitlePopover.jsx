import React, { useEffect, useRef, useState } from 'react';

// Every hover hint in the app as a popover (the Info look) instead of the browser's slow, plain tooltip: any element with
// a title gets it moved to data-tip on first hover, and the popover shows it a moment later, below the element (above it
// when there's no room), kept inside the window. Mounted once. Touch screens: later.
const DELAY = 250;
export default function TitlePopover() {
  const [tip, setTip] = useState(null); // { text, x, y, above }
  const timer = useRef(null), current = useRef(null);
  useEffect(() => {
    const hide = () => { clearTimeout(timer.current); current.current = null; setTip(null); };
    const over = e => {
      const el = e.target instanceof Element ? e.target.closest('[title], [data-tip]') : null;
      if (!el || el === current.current) return;
      const title = el.getAttribute('title');
      if (title) {
        el.setAttribute('data-tip', title); el.removeAttribute('title');
        // An icon-only control kept its name in the title: keep it for screen readers.
        if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', title);
      }
      const text = el.getAttribute('data-tip');
      if (!text) return;
      clearTimeout(timer.current); current.current = el; setTip(null);
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect(), above = r.bottom + 120 > window.innerHeight && r.top > 140;
        setTip({ text, x: Math.min(Math.max(8, r.left), window.innerWidth - 328), y: above ? r.top - 6 : r.bottom + 6, above });
      }, DELAY);
    };
    const out = e => { const el = current.current; if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide); window.removeEventListener('scroll', hide, true); };
  }, []);
  if (!tip) return null;
  return <div className={'title-pop arch-pop' + (tip.above ? ' above' : '')} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}
