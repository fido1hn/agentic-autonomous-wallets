import { and, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { dailyActionSpendCountersTable } from "../schema";
import type {
  DailyActionSpendCounterRecord,
  DailyActionSpendCounterRepository
} from "../types";
import { nowIso } from "../utils";

function toRecord(
  row: typeof dailyActionSpendCountersTable.$inferSelect
): DailyActionSpendCounterRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    dayKey: row.dayKey,
    action: row.action,
    spentLamports: row.spentLamports,
    updatedAt: row.updatedAt
  };
}

function parseLamports(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function createDailyActionSpendCountersRepository(
  db: BunSQLiteDatabase<typeof schema>
): DailyActionSpendCounterRepository {
  return {
    async getByAgentDayAndAction(agentId, dayKey, action) {
      const row = await db.query.dailyActionSpendCountersTable.findFirst({
        where: and(
          eq(dailyActionSpendCountersTable.agentId, agentId),
          eq(dailyActionSpendCountersTable.dayKey, dayKey),
          eq(dailyActionSpendCountersTable.action, action)
        )
      });
      return row ? toRecord(row) : null;
    },

    async addSpend(agentId, dayKey, action, amountLamports) {
      const now = nowIso();
      const amount = parseLamports(amountLamports).toString();

      return db.transaction(async (tx) => {
        const existing = await tx.query.dailyActionSpendCountersTable.findFirst({
          where: and(
            eq(dailyActionSpendCountersTable.agentId, agentId),
            eq(dailyActionSpendCountersTable.dayKey, dayKey),
            eq(dailyActionSpendCountersTable.action, action)
          )
        });

        if (!existing) {
          const [inserted] = await tx
            .insert(dailyActionSpendCountersTable)
            .values({
              agentId,
              dayKey,
              action,
              spentLamports: amount,
              updatedAt: now
            })
            .returning();

          if (!inserted) {
            throw new Error("DB_DAILY_ACTION_SPEND_INSERT_FAILED");
          }
          return toRecord(inserted);
        }

        const [updated] = await tx
          .update(dailyActionSpendCountersTable)
          .set({
            spentLamports: sql`CAST(${dailyActionSpendCountersTable.spentLamports} AS INTEGER) + ${amount}`,
            updatedAt: now
          })
          .where(eq(dailyActionSpendCountersTable.id, existing.id))
          .returning();

        if (!updated) {
          throw new Error("DB_DAILY_ACTION_SPEND_UPDATE_FAILED");
        }

        return toRecord(updated);
      });
    }
  };
}
