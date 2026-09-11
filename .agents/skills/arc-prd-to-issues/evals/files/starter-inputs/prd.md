# PRD: Dashboard empty state and import onboarding

## User stories

1. As a first-time user, I want an empty dashboard state so that I know what to do next.
2. As a user, I want to import a CSV of transactions so that I can start tracking spending.
3. As a user, I want import validation errors so that I can fix malformed CSV files.

## Requirements

- Empty state has an Import Transactions CTA.
- CSV import accepts date, description, amount, and category.
- Invalid rows show row-level errors.
- Successful import returns users to the dashboard.
