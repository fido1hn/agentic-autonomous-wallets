# Aegis – Autonomous Agent Wallet Framework for Solana

Aegis is a multi-agent autonomous wallet framework built on Solana devnet. It demonstrates secure, policy-constrained, programmatic wallet control for AI agents executing real on-chain transactions without human intervention.

This project is designed for the agentic wallet bounty and emphasizes practical, portfolio-grade engineering:

- Deterministic wallet operations for autonomous agents
- Security-first key handling and policy-gated signing
- Clear separation between agent decision-making and wallet execution
- Multi-agent scalability with isolated wallets and risk profiles
- Terminal-first demo flow with real agent orchestration

## Goals

Aegis demonstrates an end-to-end prototype where autonomous agents can:

- Create wallets programmatically
- Hold SOL and SPL tokens on devnet
- Propose transactions based on strategy logic
- Sign transactions automatically through a controlled wallet kernel
- Interact with a real Solana protocol (Jupiter on devnet)
- Enforce policy constraints before any signature is produced

Locked stack for this submission:

- Agent runtime and interface: Solana Agent Kit (SendAI)
- Policy and execution control plane: Aegis kernel
- Signing and key management (primary): Openfort Backend Wallets
- Fallback provider (for local testing): local software signer

## Why This Matters

AI agents need wallet infrastructure that is not just functional, but safe by default. Traditional user wallets assume a human in the loop; Aegis assumes autonomous software in the loop and introduces explicit guardrails to reduce risk.

## Core Features

- Programmatic wallet creation per agent
- Openfort-backed signing and key custody (primary mode)
- Local signer fallback for development and failure isolation
- Policy-constrained transaction signing
- RPC simulation gate before broadcast
- Program allowlist and token allowlist checks
- Per-transaction max amount limits
- Daily spend caps per agent
- Independent multi-agent execution loops
- Structured logs and audit trail of intents, approvals, rejections, and tx signatures

## Proposed MVP Scope

### In scope (MVP)

- 3 autonomous agents running independently
- 1 protocol adapter: Jupiter swap flow on devnet
- Solana Agent Kit integration (terminal agent loop)
- Openfort backend wallet integration for signing
- Policy engine + signing gate in Aegis
- Devnet airdrop bootstrap and balance checks
- Positive path (approved tx) and negative path (rejected tx)
- Local signer fallback path for demo resilience

### Out of scope (MVP)

- Mainnet deployment
- Production custody (HSM, MPC)
- Advanced UI dashboard (CLI-first for reliability)

## Tech Stack

- Language/runtime: TypeScript, Node.js (LTS)
- Agent framework: Solana Agent Kit (SendAI)
- Solana SDK: `@solana/web3.js`
- SPL support: `@solana/spl-token`
- Protocol integration: Jupiter API/adapter (devnet)
- Managed signer/key provider: Openfort Backend Wallets
- Storage: SQLite
- Config/env: `dotenv`
- Validation: `zod`
- Logging: `pino`
- Testing: Vitest (unit), integration scripts for devnet flow

## Setup

### 1. Prerequisites

- Node.js 20+
- npm 10+
- Solana CLI (optional but recommended for inspection)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required environment variables:

```bash
SOLANA_RPC=https://api.devnet.solana.com
WALLET_PROVIDER=openfort
OPENFORT_API_URL=<openfort-api-url>
OPENFORT_PUBLISHABLE_KEY=<openfort-publishable-key>
OPENFORT_BACKEND_WALLET_SECRET=<openfort-wallet-secret>
OPENFORT_POLICY_IDS=<comma-separated-policy-ids>
LOG_LEVEL=info
```

Optional local fallback signer variables:

```bash
WALLET_PROVIDER=local
MASTER_ENCRYPTION_KEY=<64-char-hex-key>
```

### 4. Run the prototype

```bash
npm run start
```

Expected runtime behavior:

- Agent wallets are created (Openfort or local mode)
- Wallets receive devnet airdrops when needed
- Solana Agent Kit evaluates strategy ticks
- Transaction intents are policy-checked
- Approved intents are signed and broadcast
- Rejected intents are logged with explicit reasons

### 5. Run tests

```bash
npm run test
```

Optional devnet integration flow:

```bash
npm run demo:devnet
```

Optional policy preflight checks:

```bash
npm run policy:check
```

## Suggested Repository Layout

```text
aegis-agent-wallet/
  src/
    core/
      agentRuntime.ts
      scheduler.ts
      intentRouter.ts
      walletProvider.ts
    agent/
      sakRunner.ts
      tools/
        executeIntentTool.ts
    wallet/
      walletFactory.ts
      encryption.ts
      signerEngine.ts
      policyEngine.ts
      providers/
        openfortProvider.ts
        localProvider.ts
    protocols/
      jupiterAdapter.ts
    strategies/
      timedRebalance.ts
      thresholdTrigger.ts
    db/
      sqlite.ts
    observability/
      auditLog.ts
      logger.ts
    types/
      policy.ts
      intents.ts
  docs/
    architecture.md
  scripts/
    demo.ts
  tests/
    policyEngine.test.ts
    signingFlow.test.ts
  SKILLS.md
  README.md
  .env.example
```

## How Agents Integrate with Aegis

Aegis is an execution backend for AI agents. Agents make decisions; Aegis controls signing and transaction safety.

### Integration flow

1. Solana Agent Kit strategy decides an action (`swap`, `rebalance`, `transfer`)
2. Agent submits an `ExecutionIntent`
3. Aegis builds a candidate transaction via protocol adapters
4. Policy engine validates constraints and simulation
5. If approved, signer executes via `WalletProvider` (`openfort` or `local`)
6. Aegis returns `approved + txSignature` or `rejected + reasonCode`

### Integration mode A: SDK (in-process)

```ts
import { executeIntent } from "./src/core/agentRuntime";

const result = await executeIntent({
  agentId: "agent-mm-01",
  action: "swap",
  fromMint: "So11111111111111111111111111111111111111112",
  toMint: "<SPL_MINT>",
  amountLamports: "50000000",
  maxSlippageBps: 100
});
```

Agent tool wiring example:

```ts
import { createSolanaAgent } from "./src/agent/sakRunner";

const agent = await createSolanaAgent({
  tools: ["execute_intent"]
});
```

### Integration mode B: Service API (out-of-process)

```http
POST /v1/intents/execute
Content-Type: application/json
```

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

Example response (approved):

```json
{
  "status": "approved",
  "provider": "openfort",
  "txSignature": "<DEVNET_TX_SIGNATURE>",
  "policyChecks": [
    "program_allowlist",
    "token_allowlist",
    "max_per_tx",
    "daily_cap",
    "rpc_simulation"
  ]
}
```

Example response (rejected):

```json
{
  "status": "rejected",
  "reasonCode": "POLICY_DAILY_CAP_EXCEEDED",
  "message": "Daily spend cap exceeded for agent-mm-01"
}
```

## Demo and Judging Alignment

This prototype is explicitly designed to satisfy bounty requirements:

- Working agentic wallet with programmatic wallet generation
- Automated transaction signing
- SOL/SPL wallet support
- Test protocol interaction on devnet
- Clear security and architecture documentation
- Open-source setup and reproducible run instructions
- Agent runtime integrated through Solana Agent Kit
- Secure signing path through Openfort backend wallets

## Openfort Policy Profile (MVP)

Aegis uses defense-in-depth:

- Inner gate: Aegis policy engine (instruction + simulation checks)
- Outer gate: Openfort policy engine (provider-level authorization)

Openfort policy behavior relied on by this MVP:

- Policies evaluated by priority
- Rules in a policy are AND-composed
- First matching rule decides (`accept` or `reject`)
- Fail-closed default (no match means reject)

MVP Solana policy set (initial):

1. `accept` `signSolTransaction` only for allowlisted destination/program addresses
2. `accept` SOL transfers below per-tx lamport cap
3. `accept` SPL transfers for allowlisted mint addresses and recipients within value caps
4. Optional explicit `reject` rules for high-risk patterns
5. Implicit reject for everything else (fail-closed)

Implementation guidance:

- Keep rules minimal and deterministic (3-5 rules for MVP)
- Log matched policy/rule IDs in execution audit records
- Run `openfort.policies.evaluate()` in preflight tests before live signing

## Security Notes

Aegis is a prototype. It demonstrates sound patterns, but it is not production custody software.

Current safety model includes:

- Openfort-managed key custody and signing isolation (primary mode)
- Local encrypted signer fallback for development (non-primary)
- Policy-gated signature path
- Fail-closed authorization via Openfort policies
- Instruction-level and token/program allowlist checks
- Simulation before broadcast

Production hardening path includes HSM/MPC, stronger secret distribution, and isolated signing services.

## Locked Delivery Plan

This documentation locks the implementation direction for the submission:

1. Build terminal demo with Solana Agent Kit producing `ExecutionIntent`.
2. Route all signing through Aegis policy checks.
3. Execute approved signatures through Openfort backend wallets.
4. Keep local signer as fallback provider for reliability.
5. Demonstrate one approved and one rejected transaction per policy.

## Documentation

- Skills and agent capabilities: `SKILLS.md`
- Full architecture deep dive: `docs/architecture.md`

## License

MIT
