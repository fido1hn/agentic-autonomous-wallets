import { desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { AegisPolicyDslV1 } from "../../types/policy";
import { parseAegisPolicyDslV1 } from "../../types/policy";
import * as schema from "../schema";
import { policiesTable } from "../schema";
import type { CreatePolicyInput, PolicyRecord, PolicyRepository } from "../types";
import { nowIso } from "../utils";

function toPolicyRecord(row: typeof policiesTable.$inferSelect): PolicyRecord {
  const dsl = parseAegisPolicyDslV1(JSON.parse(row.dslJson) as AegisPolicyDslV1);
  return {
    id: row.id,
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

    async list(options?: { limit?: number }): Promise<PolicyRecord[]> {
      const rows = await db.query.policiesTable.findMany({
        orderBy: [desc(policiesTable.createdAt)],
        limit: options?.limit
      });

      return rows.map(toPolicyRecord);
    }
  };
}
