# Auto-Dust-Permit

**Automated Maricopa County Dust Control Permit Management System**

`auto-dust-permit` is a complete automation suite for the Maricopa County Dust Control Portal. It automates the entire lifecycle of dust permits: creation, revision, renewal, and closure.

## 🚀 Features

*   **Full Automation**:
    *   **Create**: Automatically fills new permit applications (Pages 1-5).
    *   **Revise**: Submits revisions for existing permits.
    *   **Renew**: Handles annual permit renewals.
    *   **Close**: Closes out permits upon project completion.
*   **Intelligent Filling**:
    *   Uses **Google Gemini** (`@google/genai`) for intelligent text parsing and decision making.
    *   **PDF Extraction**: Automatically extracts project details from NOI and SWPPP PDFs.
    *   **Fallback Strategies**: Robust selectors handle dynamic form fields (Oracle ADF).
*   **Deployment Ready**:
    *   **Dockerized**: Single container stack (Server + Dashboard + VNC).
    *   **Visual Debugging**: Built-in VNC and noVNC for watching the browser in real-time.
    *   **Dashboard**: React-based control panel for managing the automation.

## 🛠️ Tech Stack

*   **Core**: TypeScript, Bun, Playwright
*   **AI**: Google Gemini (`@google/genai`)
*   **Container**: Docker, TigerVNC, Openbox
*   **Dashboard**: React, Bun HTML imports, TailwindCSS

## 📦 Deployment

The system is packaged as a single Docker image available on GitHub Container Registry.

### Prerequisites
*   Docker & Docker Compose
*   `docker-compose.yml` (provided in repo)
*   `.env` file with secrets

### Quick Start

1.  **Create a `.env` file** with your credentials:
    ```env
    DUST_PERMIT_USERNAME=your_email
    DUST_PERMIT_PASSWORD=your_password
    GEMINI_API_KEY=your_key
    ```
2.  **Run with Docker Compose**:
    ```bash
    docker compose up -d
    ```

### Access Points
*   **Dashboard**: http://localhost:47823
*   **API**: http://localhost:47822
*   **VNC View**: http://localhost:47821

## 🏗️ Development

### Local Setup
```bash
# Install dependencies
bun install

# Run API + dashboard
bun run dev
```

### Running Tests
```bash
# Run typecheck + lint
bun run check

# Run all tests
bun test

# Run the full creation flow E2E
bun run create
```

### Page 4 Evaluator Benchmark (E2E)

Page 4 state checks now use a Bun-built browser evaluator module injected into
the Playwright page (no runtime `new Function` reconstruction).

To benchmark cold vs warm calls during E2E:

```bash
PAGE4_STATE_BENCH=1 PAGE4_STATE_BENCH_ITERATIONS=20 bun test --max-concurrency 1 tests/e2e/create-fresh.test.ts
```

Logged metrics:

- `scriptMs`: time waiting for bundled evaluator script (includes first build)
- `injectMs`: time to inject evaluator into the page (`addInitScript` + `addScriptTag`)
- `evalMs`: pure in-browser state evaluation time
- `totalMs`: end-to-end `getPage4State()` call time

The warm summary prints once per run with `min`, `median`, `p95`, and `avg`.

## 📝 License
Private.
