import { and, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { agentApiKeysTable } from "../schema";
import type {
  AgentApiKeyRecord,
  AgentApiKeyRepository,
  CreateAgentApiKeyInput
} from "../types";
import { nowIso } from "../utils";

function toAgentApiKeyRecord(row: typeof agentApiKeysTable.$inferSelect): AgentApiKeyRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    keyHash: row.keyHash,
    label: row.label,
    status: row.status,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt
  };
}

export function createAgentApiKeysRepository(
  db: BunSQLiteDatabase<typeof schema>
): AgentApiKeyRepository {
  return {
    async create(input: CreateAgentApiKeyInput): Promise<AgentApiKeyRecord> {
      const createdAt = nowIso();
      const [row] = await db
        .insert(agentApiKeysTable)
        .values({
          agentId: input.agentId,
          keyHash: input.keyHash,
          label: input.label ?? null,
          status: "active",
          createdAt,
          lastUsedAt: null
        })
        .returning();

      if (!row) {
        throw new Error("DB_AGENT_API_KEY_CREATE_FAILED");
      }
      return toAgentApiKeyRecord(row);
    },

    async findActiveByAgentId(agentId: string): Promise<AgentApiKeyRecord | null> {
      const row = await db.query.agentApiKeysTable.findFirst({
        where: and(eq(agentApiKeysTable.agentId, agentId), eq(agentApiKeysTable.status, "active"))
      });
      return row ? toAgentApiKeyRecord(row) : null;
    },

    async revokeByAgentId(agentId: string): Promise<number> {
      const rows = await db
        .update(agentApiKeysTable)
        .set({ status: "revoked" })
        .where(and(eq(agentApiKeysTable.agentId, agentId), eq(agentApiKeysTable.status, "active")))
        .returning({ id: agentApiKeysTable.id });
      return rows.length;
    },

    async touchLastUsed(id: string): Promise<void> {
      await db
        .update(agentApiKeysTable)
        .set({ lastUsedAt: nowIso() })
        .where(eq(agentApiKeysTable.id, id));
    }
  };
}
