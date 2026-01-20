# Process Map Legend

## Colors

| Fill Color | Border | Meaning |
|------------|--------|---------|
| White | Black | Normal process step |
| Gray | Black | Paper/manual process |
| Green | Black | Automated step |
| White | Red | Pain point / bottleneck |
| White | Dashed | Optional / doesn't always happen |
| Yellow | Black | Callout / note / question |

## Shapes

| Shape | Meaning |
|-------|---------|
| Rectangle | Process step |
| Diamond | Decision point (Yes/No) |
| Oval / Pill | Start or End |

## Showing "There's a Detailed Diagram for This"

When a box represents a bigger process that has its own detailed diagram, add text inside:

```text
┌─────────────────────────┐
│                         │
│   Contract Review       │
│                         │
│   ───────────────────   │
│   See detailed diagram  │
│                         │
└─────────────────────────┘

```text

## Flow Direction

- __Master overview__: Left to Right (shows project phases)
- __Detailed processes__: Top to Down (shows steps within a phase)
