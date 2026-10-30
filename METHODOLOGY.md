# Tax Burden Map — Methodology

Oct. 29, 2026

## Purpose and audience

The map shows what a typical household actually pays in state and local taxes, as an effective rate and in dollars, so states are compared on burden rather than on statutory top rates.

Common maps pit one state's highest marginal income tax rate against another state's 0% income tax. That ignores who pays the top rate, and it ignores the sales and property taxes that no-income-tax states lean on instead.

- **Audience:** LinkedIn readers and a personal portfolio. The renter vs. owner toggle gives it a housing and mortgage-industry angle.
- **Question it answers:** For the same family at the same income, how much of that income goes to state and local taxes in each state, and which taxes take it?
- **Design principle:** Every number traces to a public government source or a stated assumption. No think-tank output is used as a model input.

## Definitions and scope

V1 measures four taxes a resident household pays directly or through rent: state income, local income, general sales and property tax.

- **Effective rate:** Total tax paid divided by household gross income. Every rate on the map uses this definition.
- **Resident burden:** Taxes the household itself pays. Taxes paid by tourists, nonresident workers or businesses are excluded, so states with large tourism or severance revenue are not flattered.
- **Tax year:** One tax year for all components, set in the data sources section.

| Tax | V1 | Notes |
| --- | --- | --- |
| State income tax | In | Computed after credits, including refundable EITC and child credits |
| Local income tax | In | Cities, counties and school districts where levied |
| General sales tax | In | IRS optional sales tax tables, plus tax on vehicle purchases at each state's vehicle rate |
| Property tax, owner | In | Paid directly on the primary residence |
| Property tax, renter | In | Portion passed through in rent, by assumption |
| Excise taxes (fuel, tobacco, alcohol) | Out | V2 |
| Toll roads | Out | V2; tolls are user fees, not taxes |
| Vehicle registration and personal property tax | Out | Candidate for V2 |
| Federal taxes, including SALT deduction | Out | State and local only |

## Household profile

The model household is a married couple filing jointly with two children, and a toggle switches it between renter and owner.

| Attribute | Default | Why |
| --- | --- | --- |
| Filing status | Married filing jointly | Locked decision |
| Dependents | Two children under 17 | Qualifies for state child credits |
| Income type | All wages, split 50/50 between spouses | Keeps the comparison on earned income; avoids capital gains treatment differences |
| Deductions | Standard or itemized, whichever is lower tax | TAXSIM selects automatically |
| Child care expenses | None | Avoids dependent care credit assumptions |
| Owner home value | Household income × state median home value-to-income ratio | Home value scales with income instead of one value for every band |
| Owner mortgage interest | Included in itemized deductions | Matters in states that allow itemizing |
| Renter rent | Household income × state median rent-to-income ratio | Same scaling logic as owner home value |
| Renter property tax | Share of rent assumed to be property tax pass-through | State-specific; see decisions |

The renter vs. owner toggle changes the property tax line, state renter or homestead credits, and state income tax where owners itemize mortgage interest. Sales tax is the same for both.

## Income views

The map runs the model household at five fixed national income points, plus two median toggles, so every state is tested on the same incomes.

