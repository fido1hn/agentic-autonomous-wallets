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
- `execute_intent`
- `get_execution_history`

### Planned next (design target)

- `create_policy`
- `list_policies`
- `assign_policy_to_wallet`
- `revoke_policy_from_wallet`
- `rotate_agent_api_key`
- `get_wallet_balance`
- `transfer_sol`
- `transfer_spl`
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
  "amountLamports": "1000000",
  "maxSlippageBps": 100,
  "idempotencyKey": "9c8d8ef0-9d6f-4d2f-bf1f-278380d2e0d7"
}
```

Expected behavior:

- Aegis validates shape + policy + limits
- Approved intent goes to Privy for signing
- Rejected intent returns explicit reason code

### 5) `get_execution_history`

Returns recent approved/rejected executions.

- Method: `GET /agents/:agentId/executions?limit=50`
- Auth: required

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

## Policy direction (planned)

Target behavior:

- User chats with agent: "create a policy"
- Agent calls Aegis policy endpoints
- Aegis creates/enforces policy in Privy
- Wallet actions follow Aegis policy + Privy policy

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
