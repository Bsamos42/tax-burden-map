# Tax burden map

What one family pays in state and local taxes in all 50 states and D.C., as a share of income and in dollars, tax year 2025.

The family is a married couple filing jointly with two children, ages 8 and 5, and all income from wages. Counted: state and local income tax, general sales tax plus tax on vehicle purchases, and property tax, paid directly by owners or through rent by renters. Effective rate = taxes paid ÷ gross income.

- **Methodology:** [METHODOLOGY.md](METHODOLOGY.md)
- **Map data:** [output/map_data.json](output/map_data.json), keyed by two-letter state code

## Run it

Requires Python 3.11 to 3.13.

```
pip install -r requirements.txt
cd model
python build_inputs.py      # data/raw -> data/processed/state_inputs.csv
python run_model.py         # PolicyEngine runs -> results_wide/long.csv, sensitivity.csv
python validate.py          # benchmarks -> validation_states.csv, validation_summary.csv, results_blended.csv
python export_map_data.py   # -> output/map_data.json
```

## Outputs (data/processed and output)

| File | Contents |
| --- | --- |
| state_inputs.csv | One row per state: every model input and the rate it implies |
| results_wide.csv | State x income level x tenure, all tax components in dollars and as rates |
| results_long.csv | Same results, one row per component |
| results_blended.csv | Owner and renter results weighted by ACS 2025 homeownership share |
| progressivity.csv | 90th-percentile rate minus 10th-percentile rate, in percentage points, by state and tenure |
| sensitivity.csv | Renter pass-through at 15% and 100%; FHA terms for 10th and 30th percentile owners |
| validation_states.csv / validation_summary.csv | Model vs ITEP, Tax Foundation and Lincoln Institute |
| output/map_data.json | Everything the map needs, by state and income level |

Vehicle tax: annual vehicle spending from a log-log fit of CE 2025 deciles 2 to 10 (elasticity 0.70), scaled by 1.076 to match married couples whose oldest child is 6 to 17, times each state's vehicle tax rate.

Mortgage: one conventional regime (80% loan-to-value). Where FHA terms would change a 10th- or 30th-percentile owner's rate by 0.1 point or more, map_data.json carries a footnote (8 states, all at the 30th percentile).

Income levels: P10, P30, P50, P70, P90 (CPS 2025 household income percentiles: $20,010; $51,330; $87,460; $140,900; $261,300), US_median (ACS 2025: $84,780) and State_median (ACS 2025).

## Inputs and sources (data/raw)

Government and author-compiled files are included. Third-party files are not redistributed here; download them from the source and save them to data/raw under the file name shown, with the columns listed. Three are model inputs, so they are required to rebuild the results; the others are used only for validation.

### Included

| File | Source |
| --- | --- |
| acs2025_state_housing_income.csv | Census ACS 2025 1-year: B19013, B25119, B25077, B25103, B25064 with margins of error |
| acs2025_us_supplement.csv | ACS 2025 1-year U.S. median household income and quintile limits |
| acs2025_tenure.csv | ACS 2025 1-year B25003 owner and renter households |
| cps2025_income_percentiles.csv | [Census P60-289](https://www.census.gov/library/publications/2026/demo/p60-289.html) Table 6, household income at selected percentiles, 2025 |
| rhfs2024_multifamily_value_to_rent.csv | HUD-Census 2024 Rental Housing Finance Survey public use file, 5+ unit properties |
| pmms2025.csv | Freddie Mac PMMS, 2025 average 30-year fixed rate (6.60%) |
| census_cog2022_income_taxes.csv | Census 2022 Census of Governments: Finance, local individual income tax by state |
| acs2022_aggregate_household_income.csv | ACS 2022 1-year B19025, denominator for the local income tax rate |
| popest2025_local_tax_jurisdictions.csv | Census Vintage 2025 population estimates for MD and IN counties, NYC, Yonkers, Wilmington |
| bls_ce2025_vehicle_purchases.csv | BLS Consumer Expenditure Surveys 2025: vehicle net outlay by income decile and for married couples with children 6 to 17 |
| vehicle_tax_rates_2025.csv | 2025 state taxes on vehicle purchases where they differ from the general sales tax, with sources; caps converted at a $30,000 price |

### Not included: download from the source

| File | Use | Source | Columns |
| --- | --- | --- | --- |
| lincoln2024_apartment_etr.csv | Model input | Lincoln Institute of Land Policy and Minnesota Center for Fiscal Excellence, [50-State Property Tax Comparison Study, taxes paid in 2024](https://www.lincolninst.edu/publications/other/50-state-property-tax-comparison-study-2024/), Appendix Tables 5a and 5c | state, largest_city, largest_city_etr_pct, rural_municipality, rural_etr_pct |
| taxfoundation_sales_tax_midyear2025.csv | Model input, 16 states without PolicyEngine rate files | Tax Foundation, [State and Local Sales Tax Rates, Midyear 2025](https://taxfoundation.org/data/all/state/sales-tax-rates-midyear-2025/) | state, state_rate, avg_local_rate, max_local_rate, combined_rate, note |
| lincoln2024_homestead_etr.csv | Validation | Same Lincoln Institute study, Appendix Tables 2a and 2g | place, table, etr_pct, median_home_value |
| itep_whopays7.csv | Validation | Institute on Taxation and Economic Policy, [Who Pays? 7th edition](https://itep.org/whopays/) data workbook: sheets APP_A, SE_GST, PROP_IND and related | sheet, state, low20, second20, middle20, fourth20, next15, next4, top1 |
| taxfoundation_burden_2022.csv | Validation | Tax Foundation, [State and Local Tax Burdens, Calendar Year 2022](https://taxfoundation.org/data/all/state/tax-burden-by-state-2022/) | state, effective_burden_pct, rank |

State income tax, local income tax for NY, MD, IN and DE, and the IRS 2025 optional sales tax tables come from [PolicyEngine US](https://github.com/PolicyEngine/policyengine-us) 2.78.0 (open source).

Raw files were transcribed from the sources listed, and each was checked against column sums computed at the source. The processed files in data/processed already reflect all inputs, so the map data can be inspected without rebuilding.

## License

Code in model/ is under the [MIT License](LICENSE). Results, methodology and the author-compiled vehicle tax file are under [CC BY 4.0](LICENSE-DATA). Government source data is in the public domain; third-party data keeps its publishers' terms.
