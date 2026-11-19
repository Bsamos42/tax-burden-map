/* Shareable-link parameters for every page in the project.
 *
 * Rules (see Rebuild Requirements):
 * - Parameter names and values are never renamed or reused; changes are additive only.
 * - Defaults are left out of the URL.
 * - Unknown parameters and values are ignored and fall back to defaults.
 * - States are postal codes (lowercase); counties are 5-digit FIPS.
 * - Reserved parameters a page doesn't use are carried through untouched, so a
 *   link passed between pages keeps the other page's settings.
 * - `v` is written only after a breaking change raises SCHEMA_VERSION.
 */
export const SCHEMA_VERSION = 1;

// Internal value -> URL value, for each live parameter.
export const VOCAB = {
  measure: { rate: 'share', dollars: 'dollars', gap: 'gap' },
  income: { P10: 'p10', P30: 'p30', P50: 'p50', P70: 'p70', P90: 'p90', US_median: 'us-median', State_median: 'state-median' },
  household: { blended: 'typical', owner: 'owner', renter: 'renter' },
  tax: { all: 'all-taxes', state_income_tax: 'state-income', local_income_tax: 'local-income', sales_tax: 'sales', property_tax: 'property' },
};
const LIVE = ['measure', 'income', 'household', 'tax', 'state'];

// Reserved for later stages, with the value shape each accepts.
export const RESERVED = {
  county: /^\d{5}$/,              // stage 2: county FIPS
  preset: /^[a-z0-9-]{1,40}$/,    // stage 3: What Taxes Buy preset slug
  w: /^[0-9.,]{1,200}$/,          // stage 3: What Taxes Buy service weights
};

function invert(o) { const r = {}; Object.keys(o).forEach((k) => { r[o[k]] = k; }); return r; }
const FROM_URL = {};
Object.keys(VOCAB).forEach((k) => { FROM_URL[k] = invert(VOCAB[k]); });

/** Returns { values, reserved }: valid live values (internal form) and reserved params to carry. */
export function readParams(search = location.search) {
  const q = new URLSearchParams(search), values = {}, reserved = {};
  Object.keys(VOCAB).forEach((k) => { const v = FROM_URL[k][q.get(k)]; if (v) values[k] = v; });
  const st = (q.get('state') || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(st)) values.state = st;
  Object.keys(RESERVED).forEach((k) => { const v = q.get(k); if (v != null && RESERVED[k].test(v)) reserved[k] = v; });
  return { values, reserved };
}

/** Query string for live values (internal form; omit a key to leave it out) plus reserved params. */
export function queryString(values, reserved = {}) {
  const q = new URLSearchParams();
  LIVE.forEach((k) => {
    const v = values[k];
    if (v == null) return;
    q.set(k, k === 'state' ? String(v).toLowerCase() : VOCAB[k][v]);
  });
  Object.keys(RESERVED).forEach((k) => { if (reserved[k] != null) q.set(k, reserved[k]); });
  if (SCHEMA_VERSION > 1) q.set('v', String(SCHEMA_VERSION));
  return q.toString().replace(/%2C/g, ',');  // keep weight lists readable
}

export function writeParams(values, reserved) {
  const qs = queryString(values, reserved);
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}

/** A link to another page that carries every setting both pages share. */
export function linkTo(path, values, reserved) {
  const qs = queryString(values, reserved);
  return path + (qs ? '?' + qs : '');
}
