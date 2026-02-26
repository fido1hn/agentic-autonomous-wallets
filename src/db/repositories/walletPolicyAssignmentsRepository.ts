import { and, eq } from "drizzle-orm";
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
    createdAt: row.createdAt
  };
}

export function createWalletPolicyAssignmentsRepository(
  db: BunSQLiteDatabase<typeof schema>
): WalletPolicyAssignmentRepository {
  return {
    async assign(agentId: string, policyId: string): Promise<WalletPolicyAssignmentRecord> {
      const createdAt = nowIso();

      await db
        .insert(walletPolicyAssignmentsTable)
        .values({
          agentId,
          policyId,
          createdAt
        })
        .onConflictDoNothing({
          target: [
            walletPolicyAssignmentsTable.agentId,
            walletPolicyAssignmentsTable.policyId
          ]
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
        where: eq(walletPolicyAssignmentsTable.agentId, agentId)
      });

      return rows.map(toWalletPolicyAssignmentRecord);
    }
  };
}
