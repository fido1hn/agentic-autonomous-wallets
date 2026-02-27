import type { ExecutionIntent, ExecutionResult, SignatureResult } from "../types/intents";
import { getActiveAppContext } from "../api/appContext";
import { writeAuditEvent } from "../observability/auditLog";
import { buildJupiterSwap } from "../protocols/jupiterAdapter";
import {
  evaluateAssignedPolicies,
  evaluateBaselineIntent,
  evaluateSimulation,
  nowDayKey
} from "./policyEngine";
import { ReasonCodes } from "./reasonCodes";
import { getOrCreateWallet } from "../wallet/walletFactory";
import { getWalletProvider } from "./walletProvider";

// Builds a serialized transaction payload from the normalized intent.
// Swap uses the Jupiter adapter; other actions keep placeholder encoding for now.
async function buildSerializedTransaction(intent: ExecutionIntent): Promise<string> {
  if (intent.action === "swap") {
    return buildJupiterSwap(intent);
  }

  // Placeholder serialization for non-swap actions until protocol adapters are added.
  return JSON.stringify(intent);
}

// Best-effort audit persistence to DB.
// Runtime execution should not fail if logging storage fails.
async function appendExecutionLogSafe(payload: {
  agentId: string;
  status: "approved" | "rejected";
  reasonCode?: string;
  provider?: SignatureResult["provider"];
  txSignature?: string;
  policyChecks: string[];
}): Promise<void> {
  try {
    const { db } = getActiveAppContext();
    await db.repositories.executionLogs.append({
      agentId: payload.agentId,
      status: payload.status,
      reasonCode: payload.reasonCode,
      provider: payload.provider,
      txSignature: payload.txSignature,
      policyChecks: payload.policyChecks
    });
  } catch {
    // Do not fail request if audit persistence fails.
  }
}

function parseExecutionResult(raw: string): ExecutionResult | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const result = parsed as Partial<ExecutionResult>;
    if (result.status === "approved" && typeof result.txSignature === "string" && typeof result.provider === "string") {
      return {
        status: "approved",
        provider: result.provider,
        txSignature: result.txSignature,
        policyChecks: Array.isArray(result.policyChecks) ? result.policyChecks : []
      } satisfies ExecutionResult;
    }
    if (result.status === "rejected" && typeof result.reasonCode === "string") {
      return {
        status: "rejected",
        reasonCode: result.reasonCode,
        policyChecks: Array.isArray(result.policyChecks) ? result.policyChecks : []
      } satisfies ExecutionResult;
    }
    return null;
  } catch {
    return null;
  }
}

