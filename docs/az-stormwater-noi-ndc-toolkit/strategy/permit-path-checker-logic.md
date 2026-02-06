# Permit Path Checker Logic (NOI vs NDC)

## What It Is
A lightweight decision engine that asks a short set of project questions and returns:

- likely path (`NOI`, `NDC`, `Possible Exemption`, or `Needs Manual Review`)
- why that path was chosen
- exact next steps and required data to finish filing

It is not a legal opinion tool. It is an operational pre-check to reduce filing errors.

## Inputs Collected
- disturbed acreage
- part of larger common plan (yes/no)
- can stormwater leave site boundary (yes/no/unsure)
- discharge route (direct to waterbody, MS4/storm drain, none, unknown)
- receiving waterbody known (yes/no)
- project municipality
- signer role available (RCO/DRO/none)
- SWPPP status (prepared/not prepared)

## Decision Outcomes
- `NOI likely required`: any off-site discharge, potential discharge, or uncertainty
- `NDC possible`: no off-site discharge and controls keep stormwater on-site
- `Possible exemption`: less than 1 acre and not part of a 1+ acre common plan (requires confirmation)
- `Needs manual review`: conflicting answers, missing signer authority, or unclear discharge path

## Output Package
- one-line recommendation
- reason summary (2-4 bullets)
- data checklist for myDEQ submission
- warning flags that need human review
- CTA: file internally or escalate to Desert Services support

## Decision Tree (MVP)
```mermaid
flowchart TD
  A["Start"] --> B{"Disturb >= 1 acre?"}
  B -- "No" --> C{"Part of larger common plan totaling >= 1 acre?"}
  B -- "Yes" --> D{"Can stormwater leave site or reach MS4/WOTUS?"}
  C -- "No" --> E["Possible Exemption<br/>Confirm with jurisdiction"]
  C -- "Yes" --> D
  D -- "Yes" --> F["NOI likely required"]
  D -- "No" --> G{"Verified no off-site discharge?"}
  D -- "Unsure" --> F
  G -- "Yes" --> H["NDC possible"]
  G -- "No/Unsure" --> F
  F --> I{"RCO/DRO available?"}
  H --> I
  I -- "No" --> J["Needs Manual Review<br/>Setup signer authority first"]
  I -- "Yes" --> K["Return checklist + next actions"]
```

## MVP Rule Notes
- if answer is `unsure` on discharge, default to `NOI likely required`
- if signer role is missing, block final recommendation as actionable submission
- preserve all answers as audit metadata with timestamp and source version
