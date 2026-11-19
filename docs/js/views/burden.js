/* Tax Burden Map view: controls, copy, detail panel, ranking and CSV download.
 * Built on the shared modules; What Taxes Buy will be a second view on the same ones.
 */
import { loadSite } from '../data.js';
import { tokens, loadTokens } from '../tokens.js';
import { readParams, writeParams, VOCAB } from '../url-state.js';
import { createMap } from '../map.js';
import { renderLegend } from '../legend.js';
import { MINUS, r1, fmtPct, fmtUSD, fmtPts, fmtTick, usd0, esc, median } from '../format.js';

// ---------- Constants ----------
const PICK = { 4: [0, 2, 3, 5], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
const LEVELS5 = ['P10', 'P30', 'P50', 'P70', 'P90'];
const PCT = { P10: '10th', P30: '30th', P50: '50th', P70: '70th', P90: '90th' };
const LEVEL_SHORT = { P10: '10th percentile', P30: '30th percentile', P50: '50th percentile', P70: '70th percentile', P90: '90th percentile', US_median: 'U.S. median', State_median: "Each state's median" };
const COMPS = ['state_income_tax', 'local_income_tax', 'sales_tax', 'property_tax'];
const CIDX = { state_income_tax: 0, local_income_tax: 1, sales_tax: 2, property_tax: 3, all: 4 };
const HIDX = { owner: 1, renter: 2, blended: 3 };
const COMP_LABEL = { state_income_tax: 'State income', local_income_tax: 'Local income', sales_tax: 'Sales', property_tax: 'Property' };
const HH = { blended: 'Typical household', owner: 'Homeowner', renter: 'Renter' };
const HH_SHORT = { blended: 'Typical', owner: 'Owner', renter: 'Renter' };
const MEASURE_SHORT = { rate: 'Share of income', dollars: 'Dollars', gap: 'Regressivity gap' };
const CALLOUTS = ['MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];  // postal codes; mapped to FIPS at start
const TILE = { AK: [0, 0], ME: [0, 10], VT: [1, 9], NH: [1, 10], WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], IL: [2, 5], WI: [2, 6], MI: [2, 7], NY: [2, 8], RI: [2, 9], MA: [2, 10], OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IN: [3, 5], OH: [3, 6], PA: [3, 7], NJ: [3, 8], CT: [3, 9], CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5], WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9], AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6], SC: [5, 7], DC: [5, 8], OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7], HI: [7, 0], TX: [7, 3], FL: [7, 8] };
const DEFAULTS = { measure: 'rate', level: 'US_median', hh: 'blended', tax: 'all' };

// ---------- State ----------
let site = null;     // data, keyed by FIPS
let map = null;
let T = null;        // reserved colors
let KEYS = [];       // FIPS codes
let INCOME = { P10: 20010, P30: 51330, P50: 87460, P70: 140900, P90: 261300, US_median: 84780 };
const S = { measure: 'rate', level: 'US_median', hh: 'blended', tax: 'all', sel: null, selShared: false };
let carried = {};    // reserved URL parameters carried through untouched
let view = {};       // derived values for the current settings
const mq = window.matchMedia('(max-width: 767px)');
const $ = (id) => document.getElementById(id);

function gapWords(v) {
  const r = r1(v);
  return r > 0 ? 'Bottom pays ' + r.toFixed(1) + ' points more' : r < 0 ? 'Top pays ' + Math.abs(r).toFixed(1) + ' points more' : 'Top and bottom pay the same share';
}

// ---------- Data access ----------
const st = (k) => site.rec(k);
function incomeOf(k, lvl) { return st(k).l[lvl][0]; }
function cellOf(k, lvl, hh) { return st(k).l[lvl][HIDX[hh]]; }
function dollarsOf(k, lvl, hh, tax) { return cellOf(k, lvl, hh)[CIDX[tax]]; }
function rateOf(k, lvl, hh, tax) { return dollarsOf(k, lvl, hh, tax) / incomeOf(k, lvl) * 100; }
function valueOf(k) {
  if (S.measure === 'gap') return -st(k).g[S.hh];
  if (S.measure === 'dollars') return dollarsOf(k, S.level, S.hh, S.tax);
  return rateOf(k, S.level, S.hh, S.tax);
}
const has = (v) => typeof v === 'number' && isFinite(v);
function roundFor(v) { return S.measure === 'dollars' ? Math.round(v) : r1(v); }
function fmtVal(v) { return !has(v) ? 'no data' : S.measure === 'gap' ? fmtPts(v) : S.measure === 'dollars' ? fmtUSD(v) : fmtPct(v); }

