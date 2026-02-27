import { and, asc, desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { walletPolicyAssignmentsTable } from "../schema";
import type {
  WalletPolicyAssignmentRecord,
  WalletPolicyAssignmentRepository
} from "../types";
import { nowIso } from "../utils";

function toWalletPolicyAssignmentRecord(
  row: typeof walletPolicyAssignmentsTable.$inferSelect
): WalletPolicyAssignmentRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    policyId: row.policyId,
    priority: row.priority,
    createdAt: row.createdAt
  };
}

export function createWalletPolicyAssignmentsRepository(
  db: BunSQLiteDatabase<typeof schema>
): WalletPolicyAssignmentRepository {
  return {
    async assign(
      agentId: string,
      policyId: string,
      options?: { priority?: number }
    ): Promise<WalletPolicyAssignmentRecord> {
      const createdAt = nowIso();
      const priority = options?.priority ?? 100;

      await db
        .insert(walletPolicyAssignmentsTable)
        .values({
          agentId,
          policyId,
          priority,
          createdAt
        })
        .onConflictDoUpdate({
          target: [
            walletPolicyAssignmentsTable.agentId,
            walletPolicyAssignmentsTable.policyId
          ],
          set: {
            priority
          }
        });

      const row = await db.query.walletPolicyAssignmentsTable.findFirst({
        where: and(
          eq(walletPolicyAssignmentsTable.agentId, agentId),
          eq(walletPolicyAssignmentsTable.policyId, policyId)
        )
      });

      if (!row) {
        throw new Error("DB_WALLET_POLICY_ASSIGN_FAILED");
      }

      return toWalletPolicyAssignmentRecord(row);
    },

    async listByAgentId(agentId: string): Promise<WalletPolicyAssignmentRecord[]> {
      const rows = await db.query.walletPolicyAssignmentsTable.findMany({
        where: eq(walletPolicyAssignmentsTable.agentId, agentId),
        orderBy: [desc(walletPolicyAssignmentsTable.priority), asc(walletPolicyAssignmentsTable.createdAt)]
      });

      return rows.map(toWalletPolicyAssignmentRecord);
    }
  };
}
