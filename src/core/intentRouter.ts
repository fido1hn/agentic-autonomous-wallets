import type { ExecutionIntent, ExecutionResult, SignatureResult } from "../types/intents";
import { getActiveAppContext } from "../api/appContext";
import { writeAuditEvent } from "../observability/auditLog";
import { buildJupiterSwap } from "../protocols/jupiterAdapter";
import {
  evaluateAssignedPolicies,
  evaluateIntent,
  evaluateSimulation,
  registerApprovedSpend
} from "./policyEngine";
import { getOrCreateWallet } from "../wallet/walletFactory";
import { getWalletProvider } from "./walletProvider";

async function buildSerializedTransaction(intent: ExecutionIntent): Promise<string> {
  if (intent.action === "swap") {
    return buildJupiterSwap(intent);
  }

  // Placeholder serialization for non-swap actions until protocol adapters are added.
  return JSON.stringify(intent);
}

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

export async function routeIntent(intent: ExecutionIntent): Promise<ExecutionResult> {
  const { policyService } = getActiveAppContext();
  const wallet = await getOrCreateWallet(intent.agentId);
  const resolvedIntent: ExecutionIntent = {
    ...intent,
    walletAddress: intent.walletAddress ?? wallet.walletRef
  };

  const assignedPolicies = await policyService.listAgentWalletPolicies(resolvedIntent.agentId);
  const assignedPolicyDecision = await evaluateAssignedPolicies(resolvedIntent, assignedPolicies);
  if (!assignedPolicyDecision.allowed) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: assignedPolicyDecision.reasonCode ?? "POLICY_REJECTED",
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
    return rejected;
  }

  const baselinePolicyDecision = await evaluateIntent(resolvedIntent);
  if (!baselinePolicyDecision.allowed) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: baselinePolicyDecision.reasonCode ?? "POLICY_REJECTED",
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
    return rejected;
  }

  let serializedTx = "";
  try {
    serializedTx = await buildSerializedTransaction(resolvedIntent);
  } catch {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: "TX_BUILD_FAILED",
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
    return rejected;
  }

  if (!serializedTx) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: "TX_BUILD_FAILED",
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
    return rejected;
  }

  const simulationDecision = await evaluateSimulation(serializedTx);
  if (!simulationDecision.allowed) {
    const rejected: ExecutionResult = {
      status: "rejected",
      reasonCode: simulationDecision.reasonCode ?? "POLICY_RPC_SIMULATION_FAILED",
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
    return rejected;
  }

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
      reasonCode: "SIGNING_FAILED",
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
    return rejected;
  }

  registerApprovedSpend(resolvedIntent.agentId, resolvedIntent.amountLamports);

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

  return approved;
}