**Fixed national income points.** The household is evaluated at the 10th, 30th, 50th, 70th and 90th percentiles of U.S. household income, the midpoints of the five national quintiles. Census put the 2025 quintile limits at $35,800, $68,600, $110,300 and $182,400 ([Census P60-289, Table 6](https://www2.census.gov/programs-surveys/demo/tables/p60/289/table6.xlsx)). Midpoints replace federal tax brackets, which measure marginal rates on taxable income and shift with filing status.

**Median toggle.**

- **US median:** Every state is run at the same U.S. median household income. Answers: what would the same family pay in each state?
- **State median:** Each state is run at its own median household income. Answers: what does a typical local family pay?
- Both medians come from the same ACS release so the U.S. and state figures are consistent. CPS ASEC put the 2025 U.S. median at $87,460 ([Census, Income in the United States: 2025](https://www.census.gov/library/publications/2026/demo/p60-289.html)); ACS medians run lower, and the spec uses ACS throughout.

**Regressivity view.** For each state, the effective rate at the 10th percentile minus the rate at the 90th percentile, in percentage points. A positive gap means lower-income families pay a larger share of income than higher-income families; rank 1 is the most regressive state. map_data.json stores the opposite sign (progressivity_gap_pp, 90th minus 10th), and the page flips it. A ratio was dropped because refundable credits make some 10th-percentile rates negative.

| View | Map shows | Units |
| --- | --- | --- |
| Rate | Total effective rate, with a breakdown by tax type on hover | % of income |
| Dollars | Total tax paid by the model household | US$ per year |
| Regressivity | 10th minus 90th percentile rate | Percentage points |

At the 10th percentile, refundable state credits can push income tax below zero. The map shows negative values rather than flooring them at zero.

## Calculation method

Each tax is computed for the model household at a given income, state and housing status, then summed and divided by gross income.

```latex
\text{Effective rate} = \frac{T_{\text{state income}} + T_{\text{local income}} + T_{\text{sales}} + T_{\text{property}}}{\text{Gross household income}}
```

| Tax | Calculation | Key inputs |
| --- | --- | --- |
| State income | Run the household through a tax calculator; take liability after all credits | Wages, filing status, dependents, itemized deductions |
| Local income | NY, MD, IN, DE: PolicyEngine run in each county or city, weighted by 2025 population. Other states: local income tax revenue ÷ household income × wages | Census 2022 Census of Governments; ACS 2022 aggregate household income; Census 2025 population estimates |
| Sales | IRS optional state sales tax table amount for the income and family size, plus the local add-on, plus annual vehicle spending × the state's 2025 vehicle tax rate | IRS Schedule A sales tax tables; combined local rates; BLS Consumer Expenditure Survey 2025 vehicle net outlay by income, scaled to married couples with school-age children; state vehicle tax rates |
| Property, owner | Home value × effective property tax rate for owner-occupied homes | ACS median real estate taxes paid ÷ ACS median home value |
| Property, renter | Annual rent × property tax share of rent × share shifted to renters | ACS median gross rent-to-income ratio; Lincoln Institute apartment effective tax rates |

**Why the IRS sales tax tables.** The IRS publishes, by state, the general sales tax a household typically pays at each income level and family size. The tables already reflect each state's base, such as grocery exemptions, so the model avoids building its own consumption basket. Local sales tax is added with the IRS local-rate method.

**Owner mortgage interest.** Used only for the itemizing decision in state income tax. Assumes 80% loan-to-value and the 2025 average 30-year fixed rate, with first-year interest on a new loan; see decisions.

**Renter property tax.** Two separate parameters drive the renter number: how much of the landlord's rent goes to property tax, and how much of that tax the landlord actually passes on to tenants.

```latex
T_{\text{renter}} = \gamma \times t_{\text{apt}} \times M \times \text{Rent}
```

| Term | Meaning | Source |
| --- | --- | --- |
| t\_apt | Apartment effective tax rate: average of the state's largest city and its rural municipality | [Lincoln Institute 50-State Property Tax Comparison, taxes paid in 2024](https://www.lincolninst.edu/publications/other/50-state-property-tax-comparison-study-2024/); apartments valued at a fixed [$600,000 plus $30,000 of fixtures](https://www.nmhc.org/news/research-corner/2024/unequal-burdens-exploring-effective-property-tax-variation-and-the-regressive-nature-of-apartment-property-taxes/) |
| M | Apartment value ÷ annual rent. National median of 7.27 for 5+ unit properties (value per unit ÷ annual rent receipts per unit), scaled by each state's ACS home-value-to-rent ratio relative to the U.S. | [HUD-Census Rental Housing Finance Survey 2024](https://www.census.gov/programs-surveys/rhfs/technical-documentation/methodology.html), which collects property value, rents and real estate taxes; ACS 2025 |
| γ | Share of the property tax shifted to renters | 50% base case, matching ITEP for validation; 15% and 100% shown in the methodology panel |
| Rent | Household rent at the given income | ACS 2025 median rent-to-income ratio |

The RHFS public Table Creator reports [national results only](https://www.census.gov/programs-surveys/rhfs/technical-documentation/rhfs-table-creator-release-notes.html), so the state scaling comes from ACS. The public use file has no state or region code, and it reports property taxes only in dollar ranges.

**How much is passed on.** Estimates of γ range widely, and the choice moves the renter results more than any other assumption.

| Source | Share shifted to renters (γ) |
| --- | --- |
| [Schwegman and Yinger, Census working paper (2020)](https://www2.census.gov/ces/wp/2020/CES-WP-20-43.pdf) | About 14% at a 3% discount rate, up to 27% at 6% |
| Carroll and Yinger (1994), per Schwegman and Yinger | 10% to 15% |
| Older cross-jurisdiction studies, per Schwegman and Yinger | 50% to 110% |
| ITEP Who Pays?, per Schwegman and Yinger | Assumes 50% |

**Checks on the result.** The modeled tax share of rent before γ is compared with [Minnesota's estimate of 13.9% of rent statewide in 2016](<https://www.revenue.state.mn.us/sites/default/files/2018-12/Rent%20Constituting%20Property%20Taxes%202018%20(Feb%2027).pdf>).

## Data sources and vintages

The recommended tax year is 2025, because the income, housing and sales tax inputs all have 2025 vintages, and PolicyEngine US supplies 2025 state income tax law.

| Input | Source | Vintage for tax year 2025 | Status |
| --- | --- | --- | --- |
| State medians: income, home value, rent, property tax paid | [ACS 1-year estimates](https://www.census.gov/programs-surveys/acs/news/data-releases/2025/release.html) | 2025, released Oct. 29, 2026 | Ready |
| County medians (Phase 2) | ACS 5-year estimates | 2021-2025 release date not set; 2020-2024 available now | Use 2020-2024 or wait |
| U.S. income percentiles | Census CPS ASEC | 2025, released Sept. 2026 | Ready |
| State income tax | [NBER TAXSIM 35](https://taxsim.nber.org/taxsim35) | Codes state law through 2021 and inflates later years at 2.5% a year | Not current |
| State income tax, alternate | [TAXSIM test version](https://taxsim.nber.org/taxsimtest) | Beta updated to 2024 state law | One year behind |
| State income tax, alternate | [PolicyEngine US](https://pypi.org/project/policyengine-us/) | Tax year 2025 parameters for all 50 states, D.C. and New York City | Selected |
| Sales tax | IRS optional sales tax tables, Schedule A instructions; vehicles: BLS Consumer Expenditure Survey 2025 and state revenue and motor vehicle agencies | 2025 | Ready |
| Local sales and income tax rates | Sales: PolicyEngine official state files, Tax Foundation midyear 2025 for 16 states. Income: PolicyEngine for NY, MD, IN, DE; Census 2022 local income tax revenue ÷ ACS household income elsewhere | 2025 | Done |

**PolicyEngine US is the income tax engine.** Several states cut rates or moved to flat taxes after 2021, so TAXSIM 35 would misstate 2025 liabilities. The TAXSIM 2024 beta stays as a cross-check on a sample of states. Other inputs: Lincoln Institute apartment effective tax rates (2024 tax year) and the HUD-Census Rental Housing Finance Survey (2023 reference year) for the renter share, and Freddie Mac PMMS weekly rates for the 2025 average mortgage rate.

## Validation

The model's results are checked against two outside studies, and the map's methodology panel shows where they agree and why they differ.

| Benchmark | What it measures | Comparison | Expected differences |
| --- | --- | --- | --- |
| [ITEP Who Pays? 7th edition](https://itep.org/whopays/) | Effective state and local rates by within-state income group | Model rates at comparable income levels; state rankings | ITEP includes excise taxes and models actual households, not one family type |
| [Tax Foundation state-local tax burdens](https://taxfoundation.org/data/all/state/tax-burden-by-state/) | Resident taxes divided by state share of net national product | State rankings only | Aggregate measure; includes business taxes passed to residents |
| [Lincoln Institute 50-State Property Tax Comparison](https://www.lincolninst.edu/publications/land-lines-magazine/articles/new-report-analyzes-variation-in-effective-property-tax-rates-across-us-states/) | Effective property tax rates on median-valued homes in large cities and rural towns | Owner property tax rates | City-level, not statewide; 2024 tax year |

- **Proposed test:** Rank correlation with each benchmark is reported, along with any state that moves 10 or more places.
- **Outliers:** Each large mover gets a one-line explanation in the methodology panel.
- None of the benchmarks is used as a model input.

## Phase 1 results

The Phase 1 build ran on Oct. 29, 2026, and was rerun the same day with vehicle-purchase sales tax added. At the U.S. median income of $84,780, the model household's burden runs from 3.1% in Wyoming to 10.7% in New York. That figure blends owners and renters by each state's homeownership rate.

| Highest burden | Rate | Lowest burden | Rate |
| --- | --- | --- | --- |
| New York | 10.7% | Wyoming | 3.1% |
| Illinois | 10.7% | Alaska | 3.4% |
| Maryland | 10.2% | North Dakota | 3.7% |
| Connecticut | 9.0% | Nevada | 3.9% |
| New Jersey | 8.8% | Tennessee | 4.4% |

- **Renters pay more than owners in 7 states** at the U.S. median: AL, AR, HI, MS, OR, SC and WV. These states tax apartments at higher effective rates than homesteads.
- **The bottom pays more than the top in 20 states,** and New Hampshire's two rates are equal. In Tennessee the 10th-percentile household pays 9.1% of income and the 90th percentile pays 3.0%, a regressivity gap of +6.0 points.
- **Refundable credits push 10th-percentile rates negative** in states such as Colorado, D.C. and Minnesota. In Colorado a renting family at $20,010 gets back more than it pays. That makes Colorado's regressivity gap −52 points and D.C.'s −41, so the legend needs a capped bottom class.

**Validation.** The model ranks states much as ITEP does once the comparison is limited to the same taxes. It tracks Tax Foundation less closely, as expected for an aggregate measure.

| Check | Result |
| --- | --- |
| State income tax vs. hand calculation, PA, IL, NC at $84,780 | Exact match in all three |
| Rank correlation vs. ITEP middle 20%, same taxes (sales, property, personal income) | 0.82 |
| Rank correlation vs. ITEP next 15% vs. model 90th percentile, same taxes | 0.92 |
| Rank correlation vs. ITEP lowest 20% vs. model 10th percentile, same taxes | 0.50 |
| Rank correlation vs. Tax Foundation 2022 burden | 0.48 |
| Owner property tax rate, ACS vs. Lincoln homestead rates | Correlation 0.83 |
| States moving 10+ ranks vs. ITEP / vs. Tax Foundation | 11 / 25 |
| Sales tax at the state median, model vs. ITEP general sales | 1.8% vs. 2.5% of income (1.5% before vehicle tax) |
| Renter tax share of rent before pass-through, Minnesota | 12.1%, vs. 13.9% Minnesota Revenue estimate for 2016 |

- **Why ITEP's bottom differs.** ITEP's lowest 20% is all households, many single or retired. The model is a working family with two children, so state EITCs and child credits drive its 10th-percentile results.
- **Why Tax Foundation differs.** Its measure includes business taxes, excise taxes and high earners' income. That puts CA, HI, VT, ME and DE near the top, while the model's median family pays far less in those states.
- **Why sales tax still runs below ITEP.** The IRS tables are built as a deduction floor, and ITEP also counts sales tax on business inputs passed to consumers. Hawaii is most affected because its excise tax hits business purchases.

**Decisions applied Oct. 29, 2026.**

- **Vehicle-purchase sales tax is in.** Annual vehicle spending comes from the BLS Consumer Expenditure Survey and is taxed at each state's 2025 vehicle rate. It adds 0.3% of income on average.
- **One conventional mortgage regime,** with FHA footnotes for owners at the 30th percentile in AL, AR, DE, HI, KS, KY, MS and OR. The largest effect is Oregon at 0.4 points.
- **Regressivity is shown as a gap:** the 10th-percentile rate minus the 90th-percentile rate, in percentage points. Positive means regressive. (Changed Oct. 29 from a progressivity gap with the opposite sign.)

Code, inputs and outputs are in the Tax Burden Project folder; output/map\_data.json feeds the map.

## Geography

Phase 1 ships the state map; Phase 2 reuses the same engine with county inputs.

|  | Phase 1: State | Phase 2: County |
| --- | --- | --- |
| Units | 50 states and D.C. | About 3,100 counties |
| Income, housing inputs | ACS 1-year, 2025 | ACS 5-year |
| State income tax | Same engine | Same as the state; no county variation |
| Local income tax | Population-weighted state average | Actual county or city rate where levied |
| Sales tax | IRS table plus weighted local rate | IRS table plus county combined rate |
| Property tax | State effective rate | County effective rate |
| Interaction | Click a state for detail | Click a state to drill into its counties |

**Low-confidence flags.** Counties where the ACS margin of error on median income, home value or taxes paid exceeds a set share of the estimate are shown with hatching and a tooltip note. Thresholds are set in decisions.

**Within-county variation.** City sales and income taxes differ inside a county. County figures are population-weighted averages, and the tooltip says so.

## Decisions

All eight decisions are set, and the model is ready for the data build.

| Decision | Choice | Detail | Status |
| --- | --- | --- | --- |
| Model approach | Household model | Required for the renter vs. owner toggle and county drill-down | Decided |
| Income tax engine and tax year | [PolicyEngine US](https://www.policyengine.org/us/research/state-income-tax-2025-update), tax year 2025 | PolicyEngine updated brackets, deductions, exemptions and credits for tax year 2025 in all 50 states, D.C. and New York City | Decided |
| Renter pass-through | State-specific share from apartment property tax rates | Apartment effective tax rate × value-to-rent multiple × share shifted to renters; method under calculation | Decided: 50% shifted to renters in the base case; 15% and 100% shown as sensitivities |
| Home value and rent scaling | Scale with income using state ratios | Home value and rent rise with income at each state's median ratio. Known limitation: research finds housing spending rises more slowly than income, so V1 likely overstates property tax at high incomes and understates it at low incomes; disclosed in the methodology panel, refinement in the V2 backlog | Decided for V1 |
| Mortgage for itemizing | 80% loan-to-value, 30-year fixed at the 2025 average Freddie Mac PMMS rate, first-year interest on a new loan | One regime for all incomes. Sensitivity: rerun the 10th and 30th percentile owners on FHA terms (96.5% loan-to-value); if the effective rate moves less than 0.1 percentage point, note it in the methodology panel and keep one regime. PMMS assumes 20% down; the rate fell from close to 7% early in the year to [6.15% at year-end](https://freddiemac.gcs-web.com/news-releases/news-release-details/mortgage-rates-drop-lowest-level-2025) | Decided; FHA footnotes for 8 states at the 30th percentile |
| County confidence threshold | Coefficient of variation: 12% or less shown normally, above 12% to 40% hatched, above 40% grayed out | Common applied convention, [not a Census Bureau standard](https://cran.r-project.org/web/packages/acsmoe/refman/acsmoe.html); CV = (MOE ÷ 1.645) ÷ estimate | Decided |
| Map color scale | Fixed breaks shared across every toggle within a unit | See design direction | Decided |
| Branding | Personal project; homage to The Economist's visual style | No employer reference | Decided |

## Design direction

The look pays homage to The Economist's charts: a red accent tag, a title that states the finding, plain sans-serif type, thin rules and a source line. It borrows the style only, with no logo, name or proprietary fonts.

| Element | Treatment |
| --- | --- |
| Header | Small red rectangle above the title, top left; bold title states the finding; one-line subtitle gives the measure and units |
| Type | Open-licensed sans-serif in place of The Economist's proprietary fonts; no text below 10pt |
| Map | Choropleth of states, Phase 2 counties; flat fills, thin white borders, no shading or 3-D |
| State detail | On click, a horizontal stacked bar splits the total into the four taxes (FT Visual Vocabulary: part-to-whole) |
| Palette | Sequential blues for burden; diverging orange-slate centered on 0 for regressivity; red reserved for the header tag and one highlighted state; colorblind-safe |
| Rules | Thin horizontal gridlines on bar charts, no chart borders, no gradients |
| Footer | Source line and a one-line note on the model household, bottom left |
| Avoid | The Economist's logo, wordmark, name and fonts, and anything that implies affiliation |

**Color scale.** Fixed breaks do aid comparison, but they can only be shared within a unit: a percent scale cannot be reused for dollars or a ratio. Each view gets one fixed scale.

| View | Scale | Shared across |
| --- | --- | --- |
| Rate | Sequential, 6 to 7 classes with rounded breaks | Every income point, both median toggles, renter and owner |
| Dollars | Sequential, rounded breaks | Both median toggles and renter and owner; set per income point, because a scale spanning the 10th to 90th percentile would wash out the low-income map |
| Regressivity | Diverging, centered on 0; end classes capped at −20 or less and +4 or more points | All toggles |

Breaks are set after the data build from the pooled results of every scenario in that view, then rounded, so switching toggles never redraws the legend in the rate and regressivity views.

## V2 backlog

V2 adds the costs V1 leaves out, with fuel and vehicle taxes first because nearly every household pays them.

| Item | Approach | Data | Difficulty |
| --- | --- | --- | --- |
| Fuel tax | Household gallons × state and local per-gallon tax | FHWA highway statistics; EIA consumption | Low |
| Vehicle registration and car property tax | Fees on one or two typical vehicles; car property tax in states such as Virginia and Missouri | State DMV fee schedules | Medium |
| Alcohol and tobacco excise | Average consumption by income level × state rates; or show as a separate, optional layer | BLS Consumer Expenditure Survey; state rates | Medium; tobacco is behavior-driven |
| Toll roads | Optional commuter scenario, not part of the burden total | Toll authority rate schedules by metro | High |
| Federal SALT deduction offset | Show net cost after the federal deduction for itemizers | Same tax engine, federal side | Low once the engine is set |
| Housing scaling with income | Replace proportional scaling of home value and rent with an income elasticity below 1, or with values by income band within each state | Housing demand literature; ACS microdata (PUMS) by income band | Medium |

**Housing scaling.** V1 scales home value and rent in proportion to income at each state's median ratio. Research finds housing spending rises more slowly than income: [Davis and Ortalo-Magné](https://www.ifo.de/DocDL/cesifo1_wp2156.pdf) find the rent share of income is steady at about 24% across metro areas but falls as income rises within a metro area, and [Goodman and Kawai](https://allengoodman.wayne.edu/Research/PUBS/gk_sej.pdf) estimate permanent-income elasticities of about 0.57 for owners and 0.40 for renters (1977 data). V1 therefore likely overstates property tax at the 90th percentile and understates it at the 10th, which makes property tax look less regressive and pulls the regressivity gap down. V2 should replace the proportional rule and report how much the regressivity results move.

**Toll roads.** Tolls are user fees, not taxes, and most residents of a toll state pay little or nothing. A statewide average would understate the cost for daily toll commuters and overstate it for everyone else. The better fit is a county or metro-level commuter scenario, such as a daily round trip on the main toll route, shown alongside the tax burden rather than added to it.
