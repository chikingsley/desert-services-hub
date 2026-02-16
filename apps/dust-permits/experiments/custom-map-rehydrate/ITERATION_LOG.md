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

## 2026-02-13T16:38:22.560Z - doc-size-v1-over3-scale035

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-size-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.055
- avg centroid error (m): 139.0
- avg area ratio: 3.647
- pass(all/iou/area/centroid): 3.8% / 7.7% / 23.1% / 30.8%
- IoU bins: >=0.75=0, >=0.50=1, >=0.25=1, <0.25=24
- top permits: D0061951:0.512(apn), D0062231:0.322(apn_size_normalized_by_doc), D0064908:0.188(apn), D0062461:0.120(apn_size_normalized_by_doc), D0041761:0.109(apn_size_normalized_by_doc)

## 2026-02-13T16:38:23.018Z - doc-size-v2-over2.5-scale030

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-size-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.046
- avg centroid error (m): 139.9
- avg area ratio: 3.458
- pass(all/iou/area/centroid): 3.8% / 7.7% / 15.4% / 30.8%
- IoU bins: >=0.75=0, >=0.50=1, >=0.25=1, <0.25=24
- top permits: D0061951:0.512(apn), D0062231:0.268(apn_size_normalized_by_doc), D0064908:0.116(apn_size_normalized_by_doc), D0062461:0.089(apn_size_normalized_by_doc), D0041761:0.083(apn_size_normalized_by_doc)

## 2026-02-13T16:38:25.894Z - doc-size-v3-over2-scale025

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-size-v3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.054
- avg centroid error (m): 138.8
- avg area ratio: 3.394
- pass(all/iou/area/centroid): 7.7% / 7.7% / 19.2% / 30.8%
- IoU bins: >=0.75=0, >=0.50=1, >=0.25=1, <0.25=24
- top permits: D0043300:0.632(apn), D0061951:0.297(apn_clipped_by_doc), D0062231:0.191(apn_size_normalized_by_doc), D0064908:0.116(apn_size_normalized_by_doc), D0062461:0.062(apn_size_normalized_by_doc)

## 2026-02-13T16:38:26.356Z - doc-size-v4-over4-scale040

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-size-v4.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.062
- avg centroid error (m): 138.0
- avg area ratio: 3.709
- pass(all/iou/area/centroid): 3.8% / 7.7% / 34.6% / 30.8%
- IoU bins: >=0.75=0, >=0.50=1, >=0.25=1, <0.25=24
- top permits: D0061951:0.512(apn), D0062231:0.368(apn_size_normalized_by_doc), D0064908:0.188(apn), D0062461:0.164(apn_size_normalized_by_doc), D0041761:0.147(apn_size_normalized_by_doc)

## 2026-02-13T16:47:16.487Z - doc-coord-v2-delta350

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.430
- avg centroid error (m): 67.7
- avg area ratio: 6.225
- pass(all/iou/area/centroid): 46.2% / 53.8% / 53.8% / 69.2%
- IoU bins: >=0.75=8, >=0.50=3, >=0.25=3, <0.25=12
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override), D0062844:0.971(coord_parcel_override)

## 2026-02-13T16:47:16.815Z - doc-coord-v3-delta500

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.430
- avg centroid error (m): 67.7
- avg area ratio: 6.225
- pass(all/iou/area/centroid): 46.2% / 53.8% / 53.8% / 69.2%
- IoU bins: >=0.75=8, >=0.50=3, >=0.25=3, <0.25=12
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override), D0062844:0.971(coord_parcel_override)

## 2026-02-13T16:47:17.250Z - doc-coord-v1-delta250

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.317
- avg centroid error (m): 98.3
- avg area ratio: 6.207
- pass(all/iou/area/centroid): 34.6% / 42.3% / 46.2% / 57.7%
- IoU bins: >=0.75=5, >=0.50=3, >=0.25=3, <0.25=15
- top permits: D0062291:1.000(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0062461:0.970(apn), D0064524:0.964(coord_parcel_override), D0063189:0.962(coord_parcel_override)

## 2026-02-13T16:48:43.955Z - doc-coord-v4-delta350-min80

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.437
- avg centroid error (m): 66.6
- avg area ratio: 6.205
- pass(all/iou/area/centroid): 46.2% / 53.8% / 53.8% / 69.2%
- IoU bins: >=0.75=8, >=0.50=3, >=0.25=3, <0.25=12
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override), D0062844:0.971(coord_parcel_override)

