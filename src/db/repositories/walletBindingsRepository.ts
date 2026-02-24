import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { walletBindingsTable } from "../schema";
import type { UpsertWalletBindingInput, WalletBindingRecord, WalletBindingRepository } from "../types";
import { nowIso } from "../utils";

// Wallet binding persistence for agent -> walletRef/provider relations.
function toWalletBindingRecord(row: typeof walletBindingsTable.$inferSelect): WalletBindingRecord {
  return {
    agentId: row.agentId,
    walletRef: row.walletRef,
    provider: row.provider,
    updatedAt: row.updatedAt
  };
}

export function createWalletBindingsRepository(
  db: BunSQLiteDatabase<typeof schema>
): WalletBindingRepository {
  return {
    async upsert(input: UpsertWalletBindingInput): Promise<WalletBindingRecord> {
      const updatedAt = nowIso();

      await db
        .insert(walletBindingsTable)
        .values({
          agentId: input.agentId,
          walletRef: input.walletRef,
          provider: input.provider,
          updatedAt
        })
        .onConflictDoUpdate({
          target: walletBindingsTable.agentId,
          set: {
            walletRef: input.walletRef,
            provider: input.provider,
            updatedAt
          }
        });

      const row = await db.query.walletBindingsTable.findFirst({
        where: eq(walletBindingsTable.agentId, input.agentId)
      });

      if (!row) {
        throw new Error("DB_WALLET_BINDING_UPSERT_FAILED");
      }

      return toWalletBindingRecord(row);
    },

    async findByAgentId(agentId: string): Promise<WalletBindingRecord | null> {
      const row = await db.query.walletBindingsTable.findFirst({
        where: eq(walletBindingsTable.agentId, agentId)
      });

      return row ? toWalletBindingRecord(row) : null;
    }
  };
}
