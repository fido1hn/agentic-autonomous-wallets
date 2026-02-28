# Aegis - Autonomous Agent Wallet Framework for Solana

Aegis is a wallet execution layer for AI agents on Solana devnet.

It lets agents act on-chain, but only inside strict safety rules.

## What Aegis does

- Creates wallets for agents
- Lets agents send structured intents
- Checks policy before any signature is allowed
- Signs through Privy-managed wallets
- Logs every approve/reject decision

## Locked stack (this submission)

- Runtime: Hono API on Bun
- Execution and policy layer: Aegis
- Signing and key custody: Privy server wallets
- Network: Solana devnet

## Core idea

Agents can decide what to do.

Agents cannot sign directly.

Aegis is the gate between agent decisions and wallet signatures.

## Core features

- Programmatic wallet creation per agent
- Privy-based signing path
- Policy checks: assigned DSL rules + baseline limits + simulation
- Explicit policy precedence via assignment priority
- Durable daily spend accounting (DB-backed)
- Idempotent intent execution by `agentId + idempotencyKey`
- Per-tx cap and daily cap controls
- Structured audit logs for every intent

## MVP scope

### In scope

- 3 agents running independently
- Jupiter swap adapter on devnet
- Privy signing integration
- Policy gate in Aegis
- Approved flow + rejected flow

### Out of scope

- Mainnet
- Production custody (HSM/MPC)
- Full dashboard UI

## Tech stack

- TypeScript + Bun
- `@solana/web3.js`
- `@solana/spl-token`
- Jupiter API
- Privy Node SDK
- SQLite
- Bun test

External demo clients (not part of Aegis core):

- Solana Agent Kit (SAK)
- OpenClaw
- OpenAI Agents SDK CLI (`scripts/agent-cli.tsx`)
- Any agent framework that can make HTTP requests

## Setup

### 1) Install

```bash
bun install
```

### 2) Configure

```bash
cp .env.example .env
```

Important vars:

```bash
SOLANA_RPC=https://api.devnet.solana.com
PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_SECRET=<privy-app-secret>
PRIVY_WALLET_POLICY_IDS=<optional-comma-separated-policy-ids>
LOG_LEVEL=info
```

App startup fails fast when `PRIVY_APP_ID` or `PRIVY_APP_SECRET` is missing.

### 3) Run

```bash
bun run start
```

This starts the Hono API server on `http://localhost:3000` by default.

OpenAPI docs are available at:

- `GET /openapi.json` (raw OpenAPI spec)
- `GET /docs` (Swagger UI)

### 4) Test

```bash
bun test
```

### 5) Demo

```bash
bun run demo:devnet
```

### 5b) Interactive agent CLI demo

Run one process per terminal and give each a unique name:

```bash
bun run demo:agent

# or explicit names
bun run scripts/agent-cli.tsx --name agent-alpha
bun run scripts/agent-cli.tsx --name agent-beta
bun run scripts/agent-cli.tsx --name agent-gamma
```

Then chat naturally in each terminal, e.g.:
- `register yourself in aegis`
- `create your wallet`
- `show your session`

### 6) Policy preflight

```bash
bun run policy:check
```

### 7) Live Privy wallet smoke test (real API calls)

```bash
bun run test:privy-live
```

## API endpoints (v1)

- `GET /health`
- `GET /openapi.json`
- `GET /docs`
- `POST /agents`
- `POST /agents/:agentId/wallet`
- `GET /agents/:agentId/wallet`
- `GET /agents/:agentId/balances`
- `POST /policies`
- `GET /policies`
- `POST /agents/:agentId/policies/:policyId`
- `GET /agents/:agentId/policies`
- `POST /intents/execute`
- `GET /agents/:agentId/executions?limit=50`

Agent-scoped endpoints require:

- `x-agent-id: <agentId>`
- `x-agent-api-key: <apiKey>`

## DB migrations (Drizzle)

Use migrations as the source of truth for schema changes.

### First-time setup

```bash
bun run db:generate
bun run start
```

`start` now applies pending migrations automatically before runtime work begins.
If you want to run migrations without starting the runtime, use `bun run aegis:init`.

### Normal workflow after schema changes

```bash
bun run db:generate
bun run start
```

### Dev-only fast sync (optional)

```bash
bun run db:push
```

Notes:

- Migrations are written to `/src/db/drizzle_migrations`.
- DB path comes from `AEGIS_DB_PATH` (default: `./data/aegis.db`).
- Commit migration files to git.

## How agents use Aegis

### Simple flow

Agent signs up -> gets `agentId` + `apiKey`
↓
Agent requests wallet -> gets wallet binding for that `agentId`
↓
Agent sends `execute_intent` requests with `ExecutionIntent`
↓
Aegis checks rules (input, limits, allowlists, simulation)
↓
If approved, Aegis asks Privy to sign
↓
Privy signs and returns signed tx for broadcast
↓
Private key never touches agent logic or app code

### Security pipeline (actual execution order)

1. Resolve agent wallet binding
2. Evaluate assigned Aegis DSL policies for that wallet
3. Evaluate baseline Aegis safety checks (global defaults)
4. Build transaction payload (adapter)
5. Run simulation gate
6. Request provider signature + broadcast
7. Persist decision logs and policy checks
8. Persist/replay idempotent results for repeated requests

If any step fails, execution is rejected with a reason code.

Typical rejected write responses now include a stable `reasonCode` plus optional `reasonDetail`, for example:

```json
{
  "status": "rejected",
  "reasonCode": "INSUFFICIENT_FUNDS",
  "reasonDetail": "Wallet does not have enough balance to complete this action.",
  "policyChecks": ["rpc_simulation"]
}
```

### ExecutionIntent example

```json
{
  "agentId": "agent-mm-01",
  "action": "swap",
  "fromMint": "So11111111111111111111111111111111111111112",
  "toMint": "<SPL_MINT>",
  "amountAtomic": "50000000",
  "maxSlippageBps": 100,
  "idempotencyKey": "9c8d8ef0-9d6f-4d2f-bf1f-278380d2e0d7"
}
```

### Manual devnet demo sequence

1. Create 3 agents
2. Create 3 wallets
3. Fund one or more wallet addresses on devnet
4. Ask one agent for its balance
5. Ask one agent to transfer SOL to another
6. Ask one agent to transfer an SPL token
7. Ask one agent to swap through Jupiter
8. Inspect execution logs for approved/rejected runs

## Why Aegis is the core security layer

Key management stays with Privy.

Policy and intent control stays with Aegis.

That means:

- agents keep autonomy to propose actions
- Aegis keeps authority to approve/reject actions
- provider only signs when Aegis already approved

This is the product edge: deterministic intent policy enforcement before signing.

## Canonical reason codes

Canonical reason codes are centralized in:

- `src/core/reasonCodes.ts`

Use these constants for API/UI handling instead of ad-hoc string literals.

## Terms

- `ExecutionIntent`: the structured request an agent sends to Aegis
- `approve`: Aegis allows signing and returns a tx signature
- `reject`: Aegis blocks signing and returns a reason code

## Security notes

This is a prototype, not production custody software.

Current protections:

- Agent never gets raw private key
- Signing is behind policy gates
- Privy handles primary key custody
- Simulation gate before broadcast
- Full approve/reject audit trail

## Project layout

```text
aegis-agent-wallet/
  src/
  docs/
  scripts/
  tests/
  README.md
  SKILLS.md
  .env.example
```

## Documentation

- Skills: `SKILLS.md`
- Deep dive: `docs/architecture.md`

## License

MIT
