/* Reserved data colors, read from css/tokens.css so the stylesheet is the single
 * source. Call loadTokens() once the stylesheet has loaded.
 */
let T = null;

function read() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const seq = (prefix, n) => Array.from({ length: n }, (_, i) => v(prefix + (i + 1)));
  return {
    burden: seq('--burden-', 6),
    gap: seq('--gap-', 7),
    refund: v('--refund'),
    refundDot: v('--refund-dot'),
    red: v('--red'),
    noData: v('--no-data'),
    reference: v('--reference'),
    comp: {
      state_income_tax: v('--comp-state-income'),
      local_income_tax: v('--comp-local-income'),
      sales_tax: v('--comp-sales'),
      property_tax: v('--comp-property'),
    },
  };
}

export async function loadTokens() {
  T = read();
  if (!T.burden[0]) {
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    T = read();
  }
  if (!T.burden[0]) throw new Error('styles missing');
  // Darkest fills take white labels.
  T.lightText = [T.burden[4], T.burden[5], T.gap[0], T.gap[6]];
  // Dotted refund pattern for HTML elements; the SVG map uses #refund-dots.
  T.dots = 'radial-gradient(' + T.refundDot + ' 1px, transparent 1.4px)';
  return T;
}

export function tokens() {
  if (!T) throw new Error('loadTokens() has not run');
  return T;
}
