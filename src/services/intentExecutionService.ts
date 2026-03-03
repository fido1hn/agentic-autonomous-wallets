import { and, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as dbSchema from "../db/schema";
import { writeAuditEvent } from "../observability/auditLog";
import { buildSolTransfer, buildSplTransfer } from "../protocols/solanaTransferAdapter";
import { buildSwapTransaction } from "../protocols/swapAdapter";
import {
  evaluateAssignedPolicies,
  evaluateBaselineIntent,
  evaluateSimulation,
  nowDayKey
} from "../core/policyEngine";
import {
  toExecutionStatusResponse,
  toInFlightExecutionResult
} from "../core/intentExecutionStateMachine";
import {
  clearExecutionWaiter,
  getExecutionWaiter,
  registerExecutionWaiter,
  rejectExecutionWaiter,
  resolveExecutionWaiter
} from "../core/executionWaitRegistry";
import { ReasonCodes } from "../core/reasonCodes";
import { classifySolanaFailure } from "../core/solanaFailure";
import { getWalletProvider } from "../core/walletProvider";
import type { AgentWalletService } from "./agentWalletService";
import type { PolicyService } from "./policyService";
import type {
  ExecutionIntent,
  ExecutionResult,
  ExecutionStatusResponse,
  InternalExecutionResult,
  IntentExecutionState,
  SerializedTransaction,
  SignatureResult
} from "../types/intents";
import type { IntentExecutionRecord, ProviderName, SqliteContext } from "../db/sqlite";
import {
  dailyActionSpendCountersTable,
  dailySpendCountersTable,
  executionLogsTable,
  intentExecutionsTable
} from "../db/schema";
import { nowIso } from "../db/utils";

type TransactionDb = BunSQLiteDatabase<typeof dbSchema>;

function resolveReasonCode(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const known = Object.values(ReasonCodes);
    if (known.includes(error.message as (typeof ReasonCodes)[keyof typeof ReasonCodes])) {
      return error.message;
    }
    const separator = error.message.indexOf(": ");
    if (separator !== -1) {
      const maybeCode = error.message.slice(0, separator);
      if (known.includes(maybeCode as (typeof ReasonCodes)[keyof typeof ReasonCodes])) {
        return maybeCode;
      }
    }
  }
  return fallback;
}

function resolveReasonDetail(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const separator = error.message.indexOf(": ");
  if (separator === -1) {
    return undefined;
  }
  return error.message.slice(separator + 2);
}

async function buildSerializedTransaction(intent: ExecutionIntent) {
  if (intent.action === "swap") {
    return buildSwapTransaction(intent);
  }

  if (intent.action === "transfer" && intent.transferAsset === "native") {
    return buildSolTransfer(intent);
  }

  if (intent.action === "transfer" && intent.transferAsset === "spl") {
    return buildSplTransfer(intent);
  }

  throw new Error(ReasonCodes.unsupportedIntentAction);
}

