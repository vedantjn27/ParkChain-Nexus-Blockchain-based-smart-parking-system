# ParkChain Nexus Manual Frontend + Backend Test Workflow

This guide is for rehearsing and demonstrating the complete ParkChain Nexus flow through the frontend while protecting limited Amoy POL.

Use two test modes:

1. No-POL rehearsal mode: verifies frontend/backend behavior without sending MetaMask transactions.
2. Live Amoy demo mode: runs the full blockchain-backed demonstration once.

## 1. What The Demo Proves

ParkChain Nexus demonstrates a blockchain-backed smart parking system where:

- Drivers sign in with a wallet instead of a password.
- Parking lots and slots are managed by the backend.
- Slots can be reserved locally for rehearsal or on-chain for the live demo.
- AI pricing is committed and revealed with an auditable hash.
- Entry, exit, disputes, and settlement are recorded in the session timeline.
- Trust score SBT and green credits show reputation and EV incentives.
- Escrow uses ParkCoin approval, deposit, exit marking, and release.
- A live visualizer shows pending and confirmed blockchain-style activity.
- Analytics summarize lots, occupancy, events, and throughput.

## 2. Start The Project

Open two terminals from the project root.

### Terminal A: Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected:

- Backend starts on `http://localhost:8000`.
- No startup errors.
- `http://localhost:8000/health` returns status `ok`.

### Terminal B: Frontend

```powershell
cd frontend
npm.cmd run dev
```

Expected:

- Frontend starts on a Vite URL, usually `http://localhost:5173`.
- Open that URL in the browser.

## 3. Pre-Demo Checks Without Spending POL

Run these checks before touching MetaMask transactions.

### Backend Automated Checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

Expected:

- All backend tests pass.
- Current expected result: `28 passed`.

### Frontend Build Checks

```powershell
cd frontend
npm.cmd run lint
npm.cmd run build
```

Expected:

- Lint has `0 errors`.
- Existing Fast Refresh warnings are acceptable.
- Build completes successfully.

### Gas Estimate Without Spending POL

```powershell
cd contracts
npx.cmd hardhat run scripts/estimate-demo-flow-local.js --network hardhat
```

Expected:

- The script prints gas for each demo action.
- It does not send live Amoy transactions.
- It reads current Amoy gas price only.

Use this to decide whether you can afford a full live run.

## 4. No-POL Frontend Rehearsal Workflow

This path verifies the frontend/backend workflow without using MetaMask gas.

### Step 1: Open Login Page

Go to:

```text
http://localhost:5173/login
```

Expected:

- Health status shows backend online.
- Chain status panel loads.
- MetaMask connect button is visible.

You may connect and sign the login message. Signing a message does not spend POL.

### Step 2: Wallet Login

Click `Connect MetaMask`.

Expected:

- MetaMask asks for wallet connection and message signature.
- No gas fee is required.
- After signing, the app navigates to the dashboard.

This proves:

- `/auth/message/{wallet}` works.
- `/auth/wallet-login` works.
- JWT storage works.
- `/auth/me` works.

### Step 3: Dashboard

Open:

```text
/app
```

Expected:

- Chain/network status is visible.
- Trust score and green credit cards load for the connected wallet.
- Lot summary and recent activity load.

This proves:

- Public read APIs work.
- Auth context is active.
- Frontend can call backend through CORS.

### Step 4: Seed Demo Data

Open:

```text
/app/map
```

Click `Seed demo data`.

Expected:

- Toast: `Demo data seeded`.
- Parking lots appear.
- Selecting a lot shows slots and occupancy forecast.

This proves:

- `/demo/seed` works.
- `/lots` works.
- `/lots/{lot_id}/slots` works.
- `/forecast/{lot_id}` works.

### Step 5: Local-Only Reservation

Select an available slot and click `Local only`.

Expected:

- Toast: `Local-only session created`.
- App navigates to `/app/session/{id}`.
- Session state is `Reserved`.
- Session has no on-chain id.

This spends no POL.

This proves:

- `/sessions/reserve` works.
- Double-booking prevention can be tested by trying to reserve the same slot again.

