import type { AgentRepository, AgentRecord, AgentStatus } from "../db/sqlite";

export interface CreateAgentParams {
  name: string;
  status?: AgentStatus;
}

export class AgentService {
  constructor(private readonly agents: AgentRepository) {}

  async createAgent(params: CreateAgentParams): Promise<AgentRecord> {
    return this.agents.create({
      name: params.name,
      status: params.status ?? "active"
    });
  }

  async getAgentById(agentId: string): Promise<AgentRecord | null> {
    return this.agents.findById(agentId);
  }
}
