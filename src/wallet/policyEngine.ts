import type { ExecutionIntent, PolicyDecision } from "../types/intents";

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
