import type { PolicyRecord } from "../db/sqlite";
import type { ExecutionIntent, PolicyDecision } from "../types/intents";
import { ReasonCodes } from "./reasonCodes";

function parseLamports(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function nowDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyCap(): bigint {
  const parsed = parseLamports(process.env.AEGIS_DAILY_LAMPORTS_CAP ?? "5000000000");
  return parsed ?? 5000000000n;
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
    return { allowed: false, reasonCode: ReasonCodes.policyRpcSimulationUnavailable, checks };
  }

  // Placeholder simulation gate until real signed/unsigned tx simulation wiring is added.
  if (serializedTx.includes("\"simulateFail\":true")) {
    return { allowed: false, reasonCode: ReasonCodes.policyRpcSimulationFailed, checks };
  }

  return { allowed: true, checks };
}

// Baseline Aegis guardrails that always run, even when no custom policy is assigned.
// These are environment-driven defaults for amount shape, per-tx cap, and daily cap.
export async function evaluateIntent(intent: ExecutionIntent): Promise<PolicyDecision> {
  return evaluateBaselineIntent(intent, "0");
}

export async function evaluateBaselineIntent(
  intent: ExecutionIntent,
  currentDailySpentLamports: string
): Promise<PolicyDecision> {
  const checks: string[] = ["intent_shape"];

  if (!intent.agentId) {
    return { allowed: false, reasonCode: ReasonCodes.policyInvalidAgentId, checks };
  }

  const lamports = parseLamports(intent.amountLamports);
  if (lamports === null || lamports === 0n) {
    return { allowed: false, reasonCode: ReasonCodes.policyInvalidAmount, checks };
  }

  checks.push("max_per_tx");
  const maxPerTx = parseLamports(process.env.AEGIS_MAX_LAMPORTS_PER_TX ?? "1000000000");
  if (maxPerTx !== null && lamports > maxPerTx) {
    return { allowed: false, reasonCode: ReasonCodes.policyMaxPerTxExceeded, checks };
  }

  if (intent.action === "swap") {
    checks.push("token_allowlist");
    if (!intent.fromMint || !intent.toMint) {
      return { allowed: false, reasonCode: ReasonCodes.policySwapMintRequired, checks };
    }
  }

  checks.push("daily_cap");
  const spent = parseLamports(currentDailySpentLamports) ?? 0n;
  const projected = spent + lamports;
  if (projected > getDailyCap()) {
    return { allowed: false, reasonCode: ReasonCodes.policyDailyCapExceeded, checks };
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
    return { allowed: false, reasonCode: ReasonCodes.policyInvalidAmount, checks };
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
            return { allowed: false, reasonCode: ReasonCodes.policyActionNotAllowed, checks };
          }
          break;
        }
        case "max_lamports_per_tx": {
          checks.push(`rule:max_lamports_per_tx:${policy.id}`);
          const max = parseLamports(rule.lteLamports);
          if (max === null || lamports > max) {
            return { allowed: false, reasonCode: ReasonCodes.policyDslMaxPerTxExceeded, checks };
          }
          break;
        }
        case "allowed_mints": {
          checks.push(`rule:allowed_mints:${policy.id}`);
          if (intent.action === "swap") {
            const fromAllowed = !!intent.fromMint && rule.mints.includes(intent.fromMint);
            const toAllowed = !!intent.toMint && rule.mints.includes(intent.toMint);
            if (!fromAllowed || !toAllowed) {
              return { allowed: false, reasonCode: ReasonCodes.policyMintNotAllowed, checks };
            }
          }
          break;
        }
        case "max_slippage_bps": {
          checks.push(`rule:max_slippage_bps:${policy.id}`);
          if (intent.action === "swap") {
            if (intent.maxSlippageBps === undefined) {
              return { allowed: false, reasonCode: ReasonCodes.policySwapSlippageRequired, checks };
            }
            if (intent.maxSlippageBps > rule.lteBps) {
              return { allowed: false, reasonCode: ReasonCodes.policyMaxSlippageExceeded, checks };
            }
          }
          break;
        }
        default: {
          return { allowed: false, reasonCode: ReasonCodes.policyRuleNotSupported, checks };
        }
      }
    }
  }

  return { allowed: true, checks };
}