export async function routeIntent(intent: ExecutionIntent): Promise<ExecutionResult> {
  const { policyService, db } = getActiveAppContext();

  const idempotencyKey = intent.idempotencyKey?.trim();
  if (idempotencyKey) {
    const existing = await db.repositories.intentIdempotency.find(intent.agentId, idempotencyKey);
    if (existing) {
      const parsed = parseExecutionResult(existing.resultJson);
      if (parsed) {
        return parsed;
      }
    }
  }

  // Ensure the agent has a wallet binding before any policy/signing checks.
  const wallet = await getOrCreateWallet(intent.agentId);
  const resolvedIntent: ExecutionIntent = {
    ...intent,
    walletAddress: intent.walletAddress ?? wallet.walletRef
  };

  // 1) Enforce wallet-assigned DSL policies (user-configured controls).
  const assignedPolicies = await policyService.listAgentWalletPolicies(resolvedIntent.agentId);
  const assignedPolicyDecision = await evaluateAssignedPolicies(resolvedIntent, assignedPolicies);
  if (!assignedPolicyDecision.allowed) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: assignedPolicyDecision.reasonCode ?? ReasonCodes.policyRejected,
      policyChecks: assignedPolicyDecision.checks
    };
    writeAuditEvent({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks
    });
    await appendExecutionLogSafe({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks ?? []
    });
    if (idempotencyKey) {
      await db.repositories.intentIdempotency.save(
        resolvedIntent.agentId,
        idempotencyKey,
        JSON.stringify(rejected)
      );
    }
    return rejected;
  }

  // 2) Enforce baseline Aegis protections (global safety defaults).
  const dayKey = nowDayKey();
  const dailySpend = await db.repositories.dailySpendCounters.getByAgentAndDay(
    resolvedIntent.agentId,
    dayKey
  );
  const baselinePolicyDecision = await evaluateBaselineIntent(
    resolvedIntent,
    dailySpend?.spentLamports ?? "0"
  );
  if (!baselinePolicyDecision.allowed) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: baselinePolicyDecision.reasonCode ?? ReasonCodes.policyRejected,
      policyChecks: [...assignedPolicyDecision.checks, ...baselinePolicyDecision.checks]
    };
    writeAuditEvent({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks
    });
    await appendExecutionLogSafe({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks ?? []
    });
    if (idempotencyKey) {
      await db.repositories.intentIdempotency.save(
        resolvedIntent.agentId,
        idempotencyKey,
        JSON.stringify(rejected)
      );
    }
    return rejected;
  }

  // 3) Build the transaction only after policy checks pass.
  let serializedTx = "";
  try {
    serializedTx = await buildSerializedTransaction(resolvedIntent);
  } catch {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: ReasonCodes.txBuildFailed,
      policyChecks: [...assignedPolicyDecision.checks, ...baselinePolicyDecision.checks]
    };
    writeAuditEvent({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks
    });
    await appendExecutionLogSafe({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks ?? []
    });
    if (idempotencyKey) {
      await db.repositories.intentIdempotency.save(
        resolvedIntent.agentId,
        idempotencyKey,
        JSON.stringify(rejected)
      );
    }
    return rejected;
  }

  if (!serializedTx) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: ReasonCodes.txBuildFailed,
      policyChecks: [...assignedPolicyDecision.checks, ...baselinePolicyDecision.checks]
    };
    writeAuditEvent({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks
    });
    await appendExecutionLogSafe({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks ?? []
    });
    if (idempotencyKey) {
      await db.repositories.intentIdempotency.save(
        resolvedIntent.agentId,
        idempotencyKey,
        JSON.stringify(rejected)
      );
    }
    return rejected;
  }

  // 4) Run simulation gate before signing.
  const simulationDecision = await evaluateSimulation(serializedTx);
  if (!simulationDecision.allowed) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: simulationDecision.reasonCode ?? ReasonCodes.policyRpcSimulationFailed,
      policyChecks: [
        ...assignedPolicyDecision.checks,
        ...baselinePolicyDecision.checks,
        ...simulationDecision.checks
      ]
    };
    writeAuditEvent({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks
    });
    await appendExecutionLogSafe({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks ?? []
    });
    if (idempotencyKey) {
      await db.repositories.intentIdempotency.save(
        resolvedIntent.agentId,
        idempotencyKey,
        JSON.stringify(rejected)
      );
    }
    return rejected;
  }

  // 5) Sign + broadcast through provider custody layer.
  const provider = getWalletProvider();
  let signature: SignatureResult;
  try {
    signature = await provider.signAndSend({
      agentId: resolvedIntent.agentId,
      walletRef: wallet.walletRef,
      serializedTx
    });
  } catch {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: ReasonCodes.signingFailed,
      policyChecks: [
        ...assignedPolicyDecision.checks,
        ...baselinePolicyDecision.checks,
        ...simulationDecision.checks
      ]
    };
    writeAuditEvent({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks
    });
    await appendExecutionLogSafe({
      agentId: resolvedIntent.agentId,
      status: "rejected",
      reasonCode: rejected.reasonCode,
      policyChecks: rejected.policyChecks ?? []
    });
    if (idempotencyKey) {
      await db.repositories.intentIdempotency.save(
        resolvedIntent.agentId,
        idempotencyKey,
        JSON.stringify(rejected)
      );
    }
    return rejected;
  }

  // 6) Persist approved spend for durable daily-cap enforcement across restarts/instances.
  await db.repositories.dailySpendCounters.addSpend(
    resolvedIntent.agentId,
    dayKey,
    resolvedIntent.amountLamports
  );

  const approved: ExecutionResult = {
    status: "approved",
    provider: signature.provider,
    txSignature: signature.txSignature,
    policyChecks: [
      ...assignedPolicyDecision.checks,
      ...baselinePolicyDecision.checks,
      ...simulationDecision.checks
    ]
  };

  writeAuditEvent({
    agentId: resolvedIntent.agentId,
    status: "approved",
    provider: signature.provider,
    txSignature: signature.txSignature,
    policyChecks: approved.policyChecks
  });
  await appendExecutionLogSafe({
    agentId: resolvedIntent.agentId,
    status: "approved",
    provider: signature.provider,
    txSignature: signature.txSignature,
    policyChecks: approved.policyChecks
  });
  if (idempotencyKey) {
    await db.repositories.intentIdempotency.save(
      resolvedIntent.agentId,
      idempotencyKey,
      JSON.stringify(approved)
    );
  }

  return approved;
}
