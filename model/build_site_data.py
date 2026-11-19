"""Write the trimmed data file the website loads.

Burden figures come from data/burden.csv, the shared dataset every page builds
from. Footnotes, the progressivity gap and renter sensitivity results, which are
not burden figures, come from output/map_data.json. Writes
docs/data/map_data.min.json, keyed by FIPS code. Dollar amounts are rounded to
whole dollars; effective rates are recomputed in the browser as tax / income.

Run after export_map_data.py:
    python build_site_data.py
"""
import json
from pathlib import Path

import pandas as pd

from build_inputs import DATA_VERSION, STATE_FIPS

ROOT = Path(__file__).resolve().parents[1]
BURDEN = ROOT / "data" / "burden.csv"
EXTRAS = ROOT / "output" / "map_data.json"
DST = ROOT / "docs" / "data" / "map_data.min.json"

# Site file format version. Bump only when the page must change to read it.
FORMAT = 2
LEVELS = ["P10", "P30", "P50", "P70", "P90", "US_median", "State_median"]
TENURES = ["owner", "renter", "blended"]
COMPONENTS = ["state_income_tax", "local_income_tax", "sales_tax", "property_tax", "total_tax"]


def main():
    b = pd.read_csv(BURDEN, dtype={"fips": str})
    b = b[b.geo_level == "state"]
    versions = set(b.data_version.astype(str))
    if versions != {DATA_VERSION}:
        raise SystemExit(f"burden.csv data_version {versions} does not match {DATA_VERSION}; rerun export_map_data.py")
    extras = json.loads(EXTRAS.read_text(encoding="utf-8"))
    cell = b.set_index(["fips", "level", "tenure", "component"]).dollars
    income = b.drop_duplicates(["fips", "level"]).set_index(["fips", "level"]).income

    states = {}
    for code, fips in sorted(STATE_FIPS.items(), key=lambda kv: kv[1]):
        x = extras["states"][code]
        states[fips] = {
            "c": code,
            "n": x["name"],
            # [income, owner[5], renter[5], blended[5]], components in COMPONENTS order
            "l": {lv: [round(income[fips, lv])] + [[round(cell[fips, lv, t, c]) for c in COMPONENTS] for t in TENURES]
                  for lv in LEVELS},
            # Stored as progressivity (90th minus 10th); the page flips the sign.
            "g": {t: x["progressivity_gap_pp"][t] for t in TENURES},
            "f": x.get("footnotes", []),
            "r": {k: round(v, 5) for k, v in x.get("renter_sensitivity", {}).items()},
        }
    out = {
        "v": FORMAT,
        "data_version": DATA_VERSION,
        "tax_year": extras["meta"]["tax_year"],
        "income_points": {k: round(v) for k, v in extras["meta"]["income_points"].items()},
        "states": states,
    }
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {DST.relative_to(ROOT)} ({DST.stat().st_size:,} bytes, {len(states)} states, data {DATA_VERSION})")


if __name__ == "__main__":
    main()
