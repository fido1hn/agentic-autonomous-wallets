import type { AgentSession, CreateAgentResponse, WalletBindingResponse } from "./types";

export function createAgentSession(name: string) {
  const state: AgentSession = { name };

  return {
    get(): AgentSession {
      return { ...state };
    },

    setCredentials(agent: CreateAgentResponse): AgentSession {
      state.name = agent.name;
      state.agentId = agent.agentId;
      state.apiKey = agent.apiKey;
      return { ...state };
    },

    setWallet(wallet: WalletBindingResponse): AgentSession {
      state.walletRef = wallet.walletRef;
      state.provider = wallet.provider;
      state.walletUpdatedAt = wallet.updatedAt;
      return { ...state };
    },

    clear(): AgentSession {
      state.agentId = undefined;
      state.apiKey = undefined;
      state.walletRef = undefined;
      state.provider = undefined;
      state.walletUpdatedAt = undefined;
      return { ...state };
    },
  };
}
