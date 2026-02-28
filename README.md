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

## Why Aegis

Wallet providers protect keys.

Aegis protects execution.

That is the distinction in this project:

- Privy handles custody and signing infrastructure
- Aegis decides what an agent is allowed to do before any signing request is sent
- agents stay autonomous, but not unchecked

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

## MVP scope

### In scope

- 3 agents running independently
- Orca swap adapter preferred on devnet
- Raydium swap adapter available explicitly
- Jupiter swap adapter available for mainnet-only paths
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

### 1) Install

```bash
bun install
```

### 2) Configure

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
Privy signs (and provider path broadcasts) -> Aegis returns tx execution result
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

When a rejection comes from an assigned DSL policy, the result now also includes `policyMatch` so agents can explain exactly what blocked the action:

```json
{
  "status": "rejected",
  "reasonCode": "POLICY_DSL_MAX_PER_TX_EXCEEDED",
  "reasonDetail": "Requested amount exceeds configured policy max.",
  "policyChecks": [
    "assigned_policies",
    "policy:pol_123:active",
    "rule:max_lamports_per_tx:pol_123"
  ],
  "policyMatch": {
    "policyId": "pol_123",
    "policyName": "Transfer cap",
    "ruleKind": "max_lamports_per_tx",
    "ruleConfig": {
      "lteLamports": "100000000"
    }
  }
}
```

### Policy lifecycle

Policies are now owned by the creating agent.

That means:

- `GET /policies` is a personal policy library, not a global list
- policies can exist unassigned
- policies can be assigned or unassigned from the agent wallet
- `DELETE /policies/:policyId` archives the policy instead of removing it
- archived policies cannot be edited or newly assigned
- disabled policies may remain assigned but are skipped during evaluation

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

Example v2 policy:

```json
{
  "name": "Only Orca SOL -> USDC swaps",
  "dsl": {
    "version": "aegis.policy.v2",
    "rules": [
      { "kind": "allowed_actions", "actions": ["swap"] },
      { "kind": "allowed_swap_protocols", "protocols": ["orca"] },
      {
        "kind": "allowed_swap_pairs",
        "pairs": [
          {
            "fromMint": "So11111111111111111111111111111111111111112",
            "toMint": "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"
          }
        ]
      }
    ]
  }
}
```

### Policy demo flow

The current runtime supports:

1. Create a policy
2. Assign it to the wallet
3. Trigger a rejection
4. Inspect `policyMatch` to see the exact blocking rule
5. Update the policy
6. Retry the same action successfully

### Swap backend behavior

- `swapProtocol: "auto"` selects the best backend for the current environment
- `auto` now prefers `orca`
- `raydium` remains available explicitly
- `jupiter` remains available explicitly and is still mainnet-only in this build
- explicit Jupiter requests on devnet are rejected with `JUPITER_MAINNET_ONLY`
- token resolution for the demo is intentionally narrow:
  - `SOL` resolves to wrapped SOL
  - `USDC` resolves automatically by environment and selected swap protocol
    - devnet `auto`/`orca` -> Orca devUSDC `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k`
    - devnet `raydium` -> standard devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
    - mainnet -> `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - any other output token must be provided as a mint address

### ExecutionIntent example

```json
{
  "agentId": "agent-mm-01",
  "action": "swap",
  "swapProtocol": "auto",
  "fromMint": "So11111111111111111111111111111111111111112",
  "toMint": "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k",
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
