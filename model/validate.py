"""Benchmark the model against ITEP, Tax Foundation and Lincoln Institute.

Writes data/processed/validation_states.csv and validation_summary.csv.
Benchmarks are comparison only; none feeds the model.
"""
from pathlib import Path

import numpy as np
import pandas as pd

from build_inputs import STATES

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
ABBR = {v: k for k, v in STATES.items()}


def spearman(a, b):
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))


def main():
    w = pd.read_csv(PROC / "results_wide.csv")
    ten = pd.read_csv(RAW / "acs2025_tenure.csv")
    ten["state"] = ten.NAME.map(STATES)
    ten = ten.dropna(subset=["state"])
    own_share = ten.set_index("state").eval("B25003_002E / B25003_001E")

    w["own_share"] = w.state.map(own_share)
    w["wt"] = np.where(w.tenure == "owner", w.own_share, 1 - w.own_share)
    comps = ["state_income_tax", "local_income_tax", "sales_tax", "property_tax", "total_tax"]
    blend = (w.assign(**{c: w[c] * w.wt for c in comps})
               .groupby(["state", "level"])[comps + ["income"]]
               .agg({**{c: "sum" for c in comps}, "income": "first"}).reset_index())
    blend["rate"] = blend.total_tax / blend.income
    blend.to_csv(PROC / "results_blended.csv", index=False)
    piv = blend.pivot(index="state", columns="level", values="rate")

    itep = pd.read_csv(RAW / "itep_whopays7.csv", comment="#")
    itep = itep[itep.state.isin(STATES)].assign(state=lambda d: d.state.map(STATES))
    tot = itep[itep.sheet == "APP_A"].set_index("state")
    sub = (itep[itep.sheet.isin(["SE_GST", "PROP_IND", "INC_PIT"])]
           .groupby("state")[["low20", "middle20", "next15"]].sum())
    tf = pd.read_csv(RAW / "taxfoundation_burden_2022.csv", comment="#")
    tf = tf.assign(state=tf.state.map(STATES)).set_index("state")

    v = pd.DataFrame(index=piv.index)
    v["model_state_median"] = piv["State_median"]
    v["model_P10"] = piv["P10"]
    v["model_P90"] = piv["P90"]
    v["itep_middle20_total"] = tot.middle20
    v["itep_middle20_like_for_like"] = sub.middle20
    v["itep_low20_like_for_like"] = sub.low20
    v["itep_next15_like_for_like"] = sub.next15
    v["tf_burden"] = tf.effective_burden_pct / 100

    # Ranks: 1 = highest burden, DC excluded from the 50-state ranks.
    s50 = v.drop(index="DC")
    r = pd.DataFrame(index=s50.index)
    r["model_rank"] = s50.model_state_median.rank(ascending=False, method="min")
    r["itep_rank"] = s50.itep_middle20_like_for_like.rank(ascending=False, method="min")
    r["tf_rank"] = s50.tf_burden.rank(ascending=False, method="min")
    r["move_vs_itep"] = r.model_rank - r.itep_rank
    r["move_vs_tf"] = r.model_rank - r.tf_rank
    v = v.join(r)

    lin = pd.read_csv(RAW / "lincoln2024_homestead_etr.csv", comment="#")
    lin["state_name"] = lin.place.str.extract(r"^(" + "|".join(sorted(STATES, key=len, reverse=True)) + ")")
    lin.loc[lin.place.str.startswith("DC "), "state_name"] = "District of Columbia"
    lin = lin[~lin.place.str.contains(r"\*")]
    lin_avg = lin.groupby("state_name").etr_pct.mean() / 100
    inp = pd.read_csv(PROC / "state_inputs.csv").set_index("state")
    v["owner_ptax_rate_acs"] = inp.owner_property_tax_rate
    v["owner_ptax_rate_lincoln"] = v.index.map(lambda s: lin_avg.get(ABBR.get(s)))
    v.to_csv(PROC / "validation_states.csv")

    sens = pd.read_csv(PROC / "sensitivity.csv")
    fha = sens[sens.scenario == "fha_owner"]
    rs = sens[sens.scenario.str.startswith("renter_shift")]
    rs = rs.assign(delta_pp=(rs.effective_rate - rs.base_effective_rate) * 100)

    summary = [
        ("Spearman: model state-median vs ITEP middle 20% (sales, property, PIT only)",
         spearman(s50.model_state_median, s50.itep_middle20_like_for_like)),
        ("Spearman: model state-median vs ITEP middle 20% (all taxes)",
         spearman(s50.model_state_median, s50.itep_middle20_total)),
        ("Spearman: model P10 vs ITEP lowest 20% (like-for-like)",
         spearman(s50.model_P10, s50.itep_low20_like_for_like)),
        ("Spearman: model P90 vs ITEP next 15% (like-for-like)",
         spearman(s50.model_P90, s50.itep_next15_like_for_like)),
        ("Spearman: model state-median vs Tax Foundation burden",
         spearman(s50.model_state_median, s50.tf_burden)),
        ("Pearson: owner property tax rate, ACS vs Lincoln city/rural average",
         float(v.owner_ptax_rate_acs.corr(v.owner_ptax_rate_lincoln))),
        ("States moving 10+ ranks vs ITEP", int((r.move_vs_itep.abs() >= 10).sum())),
        ("States moving 10+ ranks vs Tax Foundation", int((r.move_vs_tf.abs() >= 10).sum())),
        ("Mean model state-median rate", float(s50.model_state_median.mean())),
        ("Mean ITEP middle 20% like-for-like rate", float(s50.itep_middle20_like_for_like.mean())),
        ("FHA check: max absolute change in owner effective rate, pp",
         float(fha.rate_change_pp.abs().max())),
        ("FHA check: states with change >= 0.1 pp", int((fha.rate_change_pp.abs() >= 0.1).sum())),
        ("Renter share 15%: mean change in renter rate, pp",
         float(rs[rs.scenario == "renter_shift_15pct"].delta_pp.mean())),
        ("Renter share 100%: mean change in renter rate, pp",
         float(rs[rs.scenario == "renter_shift_100pct"].delta_pp.mean())),
    ]
    pd.DataFrame(summary, columns=["check", "value"]).to_csv(PROC / "validation_summary.csv", index=False)
    for k, val in summary:
        print(f"{val:10.3f}  {k}")
    print("\nMovers vs ITEP (|move| >= 10; positive = model ranks the state lower-burden):")
    cols = ["model_state_median", "itep_middle20_like_for_like", "model_rank", "itep_rank", "move_vs_itep"]
    print(v.loc[r.index[r.move_vs_itep.abs() >= 10], cols].round(4).sort_values("move_vs_itep").to_string())
    print("\nMovers vs Tax Foundation:")
    cols = ["model_state_median", "tf_burden", "model_rank", "tf_rank", "move_vs_tf"]
    print(v.loc[r.index[r.move_vs_tf.abs() >= 10], cols].round(4).sort_values("move_vs_tf").to_string())
    print("\nFHA changes >= 0.1pp:")
    print(fha[fha.rate_change_pp.abs() >= 0.1][["state", "level", "rate_change_pp"]].round(3).to_string())


if __name__ == "__main__":
    main()
