# Historical bugs — project reference

Document recurrent production bugs and risk patterns for your product.
Agents read this file at the start of every `/qas:analyze` run (re-read each time; do not cache).

## How to use

- Add one section per pattern (area, historical issues, activation signals, expected coverage).
- Keep entries conditional: apply only when the current change intersects the pattern.
- Update after every significant production incident or regression postmortem.

## Example section (replace with your data)

### Area
- Example: CSV export, filters, pagination

### Historical issues
- Example: Export ignores active filters and downloads the full dataset.

### Activation signals
- Changes touching export, filter state, or pagination APIs.

### Expected coverage
- Regression cases that prove filters and page boundaries are respected.
