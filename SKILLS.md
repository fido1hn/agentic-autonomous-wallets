# Aegis Skills Contract

This file is the agent-facing contract for Aegis.

It is written for any framework that can call HTTP APIs.

Core model:

Agent decides -> Aegis validates -> Privy signs

Private keys are never returned to agents or app code.

## Runtime profile

- Base URL: `http://localhost:3000`
- Network: Solana devnet
- Custody/signing backend: Privy server wallets
- Auth headers for protected routes:
  - `x-agent-id: <agentId>`
  - `x-agent-api-key: <apiKey>`

## Skills status map

### Live now (implemented)

- `create_agent`
- `create_wallet`
- `get_wallet`
- `get_wallet_balance`
- `execute_intent`
- `transfer_sol`
- `transfer_spl`
- `swap_tokens`
- `get_execution_history`
- `create_policy`
- `list_policies`
- `assign_policy_to_wallet`

### Planned next (design target)

- `revoke_policy_from_wallet`
- `rotate_agent_api_key`
- `call_program`

`Planned` skills are intentionally listed so external agents can align early, but they are not guaranteed until endpoints exist.

## Live skills

### 1) `create_agent`

Creates an Aegis agent identity and issues its first API key.

- Method: `POST /agents`
- Auth: none
- Body:

```json
{
  "name": "agent-alpha",
  "status": "active"
}
```

- Success:

```json
{
  "agentId": "30688291-4afd-413c-aa26-434721afea45",
  "name": "agent-alpha",
  "status": "active",
  "apiKey": "aegis_sk_..."
}
```

### 2) `create_wallet`

Creates wallet binding for an agent.

- Method: `POST /agents/:agentId/wallet`
- Auth: required
- Idempotency behavior:
- If wallet binding already exists, existing binding is returned.
- One wallet binding per agent in v1.

- Success:

```json
{
  "agentId": "30688291-4afd-413c-aa26-434721afea45",
  "walletRef": "wlt_...",
  "walletAddress": "7YttLkH4kKo3aonMh8M73PvvrLpzjAU6RzG32KzBSSMS",
  "provider": "privy",
  "updatedAt": "2026-02-25T22:32:24.821Z"
}
```

### 3) `get_wallet`

Returns current wallet binding for an agent.

- Method: `GET /agents/:agentId/wallet`
- Auth: required

### 4) `execute_intent`

Submits structured action request to Aegis.

- Method: `POST /intents/execute`
- Auth: required
- Body: `ExecutionIntent`

Swap example:

```json
{
  "agentId": "30688291-4afd-413c-aa26-434721afea45",
  "action": "swap",
  "fromMint": "So11111111111111111111111111111111111111112",
  "toMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountAtomic": "1000000",
  "maxSlippageBps": 100,
  "idempotencyKey": "9c8d8ef0-9d6f-4d2f-bf1f-278380d2e0d7"
}
```

Expected behavior:

- Aegis validates shape + policy + limits
- Approved intent goes to Privy for signing
- Rejected intent returns explicit reason code

### 5) `get_wallet_balance`

Returns current native SOL and SPL token balances for the agent wallet.

- Method: `GET /agents/:agentId/balances`
- Auth: required

### 6) `transfer_sol`

Semantic agent tool that wraps `POST /intents/execute`.

- Underlying body:

```json
{
  "agentId": "30688291-4afd-413c-aa26-434721afea45",
  "action": "transfer",
  "transferAsset": "native",
  "recipientAddress": "6iQv3Lxw9Q5XV1fV64D7Bqjofu5pY88MtXgFp16psNTJ",
  "amountAtomic": "5000"
}
```

### 7) `transfer_spl`

Semantic agent tool that wraps `POST /intents/execute`.

- Underlying body:

```json
{
  "agentId": "30688291-4afd-413c-aa26-434721afea45",
  "action": "transfer",
  "transferAsset": "spl",
  "recipientAddress": "6iQv3Lxw9Q5XV1fV64D7Bqjofu5pY88MtXgFp16psNTJ",
  "mintAddress": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "amountAtomic": "1000"
}
```

### 8) `swap_tokens`

Semantic agent tool that wraps `POST /intents/execute`.

