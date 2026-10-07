# Third-party notices

## Malaysian postcode reference

The bundled postcode lookup table is adapted from the offline table in the authorised Car Loan reference project. That table was generated from [Asyraf Hussin's Malaysia Postcodes dataset](https://github.com/AsyrafHussin/malaysia-postcodes).

Copyright (c) 2020-2025 Asyraf Hussin. MIT License; full terms are retained in `licenses/malaysia-postcodes-LICENSE.txt`. The lookup runs locally and sends no patient address to an external provider. It is a reference dataset, not an authoritative real-time postal validation service. Unknown postcodes and multiple localities require staff confirmation.

## Reference implementation patterns

Patient search, offline postcode lookup and expandable help patterns were reviewed in the authorised Car Loan reference project. Clinic adaptations do not import loan business rules, unrelated personal records or credentials.