// ---------- Scales ----------
function scaleFor() {
  if (S.measure === 'gap') {
    return { kind: 'div', breaks: [-20, -10, -5, 0, 2, 4], labels: [MINUS + '20 points or less', MINUS + '20 to ' + MINUS + '10', MINUS + '10 to ' + MINUS + '5', MINUS + '5 to 0', '0 to 2', '2 to 4', '4 points or more'], colors: T.gap, refund: false };
  }
  let breaks, labels, refund = true;
  if (S.measure === 'rate') {
    if (S.tax === 'all') { breaks = [4, 6, 7, 8, 9]; labels = ['0–4%', '4–6%', '6–7%', '7–8%', '8–9%', '9% or more']; }
    else { breaks = [1, 2, 3, 4]; labels = ['0–1%', '1–2%', '2–3%', '3–4%', '4% or more']; }
  } else if (S.tax !== 'all') {
    const inc = S.level === 'State_median' ? INCOME.US_median : INCOME[S.level];
    breaks = [1, 2, 3, 4].map((p) => Math.round(inc * p / 1000) * 10);
    const n = (x) => x.toLocaleString('en-US');
    labels = ['$0–' + n(breaks[0]), '$' + n(breaks[0]) + '–' + n(breaks[1]), '$' + n(breaks[1]) + '–' + n(breaks[2]), '$' + n(breaks[2]) + '–' + n(breaks[3]), '$' + n(breaks[3]) + ' or more'];
  } else if (S.level === 'P10') { breaks = [500, 1000, 1500]; labels = ['$0–500', '$500–1,000', '$1,000–1,500', '$1,500 or more']; }
  else if (S.level === 'P30') { breaks = [2000, 3000, 4000]; labels = ['$0–2,000', '$2,000–3,000', '$3,000–4,000', '$4,000 or more']; }
  else if (S.level === 'P70') { breaks = [5000, 7500, 10000, 12500, 15000]; labels = ['Under $5,000', '$5,000–7,500', '$7,500–10,000', '$10,000–12,500', '$12,500–15,000', '$15,000 or more']; refund = false; }
  else if (S.level === 'P90') { breaks = [10000, 15000, 20000, 25000, 30000]; labels = ['Under $10,000', '$10,000–15,000', '$15,000–20,000', '$20,000–25,000', '$25,000–30,000', '$30,000 or more']; refund = false; }
  else { breaks = [3000, 4500, 6000, 7500, 9000]; labels = ['Under $3,000', '$3,000–4,500', '$4,500–6,000', '$6,000–7,500', '$7,500–9,000', '$9,000 or more']; refund = false; }
  return { kind: 'seq', breaks, labels, colors: PICK[labels.length].map((i) => T.burden[i]), refund };
}
function classOf(sc, v) {
  let i = 0;
  if (sc.kind === 'div') { while (i < sc.breaks.length && (sc.breaks[i] <= 0 ? v > sc.breaks[i] : v >= sc.breaks[i])) i++; }
  else { while (i < sc.breaks.length && v >= sc.breaks[i]) i++; }
  return i;
}

// ---------- Copy ----------
function incomePhrase() {
  if (S.level === 'US_median') return 'on a $84,780 income';
  if (S.level === 'State_median') return "at each state's median household income";
  return 'at the ' + PCT[S.level] + ' percentile (' + usd0(INCOME[S.level]) + ')';
}
function titleFor() {
  if (S.measure === 'gap') return 'Who pays more, the top or the bottom?';
  if (S.tax === 'state_income_tax') return 'No income tax is not no tax';
  if (S.hh === 'renter' && S.tax === 'all') return 'Some renters pay more than owners';
  if (S.level === 'State_median') return 'What a typical local family pays';
  const ds = KEYS.map((k) => dollarsOf(k, S.level, S.hh, S.tax));
  const hi = Math.max.apply(null, ds), lo = Math.min.apply(null, ds);
  if (Math.round(lo) < 0) return 'From a ' + fmtUSD(hi) + ' bill to a ' + fmtUSD(-lo) + ' refund';
  return 'Same family, a ' + usd0(Math.round((hi - lo) / 100) * 100) + ' difference';
}
function subtitleFor() {
  if (S.measure === 'gap') {
    const t = 'Tax rate at the 10th percentile minus the 90th, percentage points; above zero means the bottom pays more (regressive)';
    return S.hh === 'blended' ? t : (S.hh === 'owner' ? 'Homeowners. ' : 'Renters. ') + t;
  }
  const unit = S.measure === 'dollars' ? '$ per year' : '% of income';
  if (S.measure === 'rate' && S.tax === 'state_income_tax' && S.level === 'US_median' && S.hh === 'blended') return 'State income tax only, % of income; switch to All taxes to see the full bill';
  if (S.measure === 'rate' && S.tax === 'all' && S.level === 'US_median' && S.hh === 'renter') return 'Typical renter household, property tax passed through rent at 50%, % of income';
  if (S.measure === 'dollars' && S.tax === 'all' && S.level === 'State_median' && S.hh === 'blended') return "State and local taxes at each state's median household income, $ per year";
  const what = S.tax === 'all' ? 'State and local taxes' : COMP_LABEL[S.tax] + ' tax only';
  const hh = S.hh === 'owner' ? ', homeowners' : S.hh === 'renter' ? ', renters' : '';
  return what + ' ' + incomePhrase() + ', married couple with two children, 2025' + hh + ', ' + unit;
}
function dekFor() {
  if (S.measure === 'gap' || S.tax === 'state_income_tax' || (S.hh === 'renter' && S.tax === 'all') || S.level === 'State_median') return '';
  const ds = KEYS.map((k) => [k, dollarsOf(k, S.level, S.hh, S.tax)]).sort((a, b) => b[1] - a[1]);
  const hi = ds[0], lo = ds[ds.length - 1];
  const what = S.tax === 'all' ? 'bill' : COMP_LABEL[S.tax].toLowerCase() + ' tax bill';
  if (Math.round(lo[1]) < 0) return 'The highest ' + what + ' is in ' + st(hi[0]).n + '; the largest net refund is in ' + st(lo[0]).n + '.';
  return 'That is the gap between the highest ' + what + ', ' + fmtUSD(hi[1]) + ' a year in ' + st(hi[0]).n + ', and the lowest, ' + fmtUSD(lo[1]) + ' in ' + st(lo[0]).n + '.';
}

