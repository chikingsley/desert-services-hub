---name: set-profiledescription: Switch model profile for GSD agents (quality/balanced/budget)arguments:  - name: profile    description: "Profile name: quality, balanced, or budget"    required: true---<objective>Switch the model profile used by GSD agents. This controls which Claude model each agent uses, balancing quality vs token spend.</objective><profiles>| Profile | Description ||---------|-------------|| **quality** | Opus everywhere except read-only verification || **balanced** | Opus for planning, Sonnet for execution/verification (default) || **budget** | Sonnet for writing, Haiku for research/verification |</profiles><process>## 1. Validate argument```csv```bash
```bashls .planning/config.json 2>/dev/null```text```text
```css```bashcat .planning/config.json```sql```json{  "model_profile": "$ARGUMENTS.profile"}```css```text
```html```text
```text```text
```</examples>