## 2026-02-13T16:48:44.022Z - doc-coord-v5-delta500-min80

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v5.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.437
- avg centroid error (m): 66.6
- avg area ratio: 6.205
- pass(all/iou/area/centroid): 46.2% / 53.8% / 53.8% / 69.2%
- IoU bins: >=0.75=8, >=0.50=3, >=0.25=3, <0.25=12
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override), D0062844:0.971(coord_parcel_override)

## 2026-02-13T16:49:46.613Z - doc-coord-final-recommended

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.437
- avg centroid error (m): 66.6
- avg area ratio: 6.205
- pass(all/iou/area/centroid): 46.2% / 53.8% / 53.8% / 69.2%
- IoU bins: >=0.75=8, >=0.50=3, >=0.25=3, <0.25=12
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override), D0062844:0.971(coord_parcel_override)

## 2026-02-13T17:13:31.142Z - doc-coord-size-v1-over8-scale055

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-size-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.176
- avg centroid error (m): 67.0
- avg area ratio: 4.234
- pass(all/iou/area/centroid): 3.8% / 42.3% / 23.1% / 69.2%
- IoU bins: >=0.75=0, >=0.50=1, >=0.25=10, <0.25=15
- top permits: D0061951:0.512(apn), D0062231:0.393(apn_size_normalized_by_doc), D0063189:0.303(apn_size_normalized_by_doc), D0062291:0.303(apn_size_normalized_by_doc), D0062461:0.303(apn_size_normalized_by_doc)

## 2026-02-13T17:13:31.353Z - doc-coord-size-v2-over12-scale060

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-size-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.229
- avg centroid error (m): 67.9
- avg area ratio: 4.470
- pass(all/iou/area/centroid): 11.5% / 50.0% / 30.8% / 69.2%
- IoU bins: >=0.75=1, >=0.50=1, >=0.25=11, <0.25=13
- top permits: D0064524:0.964(coord_parcel_override), D0061951:0.512(apn), D0062231:0.393(apn_size_normalized_by_doc), D0064511:0.366(coord_parcel_override), D0063189:0.362(apn_size_normalized_by_doc)

## 2026-02-13T17:14:11.743Z - doc-coord-size-v3-over12-scale060-apn-only

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-size-v3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.377
- avg centroid error (m): 67.0
- avg area ratio: 5.731
- pass(all/iou/area/centroid): 34.6% / 50.0% / 50.0% / 69.2%
- IoU bins: >=0.75=7, >=0.50=1, >=0.25=5, <0.25=13
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override), D0062844:0.971(coord_parcel_override)

## 2026-02-13T17:16:33.761Z - doc-coord-final-v2-cachefix

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.510
- avg centroid error (m): 53.8
- avg area ratio: 6.263
- pass(all/iou/area/centroid): 53.8% / 61.5% / 61.5% / 76.9%
- IoU bins: >=0.75=10, >=0.50=3, >=0.25=3, <0.25=10
- top permits: D0062291:1.000(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override)

## 2026-02-13T17:21:13.483Z - doc-coord-apnpair-smoke

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-smoke-apnpair-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 11/1/0
- avg IoU: 0.247
- avg centroid error (m): 99.6
- avg area ratio: 2.588
- pass(all/iou/area/centroid): 27.3% / 27.3% / 45.5% / 45.5%
- IoU bins: >=0.75=2, >=0.50=1, >=0.25=0, <0.25=8
- top permits: D0062038:0.993(coord_parcel_override), D0063189:0.962(coord_parcel_override), D0061951:0.512(apn), D0064908:0.188(apn), D0063234:0.031(apn)

## 2026-02-13T17:21:48.084Z - doc-coord-final-v3-apnpair

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.458
- avg centroid error (m): 73.9
- avg area ratio: 5.280
- pass(all/iou/area/centroid): 46.2% / 53.8% / 53.8% / 61.5%
- IoU bins: >=0.75=9, >=0.50=3, >=0.25=2, <0.25=12
- top permits: D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override), D0063191:0.971(coord_parcel_override)