function parseLamports(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

async function addDailySpendTx(
  tx: TransactionDb,
  agentId: string,
  dayKey: string,
  amountLamports: string
): Promise<void> {
  const now = nowIso();
  const amount = parseLamports(amountLamports).toString();

  await tx
    .insert(dailySpendCountersTable)
    .values({
      agentId,
      dayKey,
      spentLamports: amount,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [dailySpendCountersTable.agentId, dailySpendCountersTable.dayKey],
      set: {
        spentLamports: sql`CAST(${dailySpendCountersTable.spentLamports} AS INTEGER) + ${amount}`,
        updatedAt: now
      }
    });
}

async function addDailyActionSpendTx(
  tx: TransactionDb,
  agentId: string,
  dayKey: string,
  action: "swap" | "transfer",
  amountLamports: string
): Promise<void> {
  const now = nowIso();
  const amount = parseLamports(amountLamports).toString();

  await tx
    .insert(dailyActionSpendCountersTable)
    .values({
      agentId,
      dayKey,
      action,
      spentLamports: amount,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [
        dailyActionSpendCountersTable.agentId,
        dailyActionSpendCountersTable.dayKey,
        dailyActionSpendCountersTable.action
      ],
      set: {
        spentLamports: sql`CAST(${dailyActionSpendCountersTable.spentLamports} AS INTEGER) + ${amount}`,
        updatedAt: now
      }
    });
}

function executionResultFromRecord(record: IntentExecutionRecord): InternalExecutionResult {
  if (record.result) {
    return record.result;
  }
  return toInFlightExecutionResult(record);
}

function isTerminalResult(result: InternalExecutionResult): result is ExecutionResult {
  return result.status === "approved" || result.status === "rejected";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BroadcastReadyExecution {
  intent: ExecutionIntent;
  walletRef: string;
  walletAddress: string;
  provider: ProviderName;
  serializedTx: SerializedTransaction;
  policyChecks: string[];
}

type RejectedExecutionResult = Extract<ExecutionResult, { status: "rejected" }>;

export class IntentExecutionService {
  constructor(
    private readonly db: SqliteContext,
    private readonly agentWalletService: AgentWalletService,
    private readonly policyService: PolicyService
  ) {}

  async submitIntent(intent: ExecutionIntent): Promise<ExecutionResult> {
    const claimed = await this.claimOrAttachExecution(intent);
    if (claimed.mode === "terminal") {
      return claimed.result;
    }

    if (claimed.mode === "attached") {
      return this.awaitExecutionTerminal(claimed.execution.id);
    }

    return this.executeOwnedExecution(claimed.execution);
  }

  async getExecutionStatus(agentId: string, executionId: string): Promise<ExecutionStatusResponse | null> {
    const record = await this.db.repositories.intentExecutions.findById(executionId);
    if (!record || record.agentId !== agentId) {
      return null;
    }
    return toExecutionStatusResponse(record);
  }

  async resumeRecoverableExecutions(): Promise<void> {
    const recoverable = await this.db.repositories.intentExecutions.listRecoverable();
    for (const execution of recoverable.reverse()) {
      try {
        if (getExecutionWaiter(execution.id)) {
          continue;
        }
        await this.executeOwnedExecution(execution);
      } catch {
        // Recovery is best-effort. Leave the row in its current state for later inspection.
      }
    }
  }

  async finalizeBroadcastExecution(executionId: string): Promise<IntentExecutionRecord | null> {
    const existing = await this.db.repositories.intentExecutions.findById(executionId);
    if (!existing) {
      return null;
    }
    if (existing.status === "finalized") {
      return existing;
    }
    if (existing.status !== "broadcast") {
      return existing;
    }

    const result: ExecutionResult = {
      status: "approved",
      provider: (existing.provider ?? "privy") as ProviderName,
      txSignature: existing.txSignature ?? "",
      txSignatures: existing.txSignatures,
      policyChecks: existing.policyChecks ?? []
    };

    const finalized = await this.db.db.transaction(async (tx) => {
      const row = await tx.query.intentExecutionsTable.findFirst({
        where: eq(intentExecutionsTable.id, executionId)
      });
      if (!row) {
        return null;
      }
      if (row.status === "finalized") {
        return row;
      }
      if (row.status !== "broadcast") {
        return row;
      }

      const now = nowIso();
      const policyChecks = JSON.parse(row.policyChecksJson ?? "[]") as string[];
      const resultJson = JSON.stringify(result);

      if (!row.spendAppliedAt) {
        const intent = JSON.parse(row.intentJson) as ExecutionIntent;
        const dayKey = nowDayKey();
        await addDailySpendTx(tx, row.agentId, dayKey, intent.amountAtomic);
        await addDailyActionSpendTx(
          tx,
          row.agentId,
          dayKey,
          row.action,
          intent.amountAtomic
        );
      }

      if (!row.auditLoggedAt) {
        await tx.insert(executionLogsTable).values({
          agentId: row.agentId,
          status: "approved",
          provider: row.provider,
          txSignature: row.txSignature,
          policyChecksJson: JSON.stringify(policyChecks),
          createdAt: now
        });
      }

      const [updated] = await tx
        .update(intentExecutionsTable)
        .set({
          status: "finalized",
          resultJson,
          currentStep: "finalized",
          spendAppliedAt: row.spendAppliedAt ?? now,
          auditLoggedAt: row.auditLoggedAt ?? now,
          lastTransitionAt: now,
          updatedAt: now
        })
        .where(eq(intentExecutionsTable.id, executionId))
        .returning();

      return updated ?? row;
    });

    if (!finalized) {
      return null;
    }

    writeAuditEvent({
      agentId: finalized.agentId,
      status: "approved",
      provider: finalized.provider ?? "privy",
      txSignature: finalized.txSignature ?? undefined,
      policyChecks: result.policyChecks
    });

    return this.db.repositories.intentExecutions.findById(finalized.id);
  }

  private async claimOrAttachExecution(
    intent: ExecutionIntent
  ): Promise<
    | { mode: "owner"; execution: IntentExecutionRecord }
    | { mode: "attached"; execution: IntentExecutionRecord }
    | { mode: "terminal"; result: ExecutionResult }
  > {
    try {
      const execution = await this.db.repositories.intentExecutions.createReceived({
        agentId: intent.agentId,
        idempotencyKey: intent.idempotencyKey,
        action: intent.action,
        intent
      });
      return { mode: "owner", execution };
    } catch (error) {
      const existing = await this.db.repositories.intentExecutions.findByAgentAndIdempotencyKey(
        intent.agentId,
        intent.idempotencyKey
      );
      if (!existing) {
        throw error;
      }
      const result = executionResultFromRecord(existing);
      if (isTerminalResult(result)) {
        return { mode: "terminal", result };
      }
      return { mode: "attached", execution: existing };
    }
  }

  private async executeOwnedExecution(execution: IntentExecutionRecord): Promise<ExecutionResult> {
    if (getExecutionWaiter(execution.id)) {
      return this.awaitExecutionTerminal(execution.id);
    }

    registerExecutionWaiter(execution.id);

    try {
      const result = await this.resumeExecution(execution);
      resolveExecutionWaiter(execution.id, result);
      return result;
    } catch (error) {
      rejectExecutionWaiter(execution.id, error);
      throw error;
    } finally {
      clearExecutionWaiter(execution.id);
    }
  }

  private async awaitExecutionTerminal(executionId: string): Promise<ExecutionResult> {
    const localWaiter = getExecutionWaiter(executionId);
    if (localWaiter) {
      return localWaiter;
    }

    for (;;) {
      const record = await this.db.repositories.intentExecutions.findById(executionId);
      if (!record) {
        throw new Error("INTENT_EXECUTION_NOT_FOUND");
      }

      const result = executionResultFromRecord(record);
      if (isTerminalResult(result)) {
        return result;
      }

      if (record.status === "broadcast") {
        await this.finalizeBroadcastExecution(record.id);
      }

      await sleep(100);
    }
  }

  private async resumeExecution(execution: IntentExecutionRecord): Promise<ExecutionResult> {
    const record = await this.db.repositories.intentExecutions.findById(execution.id);
    if (!record) {
      throw new Error("INTENT_EXECUTION_NOT_FOUND");
    }
    if (record.status === "finalized" || record.status === "failed") {
      const result = executionResultFromRecord(record);
      if (!isTerminalResult(result)) {
        throw new Error("INTENT_EXECUTION_NOT_TERMINAL");
      }
      return result;
    }
    if (record.status === "broadcast") {
      const finalized = await this.finalizeBroadcastExecution(record.id);
      if (!finalized) {
        throw new Error("INTENT_EXECUTION_NOT_FOUND");
      }
      const result = executionResultFromRecord(finalized);
      if (!isTerminalResult(result)) {
        throw new Error("INTENT_EXECUTION_NOT_TERMINAL");
      }
      return result;
    }
    if (record.status !== "received") {
      throw new Error(`INTENT_EXECUTION_STATE_INVALID: ${record.status}`);
    }

    const preBroadcast = await this.runPreBroadcastFlow(record);
    if ("status" in preBroadcast) {
      return preBroadcast;
    }

    return this.runProviderAndFinalize(record, preBroadcast);
  }

  private async rejectReceivedExecution(
    executionId: string,
    result: RejectedExecutionResult
  ): Promise<RejectedExecutionResult> {
    const failed = await this.failExecution(executionId, "received", result);
    if (failed.status !== "rejected") {
      throw new Error("INTENT_EXECUTION_REJECT_EXPECTED");
    }
    return failed;
  }

  private async runPreBroadcastFlow(
    execution: IntentExecutionRecord
  ): Promise<BroadcastReadyExecution | RejectedExecutionResult> {
    const intent = execution.intent;

    let walletRef: string;
    let walletAddress: string;
    let provider: ProviderName;

    try {
      const wallet = await this.agentWalletService.createAgentWallet(intent.agentId);
      walletRef = wallet.walletRef;
      walletAddress = intent.walletAddress ?? wallet.walletAddress ?? "";
      provider = wallet.provider;
      if (!walletAddress) {
        return this.rejectReceivedExecution(execution.id, {
          status: "rejected",
          reasonCode: ReasonCodes.walletAddressUnavailable,
          reasonDetail: "Wallet address is not available for this agent wallet binding.",
          policyChecks: []
        });
      }
    } catch {
      return this.rejectReceivedExecution(execution.id, {
        status: "rejected",
        reasonCode: ReasonCodes.walletAddressUnavailable,
        reasonDetail: "Wallet address is not available for this agent wallet binding.",
        policyChecks: []
      });
    }

    const resolvedIntent: ExecutionIntent = {
      ...intent,
      walletAddress,
      idempotencyKey: intent.idempotencyKey
    };

    const dayKey = nowDayKey();
    const dailySpend = await this.db.repositories.dailySpendCounters.getByAgentAndDay(
      resolvedIntent.agentId,
      dayKey
    );
    const dailyActionSpend = await this.db.repositories.dailyActionSpendCounters.getByAgentDayAndAction(
      resolvedIntent.agentId,
      dayKey,
      resolvedIntent.action
    );

    const assignedPolicies = await this.policyService.listAgentWalletPolicies(resolvedIntent.agentId);
    const assignedPolicyDecision = await evaluateAssignedPolicies(resolvedIntent, assignedPolicies, {
      currentDailySpentLamports: dailySpend?.spentLamports ?? "0",
      currentDailySpentByActionLamports: {
        [resolvedIntent.action]: dailyActionSpend?.spentLamports ?? "0"
      }
    });
    if (!assignedPolicyDecision.allowed) {
      return this.rejectReceivedExecution(execution.id, {
        status: "rejected",
        reasonCode: assignedPolicyDecision.reasonCode ?? ReasonCodes.policyRejected,
        reasonDetail: assignedPolicyDecision.reasonDetail,
        policyChecks: assignedPolicyDecision.checks,
        policyMatch: assignedPolicyDecision.match
      });
    }

    const baselinePolicyDecision = await evaluateBaselineIntent(
      resolvedIntent,
      dailySpend?.spentLamports ?? "0"
    );
    if (!baselinePolicyDecision.allowed) {
      return this.rejectReceivedExecution(execution.id, {
        status: "rejected",
        reasonCode: baselinePolicyDecision.reasonCode ?? ReasonCodes.policyRejected,
        reasonDetail: baselinePolicyDecision.reasonDetail,
        policyChecks: [...assignedPolicyDecision.checks, ...baselinePolicyDecision.checks]
      });
    }

    let serializedTx: SerializedTransaction;
    try {
      serializedTx = await buildSerializedTransaction(resolvedIntent);
    } catch (error) {
      return this.rejectReceivedExecution(execution.id, {
        status: "rejected",
        reasonCode: resolveReasonCode(error, ReasonCodes.txBuildFailed),
        reasonDetail: resolveReasonDetail(error),
        policyChecks: [...assignedPolicyDecision.checks, ...baselinePolicyDecision.checks]
      });
    }

    if (!serializedTx || (Array.isArray(serializedTx) && serializedTx.length === 0)) {
      return this.rejectReceivedExecution(execution.id, {
        status: "rejected",
        reasonCode: ReasonCodes.txBuildFailed,
        reasonDetail: "Transaction builder returned an empty payload.",
        policyChecks: [...assignedPolicyDecision.checks, ...baselinePolicyDecision.checks]
      });
    }

    const simulationDecision = await evaluateSimulation(serializedTx);
    const policyChecks = [
      ...assignedPolicyDecision.checks,
      ...baselinePolicyDecision.checks,
      ...simulationDecision.checks
    ];
    if (!simulationDecision.allowed) {
      return this.rejectReceivedExecution(execution.id, {
        status: "rejected",
        reasonCode: simulationDecision.reasonCode ?? ReasonCodes.policyRpcSimulationFailed,
        reasonDetail: simulationDecision.reasonDetail,
        policyChecks
      });
    }

    return {
      intent: resolvedIntent,
      walletRef,
      walletAddress,
      provider,
      serializedTx,
      policyChecks
    };
  }

  private async runProviderAndFinalize(
    execution: IntentExecutionRecord,
    ready: BroadcastReadyExecution
  ): Promise<ExecutionResult> {
    let signature: SignatureResult;
    try {
      signature = await getWalletProvider().signAndSend({
        agentId: ready.intent.agentId,
        walletRef: ready.walletRef,
        serializedTx: ready.serializedTx
      });
    } catch (error) {
      const classified = classifySolanaFailure(
        error,
        ReasonCodes.signingFailed,
        "Provider signing or broadcast failed."
      );
      return this.failExecution(execution.id, "received", {
        status: "rejected",
        reasonCode: classified.reasonCode,
        reasonDetail: classified.reasonDetail ?? resolveReasonDetail(error),
        policyChecks: ready.policyChecks
      });
    }

    const broadcast = await this.db.repositories.intentExecutions.transitionToBroadcast(execution.id, {
      expectedStatus: "received",
      currentStep: "persist_post_broadcast_effects",
      walletRef: ready.walletRef,
      walletAddress: ready.walletAddress,
      provider: signature.provider,
      txSignature: signature.txSignature,
      txSignatures: signature.txSignatures,
      policyChecks: ready.policyChecks
    });
    if (!broadcast) {
      const latest = await this.db.repositories.intentExecutions.findById(execution.id);
      if (!latest) {
        throw new Error("INTENT_EXECUTION_NOT_FOUND");
      }
      const result = executionResultFromRecord(latest);
      if (!isTerminalResult(result)) {
        return this.awaitExecutionTerminal(latest.id);
      }
      return result;
    }

    const finalized = await this.finalizeBroadcastExecution(broadcast.id);
    if (!finalized) {
      throw new Error("INTENT_EXECUTION_NOT_FOUND");
    }
    const result = executionResultFromRecord(finalized);
    if (!isTerminalResult(result)) {
      throw new Error("INTENT_EXECUTION_NOT_TERMINAL");
    }
    return result;
  }

  private async failExecution(
    executionId: string,
    expectedStatus: "received",
    result: Extract<ExecutionResult, { status: "rejected" }>
  ): Promise<ExecutionResult> {
    const failed = await this.db.db.transaction(async (tx) => {
      const row = await tx.query.intentExecutionsTable.findFirst({
        where: and(eq(intentExecutionsTable.id, executionId), eq(intentExecutionsTable.status, expectedStatus))
      });
      if (!row) {
        return tx.query.intentExecutionsTable.findFirst({
          where: eq(intentExecutionsTable.id, executionId)
        });
      }

      const now = nowIso();
      await tx.insert(executionLogsTable).values({
        agentId: row.agentId,
        status: "rejected",
        reasonCode: result.reasonCode,
        policyChecksJson: JSON.stringify(result.policyChecks ?? []),
        createdAt: now
      });
      const [updated] = await tx
        .update(intentExecutionsTable)
        .set({
          status: "failed",
          reasonCode: result.reasonCode,
          reasonDetail: result.reasonDetail,
          policyChecksJson: JSON.stringify(result.policyChecks ?? []),
          policyMatchJson: result.policyMatch ? JSON.stringify(result.policyMatch) : null,
          resultJson: JSON.stringify(result),
          currentStep: "failed",
          auditLoggedAt: now,
          lastTransitionAt: now,
          updatedAt: now
        })
        .where(eq(intentExecutionsTable.id, executionId))
        .returning();
      return updated ?? row;
    });

    if (failed) {
      writeAuditEvent({
        agentId: failed.agentId,
        status: "rejected",
        reasonCode: result.reasonCode,
        policyChecks: result.policyChecks ?? []
      });
    }

    const latest = await this.db.repositories.intentExecutions.findById(executionId);
    if (!latest) {
      return result;
    }
    const terminal = executionResultFromRecord(latest);
    if (!isTerminalResult(terminal)) {
      throw new Error("INTENT_EXECUTION_NOT_TERMINAL");
    }
    return terminal;
  }
}
