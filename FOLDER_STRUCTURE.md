# ParkChain Nexus Folder Structure

This document maps the repository so contributors, evaluators, and frontend/backend tools can quickly find the right files.

## Root

```text
ParkChain Nexus - Blockchain based smart parking system/
  README.md
  SETUP_GUIDE.md
  FOLDER_STRUCTURE.md
  requirements.txt
  ParkChain-Nexus-Implementation-Spec.md
  MANUAL_FRONTEND_BACKEND_TEST_WORKFLOW.md
  PARKCHAIN_FEATURE_SIGNIFICANCE_EXPLAINER.md
  docs/
  backend/
  frontend/
  contracts/
```

| Path | Purpose |
|---|---|
| `README.md` | Main project presentation, architecture, features, impact, navigation guide |
| `SETUP_GUIDE.md` | Installation, environment setup, tests, demo workflow, troubleshooting |
| `FOLDER_STRUCTURE.md` | Repository map |
| `requirements.txt` | Root convenience pointer to backend Python dependencies |
| `ParkChain-Nexus-Implementation-Spec.md` | Original implementation plan and product specification |
| `MANUAL_FRONTEND_BACKEND_TEST_WORKFLOW.md` | Manual test and demo script |
| `PARKCHAIN_FEATURE_SIGNIFICANCE_EXPLAINER.md` | Simple-language explanation of features and blockchain terms |
| `docs/assets/` | Animated SVG assets and future demo media used by the README |

## Documentation Assets

```text
docs/
  assets/
    parkchain-hero.svg
    chain-pulse.svg
    section-spark.svg
```

| Asset | Purpose |
|---|---|
| `parkchain-hero.svg` | Animated README hero banner |
| `chain-pulse.svg` | Animated blockchain motion preview |
| `section-spark.svg` | Animated section divider for README headings |

## Backend

```text
backend/
  app/
    main.py
    api/
    ai/
    chain/
    core/
    db/
    demo/
  tests/
  requirements.txt
  start-dev.cmd
  .env.example
  .env
```

### `backend/app/main.py`

FastAPI entrypoint. Registers middleware and routers:

- Auth
- Chain
- Demo seed
- Forecast
- Lots
- ParkCoin faucet
- Pricing
- Sessions
- Trust/green credits
- WebSocket feed

### `backend/app/api/`

REST and WebSocket route modules.

```text
api/
  auth.py       Wallet login, challenge message, JWT
  chain.py      Chain status, event mirror, event sync
  demo.py       Demo data seed endpoint
  forecast.py   Occupancy forecast endpoint
  lots.py       Lot and slot CRUD/read APIs
  parkcoin.py   Demo ParkCoin faucet and balance route
  pricing.py    AI pricing commit/reveal endpoint
  sessions.py   Reservation, entry, exit, dispute, timeline
  trust.py      Trust SBT and GreenCreditToken routes
  ws.py         WebSocket chain feed
```

### `backend/app/ai/`

AI integration and pricing logic.

```text
ai/
  mistral_client.py       Mistral API wrapper
  pricing_engine.py      Dynamic pricing, commit hash, fallback pricing
  forecasting_engine.py  Occupancy forecast logic
```

### `backend/app/chain/`

Blockchain integration layer.

```text
chain/
  contracts.py          web3.py client, ABI loader, deployed contract bindings
  listener.py           Event sync, tx hash normalization, SQLite mirror writer
  relayer.py            Backend relayer wallet and transaction sender
  session_manager.py    ParkingSessionManager contract helper functions
  rewards.py            TrustScoreSBT and GreenCreditToken helpers
  parkcoin.py           ParkCoin balance and mint helpers
  abis/                 Contract ABIs copied from Hardhat artifacts
```

Important implementation notes:

- `contracts.py` installs `ExtraDataToPOAMiddleware` for Polygon Amoy.
- `listener.py` normalizes tx hashes and de-duplicates imported/synced events.
- `session_manager.py` normalizes `bytes32` values for QR proofs and pricing commits.
- `relayer.py` returns normalized `0x...` transaction hashes.

### `backend/app/core/`

Configuration and security helpers.

```text
core/
  config.py    Environment variables and runtime settings
  security.py  Wallet normalization, auth helpers, JWT/security utilities
```

### `backend/app/db/`

Database setup and ORM models.

```text
db/
  models.py   SQLAlchemy models
  session.py  Engine, session factory, table creation, startup cleanup
```

Core tables:

- `users`
- `lots`
- `slots`
- `sessions`
- `chain_events`
- `ai_pricing_logs`
- `trust_history`
- `green_credit_ledger`
- `disputes`

### `backend/app/demo/`

Demo seed data.

```text
demo/
  seed.py
```

### `backend/tests/`

Backend test suite.

