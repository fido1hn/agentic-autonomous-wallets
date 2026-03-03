import type { ExecutionResult, IntentExecutionState, InternalExecutionResult } from "../types/intents";
import type { IntentExecutionRecord } from "../db/sqlite";

const nonTerminalStates = new Set<IntentExecutionState>([
  "received",
  "broadcast"
]);

const terminalStates = new Set<IntentExecutionState>(["finalized", "failed"]);

export function isTerminalExecutionState(state: IntentExecutionState): boolean {
  return terminalStates.has(state);
}

export function isInFlightExecutionState(
  state: IntentExecutionState
): state is Exclude<IntentExecutionState, "finalized" | "failed"> {
  return nonTerminalStates.has(state);
}

export function toInFlightExecutionResult(record: IntentExecutionRecord): InternalExecutionResult {
  if (!isInFlightExecutionState(record.status)) {
    throw new Error("INTENT_EXECUTION_NOT_IN_FLIGHT");
  }

  return {
    status: "pending",
    executionId: record.id,
    executionState: record.status,
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function toExecutionStatusResponse(record: IntentExecutionRecord) {
  const base = {
    executionId: record.id,
    agentId: record.agentId,
    idempotencyKey: record.idempotencyKey,
    currentStep: record.currentStep ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.status === "finalized" || record.status === "failed") {
    if (!record.result) {
      throw new Error("INTENT_EXECUTION_MISSING_RESULT");
    }
    return {
      ...base,
      ...record.result
    };
  }

  return {
    ...base,
    ...toInFlightExecutionResult(record)
  };
}
