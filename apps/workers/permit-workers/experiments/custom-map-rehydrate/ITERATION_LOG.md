# Custom Map Rehydrate Iteration Log

## 2026-02-13T08:05:38.726Z - baseline-v2

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-baseline-v2.json`
- mode: baseline
- scored/skipped/errors: 26/4/0
- avg IoU: 0.151
- avg centroid error (m): 138.9
- avg area ratio: 5.164
- pass(all/iou/area/centroid): 15.4% / 23.1% / 30.8% / 30.8%
- IoU bins: >=0.75=1, >=0.50=3, >=0.25=2, <0.25=20
- top permits: D0062461:0.970(apn), D0041761:0.732(apn), D0043300:0.632(apn), D0061951:0.512(apn), D0049047:0.384(apn)

## 2026-02-13T08:06:04.202Z - doc-clues-v1

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 28/2/0
- avg IoU: 0.088
- avg centroid error (m): 1171.5
- avg area ratio: 3.928
- pass(all/iou/area/centroid): 10.7% / 17.9% / 21.4% / 28.6%
- IoU bins: >=0.75=0, >=0.50=2, >=0.25=3, <0.25=23
- top permits: D0041761:0.732(apn), D0043300:0.632(apn), D0049047:0.384(apn), D0061951:0.375(apn_clipped_by_doc), D0062231:0.296(apn)

## 2026-02-13T08:09:11.978Z - baseline-v3-no-doc-clues

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-baseline-v3.json`
- mode: baseline
- scored/skipped/errors: 26/4/0
- avg IoU: 0.151
- avg centroid error (m): 138.9
- avg area ratio: 5.164
- pass(all/iou/area/centroid): 15.4% / 23.1% / 30.8% / 30.8%
- IoU bins: >=0.75=1, >=0.50=3, >=0.25=2, <0.25=20
- top permits: D0062461:0.970(apn), D0041761:0.732(apn), D0043300:0.632(apn), D0061951:0.512(apn), D0049047:0.384(apn)

## 2026-02-13T08:09:36.963Z - doc-clues-v2-no-doc-bounds-only

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.095
- avg centroid error (m): 212.7
- avg area ratio: 4.226
- pass(all/iou/area/centroid): 11.5% / 19.2% / 23.1% / 30.8%
- IoU bins: >=0.75=0, >=0.50=2, >=0.25=3, <0.25=21
- top permits: D0041761:0.732(apn), D0043300:0.632(apn), D0049047:0.384(apn), D0061951:0.375(apn_clipped_by_doc), D0062231:0.296(apn)

## 2026-02-13T08:10:21.298Z - doc-clues-v4-clip-rehydrate-only-conf-0.75

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v4.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.095
- avg centroid error (m): 212.7
- avg area ratio: 4.226
- pass(all/iou/area/centroid): 11.5% / 19.2% / 23.1% / 30.8%
- IoU bins: >=0.75=0, >=0.50=2, >=0.25=3, <0.25=21
- top permits: D0041761:0.732(apn), D0043300:0.632(apn), D0049047:0.384(apn), D0061951:0.375(apn_clipped_by_doc), D0062231:0.296(apn)

## 2026-02-13T08:10:21.476Z - doc-clues-v3-clip-rehydrate-only

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.095
- avg centroid error (m): 212.7
- avg area ratio: 4.226
- pass(all/iou/area/centroid): 11.5% / 19.2% / 23.1% / 30.8%
- IoU bins: >=0.75=0, >=0.50=2, >=0.25=3, <0.25=21
- top permits: D0041761:0.732(apn), D0043300:0.632(apn), D0049047:0.384(apn), D0061951:0.375(apn_clipped_by_doc), D0062231:0.296(apn)

## 2026-02-13T08:13:42.517Z - doc-clues-v5-clip-share-0.45

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v5.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.145
- avg centroid error (m): 138.8
- avg area ratio: 5.126
- pass(all/iou/area/centroid): 15.4% / 23.1% / 30.8% / 30.8%
- IoU bins: >=0.75=1, >=0.50=2, >=0.25=3, <0.25=20
- top permits: D0062461:0.970(apn), D0041761:0.732(apn), D0043300:0.632(apn), D0049047:0.384(apn), D0061951:0.375(apn_clipped_by_doc)

## 2026-02-13T08:13:42.537Z - doc-clues-v6-clip-share-0.60

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v6.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.151
- avg centroid error (m): 138.9
- avg area ratio: 5.164
- pass(all/iou/area/centroid): 15.4% / 23.1% / 30.8% / 30.8%
- IoU bins: >=0.75=1, >=0.50=3, >=0.25=2, <0.25=20
- top permits: D0062461:0.970(apn), D0041761:0.732(apn), D0043300:0.632(apn), D0061951:0.512(apn), D0049047:0.384(apn)

## 2026-02-13T08:15:09.525Z - doc-clues-v7-final-guardrails

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-clues-v7.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.151
- avg centroid error (m): 138.9
- avg area ratio: 5.164
- pass(all/iou/area/centroid): 15.4% / 23.1% / 30.8% / 30.8%
- IoU bins: >=0.75=1, >=0.50=3, >=0.25=2, <0.25=20
- top permits: D0062461:0.970(apn), D0041761:0.732(apn), D0043300:0.632(apn), D0061951:0.512(apn), D0049047:0.384(apn)
