import { desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";
import { executionLogsTable } from "../schema";
import type {
  CreateExecutionLogInput,
  ExecutionLogRecord,
  ExecutionLogRepository,
} from "../types";
import { nowIso } from "../utils";

// Execution audit log persistence (approved/rejected outcomes + policy checks).
function parsePolicyChecks(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function toExecutionLogRecord(
  row: typeof executionLogsTable.$inferSelect,
): ExecutionLogRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    status: row.status,
    reasonCode: row.reasonCode ?? null,
    provider: row.provider ?? undefined,
    txSignature: row.txSignature ?? null,
    policyChecks: parsePolicyChecks(row.policyChecksJson),
    createdAt: row.createdAt,
  };
}

export function createExecutionLogsRepository(
  db: BunSQLiteDatabase<typeof schema>,
): ExecutionLogRepository {
  return {
    async append(input: CreateExecutionLogInput): Promise<ExecutionLogRecord> {
      const createdAt = nowIso();

      const [row] = await db
        .insert(executionLogsTable)
        .values({
          agentId: input.agentId,
          status: input.status,
          reasonCode: input.reasonCode,
          provider: input.provider,
          txSignature: input.txSignature,
          policyChecksJson: JSON.stringify(input.policyChecks),
          createdAt,
        })
        .returning();
      if (!row) {
        throw new Error("DB_EXECUTION_LOG_APPEND_FAILED");
      }

      return toExecutionLogRecord(row);
    },

    async listByAgentId(
      agentId: string,
      options?: { limit?: number }
    ): Promise<ExecutionLogRecord[]> {
      const rows = await db.query.executionLogsTable.findMany({
        where: eq(executionLogsTable.agentId, agentId),
        orderBy: [desc(executionLogsTable.createdAt)],
        limit: options?.limit
      });

      return rows.map(toExecutionLogRecord);
    },
  };
}
