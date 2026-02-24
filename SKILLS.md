# Aegis Agent Skill Registry

This file lists what agents can do in Aegis.

Rule: agents can request actions, but cannot sign directly.

Simple model:

Agent decides -> Aegis validates -> provider signs

## Skill groups

### Trading

- Request SOL/SPL swaps via Jupiter adapter
- Query balances and recent results
- Submit execution intents

### Risk and policy

- Enforce per-tx limits
- Enforce daily caps
- Enforce allowlisted programs and tokens
- Enforce simulation gate
- Enforce fail-closed behavior

### Treasury and tracking

- Track balances
- Track execution history
- Track rejects and reason codes

### Execution

- Create wallets per agent
- Route signing to Openfort (primary)
- Use local signer as fallback
- Broadcast approved transactions

### Strategy

- Timed rebalance logic
- Threshold-trigger logic
- Deterministic loops

## Restrictions

Agents cannot:

- Access raw private keys
- Bypass policy checks
- Sign arbitrary transactions
- Use non-allowlisted programs
- Spend outside configured limits

## Responsibility split

- Solana Agent Kit: decides actions
- Protocol adapter: builds tx
- Policy engine: validates action
- Wallet provider: signs (`openfort` primary, `local` fallback)
- Signer engine: executes only after approval

This split is the safety foundation.