## 2026-02-13T17:27:05.636Z - doc-coord-candidates-smoke-v1

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-smoke-candidates-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 11/1/0
- avg IoU: 0.417
- avg centroid error (m): 35.4
- avg area ratio: 4.809
- pass(all/iou/area/centroid): 54.5% / 54.5% / 63.6% / 90.9%
- IoU bins: >=0.75=3, >=0.50=2, >=0.25=1, <0.25=5
- top permits: D0062038:0.993(coord_parcel_override), D0064524:0.964(coord_parcel_override), D0063189:0.962(coord_parcel_override), D0062850:0.514(coord_parcel_override), D0061951:0.512(apn)

## 2026-02-13T17:29:05.780Z - doc-coord-candidates-smoke-v2

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-smoke-candidates-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 11/1/0
- avg IoU: 0.508
- avg centroid error (m): 22.3
- avg area ratio: 4.862
- pass(all/iou/area/centroid): 63.6% / 63.6% / 72.7% / 100.0%
- IoU bins: >=0.75=4, >=0.50=2, >=0.25=1, <0.25=4
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0064524:0.964(coord_parcel_override), D0063189:0.962(coord_parcel_override), D0062850:0.514(coord_parcel_override)

## 2026-02-13T17:29:30.673Z - doc-coord-final-v4-candidates

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v4.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:32:58.017Z - doc-coord-v4sweep-d900

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-d900.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:33:17.458Z - doc-coord-v4sweep-d1500

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-d1500.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:33:37.716Z - doc-coord-v4sweep-min60

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-min60.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:33:57.724Z - doc-coord-v4sweep-min100

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-min100.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:34:17.883Z - doc-coord-v4sweep-max450

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-max450.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:34:53.317Z - doc-coord-v4sweep-tol15

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-tol15.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T17:35:13.663Z - doc-coord-v4sweep-tol40

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-v4sweep-tol40.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.604
- avg centroid error (m): 35.1
- avg area ratio: 6.271
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 88.5%
- IoU bins: >=0.75=12, >=0.50=4, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T18:52:34.222Z - doc-coord-gemini-smoke-v1

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-smoke-gemini-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 11/1/0
- avg IoU: 0.508
- avg centroid error (m): 22.3
- avg area ratio: 4.862
- pass(all/iou/area/centroid): 63.6% / 63.6% / 72.7% / 100.0%
- IoU bins: >=0.75=4, >=0.50=2, >=0.25=1, <0.25=4
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0064524:0.964(coord_parcel_override), D0063189:0.962(coord_parcel_override), D0062850:0.514(coord_parcel_override)

## 2026-02-13T18:53:10.379Z - doc-coord-gemini-smoke-v2

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-smoke-gemini-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 11/1/0
- avg IoU: 0.596
- avg centroid error (m): 13.7
- avg area ratio: 4.824
- pass(all/iou/area/centroid): 72.7% / 72.7% / 72.7% / 100.0%
- IoU bins: >=0.75=5, >=0.50=2, >=0.25=1, <0.25=3
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0063651:0.970(apn_clipped_by_doc), D0064524:0.964(coord_parcel_override), D0063189:0.962(coord_parcel_override)

