export type AgentStatus = "active" | "paused";
export type ProviderName = "privy";
export type ExecutionStatus = "approved" | "rejected";
export type AgentApiKeyStatus = "active" | "revoked";
export type PolicyStatus = "active" | "disabled" | "archived";

import type { AegisPolicyDslV1 } from "../types/policy";
import type {
  agentApiKeysTable,
  dailySpendCountersTable,
  agentsTable,
  executionLogsTable,
  intentIdempotencyRecordsTable,
  policiesTable,
  walletBindingsTable,
  walletPolicyAssignmentsTable
} from "./schema";

type AgentRow = typeof agentsTable.$inferSelect;
type WalletBindingRow = typeof walletBindingsTable.$inferSelect;
type ExecutionLogRow = typeof executionLogsTable.$inferSelect;
type AgentApiKeyRow = typeof agentApiKeysTable.$inferSelect;
type PolicyRow = typeof policiesTable.$inferSelect;
type WalletPolicyAssignmentRow = typeof walletPolicyAssignmentsTable.$inferSelect;
type DailySpendCounterRow = typeof dailySpendCountersTable.$inferSelect;
type IntentIdempotencyRecordRow = typeof intentIdempotencyRecordsTable.$inferSelect;

export type AgentRecord = Omit<AgentRow, "status"> & { status: AgentStatus };
export type WalletBindingRecord = Omit<WalletBindingRow, "provider" | "walletAddress"> & {
  provider: ProviderName;
  walletAddress?: string;
};
export type AgentApiKeyRecord = Omit<AgentApiKeyRow, "status"> & { status: AgentApiKeyStatus };
export type PolicyRecord = Omit<PolicyRow, "status" | "dslJson"> & {
  status: PolicyStatus;
  dsl: AegisPolicyDslV1;
};
export type WalletPolicyAssignmentRecord = WalletPolicyAssignmentRow;
export type DailySpendCounterRecord = DailySpendCounterRow;
export type IntentIdempotencyRecord = IntentIdempotencyRecordRow;

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
  walletAddress?: string;
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

export interface CreateAgentApiKeyInput {
  agentId: string;
  keyHash: string;
  label?: string;
}

export interface CreatePolicyInput {
  name: string;
  description?: string;
  status?: PolicyStatus;
  dsl: AegisPolicyDslV1;
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
  listByAgentId(agentId: string, options?: { limit?: number }): Promise<ExecutionLogRecord[]>;
}

export interface AgentApiKeyRepository {
  create(input: CreateAgentApiKeyInput): Promise<AgentApiKeyRecord>;
  findActiveByAgentId(agentId: string): Promise<AgentApiKeyRecord | null>;
  revokeByAgentId(agentId: string): Promise<number>;
  touchLastUsed(id: string): Promise<void>;
}

export interface PolicyRepository {
  create(input: CreatePolicyInput): Promise<PolicyRecord>;
  findById(id: string): Promise<PolicyRecord | null>;
  list(options?: { limit?: number }): Promise<PolicyRecord[]>;
}

export interface WalletPolicyAssignmentRepository {
  assign(
    agentId: string,
    policyId: string,
    options?: { priority?: number }
  ): Promise<WalletPolicyAssignmentRecord>;
  listByAgentId(agentId: string): Promise<WalletPolicyAssignmentRecord[]>;
}

export interface DailySpendCounterRepository {
  getByAgentAndDay(agentId: string, dayKey: string): Promise<DailySpendCounterRecord | null>;
  addSpend(agentId: string, dayKey: string, amountLamports: string): Promise<DailySpendCounterRecord>;
}

export interface IntentIdempotencyRepository {
  find(agentId: string, idempotencyKey: string): Promise<IntentIdempotencyRecord | null>;
  save(agentId: string, idempotencyKey: string, resultJson: string): Promise<IntentIdempotencyRecord>;
}

export interface Repositories {
  agents: AgentRepository;
  walletBindings: WalletBindingRepository;
  executionLogs: ExecutionLogRepository;
  agentApiKeys: AgentApiKeyRepository;
  policies: PolicyRepository;
  walletPolicyAssignments: WalletPolicyAssignmentRepository;
  dailySpendCounters: DailySpendCounterRepository;
  intentIdempotency: IntentIdempotencyRepository;
}
