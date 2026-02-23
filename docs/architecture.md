# Aegis Architecture Deep Dive

## 1. Problem Statement

Autonomous AI agents on Solana require wallet infrastructure that balances execution autonomy with explicit safety constraints.

User-centric wallets assume human approval; agentic wallets require deterministic controls around:

- Key custody
- Signing authority
- Transaction scope
- Runtime risk management

Aegis proposes a wallet kernel architecture where autonomous decisions are allowed, but signatures are policy-gated.

Locked implementation direction for this submission:

- Agent interface and orchestration: Solana Agent Kit
- Execution policy and risk controls: Aegis kernel
- Signing/key management: Openfort backend wallets (primary)
- Reliability fallback: local signer provider

## 2. System Architecture

Aegis is composed of four layers:

1. Agent Runtime
2. Wallet Engine
3. Policy Engine
4. Protocol Adapters

Execution flow:

1. Solana Agent Kit strategy generates an intent
2. Protocol adapter constructs transaction candidate
3. Policy engine evaluates the transaction
4. Signer engine signs only if approved through wallet provider
5. Transaction is broadcast to devnet
6. Audit logs and state are persisted

## 3. Component Design

### 3.1 Agent Runtime

Responsibilities:

- Execute strategy loops on a fixed cadence
- Build structured intents (action, amount, token pair, rationale)
- Submit intents to wallet kernel

Security property:

- No private key access
- No direct signing capability

Implementation note:

- Runtime implemented with Solana Agent Kit and constrained tools

### 3.2 Wallet Engine

Responsibilities:

- Manage wallet provider routing (`openfort` or `local`)
- Provision agent wallets programmatically
- Submit approved signing requests to provider implementation

Security property:

- Agent runtime never receives signing keys
- Signing path remains behind policy gates

Provider model:

- Openfort provider (primary): managed backend wallet signing
- Local provider (fallback): encrypted key storage for local execution

### 3.3 Policy Engine

Responsibilities:

- Inspect instructions and required programs
- Enforce allowlisted program IDs
- Enforce allowlisted token mints
- Enforce per-tx and daily notional caps
- Gate signing on successful simulation

Security property:

- Signing authority is contingent on deterministic policy evaluation
- Policy enforcement is provider-agnostic and cannot be bypassed by agent tools

### 3.4 Protocol Adapters

Responsibilities:

- Translate agent intents into protocol-specific transaction data
- Isolate integration details from core signing logic

Current adapter:

- Jupiter swap flow (devnet)

Future adapters can include lending and LP interactions with no changes to signing core.

## 4. Data and State Model

SQLite stores:

- Agent profiles and policy configurations
- Intent history and execution outcomes
- Rejections with explicit reason codes
- Provider metadata and wallet references

This supports reproducibility, debugging, and compliance-style auditability.

## 5. Security Model

### 5.1 Key Management

Primary mode (Openfort):

- Signing keys managed by Openfort backend wallet infrastructure
- Aegis uses API credentials and policy-scoped signing calls
- Direct private key handling is removed from agent runtime

Fallback mode (local):

- Private keys encrypted with AES-256-GCM
- Master key provided through environment/configuration at runtime
- Nonce and auth tag stored alongside ciphertext

Limitations (prototype):

- Openfort introduces third-party dependency and service trust assumptions
- Local fallback has weaker guarantees than managed or hardware-backed custody

### 5.2 Signing Controls

A transaction can be signed only if all checks pass:

- Program IDs are allowlisted
- Token mints are allowlisted
- Notional is below per-transaction cap
- Daily spend is within configured budget
- RPC simulation returns success

Failure at any step produces a hard reject with reason code.

### 5.3 Openfort Policy Semantics (Provider Layer)

In Openfort mode, provider-side policy authorization adds an external signing gate:

- Policies are evaluated in priority order
- Criteria inside each rule are AND-composed
- First matching rule decides accept/reject
- No matching rule is rejected (fail-closed)

This is intentionally paired with Aegis kernel checks for defense-in-depth.

MVP policy profile:

1. Allow `signSolTransaction` for only allowlisted destinations/programs
2. Enforce SOL per-transaction lamport cap
3. Enforce SPL mint allowlist and per-transaction value caps
4. Reject unknown/high-risk patterns explicitly where useful
5. Implicitly reject everything else by fail-closed default

Operational expectation:

- Run policy preflight (`openfort.policies.evaluate`) in test/demo scripts
- Record matched policy/rule IDs in audit logs when available

### 5.4 Threat Considerations

Threats and mitigations:

- Rogue strategy logic: mitigated by kernel-side policy gating
- Overspending due to loop bugs: mitigated by tx and daily caps
- Unauthorized protocol calls: mitigated by program allowlist
- Malformed transactions: mitigated by instruction inspection and simulation
- Key exfiltration from storage: mitigated by encryption at rest
- Unauthorized signing requests: mitigated by provider auth + Aegis policy gate

Residual risks (prototype):

- Runtime host compromise can expose in-memory secrets
- Single-process architecture has blast-radius concentration

## 6. AI Agent Interaction Model

Aegis enforces strict separation between reasoning and execution.

- The Solana Agent Kit layer can propose actions
- The wallet kernel decides if execution is permitted
- Signing authority never moves to the AI layer

This model provides controllable autonomy:

- Agents remain productive and autonomous
- Operators retain deterministic risk boundaries
- System behavior is inspectable through audit logs

## 7. Multi-Agent Scalability

Each agent has:

- Its own wallet
- Its own policy profile
- Its own strategy state

Scalability is achieved through isolation and stateless adapters. Shared infrastructure (RPC, DB, scheduler) can be scaled independently as load increases.

## 8. MVP to Production Path

MVP:

- Single process
- SQLite
- Devnet only
- Solana Agent Kit runtime for agent orchestration
- Openfort backend wallet as primary signer
- Local provider fallback for reliability testing

Production direction:

- Dedicated signer service boundary
- HSM or MPC-backed key custody
- Postgres and append-only audit ledger
- Queue-based orchestration and retries
- Policy-as-code with versioned rollout
- Alerting and anomaly detection

## 9. Devnet Demonstration Plan

The demonstration should include:

- Multiple agent wallets created programmatically
- Successful SOL/SPL protocol interaction
- At least one policy-approved transaction
- At least one policy-rejected transaction
- Logged tx signatures and reject reasons
- Terminal demo driven by Solana Agent Kit tool calls

This proves both autonomous capability and security controls.

## 10. Conclusion

Aegis demonstrates a practical architecture for agentic wallets on Solana:

- Autonomous decision-making with constrained execution
- Secure key handling via managed backend signing (Openfort primary)
- Policy-driven signing to reduce risk
- Multi-agent support with isolation and observability

It is intentionally designed as a robust prototype that can evolve toward production-grade autonomous financial infrastructure.