// ---------- Derived view ----------
function compute() {
  const gapMode = S.measure === 'gap';
  const sc = scaleFor();
  const raw = {}, cls = {};
  KEYS.forEach((k) => {
    const v = valueOf(k);
    raw[k] = v;
    if (!has(v)) { cls[k] = null; return; }  // no data: gray, last in the ranking
    const refund = !gapMode && v < 0;
    cls[k] = { refund, color: refund ? T.refund : sc.colors[classOf(sc, roundFor(v))] };
  });
  const order = KEYS.slice().sort((a, b) => (has(raw[b]) ? raw[b] : -Infinity) - (has(raw[a]) ? raw[a] : -Infinity));
  const rank = {};
  order.forEach((k) => { rank[k] = has(raw[k]) ? 1 + order.filter((o) => has(raw[o]) && raw[o] > raw[k]).length : null; });
  const missing = KEYS.some((k) => !cls[k]);
  view = { gapMode, sc, raw, cls, order, rank, missing };
}

// ---------- Render: header and controls ----------
function renderHeader() {
  const title = titleFor(), dek = dekFor();
  $('title').textContent = title;
  $('dek').textContent = dek;
  $('dek').hidden = !dek;
  $('subtitle').textContent = subtitleFor();
  document.title = title + ' | State and local tax burden map';
  renderLegend($('legend'), view.sc, { noData: view.missing });
  $('legend-ends').hidden = !view.gapMode;
  $('renter-note').hidden = !(S.hh === 'renter' && !view.gapMode);
}

