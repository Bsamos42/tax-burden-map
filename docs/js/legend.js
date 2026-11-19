/* Fixed-break legends: optional net-refund swatch, one swatch per class, and an
 * optional no-data swatch. sc = { labels, colors, refund }.
 */
import { esc } from './format.js';
import { tokens } from './tokens.js';

export function renderLegend(el, sc, opts = {}) {
  let html = '';
  if (sc.refund) html += '<div class="legend-item" role="listitem"><div class="swatch refund"></div><span>Net refund</span></div>';
  sc.labels.forEach((l, i) => { html += '<div class="legend-item" role="listitem"><div class="swatch" style="background:' + sc.colors[i] + '"></div><span>' + esc(l) + '</span></div>'; });
  if (opts.noData) html += '<div class="legend-item" role="listitem"><div class="swatch" style="background:' + tokens().noData + '"></div><span>No data</span></div>';
  el.innerHTML = html;
}