### Step 6: Entry Confirmation

On the session page, click the entry confirmation action.

Expected:

- Session state becomes `EntryConfirmed`.
- Timeline gets `EntryConfirmed`.
- A local transaction-style event hash appears.

This proves:

- `/sessions/{id}/entry` works.
- Session timeline updates.

### Step 7: AI Pricing

Click the AI pricing action.

Expected:

- Price per minute appears.
- Surge multiplier/rationale appears.
- Session state becomes active or priced.
- Timeline gets `PricingCommitted` and `PricingRevealed`.

This proves:

- `/sessions/{id}/price` works.
- AI pricing engine works.
- Commit/reveal style data is stored.

### Step 8: Exit Confirmation

Click the exit action.

Expected:

- Session state becomes `ExitConfirmed`.
- Total amount is calculated if pricing exists.
- Timeline gets `ExitConfirmed`.

This proves:

- `/sessions/{id}/exit` works.
- Backend lifecycle transitions work.

### Step 9: Dispute And Resolution

Enter a dispute reason and submit it.

Expected:

- Session state becomes `Disputed`.
- Timeline gets `DisputeRaised`.

Then resolve the dispute.

Expected:

- Session state becomes `Resolved`.
- Timeline gets `DisputeResolved`.

This proves:

- `/sessions/{id}/dispute` works.
- `/sessions/{id}/resolve-dispute` works.

### Step 10: Trust Score

Open:

```text
/app/trust
```

For no-POL rehearsal, do not click mint/adjust if using real Amoy contracts, because backend relayer transactions spend relayer POL.

Safe read check:

- Trust score should load.
- History table should load.

Live write check only when ready:

- `Mint` creates the initial SBT.
- `+5 clean session` adjusts trust upward.
- `-10 incident` adjusts trust downward.

This proves:

- `/trust/{wallet}` works for reads.
- `/trust/me/mint` and `/trust/{wallet}/adjust` work for live relayer-backed writes.

### Step 11: Green Credits

Open:

```text
/app/green-credits
```

For no-POL rehearsal, use read-only checks.

Expected:

- GREEN balance loads.

Live write check only when ready:

- Mint green credits for EV behavior.
- Redeem green credits for discount behavior.

This proves:

- `/green-credits/{wallet}` works for reads.
- `/green-credits/{wallet}/mint` and `/green-credits/me/redeem` work for live writes.

### Step 12: Owner Lot Creation

Open:

```text
/app/owner
```

Create a lot with:

- Name
- Latitude
- Longitude
- Base price
- Multiple slots
- EV flag
- Premium flag
- Minimum trust score

Expected:

- Toast: `Lot created`.
- New lot appears on the map page.

This proves:

- `/lots` authenticated POST works.
- Slot metadata is saved.

### Step 13: Visualizer

Open:

```text
/app/visualizer
```

Expected:

- Connection status becomes online.
- Event log shows local and synced events.
- Node-link visualizer shows mempool, pending transactions, block assembly, confirmed blocks, and chain nodes.

Click `Sync recent`.

Expected:

- Recent contract events are fetched if the RPC is reachable.

This proves:

- `/ws/chain-feed` works.
- `/chain/events` works.
- `/chain/events/sync` works.
- Visualizer provider and React Flow view work.

### Step 14: Analytics

Open:

```text
/app/analytics
```

Expected:

- Lot occupancy chart loads.
- Event type distribution loads.
- Hourly throughput loads.
- KPI cards show reservations, exits, disputes, and lots.

This proves:

- Analytics page can consume `/lots` and `/chain/events`.
- Demo events are visible in aggregate form.

### Step 15: Settings

Open:

```text
/app/settings
```

Expected:

- API URL and WebSocket URL are visible.
- Deployed contract addresses are visible.
- Relayer address and network status are visible.
- Polygonscan links open for contract addresses.

This proves:

- Frontend config matches backend/deployed contracts.
- Chain status endpoint is wired.

## 5. Live Amoy Demo Workflow

Use this only once when you are ready to show the full blockchain-backed flow.

Before starting:

