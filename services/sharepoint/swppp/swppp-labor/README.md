# SWPPP Labor Estimation Model (V4)

This document records the validated labor estimation model derived from analysis of ~2,500 historical work entries from the SWPPP Master spreadsheet.

## Summary

| Metric | Value |
|--------|-------|
| **Training samples** | 926 entries |
| **Cross-validation R²** | 33.4% |
| **Median prediction error** | 34.4% |
| **90th percentile error** | 77.1% |

The model explains about 1/3 of the variance in labor times. The remaining variance is due to site conditions, weather, crew experience, and activities not captured in work descriptions.

---

## Production Rates

| Service | Rate | Unit | Notes |
|---------|------|------|-------|
| **Install Panel** | 12.7 | man-min/panel | Includes stands, hardware |
| **Relocate Panel** | 10.1 | man-min/panel | Move to new location |
| **Remove Panel** | 4.8 | man-min/panel | Take down and load |
| **Install Sock** | 0.22 | man-min/LF | 9" erosion sock |
| **Relocate Sock** | 0.40 | man-min/LF | Rarely done |
| **Install Inlet Protection** | 15.6 | man-min/inlet | Fabric + ERTEK |
| **Base Setup** | 41.4 | man-min/visit | Arrive, talk to super, unload |
| **Maintenance Penalty** | 32.1 | man-min/flat | For "fix it" stops |

### Real-World Translations

For a **4-person crew**:

- Install panels: ~19 panels/hour
- Install sock: ~1,100 LF/hour
- Remove panels: ~50 panels/hour

---

## Formula

```
Total Man-Minutes =
    (Install Panels × 12.7) +
    (Relocate Panels × 10.1) +
    (Remove Panels × 4.8) +
    (Install Sock LF × 0.22) +
    (Relocate Sock LF × 0.40) +
    (Inlets × 15.6) +
    (Is Maintenance ? 32.1 : 0) +
    41.4
```

**To convert to crew-hours:** `Man-Minutes / (Crew Size × 60)`

---

## Crew Efficiency Multipliers

Crews were analyzed for relative efficiency. A multiplier of 1.0 is baseline; higher = slower.

| Crew | Multiplier | Samples | Notes |
|------|------------|---------|-------|
| David | 1.12× | 43 | ~12% slower than baseline |
| Preston | 1.18× | 112 | |
| Aiden | 1.18× | 53 | |
| Larz | 1.21× | 25 | |
| Alfredo | 1.23× | 97 | |
| Anthony | 1.33× | 60 | |
| Nate | 1.35× | 57 | |
| Rudy | 1.36× | 92 | |
| Justin | 1.42× | 289 | Most samples |
| Dalton | 1.43× | 38 | |
| Mike | 1.45× | 95 | |
| Ray | 1.54× | 211 | |
| Steven | 1.54× | 233 | |
| Joel | 1.56× | 131 | |
| Cameron | 1.60× | 103 | |
| Dominic | 1.67× | 17 | |
| Jesus | 1.74× | 50 | |
| Jair | 1.90× | 46 | |

**Note:** "Slower" multipliers often indicate crews handling more complex sites (rocks, difficult access) or training new members. These are not performance reviews.

---

## Confidence Intervals

Given the median error of ~35%, predictions should be treated as estimates with wide uncertainty:

| Predicted Time | Likely Range (±35%) |
|----------------|---------------------|
| 2 hours | 1.3 - 2.7 hours |
| 4 hours | 2.6 - 5.4 hours |
| 8 hours | 5.2 - 10.8 hours |

**Scheduling Recommendation:** Always schedule at **70-80% of model capacity** to account for variance.

---

## Methodology

### Data Pipeline

1. **Source:** SWPPP Master 11-7-24.xlsx, "SWPPP B & V" sheet (2,540 rows)
2. **Extraction:** Action-phrase matching (e.g., "Installed 20 panels")
   - Avoids false positives from inventory notes like "They have 80 panels on site"
3. **Labor parsing:** Regex for "(X men Y hours/minutes)" patterns
4. **Filtering:** 926 entries with both labor and quantities

### Model Training

- **Algorithm:** Gradient descent (150,000 iterations)
- **Split:** 80% train / 20% test
- **Validation:** 5-fold cross-validation

### Cross-Validation Results

| Fold | R² | Median Error |
|------|-----|--------------|
| 1 | 38.7% | 36.2% |
| 2 | 59.3% | 31.4% |
| 3 | 27.5% | 36.6% |
| 4 | 40.6% | 31.7% |
| 5 | 0.9% | 36.0% |
| **Mean** | **33.4%** | **34.4%** |

The variance between folds indicates inherent noise in the data.

---

## Known Limitations

1. **Combo jobs:** Jobs with panels + sock + screening may have higher error
2. **Site conditions:** Rocks, terrain, access not captured in work logs
3. **Weather:** Hot/cold extremes affect crew speed
4. **Privacy screening:** Not extracted (different from sock)
5. **Hardware/stands:** Implicitly included in panel rates

---

## Implementation

### Files

| File | Purpose |
|------|---------|
| `scripts/labor-analysis-archive/swppp-labor-model-v4.ts` | Main model script |
| `scripts/labor-analysis-archive/swppp-labor-model.test.ts` | Validation tests (23 passing) |
| `tempfiles/swppp_model_v4_results.json` | Model coefficients and metrics |

### Running the Model

```bash
# Retrain model (if data changes)
bun scripts/labor-analysis-archive/swppp-labor-model-v4.ts

# Run validation tests
bun test scripts/labor-analysis-archive/swppp-labor-model.test.ts
```

### Quick Estimation (Inline)

```bash
bun -e "
const c = { ip: 12.7, rp: 10.1, xp: 4.8, is: 0.22, ii: 15.6, base: 41.4 };

// Example: Install 30 panels + 200 LF sock
const manMin = (30 * c.ip) + (200 * c.is) + c.base;
const crewHours = manMin / (4 * 60); // 4-person crew

console.log(\`Estimated: \${crewHours.toFixed(1)} crew-hours\`);
"
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| V1 | 2024-12 | Initial attempt (incorrect coefficients) |
| V2 | 2024-12 | Fixed sock extraction (comma numbers) |
| V3 | 2024-12 | Smarter text cleaning |
| V4 | 2024-12-31 | Action-phrase extraction, validated |

---

*Generated from analysis of SWPPP Master 11-7-24.xlsx*
*Model last trained: 2024-12-31*
