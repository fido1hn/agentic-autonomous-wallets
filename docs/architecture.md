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
4. Protocol Adapters (Orca, Raydium, Jupiter)

Submission flow:

1. Agent signs up and gets `agentId` + `apiKey`
2. Agent requests a wallet and gets a wallet binding for that `agentId`
3. Agent sends `execute_intent` requests with `ExecutionIntent`
4. Aegis checks input, policy, and simulation
5. If approved, Aegis requests a signature from Privy
6. Privy signs and the provider path broadcasts the transaction
7. Aegis returns the transaction execution result
8. Private key material never touches agent logic or app code

Execution flow in system terms (current runtime):

1. Agent submits `ExecutionIntent`
2. Aegis resolves wallet binding
3. Assigned DSL policies are evaluated (ordered by priority)
4. Baseline Aegis policies are evaluated
5. Protocol adapter builds transaction
6. Simulation gate validates tx safety
7. Provider signs and tx is broadcast
8. Durable spend counters are updated
9. Execution result + checks are logged
10. Idempotency record is stored for replay-safe retries

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
- Enforces agent-owned policy library semantics
- Enforces baseline global guardrails
- Enforces simulation gate
- Returns deterministic reason codes plus structured policy-match metadata for DSL rejects

Current DSL v1 rule set:

- `allowed_actions`
- `max_lamports_per_tx`
- `allowed_mints`
- `max_slippage_bps`

Current DSL compatibility model:

- `aegis.policy.v1` remains supported unchanged
- `aegis.policy.v2` extends the same flat `rules[]` model
- no nested AND/OR policy groups in this build

Current DSL v2 additions:

- `allowed_recipients`
- `blocked_recipients`
- `allowed_swap_pairs`
- `allowed_swap_protocols`
- `max_lamports_per_day_by_action`
- `max_lamports_per_tx_by_action`
- `max_lamports_per_tx_by_mint`

### 3.4 Protocol Adapter

- Converts intent to protocol tx format
- Keeps protocol logic out of core runtime

Current adapters:

- Orca (preferred for `auto`)
- Raydium (available explicitly)
- Jupiter (mainnet-only in this build)

## 4. Data model

SQLite stores:

- Agent and wallet metadata
- Agent-owned policy library
- Policy assignment priority per wallet
- Daily spend counters
- Daily spend counters by action
- Idempotency execution records
- Intent and tx outcomes
- Rejection reasons

## 5. API and execution examples

### 5.1 Example `ExecutionIntent`

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

### 5.2 Typical rejected response

Rejected writes return a stable `reasonCode` and may include `reasonDetail`.

```json
{
  "status": "rejected",
  "reasonCode": "INSUFFICIENT_FUNDS",
  "reasonDetail": "Wallet does not have enough balance to complete this action.",
  "policyChecks": ["rpc_simulation"]
}
```

### 5.3 Policy-driven rejected response

When a wallet-assigned DSL policy blocks execution, the response also includes `policyMatch`.

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

## 6. Policy lifecycle

Policies are owned by the creating agent and live in that agent's personal policy library.

Operationally:

1. Create a policy
2. Leave it unassigned or assign it to the agent wallet
3. Update or disable it as requirements change
4. Unassign it without deleting the policy record
5. Archive it when it should no longer be used

Lifecycle rules in this build:

- `GET /policies` returns the caller's policy library, not a global catalog
- policies can exist unassigned
- policies can be assigned or unassigned from the agent wallet
- `DELETE /policies/:policyId` archives the policy instead of deleting it
- archived policies cannot be edited or newly assigned
- disabled policies may remain assigned but are skipped during evaluation

### 6.1 Example v2 policy

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

### 6.2 Example policy flow

1. Create a policy
2. Assign it to the wallet
3. Trigger a rejection
4. Inspect `policyMatch` to identify the blocking rule
5. Update the policy
6. Retry the action successfully

## 7. Swap backend behavior

- `swapProtocol: "auto"` selects the best configured backend for the current environment
- `auto` prefers `orca` in this build
- `raydium` remains available explicitly
- `jupiter` remains available explicitly but is mainnet-only in this build
- explicit Jupiter requests on devnet are rejected with `JUPITER_MAINNET_ONLY`

Token resolution for the demo is intentionally narrow:

- `SOL` resolves to wrapped SOL
- `USDC` resolves automatically by environment and selected swap protocol
- any other output token must be provided as a mint address

Current `USDC` resolution:

- devnet with `auto` or `orca` -> Orca devUSDC `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k`
- devnet with `raydium` -> standard devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- mainnet -> `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## 8. Security model

### 8.1 Key custody

Signing mode (`privy`):

- Keys managed by Privy
- Aegis never receives raw private key

### 8.2 Signing controls

A tx is signed only when all checks pass:

- Assigned wallet policy checks
- Baseline intent checks (amount, caps, shape)
- Simulation gate

Any failed check => reject with reason code.

When a reject comes from an assigned DSL policy, the result also includes:

- `policyId`
- `policyName`
- `ruleKind`
- `ruleConfig`

That lets an agent explain exactly which policy blocked the request.

### 8.3 Inner vs outer controls

- Inner control (Aegis): intent + policy decisions before signing
- Outer control (Privy): key custody and signing infrastructure

This keeps custody concerns separate from product policy logic.

## 9. AI interaction model

- Agent decides
- Aegis validates
- Provider signs

This gives controlled autonomy with deterministic safety gates.

## 10. Scalability model

Each agent has:

- Isolated wallet context
- Isolated policy library and assignment profile
- Independent strategy loop

Shared infrastructure can scale later.

## 11. MVP boundaries

MVP includes:

- Hono API runtime
- Privy signing
- Devnet execution
- Agent-owned policy CRUD with archive-only lifecycle
- Approved + rejected demo flows

MVP excludes:

- Mainnet production custody
- HSM/MPC
- Full distributed production architecture

## 12. Demo requirements

Demo must show:

- Multi-agent wallet setup
- Real Solana interaction on devnet
- One approved tx
- One rejected tx
- Audit logs with reason codes and signatures

## 13. Conclusion

Aegis gives agents useful autonomy while keeping signing tightly controlled.

The core value is not custody alone.

The core value is intent + policy orchestration that is provider-agnostic and enforced before signing.

That is the core of a safe agent wallet system.
