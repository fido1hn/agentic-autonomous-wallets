# Aegis Agent Skill Registry

This file defines the capabilities available to agents in Aegis and the constraints under which they operate.

Agents are not trusted signers. They can only request actions from the wallet kernel. The kernel signs only if policy checks pass.

For this submission, agent orchestration is handled through Solana Agent Kit, while signing is executed through the Aegis wallet provider interface.

## Skill Domains

### Trading Skills

- Request SOL <-> SPL token swaps via Jupiter adapter
- Query balances and recent fills
- Estimate expected output and slippage bounds
- Submit execution intents for policy review

### Risk and Policy Skills

- Enforce max amount per transaction
- Enforce cumulative daily spend caps
- Enforce allowed program IDs
- Enforce allowed token mint lists
- Require RPC simulation success before signing
- Apply fail-closed provider policy checks (no match => reject)
- Support Openfort preflight policy evaluation before live execution
- Reject high-risk or malformed intents with reason codes

### Treasury and Accounting Skills

- Track per-wallet balances over time
- Track realized and unrealized PnL deltas (where applicable)
- Maintain transaction and rejection history
- Report exposure by token and by agent

### Execution Skills

- Generate new wallets programmatically
- Route signing to Openfort backend wallets (primary mode)
- Use local encrypted signer as fallback mode
- Sign valid transactions automatically after policy approval
- Broadcast signed transactions to Solana devnet

### Strategy Skills

- Timed rebalance execution
- Threshold-triggered execution
- Deterministic tick-based decision loops
- Configurable cadence and guardrails per agent

## Agent Restrictions

Agents cannot:

- Read raw private keys
- Bypass policy evaluation
- Sign arbitrary transactions directly
- Interact with non-allowlisted programs
- Transfer unrestricted amounts outside configured limits

## Separation of Responsibilities

- Solana Agent Kit runtime: decides what to do
- Protocol adapter: builds candidate transaction instructions
- Policy engine: validates whether action is permitted
- Wallet provider: executes signing (`openfort` primary, `local` fallback)
- Signer engine: signs only policy-approved transactions through the provider
- Openfort policy layer: enforces first-match authorization with fail-closed defaults

This separation is foundational to Aegis security.