- Confirm backend is running.
- Confirm frontend is running.
- Confirm MetaMask is on Polygon Amoy.
- Confirm your wallet has enough POL.
- Confirm the backend relayer wallet also has enough POL.
- Keep Polygonscan open for transaction verification.

Recommended live flow:

1. Login with MetaMask.
2. Open Settings and show chain status plus deployed contract addresses.
3. Open Map and seed demo data.
4. Select a lot and slot.
5. Click `Reserve on-chain`.
6. Confirm MetaMask transaction.
7. Wait for receipt and session import.
8. Open Visualizer and show pending/confirmed event movement.
9. On the session page, confirm entry.
10. Run AI pricing.
11. Approve ParkCoin escrow.
12. Deposit escrow.
13. Confirm exit.
14. Wait for the dispute window if required.
15. Release escrow.
16. Raise and resolve a dispute only if you want to demonstrate dispute handling. It costs extra gas.
17. Open Trust Score and mint/adjust score.
18. Open Green Credits and mint/redeem credits.
19. Open Analytics and show how events/lots changed.
20. Open Timeline and Polygonscan links to prove auditability.

## 6. Expected Live Demo Messages

During on-chain reservation:

- `Confirm in MetaMask...`
- `Submitted. Awaiting receipt...`
- `Reserved on-chain`

During local rehearsal:

- `Local-only session created`

During demo seed:

- `Demo data seeded`

During owner lot creation:

- `Lot created`

During escrow:

- Approval transaction should confirm first.
- Deposit transaction should confirm second.
- Release transaction should only work after exit is marked and the dispute window has passed.

## 7. POL Usage Guidance

Your current balance is `0.320` test POL.

The latest local estimate for a complete all-feature demo was:

- Raw full demo estimate: about `0.279 POL`
- Safer 50 percent buffered estimate: about `0.419 POL`

That means:

- One careful complete demo may fit in `0.320 POL` if gas does not spike.
- One buffered complete demo does not fit in `0.320 POL`.
- Rehearse today using local-only reservation and read-only pages.
- Save the on-chain reservation, escrow, trust writes, and green-credit writes for the final demo.

To reduce gas during the live demo:

- Do not repeat failed MetaMask transactions.
- Avoid running both positive and negative trust adjustments unless needed.
- Avoid dispute flow if time or POL is tight.
- Use local-only sessions for explanation, then one on-chain session for proof.
- Keep the browser and MetaMask ready before starting.

## 8. Troubleshooting Checklist

If frontend cannot reach backend:

- Confirm backend is on port `8000`.
- Confirm frontend `.env` or defaults use `http://localhost:8000`.
- Confirm `CORS_ORIGINS=*` exists in `backend/.env`.

If MetaMask transaction fails:

- Check Polygon Amoy network.
- Check wallet POL balance.
- Check contract addresses in Settings.
- Retry only after reading the error, because retries spend time and may consume gas if submitted.

If trust or green-credit writes fail:

- Check backend relayer POL balance.
- Check relayer private key in backend `.env`.
- Check contract ownership permissions.

If escrow release fails:

- Confirm escrow was deposited first.
- Confirm session exit was completed.
- Confirm the dispute window has passed.
- Confirm the session was not disputed.

If visualizer has no events:

- Trigger local-only reservation, entry, pricing, or exit first.
- Click `Sync recent`.
- Confirm WebSocket connection status is online.

## 9. Final Suggested Demo Script

Use this spoken structure:

1. "This is a wallet-authenticated smart parking system."
2. "The driver can discover parking lots and see AI-based occupancy forecasts."
3. "A slot can be reserved on-chain, preventing double booking."
4. "The backend imports the on-chain session and manages the parking lifecycle."
5. "AI pricing is committed and revealed for auditability."
6. "Entry, exit, disputes, and settlement are visible in the session timeline."
7. "Escrow uses ParkCoin so payment can be released after exit."
8. "Trust score and green credits show reputation and sustainability incentives."
9. "The live visualizer shows blockchain activity as events move from pending to confirmed."
10. "Analytics summarize system activity for operators."
