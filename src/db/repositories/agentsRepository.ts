import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { agentsTable } from "../schema";
import type { AgentRecord, AgentRepository, CreateAgentInput } from "../types";
import { nowIso } from "../utils";

// Agents table data access (no business workflow logic).
function toAgentRecord(row: typeof agentsTable.$inferSelect): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function createAgentsRepository(db: BunSQLiteDatabase<typeof schema>): AgentRepository {
  return {
    async create(input: CreateAgentInput): Promise<AgentRecord> {
      const timestamp = nowIso();

      const [row] = await db
        .insert(agentsTable)
        .values({
          name: input.name,
          status: input.status,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();
      if (!row) {
        throw new Error("DB_AGENT_CREATE_FAILED");
      }

      return toAgentRecord(row);
    },

    async findById(id: string): Promise<AgentRecord | null> {
      const row = await db.query.agentsTable.findFirst({ where: eq(agentsTable.id, id) });
      return row ? toAgentRecord(row) : null;
    }
  };
}
