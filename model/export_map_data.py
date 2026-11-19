"""Export the results.

Writes two files:
- data/burden.csv: the shared, flat burden dataset. One row per geography,
  income level, tenure and tax component. Every page builds from it.
- output/map_data.json: the full nested hand-off, with inputs, footnotes and
  sensitivity results that are not burden figures.
"""
import json
from pathlib import Path

import pandas as pd

from build_inputs import DATA_VERSION, STATE_FIPS, STATES

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
NAMES = {v: k for k, v in STATES.items()}
COMPS = ["state_income_tax", "local_income_tax", "sales_tax", "property_tax", "total_tax"]
FHA_THRESHOLD_PP = 0.1


def progressivity(w, b):
    """Gap in percentage points: 90th-percentile rate minus 10th-percentile rate.
    Positive = higher earners pay a larger share of income (progressive)."""
    rows = []
    for st in sorted(w.state.unique()):
        r = {"state": st}
        for t in ("owner", "renter"):
            g = w[(w.state == st) & (w.tenure == t)].set_index("level").effective_rate
            r[f"{t}_P10_rate"], r[f"{t}_P90_rate"] = g["P10"], g["P90"]
            r[f"{t}_gap_pp"] = (g["P90"] - g["P10"]) * 100
        g = b[b.state == st].set_index("level").rate
        r["blended_P10_rate"], r["blended_P90_rate"] = g["P10"], g["P90"]
        r["blended_gap_pp"] = (g["P90"] - g["P10"]) * 100
        rows.append(r)
    out = pd.DataFrame(rows)
    out.to_csv(PROC / "progressivity.csv", index=False)
    return out.set_index("state")


def fha_footnotes(sens):
    f = sens[(sens.scenario == "fha_owner") & (sens.rate_change_pp.abs() >= FHA_THRESHOLD_PP)]
    notes = {}
    for r in f.itertuples():
        pct = {"P10": "10th", "P30": "30th"}[r.level]
        notes.setdefault(r.state, []).append(
            f"Owners at the {pct} percentile with an FHA loan (96.5% loan-to-value) would pay "
            f"{abs(r.rate_change_pp):.1f} percentage point{'s' if abs(r.rate_change_pp) >= 1.05 else ''} "
            f"{'less' if r.rate_change_pp < 0 else 'more'} of income, because more mortgage interest is deductible.")
    return notes


def block(row):
    d = {c: round(float(row[c]), 2) for c in COMPS}
    d["effective_rate"] = round(float(row["total_tax"] / row["income"]), 5)
    return d


BURDEN_COLUMNS = ["data_version", "fips", "geo_level", "state", "name", "level", "income",
                  "tenure", "component", "dollars", "rate"]


def write_burden(data):
    """Flatten map_data's burden figures into data/burden.csv, sorted by FIPS."""
    rows = []
    for st, s in sorted(data["states"].items(), key=lambda kv: STATE_FIPS[kv[0]]):
        for lvl, e in s["levels"].items():
            for t in ("owner", "renter", "blended"):
                for c in COMPS:
                    d = e[t][c]
                    rows.append([DATA_VERSION, STATE_FIPS[st], "state", st, s["name"], lvl, e["income"],
                                 t, c, d, round(d / e["income"], 6)])
    out = pd.DataFrame(rows, columns=BURDEN_COLUMNS)
    path = ROOT / "data" / "burden.csv"
    out.to_csv(path, index=False)
    print("wrote", path, len(out), "rows")


def main():
    w = pd.read_csv(PROC / "results_wide.csv")
    b = pd.read_csv(PROC / "results_blended.csv")
    inp = pd.read_csv(PROC / "state_inputs.csv").set_index("state")
    sens = pd.read_csv(PROC / "sensitivity.csv")
    prog = progressivity(w, b)
    notes = fha_footnotes(sens)
    data = {"meta": {
        "data_version": DATA_VERSION,
        "tax_year": 2025,
        "household": "Married filing jointly, two children (ages 8 and 5), all income from wages",
        "income_points": {r.level: r.income for r in w[w.state == "AL"].drop_duplicates("level").itertuples()
                          if r.level.startswith("P") or r.level == "US_median"},
        "renter_pass_through": 0.5,
        "blended": "owner and renter results weighted by ACS 2025 homeownership share",
        "sales_tax": "IRS 2025 optional state and local sales tax tables plus an annualized vehicle-purchase tax",
        "progressivity_gap": "90th-percentile effective rate minus 10th-percentile effective rate, percentage points; positive = progressive; diverging scale centered on 0",
        "mortgage": "One regime: 80% loan-to-value, 2025 average 30-year fixed rate; FHA footnotes where the effect is 0.1 point or more",
        "sources": "See README.md and data/raw for every input and its source.",
    }, "states": {}}
    for st, g in w.groupby("state"):
        s = {"name": NAMES[st], "fips": STATE_FIPS[st], "inputs": {
            "median_hh_income": float(inp.loc[st, "median_hh_income"]),
            "owner_property_tax_rate": round(float(inp.loc[st, "owner_property_tax_rate"]), 5),
            "local_sales_rate": round(float(inp.loc[st, "local_sales_rate"]), 5),
            "local_sales_rate_source": inp.loc[st, "local_sales_rate_source"],
            "local_income_tax_method": inp.loc[st, "local_income_tax_method"],
        }, "levels": {}}
        for lvl, gl in g.groupby("level"):
            e = {"income": float(gl.income.iloc[0])}
            for t in ("owner", "renter"):
                e[t] = block(gl[gl.tenure == t].iloc[0])
            e["blended"] = block(b[(b.state == st) & (b.level == lvl)].iloc[0])
            s["levels"][lvl] = e
        s["progressivity_gap_pp"] = {t: round(float(prog.loc[st, f"{t}_gap_pp"]), 2)
                                     for t in ("owner", "renter", "blended")}
        s["footnotes"] = notes.get(st, [])
        rs = sens[(sens.state == st) & sens.scenario.str.startswith("renter")]
        s["renter_sensitivity"] = {f"{r.scenario}|{r.level}": round(float(r.effective_rate), 5)
                                   for r in rs.itertuples()}
        data["states"][st] = s
    # Rank (1 = highest effective rate) and the 51-state median, per level and household.
    ref = {}
    for lvl in data["states"]["AL"]["levels"]:
        ref[lvl] = {}
        for t in ("owner", "renter", "blended"):
            rates = pd.Series({st: s["levels"][lvl][t]["effective_rate"] for st, s in data["states"].items()})
            ranks = rates.rank(ascending=False, method="min").astype(int)
            for st in rates.index:
                data["states"][st]["levels"][lvl][t]["rank"] = int(ranks[st])
            ref[lvl][t] = round(float(rates.median()), 5)
    data["meta"]["median_effective_rate_51"] = ref
    (OUT / "map_data.json").write_text(json.dumps(data, indent=1))
    print("wrote", OUT / "map_data.json", len(data["states"]), "states")
    write_burden(data)


if __name__ == "__main__":
    main()
