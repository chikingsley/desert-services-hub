# SWPPP Labor Analysis & Scheduling Algorithm

This document records the process of transforming ~6,000 rows of unstructured SharePoint Excel data into a predictive labor estimation model.

## 1. The "Truth" Algorithm
Through multivariate regression and residual analysis of 651 cleaned historical work events, we established the following production rates:

| Service Category | Rate (Man-Minutes) | Real-World Translation (4-man crew) |
|------------------|--------------------|--------------------------------------|
| **Panel Install**| 28.0 per panel     | ~7 panels per hour                   |
| **Sock Install** | 0.95 per LF        | ~250 feet per hour                   |
| **Panel Removal**| 1.1 per panel      | ~200 panels per hour (fast!)         |
| **Maintenance**  | 60.0 (flat)        | 1-hour "fix-it" stop                 |
| **Site Setup**   | 45.0 (flat)        | Arrival, talk to super, setup        |

### Final Formula
`Total Man Minutes = [(Panels * 28.0) + (SockLF * 0.95) + (Maint ? 60) + 45] * CrewMultiplier`

| Crew Name | Multiplier | Efficiency |
|-----------|------------|------------|
| **Jole**  | 0.87       | 13% Faster |
| **Conrad**| 1.15       | 15% Slower |
| **David** | 1.45       | 45% Slower |
| **Alfredo**| 1.58      | 58% Slower |
| **Joel**  | 1.89       | 89% Slower |

*Note: Slower multipliers often indicate crews handling more complex "Rock" sites or training new members.*

---

## 2. Research & Methodology

### Phase A: Multidimensional Extraction
We built a script to ignore "inventory noise" (e.g., "They have 400 panels on site") by filtering out all numbers inside parentheses. We then categorized work by action verbs (*Install, Relocate, Remove*).

### Phase B: Solving the "Combo" Mystery
We discovered that "Combo" jobs (Panels + Sock) actually have a **Combo Discount**. Once a crew is on site, adding a second service type is faster than doing that service as a standalone trip.

### Phase C: Crew Efficiency Multipliers
We parsed names from the work logs to find "Speed Outliers."
*   **Highly Efficient**: Jole (13% faster than average).
*   **Learning/Slower**: Cameron/Aiden (90% slower than average - likely newer or handled complex sites).

---

## 3. Real-World Application (Scheduling)

### Capacity Calculation
Based on the current "Confirmed Schedule," the model identified **945 hours of work**.
*   **Total Capacity (3 crews)**: ~96 hours/day.
*   **Current Backlog**: **~10 working days**.

### Recommendations for Tooling
1.  **n8n Implementation**: Use the logic in `scripts/labor-analysis-archive/estimate_backlog.ts` to push "Estimated Hours" to a Monday.com column.
2.  **Notion Visualization**: To solve the "Too many items" problem, group by **"Crew Assignment"** first, then **"Status."** This collapses 700 items into 3 clear "Truck Views."
3.  **The "Safety Buffer"**: Because site conditions vary, always schedule at **80% of model capacity**. If the model says a day is 8 hours, it will likely take 10 due to traffic/rocks.

## 4. Analysis Archive
All scripts used to derive these numbers are located in `./scripts/labor-analysis-archive/`.
