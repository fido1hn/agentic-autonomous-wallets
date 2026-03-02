# Aegis - Autonomous Agent Wallet Framework for Solana

Aegis is a wallet execution layer for AI agents on Solana devnet.

It lets agents act on-chain, but only inside strict safety rules.

## What Aegis does

- Creates wallets for agents
- Lets agents send structured intents
- Checks policy before any signature is allowed
- Signs through Privy-managed wallets
- Logs every approve/reject decision

## Core idea

Agents can decide what to do.

Agents cannot sign directly.

Aegis is the gate between agent decisions and wallet signatures.

## Core features

- Programmatic wallet creation per agent
- Privy-based signing path
- Policy checks: assigned DSL rules + baseline limits + simulation
- Explicit policy precedence via assignment priority
- Agent-owned policy library with archive-only lifecycle
- DSL v1 + v2 compatibility for policy definitions
- Durable daily spend accounting (DB-backed)
- Idempotent intent execution by `agentId + idempotencyKey`
- Per-tx cap and daily cap controls
- Recipient, protocol, swap-pair, and action-scoped policy controls
- Structured audit logs for every intent

## Tech stack

- TypeScript + Bun
- `@solana/web3.js`
- `@solana/spl-token`
- Orca Whirlpools
- Raydium Trade API
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

### 1) Clone the repo

```bash
git clone https://github.com/fido1hn/agentic-autonomous-wallets.git
cd agentic-autonomous-wallets
```

### 2) Install dependencies

```bash
bun install
```

### 3) Configure environment

```bash
cp .env.example .env
```

Required runtime vars:

```bash
SOLANA_RPC=https://api.devnet.solana.com
AEGIS_DB_PATH=./data/aegis.db
PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_SECRET=<privy-app-secret>
LOG_LEVEL=info
OPENAI_API_KEY=<only needed for the demo agent CLI>
JUPITER_QUOTE_URL=https://lite-api.jup.ag/swap/v1/quote
JUPITER_SWAP_URL=https://lite-api.jup.ag/swap/v1/swap
```

App startup fails fast when `PRIVY_APP_ID` or `PRIVY_APP_SECRET` is missing.
The interactive agent CLI additionally requires `OPENAI_API_KEY`.

### 4) Start the API

```bash
bun run start
```

This starts the Hono API server on `http://localhost:3000` by default.
Pending DB migrations are applied automatically on startup.

OpenAPI docs are available at:

- `GET /openapi.json` (raw OpenAPI spec)
- `GET /docs` (Swagger UI)

### 5) Test

```bash
bun test
```

### 6) Interactive agent CLI demo

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

### 7) Policy preflight

```bash
bun run policy:check
```

### 8) Live Privy wallet smoke test (real API calls)

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
- `GET /policies/:policyId`
- `PATCH /policies/:policyId`
- `DELETE /policies/:policyId`
- `POST /agents/:agentId/policies/:policyId`
- `DELETE /agents/:agentId/policies/:policyId`
- `GET /agents/:agentId/policies`
- `POST /intents/execute`
- `GET /agents/:agentId/executions?limit=50`

Agent-scoped endpoints require:

- `x-agent-id: <agentId>`
- `x-agent-api-key: <apiKey>`

## DB migrations (Drizzle)

Use migrations as the source of truth for schema changes.

### First run

```bash
bun run start
```

You do not need to run `bun run db:generate` before `bun run start` unless you changed the schema locally and need to create a new migration file.

`start` applies pending migrations automatically before runtime work begins.
If you want to apply migrations without starting the API, use `bun run aegis:init`.

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

1. Agent signs up and gets `agentId` + `apiKey`
2. Agent requests a wallet and gets a wallet binding for that `agentId`
3. Agent sends `execute_intent` requests with `ExecutionIntent`
4. Aegis checks rules: input, limits, allowlists, and simulation
5. If approved, Aegis asks Privy to sign
6. Privy signs and the provider path broadcasts the transaction
7. Aegis returns the transaction result
8. Private key material never touches agent logic or app code

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

Rejected responses include stable reason codes. Detailed request and response examples are in `docs/architecture.md`.

### Policy lifecycle

Policies are owned by the creating agent and can be created, assigned, updated, unassigned, disabled, or archived.

### Policy DSL v2

Aegis now supports both:

- `aegis.policy.v1`
- `aegis.policy.v2`

v1 policies continue to work unchanged.

v2 keeps the same flat `rules[]` model and adds stronger wallet controls:

- `allowed_recipients`
- `blocked_recipients`
- `allowed_swap_pairs`
- `allowed_swap_protocols`
- `max_lamports_per_day_by_action`
- `max_lamports_per_tx_by_action`
- `max_lamports_per_tx_by_mint`

Detailed policy examples are in `docs/architecture.md`.

### Policy demo flow

The current runtime supports:

1. Create a policy
2. Assign it to the wallet
3. Trigger a rejection
4. Inspect `policyMatch` to see the exact blocking rule
5. Update the policy
6. Retry the same action successfully

### Swap backend behavior

- `auto` prefers `orca` on devnet
- `raydium` is available explicitly
- `jupiter` is mainnet-only in this build
- detailed backend behavior and payload examples are in `docs/architecture.md`

### Manual devnet demo sequence

1. Create 3 agents
2. Create 3 wallets
3. Fund one or more wallet addresses on devnet
4. Ask one agent for its balance
5. Ask one agent to transfer SOL to another
6. Ask one agent to transfer an SPL token
7. Ask one agent to swap SOL to USDC through Orca on devnet
8. Inspect execution logs for approved/rejected runs

## What The Demo Proves

- [x] an agent can register itself and receive API credentials
- [x] an agent can provision its own wallet
- [x] an agent can read native SOL and SPL balances
- [x] an agent can transfer SOL and SPL tokens
- [x] an agent can swap on Solana devnet
- [x] an agent can create, assign, update, and archive wallet policies
- [x] Aegis can reject actions before signing and explain the exact blocking policy rule

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

## Known Limits

- This submission is explicitly devnet-first.
- Privy is the only active custody/signing backend in v1.
- Token symbol resolution is intentionally narrow for the demo:
  - `SOL` is resolved automatically
  - `USDC` is resolved automatically
  - other tokens should be provided by mint address
- Swap availability still depends on devnet liquidity and protocol support.
- Policy DSL v2 is intentionally flat; nested boolean logic is not part of this submission.

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
