/* Choropleth map (desktop) and equal-area tile grid (phone), keyed by FIPS.
 * Knows nothing about taxes: a view passes each area's fill and handlers.
 */
import { esc } from './format.js';
import { tokens } from './tokens.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * o.svg, o.statesG, o.calloutsG, o.tiles, o.tip, o.wrap: elements
 * o.keys: FIPS codes in draw order
 * o.shape(k): SVG path data · o.label(k): short label (postal code) · o.name(k): full name
 * o.tile(k): [row, col] in the tile grid · o.callouts: FIPS codes for the small-state boxes
 * o.tipLines(k): tooltip lines, a string or [className, text] · o.onSelect(k)
 */
export function createMap(o) {
  // Build
  o.keys.forEach((k) => {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', o.shape(k));
    p.setAttribute('class', 'st');
    p.dataset.fips = k;
    o.statesG.appendChild(p);
  });
  o.callouts.forEach((k, i) => {
    const y = 212 + i * 30;
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', 914); r.setAttribute('y', y); r.setAttribute('width', 26); r.setAttribute('height', 22);
    r.setAttribute('class', 'st'); r.dataset.fips = k;
    o.calloutsG.appendChild(r);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', 947); t.setAttribute('y', y + 17); t.setAttribute('class', 'callout-label');
    t.textContent = o.label(k);
    o.calloutsG.appendChild(t);
  });
  let html = '';
  o.keys.forEach((k) => {
    const [row, col] = o.tile(k);
    html += '<button type="button" class="tile" role="listitem" data-fips="' + k + '" style="grid-row:' + (row + 1) + ';grid-column:' + (col + 1) + '">' + esc(o.label(k)) + '</button>';
  });
  o.tiles.innerHTML = html;

  let styles = {};

  // Tooltip
  let hover = null;
  function areas(k) { return o.svg.querySelectorAll('.st[data-fips="' + k + '"]'); }
  function hideTip() {
    o.tip.hidden = true;
    if (hover) areas(hover).forEach((el) => el.classList.remove('hover'));
    hover = null;
  }
  function onMove(e) {
    const t = e.target.closest ? e.target.closest('.st') : null;
    if (!t) { hideTip(); return; }
    const k = t.dataset.fips;
    if (k !== hover) {
      if (hover) areas(hover).forEach((el) => el.classList.remove('hover'));
      hover = k;
      areas(k).forEach((el) => el.classList.add('hover'));
      const lines = styles[k] ? o.tipLines(k) : ['No data for ' + o.name(k)];
      o.tip.innerHTML = '<strong>' + esc(o.name(k)) + '</strong>' + lines.map((l) =>
        Array.isArray(l) ? '<span class="' + l[0] + '">' + esc(l[1]) + '</span>' : '<span>' + esc(l) + '</span>').join('');
    }
    const box = o.wrap.getBoundingClientRect();
    const x = e.clientX - box.left, y = e.clientY - box.top;
    const left = x + 16 + 250 > box.width ? x - 266 : x + 16;
    o.tip.style.left = Math.max(0, left) + 'px';
    o.tip.style.top = (y + 18) + 'px';
    o.tip.hidden = false;
  }
  o.svg.addEventListener('mousemove', onMove);
  o.svg.addEventListener('mouseleave', hideTip);
  o.svg.addEventListener('click', (e) => { const t = e.target.closest('.st'); if (t) o.onSelect(t.dataset.fips); });
  o.tiles.addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) o.onSelect(t.dataset.fips); });

  /**
   * s[k] = { color, refund } or null for no data · sel: selected FIPS or null
   * aria(k): tile label for screen readers
   */
  function paint(s, sel, aria) {
    const T = tokens();
    styles = s;
    o.svg.querySelectorAll('.st').forEach((el) => {
      const k = el.dataset.fips, st = s[k];
      el.setAttribute('fill', !st ? T.noData : st.refund ? 'url(#refund-dots)' : st.color);
      el.classList.toggle('sel', k === sel);
    });
    if (sel) {
      const p = o.statesG.querySelector('.st[data-fips="' + sel + '"]');
      if (p) p.parentNode.appendChild(p);  // draw the selected state on top
    }
    o.tiles.querySelectorAll('.tile').forEach((el) => {
      const k = el.dataset.fips, st = s[k], color = st ? st.color : T.noData;
      el.style.backgroundColor = color;
      el.style.backgroundImage = st && st.refund ? T.dots : 'none';
      el.style.backgroundSize = '5px 5px';
      el.style.color = T.lightText.indexOf(color) >= 0 ? '#FFFFFF' : '#1A1A1A';
      el.setAttribute('aria-pressed', String(k === sel));
      el.setAttribute('aria-label', st ? aria(k) : o.name(k) + ', no data');
    });
  }

  function focusTile(k) { const t = o.tiles.querySelector('.tile[data-fips="' + k + '"]'); if (t) t.focus(); }

  return { paint, hideTip, focusTile };
}
