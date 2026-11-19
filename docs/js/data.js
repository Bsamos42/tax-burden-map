/* Loads the site data file and state shapes, both keyed by FIPS code.
 * FIPS is the join key; postal codes are labels and URL values only.
 * Data: data/map_data.min.json, built by model/build_site_data.py from data/burden.csv.
 * Shapes: data/geo.json, from us-atlas 3.0.1 (states-albers-10m, ISC license,
 * Census Bureau cartographic boundaries), simplified, drawn in a 1000 x 610 box.
 */
export const FORMAT = 2;  // site file format this code reads

function getJSON(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
}

/** base: path from the page to the site root, e.g. '' or '../'. */
export async function loadSite(base = '') {
  const [d, geo] = await Promise.all([getJSON(base + 'data/map_data.min.json'), getJSON(base + 'data/geo.json')]);
  if (d.v !== FORMAT) throw new Error('data format ' + d.v + ', expected ' + FORMAT);
  const byCode = {};
  Object.keys(d.states).forEach((f) => { byCode[d.states[f].c] = f; });
  // Listed in postal-code order, which sets draw order and breaks ranking ties.
  const keys = Object.keys(d.states).sort((a, b) => (d.states[a].c < d.states[b].c ? -1 : 1));
  return {
    dataVersion: d.data_version,
    taxYear: d.tax_year,
    income: d.income_points,
    keys,
    rec: (f) => d.states[f],
    code: (f) => d.states[f].c,
    name: (f) => d.states[f].n,
    fips: (code) => byCode[String(code).toUpperCase()],
    shape: (f) => geo[f],
  };
}