## 2026-02-13T18:54:23.590Z - doc-coord-final-v5-gemini

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v5-gemini.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.641
- avg centroid error (m): 31.5
- avg area ratio: 6.255
- pass(all/iou/area/centroid): 69.2% / 76.9% / 69.2% / 88.5%
- IoU bins: >=0.75=13, >=0.50=4, >=0.25=3, <0.25=6
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T18:58:22.704Z - doc-coord-final-v5-gemini-allpermits-v1

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v5-gemini-allpermits-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.584
- avg centroid error (m): 42.2
- avg area ratio: 6.315
- pass(all/iou/area/centroid): 61.5% / 69.2% / 69.2% / 84.6%
- IoU bins: >=0.75=12, >=0.50=3, >=0.25=3, <0.25=8
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:04:29.538Z - doc-coord-final-v5-gemini-allpermits-v2

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v5-gemini-allpermits-v2.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.621
- avg centroid error (m): 38.6
- avg area ratio: 6.299
- pass(all/iou/area/centroid): 65.4% / 73.1% / 69.2% / 84.6%
- IoU bins: >=0.75=13, >=0.50=3, >=0.25=3, <0.25=7
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:36:16.715Z - doc-coord-final-v6-gemini3

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-gemini3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.641
- avg centroid error (m): 31.5
- avg area ratio: 6.255
- pass(all/iou/area/centroid): 69.2% / 76.9% / 69.2% / 88.5%
- IoU bins: >=0.75=13, >=0.50=4, >=0.25=3, <0.25=6
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:37:52.709Z - doc-coord-final-v6-gemini3-maxdocs3

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-gemini3-maxdocs3.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.641
- avg centroid error (m): 31.5
- avg area ratio: 6.255
- pass(all/iou/area/centroid): 69.2% / 76.9% / 69.2% / 88.5%
- IoU bins: >=0.75=13, >=0.50=4, >=0.25=3, <0.25=6
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:38:57.682Z - doc-coord-final-v6-gemini3-size-v1

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-gemini3-size-v1.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.545
- avg centroid error (m): 31.6
- avg area ratio: 5.533
- pass(all/iou/area/centroid): 57.7% / 61.5% / 65.4% / 88.5%
- IoU bins: >=0.75=12, >=0.50=2, >=0.25=2, <0.25=10
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:39:58.917Z - doc-coord-final-v6-gemini3-maxdelta900

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-gemini3-maxdelta900.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.641
- avg centroid error (m): 31.5
- avg area ratio: 6.255
- pass(all/iou/area/centroid): 69.2% / 76.9% / 69.2% / 88.5%
- IoU bins: >=0.75=13, >=0.50=4, >=0.25=3, <0.25=6
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:41:29.339Z - doc-coord-final-v6-gemini3-clip0005

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-gemini3-clip0005.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.160
- avg centroid error (m): 46.8
- avg area ratio: 3.516
- pass(all/iou/area/centroid): 15.4% / 23.1% / 15.4% / 84.6%
- IoU bins: >=0.75=1, >=0.50=2, >=0.25=3, <0.25=20
- top permits: D0063651:0.970(apn_clipped_by_doc), D0041761:0.732(apn), D0043300:0.632(apn), D0049047:0.384(apn), D0061951:0.375(apn_clipped_by_doc)

## 2026-02-13T19:42:24.874Z - doc-coord-final-v6-gemini3-clip030

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-gemini3-clip030.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.636
- avg centroid error (m): 31.4
- avg area ratio: 6.217
- pass(all/iou/area/centroid): 69.2% / 76.9% / 69.2% / 88.5%
- IoU bins: >=0.75=13, >=0.50=3, >=0.25=4, <0.25=6
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)

## 2026-02-13T19:46:37.044Z - doc-coord-v6-resolver-smoke

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-smoke-gemini-v3-resolver.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 5/0/0
- avg IoU: 0.731
- avg centroid error (m): 8.9
- avg area ratio: 2.054
- pass(all/iou/area/centroid): 80.0% / 80.0% / 80.0% / 100.0%
- IoU bins: >=0.75=3, >=0.50=1, >=0.25=0, <0.25=1
- top permits: D0062291:1.000(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0063189:0.962(coord_parcel_override), D0061951:0.512(apn), D0064908:0.188(apn)

## 2026-02-13T19:47:37.258Z - doc-coord-final-v6-resolver-default

- input: `experiments/custom-map-rehydrate/out/dataset-run.json`
- output: `experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v6-resolver-default.json`
- mode: doc-clue-assisted
- scored/skipped/errors: 26/4/0
- avg IoU: 0.641
- avg centroid error (m): 31.5
- avg area ratio: 6.255
- pass(all/iou/area/centroid): 69.2% / 76.9% / 69.2% / 88.5%
- IoU bins: >=0.75=13, >=0.50=4, >=0.25=3, <0.25=6
- top permits: D0062291:1.000(coord_parcel_override), D0055861:0.999(coord_parcel_override), D0058823:0.999(coord_parcel_override), D0062038:0.993(coord_parcel_override), D0062824:0.984(coord_parcel_override)
