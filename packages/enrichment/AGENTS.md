# Enrichment (`packages/enrichment`)

Contact and company enrichment services. Independent of email — operates on names, domains, and identifiers.

## Scope

- **PDL** (`src/pdl/`): People Data Labs person/company enrichment, search, cleaner, and support APIs.
- **Jina** (`src/jina/`): Jina AI web search, reader, embeddings, reranker, classifier, segmenter.
- **Jina+Gemini** (`src/jina/jina-gemini.ts`): Web scrape + Gemini extraction for companies PDL can't find.
- **Smart Enrich** (`src/jina/smart-enrich.ts`): PDL-first with Jina+Gemini fallback.
- **Avatars** (`src/avatars.ts`): Gravatar + UI Avatars URL generation.
- **Clearbit** (`src/clearbit.ts`): Free logo API by domain.

## Architecture

```text
src/
  types.ts            # AvatarResult, LogoResult
  avatars.ts          # Gravatar + UI Avatars
  clearbit.ts         # Company logo URLs
  pdl/
    client.ts         # PDL SDK singleton + rate limit constants
    types.ts          # All PDL request/response types
    person.ts         # Person enrich, search, identify
    company.ts        # Company enrich, search, clean (batch)
    support.ts        # Job title, IP, location, school, autocomplete
  jina/
    types.ts          # Jina API types (search, read, embed, rerank, classify, segment)
    search.ts         # Low-level Jina search helpers
    client.ts         # Full Jina client (search, read, embed, rerank, classify, segment)
    jina-gemini.ts    # Jina search + Gemini extraction for company enrichment
    smart-enrich.ts   # PDL-first, Jina+Gemini fallback orchestrator
```

## Import Alias

`@enrichment/*` maps to `packages/enrichment/src/*`.

## API Keys (env vars)

| Var | Service | Required by |
|-----|---------|-------------|
| `PEOPLE_DATA_LABS_API_KEY` | PDL | `pdl/*` |
| `JINA_API_KEY` | Jina AI | `jina/client.ts` |
| `GEMINI_API_KEY` | Google Gemini | `jina/jina-gemini.ts` |

## Rate Limits (PDL Free Tier)

- Company cleaner: 10/min, 10,000/month (generous)
- Person enrichment: 10/min, 100/month (scarce)
- Company enrichment: 100/min, 100/month
- Use `RATE_LIMIT_DELAY` (6.5s) between batch calls

## Rules

- Do not import from `@email/*` — this package is standalone.
- PDL client is a lazy singleton; do not create multiple instances.
- All API functions return `{ success, timeMs, error? }` result wrappers; never throw.
- Jina+Gemini is a fallback path — always try PDL first via `smartEnrich`.
