"""Run the model household through every state, income level and tenure.

Outputs (data/processed/):
  results_long.csv   one row per state x income level x tenure x component
  results_wide.csv   one row per state x income level x tenure, all components
  sensitivity.csv    renter pass-through (15%, 100%) and FHA owner checks
"""
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
from policyengine_us import Simulation

from build_inputs import (MORTGAGE_LTV, FHA_LTV, RENTER_SHIFT_BASE,
                          RENTER_SHIFT_SENS)

YEAR = 2025
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"

PE_OUTPUTS = ["state_income_tax", "local_tax", "state_sales_tax", "local_sales_tax"]


def vehicle_outlay_curve():
    """Annual vehicle purchases (net outlay) as a function of income.

    Log-log fit across CE 2025 income deciles 2-10 (decile 1 mixes retirees
    with assets and is excluded), weighted by inverse sampling variance, then
    scaled so the curve matches married couples whose oldest child is 6-17.
    """
    ce = pd.read_csv(RAW / "bls_ce2025_vehicle_purchases.csv", comment="#").set_index("group")
    dec = ce.loc[[f"decile_{i}" for i in range(2, 11)]]
    x, y, se = (dec.mean_income_before_taxes, dec.vehicle_purchases_net_outlay,
                dec.vehicle_purchases_se)
    b, a = np.polyfit(np.log(x), np.log(y), 1, w=y / se)
    fam = ce.loc["married_couple_oldest_child_6_to_17"]
    factor = fam.vehicle_purchases_net_outlay / np.exp(a + b * np.log(fam.mean_income_before_taxes))
    return lambda inc: factor * np.exp(a + b * np.log(inc)), dict(a=a, b=b, factor=factor)


def county_code(name, st):
    s = name.upper().replace("'", "_").replace(".", "").replace(" ", "_")
    return f"{s}_{st}"


def income_levels(inputs):
    pct = pd.read_csv(RAW / "cps2025_income_percentiles.csv")
    pts = {f"P{int(r.percentile)}": float(r.household_income_2025)
           for r in pct.itertuples() if r.percentile in (10, 30, 50, 70, 90)}
    us_med = float(inputs.loc[inputs.state == "US", "median_hh_income"].iloc[0])
    return pts, us_med


def household_specs(inputs):
    """One spec per state x income level x tenure (before locality variants)."""
    pts, us_med = income_levels(inputs)
    specs = []
    for r in inputs[inputs.state != "US"].itertuples():
        levels = dict(pts)
        levels["US_median"] = us_med
        levels["State_median"] = float(r.median_hh_income)
        for lvl, y in levels.items():
            for tenure in ("owner", "renter"):
                s = dict(state=r.state, level=lvl, income=y, tenure=tenure)
                if tenure == "owner":
                    v = r.home_value_to_income * y
                    s["home_value"] = v
                    s["real_estate_taxes"] = r.owner_property_tax_rate * v
                    s["mortgage_interest"] = MORTGAGE_LTV * v * r.first_year_interest_per_loan_dollar
                    s["rent"] = 0.0
                else:
                    s["home_value"] = 0.0
                    s["real_estate_taxes"] = 0.0
                    s["mortgage_interest"] = 0.0
                    s["rent"] = r.rent_to_income * y
                s["local_sales_tax_rate"] = float(r.local_sales_rate)
                specs.append(s)
    return specs


def locality_variants(spec, pops):
    """Expand a spec into (weight, overrides) locality variants for the states
    whose local income tax PolicyEngine models."""
    st = spec["state"]
    if st == "NY":
        tot = pops.loc[(pops.geo_type == "state") & (pops.state == "NY"), "pop2025"].iloc[0]
        nyc = pops.loc[(pops.geo_type == "county") & (pops.state == "NY"), "pop2025"].sum()
        yon = pops.loc[pops.name == "Yonkers city", "pop2025"].iloc[0]
        return [(nyc / tot, {"in_nyc": True}), (yon / tot, {"in_yonkers": True}),
                (1 - (nyc + yon) / tot, {})]
    if st == "DE":
        tot = pops.loc[(pops.geo_type == "state") & (pops.state == "DE"), "pop2025"].iloc[0]
        wil = pops.loc[pops.name == "Wilmington city", "pop2025"].iloc[0]
        return [(wil / tot, {"in_wilmington": True}), (1 - wil / tot, {})]
    if st in ("MD", "IN"):
        c = pops[(pops.geo_type == "county") & (pops.state == st)]
        tot = c.pop2025.sum()
        return [(p / tot, {"county": county_code(n, st)}) for n, p in zip(c.name, c.pop2025)]
    if st == "WI":
        # Wisconsin's child care subsidy formulas need a county; Wisconsin has
        # no local income tax, so the county does not change the results here.
        return [(1.0, {"county": "MILWAUKEE_COUNTY_WI"})]
    return [(1.0, {})]


