# Framework study report

Evidence: **live-pilot-only**. Questions: 3; repetitions: 3.
The question set has been used previously and is not blind. Smoke timings and token counts are synthetic plumbing observations.

Final evidence cap: 4; user-context cap: 12000 characters.

| Arm | n | Usable result rate (median [min, max]) | Requests |
| --- | ---: | --- | ---: |
| native | 9 | 1.000 [0.667, 1.000] | 9 |
| langchain | 9 | 1.000 [0.667, 1.000] | 9 |
| langgraph | 9 | 1.000 [0.333, 1.000] | 26 |

| Question / repetition | Baseline final Recall@K | Graph final Recall@K | Cumulative found | Extra requests | Stop |
| --- | ---: | ---: | ---: | ---: | --- |
| rag-001 / 1 | 0.333 | 0.333 | 4 | 1 | generation-valid |
| rag-003 / 1 | 0.000 | 0.250 | 6 | 2 | supplement-limit |
| ins-001 / 1 | unavailable | unavailable | 7 | 2 | supplement-limit |
| rag-001 / 2 | 0.333 | 0.333 | 4 | 1 | generation-valid |
| rag-003 / 2 | 0.000 | 0.250 | 6 | 3 | generation-valid |
| ins-001 / 2 | unavailable | unavailable | 8 | 2 | supplement-limit |
| rag-001 / 3 | 0.333 | 0.333 | 4 | 1 | generation-invalid |
| rag-003 / 3 | 0.000 | 0.250 | 7 | 3 | generation-invalid |
| ins-001 / 3 | unavailable | unavailable | 7 | 2 | supplement-limit |

Failures: 4; successful complete records: 13; pairs with no final-recall gain: 3.
An absent example category means it was not observed. Recall is label-based retrieval coverage, not answer quality.

See summary.json for per-repetition rates and dispersion, outcome counts, cell sample sizes, execution times, request differences and four separate token totals.
First-attempt card validity counts only completed end_turn final generations; provider failures, truncation and refusal remain separate outcomes. Coverage-only incomplete responses contribute to usable-result rate. Failed results count as incorrect missing-evidence decisions.
Final-context recall uses retained evidence even when no final generation ran; cumulative recall is separate and never substituted for Recall@K.
Semantic citation precision, unsupported-claim rate and monetary cost are unavailable. Reference validity does not establish semantic support.

Retain as experiment; adoption requires semantic review and repeated live evaluation.
