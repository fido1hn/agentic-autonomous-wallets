import { and, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { dailySpendCountersTable } from "../schema";
import type { DailySpendCounterRecord, DailySpendCounterRepository } from "../types";
import { nowIso } from "../utils";

function toDailySpendCounterRecord(
  row: typeof dailySpendCountersTable.$inferSelect
): DailySpendCounterRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    dayKey: row.dayKey,
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

export function createDailySpendCountersRepository(
  db: BunSQLiteDatabase<typeof schema>
): DailySpendCounterRepository {
  return {
    async getByAgentAndDay(agentId: string, dayKey: string): Promise<DailySpendCounterRecord | null> {
      const row = await db.query.dailySpendCountersTable.findFirst({
        where: and(eq(dailySpendCountersTable.agentId, agentId), eq(dailySpendCountersTable.dayKey, dayKey))
      });
      return row ? toDailySpendCounterRecord(row) : null;
    },

    async addSpend(agentId: string, dayKey: string, amountLamports: string): Promise<DailySpendCounterRecord> {
      const now = nowIso();
      const amount = parseLamports(amountLamports);
      const amountString = amount.toString();

      // Atomic increment to avoid lost updates under concurrent requests.
      await db
        .insert(dailySpendCountersTable)
        .values({
          agentId,
          dayKey,
          spentLamports: amountString,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [dailySpendCountersTable.agentId, dailySpendCountersTable.dayKey],
          set: {
            spentLamports: sql`CAST(${dailySpendCountersTable.spentLamports} AS INTEGER) + ${amountString}`,
            updatedAt: now
          }
        });

      const row = await db.query.dailySpendCountersTable.findFirst({
        where: and(eq(dailySpendCountersTable.agentId, agentId), eq(dailySpendCountersTable.dayKey, dayKey))
      });

      if (!row) {
        throw new Error("DB_DAILY_SPEND_UPSERT_FAILED");
      }
      return toDailySpendCounterRecord(row);
    }
  };
}