def build_situation(rows):
    sit = {k: {} for k in ["people", "tax_units", "families", "spm_units",
                           "marital_units", "households"]}
    for i, r in enumerate(rows):
        a1, a2, k1, k2 = (f"h{i}_{p}" for p in ("a1", "a2", "k1", "k2"))
        mem = [a1, a2, k1, k2]
        y = r["income"]
        sit["people"][a1] = {"age": {YEAR: 40}, "employment_income": {YEAR: y / 2}}
        sit["people"][a2] = {"age": {YEAR: 38}, "employment_income": {YEAR: y / 2}}
        sit["people"][k1] = {"age": {YEAR: 8}}
        sit["people"][k2] = {"age": {YEAR: 5}}
        if r.get("rent"):
            sit["people"][a1]["rent"] = {YEAR: r["rent"]}
        if r.get("real_estate_taxes"):
            sit["people"][a1]["real_estate_taxes"] = {YEAR: r["real_estate_taxes"]}
        if r.get("mortgage_interest"):
            sit["people"][a1]["deductible_mortgage_interest"] = {YEAR: r["mortgage_interest"]}
        sit["tax_units"][f"h{i}_tu"] = {"members": mem}
        sit["families"][f"h{i}_f"] = {"members": mem}
        sit["spm_units"][f"h{i}_s"] = {"members": mem}
        sit["marital_units"][f"h{i}_m"] = {"members": [a1, a2]}
        sit["marital_units"][f"h{i}_m1"] = {"members": [k1]}
        sit["marital_units"][f"h{i}_m2"] = {"members": [k2]}
        hh = {"members": mem, "state_code": {YEAR: r["state"]},
              "local_sales_tax_rate": {YEAR: r["local_sales_tax_rate"]}}
        for k, v in r.get("overrides", {}).items():
            hh[k] = {YEAR: v}
        sit["households"][f"h{i}"] = hh
    return sit


def simulate(rows, chunk=600):
    out = []
    for start in range(0, len(rows), chunk):
        part = rows[start:start + chunk]
        sim = Simulation(situation=build_situation(part))
        vals = {v: sim.calculate(v, YEAR) for v in PE_OUTPUTS}
        for j, r in enumerate(part):
            out.append({**r, **{v: float(vals[v][j]) for v in PE_OUTPUTS}})
        print(f"  simulated {start + len(part)}/{len(rows)} households", flush=True)
    return out


