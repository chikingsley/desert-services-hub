# Desert SSSP CLI

Generate a Desert Services-branded Site-Specific Safety Plan (SSSP) PDF using the shared `lib/pdf/*` infrastructure (logo, fonts, header/footer).

## Usage

```bash
# Create a fill-out template JSON
bun apps/cli-tools/sssp-cli/bin/cli.ts init data/sssp/sssp.input.json

# Generate the PDF
bun apps/cli-tools/sssp-cli/bin/cli.ts generate --in data/sssp/sssp.input.json --out data/sssp/SSSP.pdf
```

