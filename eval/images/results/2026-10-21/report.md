# Image retrieval: measured results

24 images; 52 unique questions (48 answerable, 4 negative); three measured encoding passes. Frozen inputs: adae1fb5af9ad654c430c0187955bc297ede7da8576f65a1fd19fde2f9018150.

| Split | Arm | Answerable n | Recall@1 | Recall@3 | Recall@5 | MRR@5 | nDCG@5 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| all | text | 48 | 41.7% | 95.8% | 95.8% | 0.677 | 0.750 |
| all | ocr | 48 | 85.4% | 91.7% | 93.8% | 0.891 | 0.903 |
| all | clip | 48 | 35.4% | 47.9% | 60.4% | 0.433 | 0.475 |
| development | text | 24 | 45.8% | 95.8% | 95.8% | 0.708 | 0.774 |
| development | ocr | 24 | 83.3% | 91.7% | 95.8% | 0.885 | 0.904 |
| development | clip | 24 | 37.5% | 41.7% | 50.0% | 0.408 | 0.430 |
| evaluation | text | 24 | 37.5% | 95.8% | 95.8% | 0.646 | 0.727 |
| evaluation | ocr | 24 | 87.5% | 91.7% | 91.7% | 0.896 | 0.901 |
| evaluation | clip | 24 | 33.3% | 54.2% | 70.8% | 0.459 | 0.520 |

Each metric has three repetition aggregates with median/min/max in summary.json. Repetition does not increase unique-question n. Negatives are excluded from ranking denominators; no abstention threshold is evaluated.
All three CLIP ranking orders identical: true.

Actual OCR total: 1223.2 ms. CLIP load/cache/download: 234.0 ms; total encoding process work: 3138.8 ms; peak process RSS: 897824 KiB.
CLIP image encoding median/full range: {"n":72,"median":29.215249500000027,"min":28.246374999999716,"max":41.81575000000004} ms; query encoding: {"n":156,"median":4.301249499999926,"min":2.9961249999998927,"max":9.998583000000053} ms.
Text/OCR index construction: 5.104/0.142 ms. Query search and encoding are separate in each record.
No hosted API inference calls. Hardware, electricity and engineering costs are unpriced. All diagram sources are repository-authored; this exposed same-author pilot cannot establish general image-retrieval effectiveness.
