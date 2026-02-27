import { and, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { intentIdempotencyRecordsTable } from "../schema";
import type { IntentIdempotencyRecord, IntentIdempotencyRepository } from "../types";
import { nowIso } from "../utils";

function toIntentIdempotencyRecord(
  row: typeof intentIdempotencyRecordsTable.$inferSelect
): IntentIdempotencyRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    idempotencyKey: row.idempotencyKey,
    resultJson: row.resultJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function createIntentIdempotencyRepository(
  db: BunSQLiteDatabase<typeof schema>
): IntentIdempotencyRepository {
  return {
    async find(agentId: string, idempotencyKey: string): Promise<IntentIdempotencyRecord | null> {
      const row = await db.query.intentIdempotencyRecordsTable.findFirst({
        where: and(
          eq(intentIdempotencyRecordsTable.agentId, agentId),
          eq(intentIdempotencyRecordsTable.idempotencyKey, idempotencyKey)
        )
      });
      return row ? toIntentIdempotencyRecord(row) : null;
    },

    async save(
      agentId: string,
      idempotencyKey: string,
      resultJson: string
    ): Promise<IntentIdempotencyRecord> {
      const now = nowIso();

      await db
        .insert(intentIdempotencyRecordsTable)
        .values({
          agentId,
          idempotencyKey,
          resultJson,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [
            intentIdempotencyRecordsTable.agentId,
            intentIdempotencyRecordsTable.idempotencyKey
          ],
          set: {
            resultJson,
            updatedAt: now
          }
        });

      const row = await db.query.intentIdempotencyRecordsTable.findFirst({
        where: and(
          eq(intentIdempotencyRecordsTable.agentId, agentId),
          eq(intentIdempotencyRecordsTable.idempotencyKey, idempotencyKey)
        )
      });

      if (!row) {
        throw new Error("DB_INTENT_IDEMPOTENCY_SAVE_FAILED");
      }
      return toIntentIdempotencyRecord(row);
    }
  };
}