def main():
    t0 = time.time()
    inputs = pd.read_csv(PROC / "state_inputs.csv")
    pops = pd.read_csv(RAW / "popest2025_local_tax_jurisdictions.csv", comment="#")
    specs = household_specs(inputs)

    rows = []
    for sid, s in enumerate(specs):
        for w, ov in locality_variants(s, pops):
            rows.append({**s, "spec_id": sid, "weight": w, "overrides": ov})
    print(f"{len(specs)} households, {len(rows)} PolicyEngine runs incl. locality variants")
    res = pd.DataFrame(simulate(rows))

    # Population-weight the locality variants back to one household per spec.
    w = res.weight
    agg = res.assign(**{v: res[v] * w for v in PE_OUTPUTS}).groupby("spec_id")[PE_OUTPUTS].sum()
    base = pd.DataFrame(specs)
    base.index.name = "spec_id"
    df = base.join(agg)

    inp = inputs.set_index("state")
    df["local_income_method"] = df.state.map(inp.local_income_tax_method)
    agg_rate = df.state.map(inp.agg_local_income_tax_rate).fillna(0)
    pe_local_states = df.local_income_method.str.startswith("PolicyEngine")
    df["local_income_tax"] = np.where(pe_local_states, df.local_tax, agg_rate * df.income)
    curve, fit = vehicle_outlay_curve()
    print(f"vehicle outlay fit: elasticity {fit['b']:.3f}, family factor {fit['factor']:.3f}")
    df["vehicle_outlay"] = curve(df.income)
    df["vehicle_sales_tax"] = df.vehicle_outlay * df.state.map(inp.vehicle_tax_rate)
    df["general_sales_tax"] = df.state_sales_tax + df.local_sales_tax
    df["sales_tax"] = df.general_sales_tax + df.vehicle_sales_tax

    share = df.state.map(inp.renter_tax_share_of_rent_before_shift)
    df["property_tax"] = np.where(df.tenure == "owner", df.real_estate_taxes,
                                  RENTER_SHIFT_BASE * share * df.rent)
    df["total_tax"] = df[["state_income_tax", "local_income_tax", "sales_tax",
                          "property_tax"]].sum(axis=1)
    df["effective_rate"] = df.total_tax / df.income
    for c in ["state_income_tax", "local_income_tax", "sales_tax", "property_tax"]:
        df[c + "_rate"] = df[c] / df.income

    cols = ["state", "level", "tenure", "income", "home_value", "rent",
            "state_income_tax", "local_income_tax", "state_sales_tax",
            "local_sales_tax", "general_sales_tax", "vehicle_outlay",
            "vehicle_sales_tax", "sales_tax", "property_tax", "total_tax",
            "effective_rate", "state_income_tax_rate", "local_income_tax_rate",
            "sales_tax_rate", "property_tax_rate", "mortgage_interest",
            "local_sales_tax_rate", "local_income_method"]
    wide = df[cols].sort_values(["state", "level", "tenure"])
    wide.to_csv(PROC / "results_wide.csv", index=False)
    long = wide.melt(id_vars=["state", "level", "tenure", "income"],
                     value_vars=["state_income_tax", "local_income_tax", "sales_tax",
                                 "property_tax", "total_tax"],
                     var_name="component", value_name="dollars")
    long["rate"] = long.dollars / long.income
    long.to_csv(PROC / "results_long.csv", index=False)

    # Sensitivity 1: renter pass-through share.
    rent_rows = df[df.tenure == "renter"].copy()
    sens = []
    for g in RENTER_SHIFT_SENS:
        pt = g * share[rent_rows.index] * rent_rows.rent
        tot = rent_rows.total_tax - rent_rows.property_tax + pt
        sens.append(rent_rows[["state", "level", "income"]].assign(
            scenario=f"renter_shift_{int(g * 100)}pct", property_tax=pt,
            total_tax=tot, effective_rate=tot / rent_rows.income,
            base_effective_rate=rent_rows.effective_rate))

    # Sensitivity 2: FHA terms for the 10th and 30th percentile owners.
    fha = []
    for s in specs:
        if s["tenure"] == "owner" and s["level"] in ("P10", "P30"):
            r = inp.loc[s["state"]]
            s2 = {**s, "mortgage_interest": FHA_LTV * s["home_value"] * r.first_year_interest_per_loan_dollar}
            for wgt, ov in locality_variants(s2, pops):
                fha.append({**s2, "weight": wgt, "overrides": ov})
    fres = pd.DataFrame(simulate(fha))
    fres["sit_w"] = fres.state_income_tax * fres.weight
    fsum = fres.groupby(["state", "level"]).agg(state_income_tax_fha=("sit_w", "sum"),
                                                income=("income", "first")).reset_index()
    own = df[(df.tenure == "owner") & df.level.isin(["P10", "P30"])][["state", "level", "state_income_tax", "effective_rate"]]
    fsum = fsum.merge(own, on=["state", "level"])
    fsum["rate_change_pp"] = (fsum.state_income_tax_fha - fsum.state_income_tax) / fsum.income * 100
    fsum["scenario"] = "fha_owner"
    sens.append(fsum)
    pd.concat(sens, ignore_index=True).to_csv(PROC / "sensitivity.csv", index=False)
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
