export type AgentStatus = "active" | "paused";
export type ProviderName = "openfort" | "local";
export type ExecutionStatus = "approved" | "rejected";

import type { agentsTable, executionLogsTable, walletBindingsTable } from "./schema";

type AgentRow = typeof agentsTable.$inferSelect;
type WalletBindingRow = typeof walletBindingsTable.$inferSelect;
type ExecutionLogRow = typeof executionLogsTable.$inferSelect;

export type AgentRecord = Omit<AgentRow, "status"> & { status: AgentStatus };
export type WalletBindingRecord = Omit<WalletBindingRow, "provider"> & { provider: ProviderName };

export interface ExecutionLogRecord extends Omit<ExecutionLogRow, "status" | "provider" | "policyChecksJson"> {
  status: ExecutionStatus;
  provider?: ProviderName;
  policyChecks: string[];
}

export interface CreateAgentInput {
  name: string;
  status: AgentStatus;
}

export interface UpsertWalletBindingInput {
  agentId: string;
  walletRef: string;
  provider: ProviderName;
}

export interface CreateExecutionLogInput {
  agentId: string;
  status: ExecutionStatus;
  reasonCode?: string;
  provider?: ProviderName;
  txSignature?: string;
  policyChecks: string[];
}

export interface AgentRepository {
  create(input: CreateAgentInput): Promise<AgentRecord>;
  findById(id: string): Promise<AgentRecord | null>;
}

export interface WalletBindingRepository {
  upsert(input: UpsertWalletBindingInput): Promise<WalletBindingRecord>;
  findByAgentId(agentId: string): Promise<WalletBindingRecord | null>;
}

export interface ExecutionLogRepository {
  append(input: CreateExecutionLogInput): Promise<ExecutionLogRecord>;
  listByAgentId(agentId: string): Promise<ExecutionLogRecord[]>;
}

export interface Repositories {
  agents: AgentRepository;
  walletBindings: WalletBindingRepository;
  executionLogs: ExecutionLogRepository;
}
