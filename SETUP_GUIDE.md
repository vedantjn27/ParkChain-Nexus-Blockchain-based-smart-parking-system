# ParkChain Nexus Setup Guide

This guide explains how to install, configure, run, test, and demonstrate ParkChain Nexus from a fresh checkout.

## 1. Prerequisites

Install these first:

- Python 3.12+
- Node.js 20+
- npm
- MetaMask browser extension
- A Polygon Amoy RPC URL
- Test POL on Polygon Amoy for live blockchain transactions
- A Mistral API key for AI pricing and forecasting

Recommended terminal on Windows:

```text
PowerShell
```

## 2. Repository Layout

```text
backend/     FastAPI API, SQLite mirror, AI engines, web3.py relayer
frontend/    React/Vite frontend, wallet UI, visualizer, dashboards
contracts/   Solidity contracts, Hardhat config, deploy/test scripts
```

## 3. Backend Setup

From the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Create `backend/.env` from `backend/.env.example`.

Minimum required values:

```env
MISTRAL_API_KEY=your_mistral_key
RPC_URL_AMOY=https://rpc-amoy.polygon.technology
RELAYER_PRIVATE_KEY=your_relayer_private_key
PARKING_SESSION_MANAGER_ADDRESS=deployed_address
TRUST_SCORE_SBT_ADDRESS=deployed_address
ESCROW_SETTLEMENT_ADDRESS=deployed_address
GREEN_CREDIT_TOKEN_ADDRESS=deployed_address
PARK_COIN_ADDRESS=deployed_address
JWT_SECRET=long_random_secret
DATABASE_URL=sqlite:///./parkchain.db
DISPUTE_WINDOW_SECONDS=120
CORS_ORIGINS=*
DEMO_CHAIN_FALLBACK=true
```

Notes:

- `RELAYER_PRIVATE_KEY` must belong to the wallet that owns or is authorized for relayer-backed contract actions.
- `DEMO_CHAIN_FALLBACK=true` keeps the demo flow alive if a relayer write fails and stores the real chain error for debugging.
- `DEMO_CHAIN_FALLBACK=false` is stricter and returns failures immediately.

Start backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check:

```text
http://127.0.0.1:8000/health
```

Expected:

```json
{"status":"ok","service":"ParkChain Nexus API","environment":"development"}
```

## 4. Frontend Setup

From the project root:

```powershell
cd frontend
npm.cmd install
```

Start frontend:

```powershell
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:5173
```

The frontend uses `frontend/src/config/index.ts` for API URL, WebSocket URL, contract addresses, and Polygonscan links.

## 5. Smart Contract Setup

From the project root:

```powershell
cd contracts
npm.cmd install
```

Run contract tests:

```powershell
npx.cmd hardhat test
```

Deploy to Polygon Amoy:

```powershell
npx.cmd hardhat run scripts/deploy.js --network amoy
```

After deployment:

1. Copy deployed addresses into `backend/.env`.
2. Copy or verify addresses in frontend config if needed.
3. Restart backend.
4. Open the frontend settings page to confirm all contracts are configured.

## 6. Running The Full App

Use two terminals.

Terminal A:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal B:

```powershell
cd frontend
npm.cmd run dev
```

Then open:

```text
http://127.0.0.1:5173
```

## 7. Testing

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

Frontend build:

```powershell
cd frontend
npm.cmd run build
```

Frontend lint:

```powershell
cd frontend
npm.cmd run lint
```

Contracts:

```powershell
cd contracts
npx.cmd hardhat test
```

## 8. Demo Workflow

### Local Rehearsal

Use this to test without spending POL:

1. Open `/login`.
2. Connect MetaMask and sign login message.
3. Open `/app/map`.
4. Seed demo data.
5. Reserve a slot using local-only mode.
6. Confirm entry.
7. Run AI pricing.
8. Confirm exit.
9. Raise and resolve dispute if needed.
10. View timeline, visualizer, and analytics.

### Live Amoy Demo

Use this to prove real chain actions:

1. Confirm MetaMask is on Polygon Amoy.
2. Confirm driver wallet has test POL.
3. Confirm relayer wallet has test POL.
4. Reserve slot on-chain from the map.
5. Confirm entry.
6. Run AI pricing commit/reveal.
7. Click `Get demo PARK`.
8. Click `Approve`.
9. Click `Deposit escrow`.
10. Confirm exit.
11. Wait for dispute window if required.
12. Release escrow.
13. Show timeline and Polygonscan links.
14. Show visualizer and analytics.

## 9. Important Demo Concepts

### POL vs PARK

```text
POL  = gas token for Polygon Amoy transactions
PARK = ParkCoin payment token used inside ParkChain escrow
```

Users need test POL for MetaMask transactions such as reservation, approval, deposit, and release.

Users need PARK for escrow deposit. Use `Get demo PARK` in the session page to mint demo ParkCoin.

### Local vs On-Chain

Local events are useful for rehearsal. On-chain events create Polygon Amoy transactions and Polygonscan links.

If a relayer-backed action falls back locally, the UI shows the real chain error so it can be debugged.

## 10. Troubleshooting

### Backend Not Running

Check:

```text
http://127.0.0.1:8000/health
```

If it fails, restart the backend and check `.env`.

### Frontend Cannot Reach Backend

Check:

- Backend is on port `8000`.
- `CORS_ORIGINS=*` exists in `backend/.env`.
- Frontend API URL is correct in `frontend/src/config/index.ts`.

### MetaMask Transaction Fails

Check:

- Wallet is on Polygon Amoy.
- Wallet has test POL.
- Contract addresses are correct.
- You are not reusing a locally-fallback session to test real chain transitions.

### Entry, Pricing, Or Exit Falls Back

Look at the timeline `Chain error` row or the warning toast.

Common causes:

- Wrong on-chain state.
- RPC failure.
- Relayer gas issue.
- Contract revert.
- Reusing a session that already moved forward locally.

### Escrow Deposit Fails

Check:

- You clicked `Get demo PARK`.
- PARK balance is greater than deposit amount.
- You clicked `Approve`.
- Approval transaction confirmed.
- Deposit amount did not exceed approved amount.

### Escrow Release Fails

Check:

- Escrow was deposited.
- Exit was confirmed.
- Dispute window has passed.
- Session is not disputed.

## 11. Clean Generated Files

The repository ignores generated artifacts such as:

```text
__pycache__/
*.pyc
.pytest_cache/
*.log
frontend/dist/
frontend/node_modules/
backend/.venv/
backend/.env
*.db
```

Do not commit local databases, private keys, virtual environments, node modules, or build output.
