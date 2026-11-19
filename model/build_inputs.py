"""Assemble one row of model inputs per state from the raw source files.

Writes data/processed/state_inputs.csv. Every column traces to a file in
data/raw/ or to PolicyEngine US's bundled official sales tax rate files.
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN",
    "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI",
    "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
    "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}

# Census FIPS state codes. FIPS is the join key for every dataset and map shape;
# postal codes are labels only. County FIPS (stage 2) starts with these two digits.
STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08",
    "CT": "09", "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15",
    "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
    "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
    "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
    "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
    "WV": "54", "WI": "55", "WY": "56",
}

# Tax year plus a revision number. Change it whenever any published figure
# changes, and record why in CHANGELOG.md.
DATA_VERSION = "2025.1"

# States PolicyEngine has no official local sales tax rate file for; their
# local rate comes from Tax Foundation's midyear 2025 population-weighted
# average (decision recorded in the methodology spec).
TF_GAP_STATES = ["AL", "AK", "AZ", "CA", "CO", "FL", "HI", "ID", "IL", "LA",
                 "MO", "MS", "NM", "PA", "SC", "TX"]

# Local income tax handled by PolicyEngine, population-weighted by locality.
PE_LOCAL_INCOME_STATES = ["NY", "MD", "IN", "DE"]

# RHFS 2024: median value-to-annual-rent multiple, 5+ unit properties.
RHFS_MULTIPLE_US = 7.273

MORTGAGE_LTV = 0.80
FHA_LTV = 0.965
RENTER_SHIFT_BASE = 0.50
RENTER_SHIFT_SENS = (0.15, 1.00)


def pe_local_sales_rates(year=2025):
    """Population-weighted local sales tax rate by state from PolicyEngine's
    official rate files (combined rate less the state general rate)."""
    from policyengine_us.tools.local_sales_tax_rates import (
        locality_sales_tax_rates, state_general_sales_tax_rates)
    combined = locality_sales_tax_rates(year).state
    state = state_general_sales_tax_rates(year).reindex(combined.index)
    # Nevada's official files fold the 6.85% state rate into county rates.
    state = state.fillna(pd.Series({"NV": 0.0685}))
    return (combined - state).clip(lower=0)


VEHICLE_PRICE = 30_000  # assumed taxable price per vehicle, used only for caps
_VEH = None


def _vehicle_table():
    global _VEH
    if _VEH is None:
        _VEH = pd.read_csv(RAW / "vehicle_tax_rates_2025.csv", comment="#").set_index("state")
    return _VEH


def vehicle_new_share():
    ce = pd.read_csv(RAW / "bls_ce2025_vehicle_purchases.csv", comment="#").set_index("group")
    r = ce.loc["all_consumer_units"]
    return r.new_cars_trucks / r.vehicle_purchases_net_outlay


def vehicle_tax_rate(row):
    """Effective tax rate on vehicle purchases for one state (decimal)."""
    st, local = row.state, row.local_sales_rate
    t = _vehicle_table()
    if st == "US":
        return np.nan
    if st not in t.index:
        state_rate = row.tf_state_sales_rate_pct / 100
        if st == "UT":  # PolicyEngine's UT local rate already includes the 1.25% statewide add-on
            state_rate -= 0.0125
        return state_rate + local
    r = t.loc[st]
    base = r.state_rate_pct / 100
    rules = {
        "AL": base + 0.5 * local,
        "AK": local,
        "AR": base + local * 2_500 / VEHICLE_PRICE,
        "FL": base + local * 5_000 / VEHICLE_PRICE,
        "TN": base + (local + 0.0275) * 1_600 / VEHICLE_PRICE,
        "IL": base + local,
        "WA": base + local,
        "SC": min(base * VEHICLE_PRICE, 500) / VEHICLE_PRICE,
        "OR": base * vehicle_new_share(),
    }
    return rules.get(st, base)


def mortgage_first_year_interest(principal, annual_rate, years=30):
    r = annual_rate / 12
    n = years * 12
    pmt = principal * r / (1 - (1 + r) ** -n)
    bal, interest = principal, 0.0
    for _ in range(12):
        i = bal * r
        interest += i
        bal -= pmt - i
    return interest


def main():
    acs = pd.read_csv(RAW / "acs2025_state_housing_income.csv")
    acs = acs[acs.NAME.isin(STATES) | (acs.NAME == "United States")].copy()
    us_supp = pd.read_csv(RAW / "acs2025_us_supplement.csv")
    us_med = float(us_supp.loc[us_supp.variable == "B19013_001E", "value"].iloc[0])
    acs.loc[acs.NAME == "United States", "B19013_001E"] = us_med

    d = pd.DataFrame({
        "state_name": acs.NAME,
        "state": acs.NAME.map(STATES).fillna("US"),
        "median_hh_income": acs.B19013_001E,
        "median_hh_income_moe": acs.B19013_001M,
        "owner_median_income": acs.B25119_002E,
        "renter_median_income": acs.B25119_003E,
        "median_home_value": acs.B25077_001E,
        "median_re_taxes": acs.B25103_001E,
        "median_gross_rent_monthly": acs.B25064_001E,
    })
    d["owner_property_tax_rate"] = d.median_re_taxes / d.median_home_value
    d["home_value_to_income"] = d.median_home_value / d.owner_median_income
    d["rent_to_income"] = 12 * d.median_gross_rent_monthly / d.renter_median_income
    d["value_to_rent"] = d.median_home_value / (12 * d.median_gross_rent_monthly)
    us_vr = float(d.loc[d.state == "US", "value_to_rent"].iloc[0])
    d["apt_value_to_rent_multiple"] = RHFS_MULTIPLE_US * d.value_to_rent / us_vr

    lin = pd.read_csv(RAW / "lincoln2024_apartment_etr.csv", comment="#")
    lin["apt_etr"] = lin[["largest_city_etr_pct", "rural_etr_pct"]].mean(axis=1) / 100
    d = d.merge(lin[["state", "apt_etr"]].rename(columns={"state": "state_name"}),
                on="state_name", how="left")
    d["renter_tax_share_of_rent_before_shift"] = d.apt_etr * d.apt_value_to_rent_multiple

    tf = pd.read_csv(RAW / "taxfoundation_sales_tax_midyear2025.csv", comment="#")
    d = d.merge(tf[["state", "avg_local_rate"]].rename(
        columns={"state": "state_name", "avg_local_rate": "tf_local_sales_rate_pct"}),
        on="state_name", how="left")
    pe_rates = pe_local_sales_rates()
    d["pe_local_sales_rate"] = d.state.map(pe_rates)
    d["local_sales_rate"] = np.where(
        d.state.isin(TF_GAP_STATES), d.tf_local_sales_rate_pct / 100,
        d.pe_local_sales_rate.fillna(0))
    d["local_sales_rate_source"] = np.where(
        d.state.isin(TF_GAP_STATES), "Tax Foundation midyear 2025",
        np.where(d.pe_local_sales_rate.notna(), "PolicyEngine official state files",
                 "none (no local general sales tax)"))
    d.loc[d.state == "NJ", "local_sales_rate"] = 0.0  # Salem County artifact

    cog = pd.read_csv(RAW / "census_cog2022_income_taxes.csv", comment="#")
    agg = pd.read_csv(RAW / "acs2022_aggregate_household_income.csv")
    cog = cog.merge(agg.rename(columns={"NAME": "state"}), on="state", how="left")
    cog["agg_local_income_tax_rate"] = (
        cog.local_individual_income_tax_k * 1000 / cog.B19025_001E)
    d = d.merge(cog[["state", "agg_local_income_tax_rate"]].rename(
        columns={"state": "state_name"}), on="state_name", how="left")
    d.loc[d.state == "DC", "agg_local_income_tax_rate"] = 0.0  # DC's tax is its state tax
    d["local_income_tax_method"] = np.where(
        d.state.isin(PE_LOCAL_INCOME_STATES), "PolicyEngine, population-weighted",
        np.where(d.agg_local_income_tax_rate > 0,
                 "Census local income tax revenue / ACS household income", "none"))

    pmms = pd.read_csv(RAW / "pmms2025.csv")
    rate = float(pmms.loc[pmms.measure == "pmms30_2025_annual_average_pct", "value"].iloc[0]) / 100
    d["mortgage_rate"] = rate
    d["first_year_interest_per_loan_dollar"] = mortgage_first_year_interest(1.0, rate)

    d = d.merge(tf[["state", "state_rate"]].rename(
        columns={"state": "state_name", "state_rate": "tf_state_sales_rate_pct"}),
        on="state_name", how="left")
    d["vehicle_tax_rate"] = d.apply(vehicle_tax_rate, axis=1)

    d = d.sort_values("state").reset_index(drop=True)
    d.to_csv(OUT / "state_inputs.csv", index=False)
    print(d[["state", "owner_property_tax_rate", "home_value_to_income", "rent_to_income",
             "apt_etr", "apt_value_to_rent_multiple", "renter_tax_share_of_rent_before_shift",
             "local_sales_rate", "agg_local_income_tax_rate"]].round(4).to_string())


if __name__ == "__main__":
    main()
