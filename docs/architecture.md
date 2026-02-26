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

Execution flow in system terms:

1. Agent creates intent
2. Adapter builds transaction
3. Policy engine checks it
4. Signer requests provider signature
5. Transaction is broadcast
6. Result is logged

## 3. Component responsibilities

### 3.1 External agent client

- Runs strategy loop outside Aegis
- Produces structured intents
- Calls Aegis API
- Never signs directly

### 3.2 Wallet Engine

- Routes signing to `privy` wallet APIs
- Resolves wallet per agent
- Sends only approved requests to signer

### 3.3 Policy Engine

- Validates intent shape
- Checks allowlists and limits
- Enforces daily/per-tx caps
- Requires simulation gate

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

- Allowed programs/tokens
- Value limits
- Daily spend cap
- Simulation gate

Any failed check => reject with reason code.

### 5.3 Privy policy semantics

- Policies run by priority
- Rule criteria use AND logic
- First match decides allow/reject
- No match => reject (fail-closed)

MVP policy profile:

1. Restrict signing operation scope
2. Enforce SOL value caps
3. Enforce SPL mint/value rules
4. Use explicit rejects for risky patterns
5. Rely on fail-closed default

## 6. AI interaction model

- Agent decides
- Aegis validates
- Provider signs

This gives controlled autonomy.

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

That is the core of a safe agent wallet system.