function renderControls() {
  document.querySelectorAll('[data-measure]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.measure === S.measure)); });
  document.querySelectorAll('[data-hh]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.hh === S.hh)); });
  $('sel-income').value = S.level;
  $('sel-tax').value = S.tax;
  $('sel-income').disabled = view.gapMode;
  $('sel-tax').disabled = view.gapMode;
  $('ctl-income').classList.toggle('is-disabled', view.gapMode);
  $('ctl-tax').classList.toggle('is-disabled', view.gapMode);
  $('settings-summary').textContent = view.gapMode
    ? MEASURE_SHORT.gap + ' · ' + HH_SHORT[S.hh]
    : MEASURE_SHORT[S.measure] + ' · ' + LEVEL_SHORT[S.level] + ' · ' + HH_SHORT[S.hh] + ' · ' + (S.tax === 'all' ? 'All taxes' : COMP_LABEL[S.tax]);
}

// ---------- Render: map ----------
function tipLines(k) {
  const lines = [];
  if (view.gapMode) {
    lines.push(gapWords(view.raw[k]));
    lines.push(['t2', 'Rank ' + view.rank[k] + ' of 51 (1 = most regressive)']);
    lines.push(['t2', '10th percentile ' + fmtPct(rateOf(k, 'P10', S.hh, 'all')) + ' · 90th ' + fmtPct(rateOf(k, 'P90', S.hh, 'all'))]);
    return lines;
  }
  const r = rateOf(k, S.level, S.hh, S.tax), d = dollarsOf(k, S.level, S.hh, S.tax);
  lines.push((S.tax === 'all' ? '' : COMP_LABEL[S.tax] + ' tax: ') + fmtPct(r) + ' of income · ' + fmtUSD(d) + ' a year' + (d < 0 ? ', net refund' : ''));
  lines.push(['t2', 'Rank ' + view.rank[k] + ' of 51 (1 = highest)']);
  if (S.tax === 'all') {
    const x = cellOf(k, S.level, S.hh);
    const parts = COMPS.filter((c) => { const v = x[CIDX[c]]; return x[4] < 0 ? Math.round(v) !== 0 : Math.round(v) > 0; })
      .map((c) => COMP_LABEL[c] + ' ' + fmtUSD(x[CIDX[c]]));
    if (parts.length) lines.push(['t2', parts.join(' · ')]);
  }
  if (S.level === 'State_median') lines.push(['t2', 'Income ' + fmtUSD(incomeOf(k, S.level))]);
  return lines;
}

function renderMap() {
  map.paint(view.cls, S.sel, (k) => st(k).n + ', ' + fmtVal(view.raw[k]) + ', rank ' + view.rank[k] + ' of 51');
  const ranked = view.order.filter((k) => has(view.raw[k]));
  const top = ranked[0], bot = ranked[ranked.length - 1];
  $('map-desc').textContent = titleFor() + '. Highest: ' + st(top).n + ', ' + fmtVal(view.raw[top]) + '. Lowest: ' + st(bot).n + ', ' + fmtVal(view.raw[bot]) + '. Use the ranking below the map to select a state by keyboard.';
}

// ---------- Render: ranking ----------
function renderRanking() {
  const order = view.order, raw = view.raw;
  const vs = order.map((k) => raw[k]).filter(has);
  const lo = Math.min.apply(null, [0].concat(vs)), hi = Math.max.apply(null, [0].concat(vs));
  const span = mq.matches ? 70 : 84;
  const X = (v) => (v - lo) / ((hi - lo) || 1) * span;
  const z = X(0);
  let html = '';
  order.forEach((k) => {
    const v = raw[k], kc = view.cls[k];
    const label = st(k).n + ', ' + fmtVal(v) + (has(v) ? ', rank ' + view.rank[k] + ' of 51' : '');
    let bar;
    if (!kc) {
      bar = '<span class="val" style="left:' + z + '%">No data</span>';
    } else {
      const a = X(Math.min(0, v)), b = X(Math.max(0, v));
      const barStyle = 'left:' + a + '%;width:' + Math.max(b - a, 0.3) + '%;background-color:' + kc.color + (kc.refund ? ';background-image:' + T.dots + ';background-size:5px 5px' : '');
      bar = '<span class="bar" style="' + barStyle + '"></span><span class="val" style="left:' + (v >= 0 ? b : z) + '%">' + esc(fmtVal(v)) + '</span>';
    }
    html += '<button type="button" class="rank-row" role="listitem" data-fips="' + k + '" aria-pressed="' + (k === S.sel) + '" aria-label="' + esc(label) + '">' +
      '<span class="name">' + esc(st(k).n) + '</span><span class="track"><span class="zero" style="left:' + z + '%"></span>' + bar + '</span></button>';
  });
  $('rank').innerHTML = html;
  const unit = view.gapMode ? 'percentage points' : S.measure === 'dollars' ? '$ per year' : '% of income';
  $('rank-sub').textContent = (view.gapMode ? '10th minus 90th percentile; above zero means the bottom pays more'
    : (S.tax === 'all' ? 'All taxes' : COMP_LABEL[S.tax] + ' tax') + ', ' + incomePhrase().replace(/^on a /, '').replace(/^at /, '')) + ', ' + unit + '; select a bar to see the state';
}

// ---------- Render: detail panel ----------
let lcState = null;  // geometry for the income chart tooltip

function renderPanel() {
  const body = $('panel-body');
  const panel = $('panel');
  panel.classList.toggle('open', !!S.sel && mq.matches);
  if (!S.sel) {
    body.innerHTML = '<p class="panel-empty">Select a state on the map or in the ranking to see what makes up its bill.</p>';
    syncScrim();
    return;
  }
  const k = S.sel, s = st(k), lvl = S.level, gapMode = view.gapMode, raw = view.raw;
  if (!has(raw[k])) {
    body.innerHTML = '<div class="p-head"><div><h2>' + esc(s.n) + '</h2><div class="p-ctx">No data for ' + esc(s.n) + ' in this view.</div></div>' +
      '<button type="button" class="p-close" data-action="close" aria-label="Close state details"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="#1A1A1A" stroke-width="2" fill="none"/></svg></button></div>';
    syncScrim();
    return;
  }
  const RED = T.red, REF = T.reference;
  const inc = incomeOf(k, lvl);
  const lvlText = lvl === 'US_median' ? 'U.S. median income, $84,780' : lvl === 'State_median' ? "the state's median income, " + fmtUSD(inc) : PCT[lvl] + ' percentile, ' + usd0(inc);
  const ctx = gapMode ? HH[S.hh] + ', 10th minus 90th percentile' : HH[S.hh] + ' at ' + lvlText;
  let big, bigUnit, sub, rankText;
  if (gapMode) {
    big = fmtPts(raw[k]);
    bigUnit = r1(raw[k]) > 0 ? 'regressive' : r1(raw[k]) < 0 ? 'progressive' : 'flat';
    sub = gapWords(raw[k]) + ': 10th percentile pays ' + fmtPct(rateOf(k, 'P10', S.hh, 'all')) + '; 90th pays ' + fmtPct(rateOf(k, 'P90', S.hh, 'all'));
    rankText = 'Rank ' + view.rank[k] + ' of 51 (1 = most regressive)';
  } else {
    const r = rateOf(k, lvl, S.hh, S.tax), d = dollarsOf(k, lvl, S.hh, S.tax);
    const taxNote = S.tax === 'all' ? '' : ', ' + COMP_LABEL[S.tax].toLowerCase() + ' tax';
    if (S.measure === 'dollars') { big = fmtUSD(d); bigUnit = 'a year' + taxNote + (d < 0 ? ', net refund' : ''); sub = fmtPct(r) + ' of income'; }
    else { big = fmtPct(r); bigUnit = 'of income' + taxNote; sub = fmtUSD(d) + ' a year' + (d < 0 ? ', net refund' : ''); }
    rankText = 'Rank ' + view.rank[k] + ' of 51 (1 = highest)';
  }

  // Stacked bar
  const x = cellOf(k, lvl, S.hh);
  const comps = COMPS.map((c) => ({ k: c, v: x[CIDX[c]] }));
  const pos = comps.filter((q) => q.v > 0).reduce((a, q) => a + q.v, 0);
  const neg = comps.filter((q) => q.v < 0).reduce((a, q) => a + q.v, 0);
  const spanAll = (pos - neg) || 1, z = -neg / spanAll * 100;
  let accP = z, accN = z, segs = '';
  comps.forEach((q) => {
    let w;
    if (q.v > 0) { w = q.v / spanAll * 100; segs += '<span class="seg-bar" style="left:' + accP + '%;width:' + w + '%;background:' + T.comp[q.k] + '"></span>'; accP += w; }
    else if (q.v < 0) { w = -q.v / spanAll * 100; accN -= w; segs += '<span class="seg-bar" style="left:' + accN + '%;width:' + w + '%;background:' + T.comp[q.k] + '"></span>'; }
  });
  if (neg < 0) segs += '<span class="zero" style="left:calc(' + z + '% - 1px)"></span>';
  const where = lvl === 'US_median' ? 'the U.S. median' : lvl === 'State_median' ? "the state's median" : 'the ' + PCT[lvl] + ' percentile';
  const barSub = 'Total ' + fmtUSD(x[4]) + ' a year at ' + where + (neg < 0 ? '; credits left of the line' : '');
  const key = comps.map((q) => '<div><i style="background:' + T.comp[q.k] + '"></i><span>' + COMP_LABEL[q.k] + '</span><b>' + fmtUSD(q.v) + '</b></div>').join('');

  // Income line chart
  const pts = LEVELS5.map((l) => rateOf(k, l, S.hh, S.tax));
  const ref = LEVELS5.map((l) => median(KEYS.map((kk) => rateOf(kk, l, S.hh, S.tax))));
  const all = pts.concat(ref);
  const mn = Math.min.apply(null, [0].concat(all)), mx = Math.max.apply(null, all.concat([0.5]));
  const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];
  const step = steps.find((t) => Math.ceil(mx / t - 1e-9) - Math.floor(mn / t) <= 6) || 50;
  const y0 = Math.floor(mn / step) * step, y4 = Math.ceil(mx / step - 1e-9) * step;
  const Y = (v) => 146 - (v - y0) / (y4 - y0) * 130;
  const XS = [44, 104.5, 165, 225.5, 286];
  let svg = '';
  for (let v = y0; v <= y4 + 1e-9; v += step) {
    const gy = Y(v).toFixed(1), isZero = Math.abs(v) < 1e-9;
    svg += '<line x1="40" x2="290" y1="' + gy + '" y2="' + gy + '" stroke="' + (isZero ? '#1A1A1A' : '#D2D6DA') + '" stroke-width="' + (isZero ? 1.5 : 1) + '"/>';
    svg += '<text x="34" y="' + (+gy + 5) + '" text-anchor="end">' + fmtTick(v) + '</text>';
  }
  const line = (arr) => arr.map((val, i) => XS[i] + ',' + Y(val).toFixed(1)).join(' ');
  svg += '<polyline points="' + line(ref) + '" fill="none" stroke="' + REF + '" stroke-width="2"/>';
  svg += '<polyline points="' + line(pts) + '" fill="none" stroke="' + RED + '" stroke-width="2.5"/>';
  ref.forEach((val, i) => { svg += '<rect x="' + (XS[i] - 3.5) + '" y="' + (Y(val) - 3.5).toFixed(1) + '" width="7" height="7" fill="' + REF + '"/>'; });
  pts.forEach((val, i) => { svg += '<circle cx="' + XS[i] + '" cy="' + Y(val).toFixed(1) + '" r="4" fill="' + RED + '"/>'; });
  let sy = Y(pts[4]), ry = Y(ref[4]);
  if (Math.abs(sy - ry) < 16) { const m = (sy + ry) / 2; if (sy <= ry) { sy = m - 8; ry = m + 8; } else { sy = m + 8; ry = m - 8; } }
  svg += '<text class="end-s" x="298" y="' + (sy + 5).toFixed(1) + '">' + fmtPct(pts[4]) + '</text>';
  svg += '<text class="end-r" x="298" y="' + (ry + 5).toFixed(1) + '">' + fmtPct(ref[4]) + '</text>';
  LEVELS5.forEach((l, i) => { svg += '<text x="' + XS[i] + '" y="166" text-anchor="middle">' + PCT[l] + '</text>'; });
  svg += '<line id="lc-guide" x1="0" x2="0" y1="12" y2="146" stroke="' + REF + '" stroke-width="1" visibility="hidden"/>';
  LEVELS5.forEach((l, i) => { svg += '<rect class="lc-hit" data-i="' + i + '" x="' + (XS[i] - 30.25) + '" y="6" width="60.5" height="152" fill="transparent"/>'; });
  const lcAria = s.n + ': ' + LEVELS5.map((l, i) => PCT[l] + ' percentile ' + fmtPct(pts[i])).join(', ') + '. Median of 51 states: ' + ref.map(fmtPct).join(', ') + '.';
  lcState = { XS, Y, pts, ref, name: s.n };
  const lcSub = (S.tax === 'all' ? 'All taxes' : COMP_LABEL[S.tax] + ' tax') + ', % of income, by income percentile; ' + HH[S.hh].toLowerCase();

  // Owner vs. renter
  const tax = S.tax;
  const ro = rateOf(k, lvl, 'owner', tax), rr = rateOf(k, lvl, 'renter', tax);
  const hiV = Math.max(Math.ceil(Math.max(ro, rr, 0) / 2) * 2, 2), loV = Math.min(Math.floor(Math.min(ro, rr, 0) / 2) * 2, 0);
  const P = (val) => 12 + (val - loV) / (hiV - loV) * 76;
  const po = P(ro), pr = P(rr);
  const dd = r1(rr) - r1(ro);
  const orNote = Math.abs(dd) < 0.05 ? 'Owners and renters pay about the same share.' : 'Renters pay ' + Math.abs(dd).toFixed(1) + (Math.abs(dd) === 1 ? ' point ' : ' points ') + (dd > 0 ? 'more' : 'less') + ' than owners.';
  let sens = '';
  if (S.hh === 'renter' && tax === 'all' && !gapMode) {
    const a15 = s.r['renter_shift_15pct|' + lvl], a100 = s.r['renter_shift_100pct|' + lvl];
    if (a15 != null && a100 != null) sens = 'If landlords pass on 15% of property tax: ' + fmtPct(a15 * 100) + '. At 50%: ' + fmtPct(rr) + '. At 100%: ' + fmtPct(a100 * 100) + '.';
  }

  const notes = (s.f || []).slice();
  if (x[4] < 0) notes.push('Refundable state credits exceed taxes paid at this income.');

  body.innerHTML =
    '<div class="p-head"><div><h2>' + esc(s.n) + '</h2><div class="p-ctx">' + esc(ctx) + '</div></div>' +
    '<button type="button" class="p-close" data-action="close" aria-label="Close state details"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="#1A1A1A" stroke-width="2" fill="none"/></svg></button></div>' +
    '<div><div class="p-big"><b>' + esc(big) + '</b><span>' + esc(bigUnit) + '</span></div><div class="p-sub">' + esc(sub) + '</div><div class="p-rank">' + esc(rankText) + '</div></div>' +
    '<div class="p-sec"><h3>What makes up the bill</h3><span class="p-note">' + esc(barSub) + '</span><div class="stack">' + segs + '</div><div class="stack-key">' + key + '</div></div>' +
    '<div class="p-sec"><h3>How the bill changes with income</h3>' +
      '<div class="chart-key"><span><svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="' + RED + '" stroke-width="2.5"/><circle cx="11" cy="5" r="3.5" fill="' + RED + '"/></svg>' + esc(s.n) + '</span>' +
      '<span><svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="' + REF + '" stroke-width="2"/><rect x="8" y="2" width="6" height="6" fill="' + REF + '"/></svg>Median of 51 states</span></div>' +
      '<div class="linechart" id="linechart"><svg viewBox="0 0 340 172" role="img" aria-label="' + esc(lcAria) + '">' + svg + '</svg><div id="lc-tip" class="lc-tip" hidden></div></div>' +
      '<span class="p-note">' + esc(lcSub) + '</span></div>' +
    '<div class="p-sec"><h3>Owner vs. renter</h3><span class="p-note">' + esc((tax === 'all' ? 'All taxes' : COMP_LABEL[tax] + ' tax') + ', % of income, at ' + where) + '</span>' +
      '<div class="dots-key"><span><i class="dot owner"></i>Owner</span><span><i class="dot renter"></i>Renter</span></div>' +
      '<div class="dotplot"><span class="lab o" style="left:' + po + '%">Owner ' + esc(fmtPct(ro)) + '</span><span class="axis"></span>' +
      '<span class="ax lo">' + fmtTick(loV) + '</span><span class="ax hi">' + fmtTick(hiV) + '</span>' +
      '<span class="link" style="left:' + Math.min(po, pr) + '%;width:' + Math.abs(po - pr) + '%"></span>' +
      '<span class="dot owner" style="left:' + po + '%"></span><span class="dot renter" style="left:' + pr + '%"></span>' +
      '<span class="lab r" style="left:' + pr + '%">Renter ' + esc(fmtPct(rr)) + '</span></div>' +
      '<span style="font-size:15px">' + esc(orNote) + '</span>' + (sens ? '<span class="p-note">' + esc(sens) + '</span>' : '') + '</div>' +
    '<div class="p-notes">' + notes.map((n) => '<p>' + esc(n) + '</p>').join('') + '<a href="#method" data-action="method">How I calculated this</a></div>';
  syncScrim();
}

function onChartMove(e) {
  const hit = e.target.closest ? e.target.closest('.lc-hit') : null;
  const tip = $('lc-tip'), guide = $('lc-guide');
  if (!hit || !lcState || !tip) { if (tip) tip.hidden = true; if (guide) guide.setAttribute('visibility', 'hidden'); return; }
  const i = +hit.dataset.i, L = lcState;
  const topY = Math.min(L.Y(L.pts[i]), L.Y(L.ref[i]));
  guide.setAttribute('x1', L.XS[i]); guide.setAttribute('x2', L.XS[i]); guide.setAttribute('visibility', 'visible');
  tip.innerHTML = '<strong>' + PCT[LEVELS5[i]] + ' percentile, ' + usd0(INCOME[LEVELS5[i]]) + '</strong><span class="s">' + esc(L.name + ': ' + fmtPct(L.pts[i])) + '</span><span class="r">Median of 51 states: ' + fmtPct(L.ref[i]) + '</span>';
  tip.style.left = (L.XS[i] / 340 * 100) + '%';
  tip.style.top = (topY / 172 * 100) + '%';
  tip.style.transform = 'translate(' + (i === 0 ? '0%' : i === 4 ? '-100%' : '-50%') + ', calc(-100% - 10px))';
  tip.hidden = false;
}

// ---------- Sheets (phone) ----------
function settingsOpen() { return $('controls').classList.contains('open'); }
function syncScrim() {
  const open = settingsOpen() || (mq.matches && $('panel').classList.contains('open'));
  $('scrim').hidden = !open;
  document.body.style.overflow = open && mq.matches ? 'hidden' : '';
}
function openSettings() {
  const ctl = $('controls');
  ctl.classList.add('open');
  ctl.setAttribute('role', 'dialog');
  ctl.setAttribute('aria-modal', 'true');
  $('settings-btn').setAttribute('aria-expanded', 'true');
  if (S.sel && mq.matches) { S.sel = null; S.selShared = false; render(); }
  syncScrim();
  $('settings-done').focus();
}
function closeSettings() {
  const ctl = $('controls');
  ctl.classList.remove('open');
  ctl.setAttribute('role', 'group');
  ctl.removeAttribute('aria-modal');
  $('settings-btn').setAttribute('aria-expanded', 'false');
  syncScrim();
  $('settings-btn').focus();
}

// ---------- URL ----------
function readURL() {
  const { values: v, reserved } = readParams();
  carried = reserved;
  if (v.measure) S.measure = v.measure;
  if (v.income) S.level = v.income;
  if (v.household) S.hh = v.household;
  if (v.tax) S.tax = v.tax;
  if (S.measure === 'gap') S.tax = 'all';
  const f = v.state && site.fips(v.state);
  if (f) { S.sel = f; S.selShared = true; }
}
function writeURL() {
  writeParams({
    measure: S.measure !== DEFAULTS.measure ? S.measure : null,
    income: S.measure !== 'gap' && S.level !== DEFAULTS.level ? S.level : null,
    household: S.hh !== DEFAULTS.hh ? S.hh : null,
    tax: S.measure !== 'gap' && S.tax !== DEFAULTS.tax ? S.tax : null,
    state: S.sel && S.selShared ? site.code(S.sel) : null,
  }, carried);
}

// ---------- CSV ----------
function csvText() {
  const MKEY = { rate: 'share', dollars: 'dollars', gap: 'regressivity_gap' };
  const unitKey = view.gapMode ? 'percentage_points' : S.measure === 'dollars' ? 'usd_per_year' : 'percent_of_income';
  const rows = view.order.map((k) => [
    '"' + st(k).n + '"', site.code(k), k, MKEY[S.measure], view.gapMode ? 'p10_minus_p90' : S.level, view.gapMode ? '' : incomeOf(k, S.level),
    VOCAB.household[S.hh], view.gapMode ? 'all' : S.tax, has(view.raw[k]) ? roundFor(view.raw[k]) : '', unitKey, view.rank[k] == null ? '' : view.rank[k], site.dataVersion,
  ].join(','));
  return 'state,code,fips,measure,income_level,income,household,tax,value,unit,rank,data_version\n' + rows.join('\n') + '\n';
}
function csvName() {
  const MK = { rate: 'share', dollars: 'dollars', gap: 'regressivity-gap' };
  return 'tax-burden-map_' + (view.gapMode ? MK.gap + '_' + VOCAB.household[S.hh] : [MK[S.measure], VOCAB.income[S.level], VOCAB.household[S.hh], VOCAB.tax[S.tax]].join('_')) + '.csv';
}

// ---------- Main render ----------
function render() {
  compute();
  renderHeader();
  renderControls();
  renderMap();
  renderRanking();
  renderPanel();
  $('csv').setAttribute('download', csvName());
  writeURL();
}

function select(k, fromUser) {
  S.sel = k;
  S.selShared = !!k && fromUser !== false;
  map.hideTip();
  render();
  if (k && mq.matches) { const p = $('panel'); p.scrollTop = 0; const b = p.querySelector('.p-close'); if (b) b.focus(); }
}
function closePanel() {
  const was = S.sel;
  S.sel = null; S.selShared = false;
  render();
  if (was && mq.matches) map.focusTile(was);
}
function openMethod(scroll) {
  $('method-btn').setAttribute('aria-expanded', 'true');
  $('method-body').hidden = false;
  if (scroll) $('method').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Events ----------
function bind() {
  document.querySelectorAll('[data-measure]').forEach((b) => {
    b.addEventListener('click', () => { S.measure = b.dataset.measure; if (S.measure === 'gap') S.tax = 'all'; render(); });
  });
  document.querySelectorAll('[data-hh]').forEach((b) => {
    b.addEventListener('click', () => { S.hh = b.dataset.hh; render(); });
  });
  $('sel-income').addEventListener('change', (e) => { S.level = e.target.value; render(); });
  $('sel-tax').addEventListener('change', (e) => { S.tax = e.target.value; render(); });
  $('rank').addEventListener('click', (e) => { const t = e.target.closest('.rank-row'); if (t) select(t.dataset.fips); });

  const panel = $('panel');
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) { const hit = e.target.closest('.lc-hit'); if (hit) onChartMove(e); return; }
    if (a.dataset.action === 'close') closePanel();
    if (a.dataset.action === 'method') { e.preventDefault(); if (mq.matches) closePanel(); openMethod(true); }
  });
  panel.addEventListener('mousemove', (e) => { if (e.target.closest('#linechart')) onChartMove(e); });
  panel.addEventListener('mouseleave', () => { const t = $('lc-tip'), g = $('lc-guide'); if (t) t.hidden = true; if (g) g.setAttribute('visibility', 'hidden'); });

  $('method-btn').addEventListener('click', function () {
    const open = this.getAttribute('aria-expanded') !== 'true';
    this.setAttribute('aria-expanded', String(open));
    $('method-body').hidden = !open;
  });

  $('settings-btn').addEventListener('click', openSettings);
  $('settings-done').addEventListener('click', closeSettings);
  $('scrim').addEventListener('click', () => { if (settingsOpen()) closeSettings(); else closePanel(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (settingsOpen()) closeSettings();
    else if (S.sel) closePanel();
  });

  $('share-btn').addEventListener('click', () => {
    const url = location.href, status = $('share-status');
    const done = () => { status.textContent = 'Link copied'; setTimeout(() => { status.textContent = ''; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => { window.prompt('Copy this link:', url); });
    } else { window.prompt('Copy this link:', url); }
  });

  $('csv').addEventListener('click', function () {
    const blob = new Blob([csvText()], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    this.href = href;
    setTimeout(() => { URL.revokeObjectURL(href); }, 10000);
  });

  const onMQ = () => {
    if (!mq.matches && settingsOpen()) closeSettings();
    render();
  };
  if (mq.addEventListener) mq.addEventListener('change', onMQ); else mq.addListener(onMQ);
}

// ---------- Start ----------
async function start() {
  try {
    [site, T] = await Promise.all([loadSite(''), loadTokens()]);
  } catch (err) {
    $('loading').textContent = 'The data could not load (' + err.message + '). Try reloading the page.';
    return;
  }
  INCOME = site.income;
  KEYS = site.keys;
  $('data-version').textContent = site.dataVersion;
  readURL();
  if (!S.sel && !mq.matches) { S.sel = site.fips('NC'); S.selShared = false; }
  map = createMap({
    svg: $('map'), statesG: $('states'), calloutsG: $('callouts'), tiles: $('tiles'), tip: $('tip'), wrap: $('map-wrap'),
    keys: KEYS, shape: site.shape, label: site.code, name: site.name, tile: (k) => TILE[site.code(k)],
    callouts: CALLOUTS.map(site.fips), tipLines, onSelect: (k) => select(k),
  });
  bind();
  $('loading').hidden = true;
  render();
}
start();