```text
tests/
  test_auth.py
  test_lots.py
  test_sessions.py
  test_ai_and_events.py
  test_chain.py
  test_contract_wiring.py
  test_remaining_phases.py
  test_ws.py
  test_foundation.py
```

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

## Frontend

```text
frontend/
  src/
    assets/
    components/
    context/
    hooks/
    lib/
    routes/
    config/
    styles.css
  package.json
  vite.config.ts
  tsconfig.json
  start-dev.cmd
```

### `frontend/src/routes/`

Application pages using file-based routing.

```text
routes/
  index.tsx              Branding/landing page
  login.tsx              MetaMask login page
  app.tsx                Authenticated app shell
  app.index.tsx          Dashboard
  app.map.tsx            Parking map, slot reservation, seed demo data
  app.session.$id.tsx    Session lifecycle, AI pricing, escrow, timeline
  app.visualizer.tsx     Live blockchain visualizer page
  app.analytics.tsx      Charts and KPIs
  app.trust.tsx          TrustScore SBT page
  app.green-credits.tsx  GreenCreditToken page
  app.owner.tsx          Lot owner creation/admin page
  app.settings.tsx       API, chain, relayer, contract diagnostics
```

### `frontend/src/components/`

Reusable UI and feature components.

```text
components/
  AppHeader.tsx
  AppSidebar.tsx
  ChainVisualizer.tsx
  NetworkBadge.tsx
  ThemeToggle.tsx
  TxLink.tsx
  WalletPill.tsx
  ui/
```

`ChainVisualizer.tsx` is the centerpiece for the animated mempool, pending, block assembly, confirmed block, and event explanation view.

### `frontend/src/context/`

Global application providers.

```text
context/
  AuthProvider.tsx        Wallet auth and JWT state
  ThemeProvider.tsx       Theme state
  VisualizerProvider.tsx  WebSocket/event feed integration
```

### `frontend/src/lib/`

Frontend utilities.

```text
lib/
  api.ts        REST client and API error handling
  wallet.ts     MetaMask connection/signature helpers
  contracts.ts  ethers.js contract instances and reservation helper
  abis.ts       Frontend ABI snippets
  format.ts     Date, duration, token, hash formatting
  types.ts      Shared frontend DTO types
  ws.ts         WebSocket helpers
```

### `frontend/src/config/`

Frontend runtime constants.

```text
config/
  index.ts
```

Contains API URL, WebSocket URL, contract addresses, and Polygonscan URL builder.

### `frontend/src/assets/`

Visual assets used by the landing page and frontend.

```text
assets/
  ai-pricing.jpg
  branding-hero.jpg
  chain-pattern.jpg
  ev-charging.jpg
```

## Contracts

```text
contracts/
  contracts/
  scripts/
  test/
  hardhat.config.js
  package.json
```

### `contracts/contracts/`

Solidity smart contracts.

```text
contracts/
  ParkingSessionManager.sol
  ParkCoin.sol
  EscrowSettlement.sol
  TrustScoreSBT.sol
  GreenCreditToken.sol
```

### `contracts/scripts/`

Deployment and estimation scripts.

```text
scripts/
  deploy.js
  deploy-green-credit.js
  deployer-status.js
  estimate-deploy-cost.js
  estimate-demo-gas.js
  estimate-demo-flow-local.js
  check-recovered-contracts.js
```

### `contracts/test/`

Hardhat contract tests.

```text
test/
  parking-session-manager.test.js
  trust-score-sbt.test.js
```

## Generated Or Local-Only Files

These should not be committed:

```text
backend/.env
backend/.venv/
backend/*.db
frontend/node_modules/
frontend/dist/
contracts/node_modules/
__pycache__/
.pytest_cache/
*.log
```

## Where To Change Common Things

| Task | File |
|---|---|
| Add a backend route | `backend/app/api/` |
| Add a new DB table | `backend/app/db/models.py` |
| Change env variables | `backend/app/core/config.py` and `backend/.env.example` |
| Change contract address loading | `backend/app/chain/contracts.py` |
| Change session lifecycle | `backend/app/api/sessions.py` and `backend/app/chain/session_manager.py` |
| Change AI pricing | `backend/app/api/pricing.py` and `backend/app/ai/pricing_engine.py` |
| Change escrow UI | `frontend/src/routes/app.session.$id.tsx` |
| Change wallet login | `frontend/src/context/AuthProvider.tsx` and `frontend/src/lib/wallet.ts` |
| Change visualizer | `frontend/src/components/ChainVisualizer.tsx` and `frontend/src/context/VisualizerProvider.tsx` |
| Change landing page | `frontend/src/routes/index.tsx` |
| Change smart contracts | `contracts/contracts/` |
| Deploy contracts | `contracts/scripts/deploy.js` |
