# Desert Services Hub - Task Runner

default:
    @just --list

# Development

[doc('Run type check')]
typecheck:
    bun run typecheck

[doc('Run linter')]
lint:
    bun run lint

[doc('Fix lint issues')]
fix:
    bun run fix

[doc('Run typecheck + lint')]
check:
    bun run check

[doc('Run tests')]
test:
    bun test tests/ services/

[doc('Start AIStor for tests')]
aistor-start:
    docker compose up -d aistor

[doc('Stop AIStor')]
aistor-stop:
    docker compose stop aistor

[doc('Check AIStor status')]
aistor-status:
    docker compose ps aistor
