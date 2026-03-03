import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type {
  CreateIntentExecutionInput,
  IntentExecutionRecord,
  IntentExecutionRepository,
  ProviderName
} from "../types";
import * as schema from "../schema";
import { intentExecutionsTable } from "../schema";
import { nowIso } from "../utils";
import type { ExecutionResult, PolicyMatchInfo } from "../../types/intents";

function parseJson<T>(raw: string | null | undefined): T | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function toIntentExecutionRecord(
  row: typeof intentExecutionsTable.$inferSelect
): IntentExecutionRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    action: row.action,
    intent: parseJson(row.intentJson) ?? {
      agentId: row.agentId,
      action: row.action,
      amountAtomic: "0",
      idempotencyKey: row.idempotencyKey
    },
    result: parseJson<ExecutionResult>(row.resultJson),
    walletRef: row.walletRef ?? null,
    walletAddress: row.walletAddress ?? null,
    provider: (row.provider ?? undefined) as ProviderName | undefined,
    txSignature: row.txSignature ?? null,
    txSignatures: parseJson<string[]>(row.txSignaturesJson),
    reasonCode: row.reasonCode ?? null,
    reasonDetail: row.reasonDetail ?? null,
    policyChecks: parseJson<string[]>(row.policyChecksJson),
    policyMatch: parseJson<PolicyMatchInfo>(row.policyMatchJson),
    currentStep: row.currentStep ?? null,
    spendAppliedAt: row.spendAppliedAt ?? null,
    auditLoggedAt: row.auditLoggedAt ?? null,
    lastTransitionAt: row.lastTransitionAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function findById(
  db: BunSQLiteDatabase<typeof schema>,
  id: string
): Promise<IntentExecutionRecord | null> {
  const row = await db.query.intentExecutionsTable.findFirst({
    where: eq(intentExecutionsTable.id, id)
  });
  return row ? toIntentExecutionRecord(row) : null;
}

export function createIntentExecutionsRepository(
  db: BunSQLiteDatabase<typeof schema>
): IntentExecutionRepository {
  return {
    async createReceived(input: CreateIntentExecutionInput): Promise<IntentExecutionRecord> {
      const now = nowIso();
      const [row] = await db
        .insert(intentExecutionsTable)
        .values({
          agentId: input.agentId,
          idempotencyKey: input.idempotencyKey,
          status: "received",
          action: input.action,
          intentJson: JSON.stringify(input.intent),
          currentStep: "received",
          lastTransitionAt: now,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      if (!row) {
        throw new Error("DB_INTENT_EXECUTION_CREATE_FAILED");
      }
      return toIntentExecutionRecord(row);
    },

    async findByAgentAndIdempotencyKey(agentId: string, idempotencyKey: string) {
      const row = await db.query.intentExecutionsTable.findFirst({
        where: and(
          eq(intentExecutionsTable.agentId, agentId),
          eq(intentExecutionsTable.idempotencyKey, idempotencyKey)
        )
      });
      return row ? toIntentExecutionRecord(row) : null;
    },

    async findById(id: string) {
      return findById(db, id);
    },

    async listRecoverable() {
      const rows = await db.query.intentExecutionsTable.findMany({
        where: inArray(intentExecutionsTable.status, ["received", "broadcast"]),
        orderBy: [desc(intentExecutionsTable.updatedAt)]
      });
      return rows.map(toIntentExecutionRecord);
    },

    async transitionToBroadcast(id, patch) {
      const now = nowIso();
      const [row] = await db
        .update(intentExecutionsTable)
        .set({
          status: "broadcast",
          currentStep: patch.currentStep ?? "broadcast",
          walletRef: patch.walletRef,
          walletAddress: patch.walletAddress,
          provider: patch.provider,
          txSignature: patch.txSignature,
          txSignaturesJson: JSON.stringify(patch.txSignatures ?? [patch.txSignature]),
          policyChecksJson: JSON.stringify(patch.policyChecks),
          lastTransitionAt: now,
          updatedAt: now
        })
        .where(and(eq(intentExecutionsTable.id, id), eq(intentExecutionsTable.status, patch.expectedStatus)))
        .returning();
      return row ? toIntentExecutionRecord(row) : null;
    },

    async finalizeSuccess(id, patch) {
      const now = nowIso();
      const [row] = await db
        .update(intentExecutionsTable)
        .set({
          status: "finalized",
          resultJson: JSON.stringify(patch.result),
          spendAppliedAt: patch.spendAppliedAt,
          auditLoggedAt: patch.auditLoggedAt,
          currentStep: "finalized",
          lastTransitionAt: now,
          updatedAt: now
        })
        .where(and(eq(intentExecutionsTable.id, id), eq(intentExecutionsTable.status, patch.expectedStatus)))
        .returning();
      return row ? toIntentExecutionRecord(row) : null;
    },

    async finalizeFailure(id, patch) {
      const now = nowIso();
      const [row] = await db
        .update(intentExecutionsTable)
        .set({
          status: "failed",
          reasonCode: patch.reasonCode,
          reasonDetail: patch.reasonDetail,
          policyChecksJson: patch.policyChecks ? JSON.stringify(patch.policyChecks) : undefined,
          policyMatchJson: patch.policyMatch ? JSON.stringify(patch.policyMatch) : undefined,
          resultJson: JSON.stringify(patch.result),
          currentStep: "failed",
          lastTransitionAt: now,
          updatedAt: now
        })
        .where(and(eq(intentExecutionsTable.id, id), eq(intentExecutionsTable.status, patch.expectedStatus)))
        .returning();
      return row ? toIntentExecutionRecord(row) : null;
    },

    async markSpendApplied(id, expectedStatus, timestamp) {
      const [row] = await db
        .update(intentExecutionsTable)
        .set({
          spendAppliedAt: timestamp,
          updatedAt: timestamp
        })
        .where(
          and(
            eq(intentExecutionsTable.id, id),
            eq(intentExecutionsTable.status, expectedStatus),
            isNull(intentExecutionsTable.spendAppliedAt)
          )
        )
        .returning();
      return !!row;
    },

    async markAuditLogged(id, expectedStatus, timestamp) {
      const [row] = await db
        .update(intentExecutionsTable)
        .set({
          auditLoggedAt: timestamp,
          updatedAt: timestamp
        })
        .where(
          and(
            eq(intentExecutionsTable.id, id),
            eq(intentExecutionsTable.status, expectedStatus),
            isNull(intentExecutionsTable.auditLoggedAt)
          )
        )
        .returning();
      return !!row;
    }
  };
}
