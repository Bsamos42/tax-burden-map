/* AP-style number formatting shared by every page. */
export const MINUS = '−';
export const NOBREAK = '⁠';

export function r1(v) { return Math.round(v * 10) / 10; }
export function fmtPct(v) { const r = r1(v); return (r < 0 ? MINUS + NOBREAK : '') + Math.abs(r).toFixed(1) + '%'; }
export function fmtUSD(v) { const r = Math.round(v); return (r < 0 ? MINUS + NOBREAK : '') + '$' + Math.abs(r).toLocaleString('en-US'); }
export function fmtPts(v) { const r = r1(v); return (r > 0 ? '+' : r < 0 ? MINUS + NOBREAK : '') + Math.abs(r).toFixed(1) + ' points'; }
export function fmtTick(v) { const a = Math.abs(v); return (v < 0 ? MINUS : '') + (Number.isInteger(a) ? String(a) : a.toFixed(1)) + '%'; }
export function usd0(n) { return '$' + Number(n).toLocaleString('en-US'); }
export function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
export function median(xs) { const a = xs.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }
