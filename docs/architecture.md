# Aegis Architecture Deep Dive

## 1. Problem

AI agents can act fast, but wallet signing must stay controlled.

If agents can sign anything directly, risk is too high.

Aegis solves this by separating:

- Agent decision-making
- Wallet signing authority

## 2. Architecture (simple)

Aegis has 4 layers:

1. API Runtime (Hono on Bun)
2. Wallet Engine (provider routing)
3. Policy Engine (risk checks)
4. Protocol Adapters (Jupiter now)

Submission flow:

Agent signs up -> gets `agentId` + wallet
↓
Aegis gives that agent its own isolated wallet context
↓
Agent sends `execute_intent` requests with `ExecutionIntent`
↓
Aegis checks input + policy + simulation
↓
If approved, Aegis requests signature from Privy
↓
Privy signs and returns a signed transaction for broadcast
↓
Private key never touches agent logic or app code

Execution flow in system terms (current runtime):

1. Agent submits `ExecutionIntent`
2. Aegis resolves wallet binding
3. Assigned DSL policies are evaluated
4. Baseline Aegis policies are evaluated
5. Protocol adapter builds transaction
6. Simulation gate validates tx safety
7. Provider signs and tx is broadcast
8. Execution result + checks are logged

## 3. Component responsibilities

### 3.1 External agent client

- Runs strategy loop outside Aegis
- Produces structured intents
- Calls Aegis API
- Never signs directly

### 3.2 Wallet Engine

- Routes signing to `privy` wallet APIs
- Resolves wallet per agent
- Sends only already-approved requests to signer

### 3.3 Policy Engine

- Enforces assigned DSL policy rules per wallet
- Enforces baseline global guardrails
- Enforces simulation gate
- Returns deterministic reason codes for rejects

Current DSL v1 rule set:

- `allowed_actions`
- `max_lamports_per_tx`
- `allowed_mints`
- `max_slippage_bps`

### 3.4 Protocol Adapter

- Converts intent to protocol tx format
- Keeps protocol logic out of core runtime

Current adapter: Jupiter (devnet)

## 4. Data model

SQLite stores:

- Agent and wallet metadata
- Policy references
- Intent and tx outcomes
- Rejection reasons

## 5. Security model

### 5.1 Key custody

Signing mode (`privy`):

- Keys managed by Privy
- Aegis never receives raw private key

### 5.2 Signing controls

A tx is signed only when all checks pass:

- Assigned wallet policy checks
- Baseline intent checks (amount, caps, shape)
- Simulation gate

Any failed check => reject with reason code.

### 5.3 Inner vs outer controls

- Inner control (Aegis): intent + policy decisions before signing
- Outer control (Privy): key custody and signing infrastructure

This keeps custody concerns separate from product policy logic.

## 6. AI interaction model

- Agent decides
- Aegis validates
- Provider signs

This gives controlled autonomy with deterministic safety gates.

## 7. Scalability model

Each agent has:

- Isolated wallet context
- Isolated policy profile
- Independent strategy loop

Shared infrastructure can scale later.

## 8. MVP boundaries

MVP includes:

- Hono API runtime
- Privy signing
- Devnet execution
- Approved + rejected demo flows

MVP excludes:

- Mainnet production custody
- HSM/MPC
- Full distributed production architecture

## 9. Demo requirements

Demo must show:

- Multi-agent wallet setup
- Real Solana interaction on devnet
- One approved tx
- One rejected tx
- Audit logs with reason codes and signatures

## 10. Conclusion

Aegis gives agents useful autonomy while keeping signing tightly controlled.

The core value is not custody alone.

The core value is intent + policy orchestration that is provider-agnostic and enforced before signing.

That is the core of a safe agent wallet system.
