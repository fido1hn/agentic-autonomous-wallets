import type { PolicyRecord } from "../db/sqlite";
import type { ExecutionIntent, PolicyDecision } from "../types/intents";

// In-memory daily spend tracker keyed by agent.
// Good for dev/test; move to DB-backed counters for multi-instance production.
type DailySpendState = {
  dayKey: string;
  spentLamports: bigint;
};

const spendByAgent = new Map<string, DailySpendState>();

function parseLamports(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function nowDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyCap(): bigint {
  const parsed = parseLamports(process.env.AEGIS_DAILY_LAMPORTS_CAP ?? "5000000000");
  return parsed ?? 5000000000n;
}

function projectedDailySpend(agentId: string, amount: bigint): bigint {
  const dayKey = nowDayKey();
  const current = spendByAgent.get(agentId);
  if (!current || current.dayKey !== dayKey) {
    return amount;
  }
  return current.spentLamports + amount;
}

// Called only on approved execution to advance the in-memory daily spend counter.
export function registerApprovedSpend(agentId: string, amountLamports: string): void {
  const amount = parseLamports(amountLamports);
  if (amount === null || amount === 0n) {
    return;
  }

  const dayKey = nowDayKey();
  const current = spendByAgent.get(agentId);
  if (!current || current.dayKey !== dayKey) {
    spendByAgent.set(agentId, { dayKey, spentLamports: amount });
    return;
  }

  spendByAgent.set(agentId, {
    dayKey,
    spentLamports: current.spentLamports + amount
  });
}

// Placeholder simulation policy.
// Current behavior uses runtime flags and simple payload marker checks.
export async function evaluateSimulation(serializedTx: string): Promise<PolicyDecision> {
  const checks = ["rpc_simulation"];
  const requireSimulation = process.env.AEGIS_REQUIRE_RPC_SIMULATION !== "false";

  if (!requireSimulation) {
    return { allowed: true, checks };
  }

  if (!process.env.SOLANA_RPC) {
    return { allowed: false, reasonCode: "POLICY_RPC_SIMULATION_UNAVAILABLE", checks };
  }

  // Placeholder simulation gate until real signed/unsigned tx simulation wiring is added.
  if (serializedTx.includes("\"simulateFail\":true")) {
    return { allowed: false, reasonCode: "POLICY_RPC_SIMULATION_FAILED", checks };
  }

  return { allowed: true, checks };
}

// Baseline Aegis guardrails that always run, even when no custom policy is assigned.
// These are environment-driven defaults for amount shape, per-tx cap, and daily cap.
export async function evaluateIntent(intent: ExecutionIntent): Promise<PolicyDecision> {
  const checks: string[] = ["intent_shape"];

  if (!intent.agentId) {
    return { allowed: false, reasonCode: "POLICY_INVALID_AGENT_ID", checks };
  }

  const lamports = parseLamports(intent.amountLamports);
  if (lamports === null || lamports === 0n) {
    return { allowed: false, reasonCode: "POLICY_INVALID_AMOUNT", checks };
  }

  checks.push("max_per_tx");
  const maxPerTx = parseLamports(process.env.AEGIS_MAX_LAMPORTS_PER_TX ?? "1000000000");
  if (maxPerTx !== null && lamports > maxPerTx) {
    return { allowed: false, reasonCode: "POLICY_MAX_PER_TX_EXCEEDED", checks };
  }

  if (intent.action === "swap") {
    checks.push("token_allowlist");
    if (!intent.fromMint || !intent.toMint) {
      return { allowed: false, reasonCode: "POLICY_SWAP_MINT_REQUIRED", checks };
    }
  }

  checks.push("daily_cap");
  const projected = projectedDailySpend(intent.agentId, lamports);
  if (projected > getDailyCap()) {
    return { allowed: false, reasonCode: "POLICY_DAILY_CAP_EXCEEDED", checks };
  }

  return { allowed: true, checks };
}

// Evaluates wallet-assigned DSL policies.
// If no policies are assigned, this check passes by design.
export async function evaluateAssignedPolicies(
  intent: ExecutionIntent,
  policies: PolicyRecord[]
): Promise<PolicyDecision> {
  const checks: string[] = ["assigned_policies"];

  if (policies.length === 0) {
    checks.push("assigned_policies:none");
    return { allowed: true, checks };
  }

  const lamports = parseLamports(intent.amountLamports);
  if (lamports === null || lamports === 0n) {
    return { allowed: false, reasonCode: "POLICY_INVALID_AMOUNT", checks };
  }

  for (const policy of policies) {
    // Non-active policies stay attached but are skipped during evaluation.
    if (policy.status !== "active") {
      checks.push(`policy:${policy.id}:inactive`);
      continue;
    }

    checks.push(`policy:${policy.id}:active`);
    for (const rule of policy.dsl.rules) {
      // First failing rule rejects immediately with a precise reason code.
      switch (rule.kind) {
        case "allowed_actions": {
          checks.push(`rule:allowed_actions:${policy.id}`);
          if (!rule.actions.includes(intent.action)) {
            return { allowed: false, reasonCode: "POLICY_ACTION_NOT_ALLOWED", checks };
          }
          break;
        }
        case "max_lamports_per_tx": {
          checks.push(`rule:max_lamports_per_tx:${policy.id}`);
          const max = parseLamports(rule.lteLamports);
          if (max === null || lamports > max) {
            return { allowed: false, reasonCode: "POLICY_DSL_MAX_PER_TX_EXCEEDED", checks };
          }
          break;
        }
        case "allowed_mints": {
          checks.push(`rule:allowed_mints:${policy.id}`);
          if (intent.action === "swap") {
            const fromAllowed = !!intent.fromMint && rule.mints.includes(intent.fromMint);
            const toAllowed = !!intent.toMint && rule.mints.includes(intent.toMint);
            if (!fromAllowed || !toAllowed) {
              return { allowed: false, reasonCode: "POLICY_MINT_NOT_ALLOWED", checks };
            }
          }
          break;
        }
        case "max_slippage_bps": {
          checks.push(`rule:max_slippage_bps:${policy.id}`);
          if (intent.action === "swap") {
            if (intent.maxSlippageBps === undefined) {
              return { allowed: false, reasonCode: "POLICY_SWAP_SLIPPAGE_REQUIRED", checks };
            }
            if (intent.maxSlippageBps > rule.lteBps) {
              return { allowed: false, reasonCode: "POLICY_MAX_SLIPPAGE_EXCEEDED", checks };
            }
          }
          break;
        }
        default: {
          return { allowed: false, reasonCode: "POLICY_RULE_NOT_SUPPORTED", checks };
        }
      }
    }
  }

  return { allowed: true, checks };
}
