# Changelog

Data versions are the tax year plus a revision number. A new data version means at least one published figure changed.

## Unreleased: stage 1 rebuild

Data version 2025.1. No figures changed.

- Added data/burden.csv, the shared burden dataset every page builds from, with a FIPS code and data version on every row.
- Keyed the site data file and state shapes by FIPS code; postal codes are labels and URL values only.
- Split the page script into shared modules (data, URL state, map, legend, formatting) and the burden view; moved reserved colors to css/tokens.css.
- Link parameters: added rules and reserved `county`, `preset` and `w`, which are carried through untouched.
- Added a "no data" treatment: gray on the map, a note in the tooltip and detail panel, last in the ranking.
- CSV download gains `fips` and `data_version` columns.
- Added a data vintage line to the methodology panel and METHODOLOGY.md.
- Changed the sales tax color from gold to violet so it no longer resembles the regressive orange.

## 2025.1

First published results, tax year 2025.
