export interface AgentPolicy {
  agentId: string;
  maxLamportsPerTx: string;
  dailyLamportsCap: string;
  allowlistedPrograms: string[];
  allowlistedMints: string[];
}

export interface ProviderPolicyMeta {
  provider: "privy";
  policyIds: string[];
}
