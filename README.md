# Aegis - Autonomous Agent Wallet Framework for Solana

Aegis is a wallet execution layer for AI agents on Solana devnet.

It lets agents act on-chain, but only inside strict safety rules.

## What Aegis does

- Creates wallets for agents
- Lets agents send structured intents
- Checks policy before any signature is allowed
- Signs through Openfort (primary) or local signer (fallback)
- Logs every approve/reject decision

## Locked stack (this submission)

- Agent runtime: Solana Agent Kit (SendAI)
- Execution and policy layer: Aegis
- Signing and key custody: Openfort Backend Wallets (primary)
- Fallback signing mode: local signer
- Network: Solana devnet

## Core idea

Agents can decide what to do.

Agents cannot sign directly.

Aegis is the gate between agent decisions and wallet signatures.

## Core features

- Programmatic wallet creation per agent
- Openfort-based signing path
- Local fallback signing path
- Policy checks: limits, allowlists, simulation
- Per-tx cap and daily cap controls
- Structured audit logs for every intent

## MVP scope

### In scope

- 3 agents running independently
- Jupiter swap adapter on devnet
- Solana Agent Kit terminal loop
- Openfort signing integration
- Policy gate in Aegis
- Approved flow + rejected flow

### Out of scope

- Mainnet
- Production custody (HSM/MPC)
- Full dashboard UI

## Tech stack

- TypeScript + Node.js
- Solana Agent Kit
- `@solana/web3.js`
- `@solana/spl-token`
- Jupiter API
- Openfort Backend Wallets
- SQLite
- Vitest

## Setup

### 1) Install

```bash
npm install
```

### 2) Configure

```bash
cp .env.example .env
```

Important vars:

```bash
SOLANA_RPC=https://api.devnet.solana.com
WALLET_PROVIDER=openfort
OPENFORT_API_URL=<openfort-api-url>
OPENFORT_PUBLISHABLE_KEY=<openfort-publishable-key>
OPENFORT_BACKEND_WALLET_SECRET=<openfort-wallet-secret>
OPENFORT_POLICY_IDS=<comma-separated-policy-ids>
LOG_LEVEL=info
```

Local fallback mode:

```bash
WALLET_PROVIDER=local
MASTER_ENCRYPTION_KEY=<64-char-hex-key>
```

### 3) Run

```bash
npm run start
```

### 4) Test

```bash
npm test
```

### 5) Demo

```bash
npm run demo:devnet
```

### 6) Policy preflight

```bash
npm run policy:check
```

## DB migrations (Drizzle)

Use migrations as the source of truth for schema changes.

### First-time setup

```bash
bun run db:generate
bun run aegis:init
```

### Normal workflow after schema changes

```bash
bun run db:generate
bun run db:migrate
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

Agent signs up -> gets `agentId` + wallet
↓
Aegis gives that agent its own isolated wallet context
↓
Agent sends `execute_intent` requests with `ExecutionIntent`
↓
Aegis checks rules (input, limits, allowlists, simulation)
↓
If approved, Aegis asks Openfort to sign
↓
Openfort signs and returns tx signature
↓
Private key never touches agent logic or app code

### ExecutionIntent example

```json
{
  "agentId": "agent-mm-01",
  "action": "swap",
  "fromMint": "So11111111111111111111111111111111111111112",
  "toMint": "<SPL_MINT>",
  "amountLamports": "50000000",
  "maxSlippageBps": 100,
  "idempotencyKey": "9c8d8ef0-9d6f-4d2f-bf1f-278380d2e0d7"
}
```

## Openfort policy profile (MVP)

Aegis uses two safety layers:

- Inner layer: Aegis policy checks
- Outer layer: Openfort policy checks

Openfort policy behavior used here:

- Priority order matters
- Rule criteria use AND logic
- First matching rule decides
- No match means reject (fail-closed)

MVP policy set:

1. Allow only intended Solana signing operation
2. Enforce SOL per-tx cap
3. Enforce SPL mint allowlist + value caps
4. Optionally add explicit reject rules
5. Reject everything else by default

## Terms

- `ExecutionIntent`: the structured request an agent sends to Aegis
- `approve`: Aegis allows signing and returns a tx signature
- `reject`: Aegis blocks signing and returns a reason code

## Security notes

This is a prototype, not production custody software.

Current protections:

- Agent never gets raw private key
- Signing is behind policy gates
- Openfort handles primary key custody
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