- In this build, Aegis resolves `USDC` automatically by environment:
  - devnet with `auto`/`orca`: `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` (Orca devUSDC)
  - devnet with `raydium`: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
  - mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- For any other SPL token, provide the mint address explicitly.
- Protocol behavior:
  - `auto` chooses the best configured backend for the current environment
  - `orca` is the preferred swap backend in this project
  - `raydium` remains available explicitly on devnet
  - `jupiter` is treated as mainnet-only and will be rejected on devnet with `JUPITER_MAINNET_ONLY`

- Underlying body:

```json
{
  "agentId": "30688291-4afd-413c-aa26-434721afea45",
  "action": "swap",
  "swapProtocol": "auto",
  "fromMint": "So11111111111111111111111111111111111111112",
  "toMint": "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k",
  "amountAtomic": "1000000",
  "maxSlippageBps": 100
}
```

Example natural-language swap requests:

- `swap 0.8 sol to usdc`
- `swap 0.8 sol to usdc using orca`
- `swap 0.8 sol to usdc using raydium`
- `swap 0.8 sol to 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### 9) `get_execution_history`

Returns recent approved/rejected executions.

- Method: `GET /agents/:agentId/executions?limit=50`
- Auth: required

### 10) `create_policy`

Creates an Aegis policy in DSL v1 format.

- Method: `POST /policies`
- Auth: required
- Body:

```json
{
  "name": "allow small swaps",
  "description": "limit to small swap amounts",
  "dsl": {
    "version": "1",
    "rules": [
      { "kind": "allowed_actions", "actions": ["swap"] },
      { "kind": "max_lamports_per_tx", "value": "50000000" }
    ]
  }
}
```

### 11) `list_policies`

Lists available policies.

- Method: `GET /policies?limit=50`
- Auth: required

### 12) `assign_policy_to_wallet`

Assigns a policy to an agent wallet with optional priority.

- Method: `POST /agents/:agentId/policies/:policyId`
- Auth: required
- Body (optional):

```json
{
  "priority": 200
}
```

## Safety contract

Agents must:

- Send structured intents only
- Respect policy rejections
- Include idempotency keys for retry-safe writes
- Keep `agentId` and auth headers aligned

Agents must not:

- Request private keys
- Ask for raw signing outside Aegis flow
- Retry denied actions blindly
- Attempt non-allowlisted behavior

## Error contract

All API errors use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "human readable reason",
    "requestId": "uuid"
  }
}
```

Agents should log `requestId` for debugging and audit.

Rejected intent results can also include:

```json
{
  "status": "rejected",
  "reasonCode": "INSUFFICIENT_FUNDS",
  "reasonDetail": "Wallet does not have enough balance to complete this action.",
  "policyChecks": ["rpc_simulation"]
}
```

For devnet swap requests, agents should explain protocol-specific failures clearly:

- `JUPITER_MAINNET_ONLY`: Jupiter swap backend is only available on mainnet in this build
- `SWAP_PROTOCOL_UNAVAILABLE`: no compatible swap backend is configured for the current environment
- `INSUFFICIENT_FUNDS`: wallet does not have enough balance to complete the action

## Policy direction (planned)

Target behavior:

- User chats with agent: "create a policy"
- Agent calls Aegis policy endpoints
- Aegis stores and enforces policy in Aegis runtime
- Wallet actions follow Aegis policy checks before any signing request

Target policy controls:

- Per-tx value caps
- Daily spend caps
- Allowlist/denylist for recipients and programs
- Token mint restrictions
- Fail-closed default

## Reference docs

- Privy OpenClaw integration guide:
- <https://docs.privy.io/recipes/agent-integrations/openclaw-agentic-wallets.md>
- Privy server wallet create API:
- <https://docs.privy.io/api-reference/wallets/create>
- Privy idempotency key guide:
- <https://docs.privy.io/guide/server-wallets/idempotency-key>
- Privy agent skill repo:
- <https://github.com/privy-io/privy-agentic-wallets-skill>

## Compatibility statement

Aegis skills are framework-agnostic.

They can be consumed by OpenClaw, SAK demos, or any agent runtime that can make HTTP requests.
