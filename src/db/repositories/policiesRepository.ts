import { and, desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { AegisPolicyDsl } from "../../types/policy";
import { parseAegisPolicyDsl } from "../../types/policy";
import * as schema from "../schema";
import { policiesTable, walletPolicyAssignmentsTable } from "../schema";
import type {
  CreatePolicyInput,
  PolicyRecord,
  PolicyRepository,
  UpdatePolicyInput
} from "../types";
import { nowIso } from "../utils";

function toPolicyRecord(row: typeof policiesTable.$inferSelect): PolicyRecord {
  const dsl = parseAegisPolicyDsl(JSON.parse(row.dslJson) as AegisPolicyDsl);
  return {
    id: row.id,
    ownerAgentId: row.ownerAgentId ?? undefined,
    name: row.name,
    description: row.description,
    status: row.status,
    dsl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function createPoliciesRepository(
  db: BunSQLiteDatabase<typeof schema>
): PolicyRepository {
  return {
    async create(input: CreatePolicyInput): Promise<PolicyRecord> {
      const timestamp = nowIso();

      const [row] = await db
        .insert(policiesTable)
        .values({
          ownerAgentId: input.ownerAgentId,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "active",
          dslJson: JSON.stringify(input.dsl),
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();

      if (!row) {
        throw new Error("DB_POLICY_CREATE_FAILED");
      }

      return toPolicyRecord(row);
    },

    async findById(id: string): Promise<PolicyRecord | null> {
      const row = await db.query.policiesTable.findFirst({
        where: eq(policiesTable.id, id)
      });

      return row ? toPolicyRecord(row) : null;
    },

    async findByIdForOwner(id: string, ownerAgentId: string): Promise<PolicyRecord | null> {
      const row = await db.query.policiesTable.findFirst({
        where: and(eq(policiesTable.id, id), eq(policiesTable.ownerAgentId, ownerAgentId))
      });

      return row ? toPolicyRecord(row) : null;
    },

    async list(options?: { limit?: number }): Promise<PolicyRecord[]> {
      const rows = await db.query.policiesTable.findMany({
        orderBy: [desc(policiesTable.createdAt)],
        limit: options?.limit
      });

      return rows.map(toPolicyRecord);
    },

    async listForOwner(ownerAgentId, options) {
      const rows = await db.query.policiesTable.findMany({
        where: and(
          eq(policiesTable.ownerAgentId, ownerAgentId),
          options?.status ? eq(policiesTable.status, options.status) : undefined
        ),
        orderBy: [desc(policiesTable.createdAt)],
        limit: options?.limit
      });

      let records = rows.map(toPolicyRecord);

      if (options?.assigned !== undefined && options.assignedAgentId) {
        const assignments = await db.query.walletPolicyAssignmentsTable.findMany({
          where: eq(walletPolicyAssignmentsTable.agentId, options.assignedAgentId)
        });
        const assignedPolicyIds = new Set(assignments.map((assignment) => assignment.policyId));
        records = records.filter((record) =>
          options.assigned ? assignedPolicyIds.has(record.id) : !assignedPolicyIds.has(record.id)
        );
      }

      return records;
    },

    async updateForOwner(id: string, ownerAgentId: string, input: UpdatePolicyInput): Promise<PolicyRecord | null> {
      const timestamp = nowIso();
      const values: Record<string, unknown> = {
        updatedAt: timestamp
      };
      if (input.name !== undefined) {
        values.name = input.name;
      }
      if (input.description !== undefined) {
        values.description = input.description ?? null;
      }
      if (input.status !== undefined) {
        values.status = input.status;
      }
      if (input.dsl !== undefined) {
        values.dslJson = JSON.stringify(input.dsl);
      }

      const rows = await db
        .update(policiesTable)
        .set(values)
        .where(and(eq(policiesTable.id, id), eq(policiesTable.ownerAgentId, ownerAgentId)))
        .returning();

      return rows[0] ? toPolicyRecord(rows[0]) : null;
    },

    async archiveForOwner(id: string, ownerAgentId: string): Promise<PolicyRecord | null> {
      const rows = await db
        .update(policiesTable)
        .set({
          status: "archived",
          updatedAt: nowIso()
        })
        .where(and(eq(policiesTable.id, id), eq(policiesTable.ownerAgentId, ownerAgentId)))
        .returning();

      return rows[0] ? toPolicyRecord(rows[0]) : null;
    }
  };
}
