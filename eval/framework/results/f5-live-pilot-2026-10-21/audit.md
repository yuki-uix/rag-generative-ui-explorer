# Live study: semantic and cost audit

Records: 27; rendered factual fields: 41; model requests: 44.

| Arm | Requests | Published-rate CNY cost | Published-rate USD cost |
| --- | ---: | ---: | ---: |
| native | 9 | 0.246580800 | 0.036165184 |
| langchain | 9 | 0.236992800 | 0.034758944 |
| langgraph | 26 | 0.455766900 | 0.066845812 |

Actual-usage rated totals: CNY 0.939340500; USD 0.137769940. These are separate published currency schedules, not FX conversion.
Observed account deduction: CNY 0.940000000; balance resolution 0.010000000; within resolution of rated total: true; two latest readings equal: true.
Account balance change is account-wide, can settle with delay, and is not a per-request invoice. Full balances and credentials are not included.

Reviewed fields: 41; citation links: 41; fully supported: 31; partial: 10; unsupported: 0; contradicted: 0.
Strict citation precision: 0.7560975609756098; unsupported-claim rate: 0; not-fully-supported rate: 0.24390243902439024. Partial links do not count as full support. Empty denominators remain null.
Single non-blinded AI evidence audit, not an independent human evaluation. The reviewer also built the harness; the exploratory rubric was finalized during the pilot and the exact judge model was not independently pinned.
Only validated, renderable GroundedText fields enter semantic rates. Failed generations still enter spend, but their raw unrendered claims do not enter rendered-field precision. Scope qualifications and overall answer decisions are audited separately.
See semantic-review.json for each claim, exact source excerpt and rationale, and audit.json for every priced control/generation call. Corpus support does not establish the corpus itself is correct.
