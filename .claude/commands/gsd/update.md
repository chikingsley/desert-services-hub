---name: gsd:updatedescription: Update GSD to latest version with changelog display---<objective>Check for GSD updates, install if available, and display what changed.Provides a better update experience than raw `npx get-shit-done-cc` by showing version diff and changelog entries.</objective><process><step name="get_installed_version">Read installed version:```bashcat ./.claude/get-shit-done/VERSION 2>/dev/null```text```bash
```html```bashnpm view get-shit-done-cc version 2>/dev/null```text```text
```html```bash
```text```bash
```html```bash
```csv```bashnpx get-shit-done-cc --global```text```bashrm -f ./.claude/cache/gsd-update-check.json```html```text
```</step></process><success_criteria>- [ ] Installed version read correctly- [ ] Latest version checked via npm- [ ] Update skipped if already current- [ ] Changelog fetched and displayed BEFORE update- [ ] Clean install warning shown- [ ] User confirmation obtained- [ ] Update executed successfully- [ ] Restart reminder shown</success_criteria>