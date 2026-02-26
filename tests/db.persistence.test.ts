import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connectSqlite } from "../src/db/sqlite";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { initSqliteSchema } from "./helpers/initSqliteSchema";

describe("sqlite persistence", () => {
  it("persists agent and wallet binding across reconnect", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-db-"));
    const dbPath = join(dir, "aegis.db");

    let agentId = "";
    let walletRef = "";

    const first = connectSqlite(dbPath);
    try {
      initSqliteSchema(first.client);

      const agentService = new AgentService(first.repositories.agents);
      const walletService = new AgentWalletService(
        first.repositories.agents,
        first.repositories.walletBindings,
        async (agentId) => ({ provider: "privy", walletRef: `privy_wallet_${agentId}` })
      );

      const agent = await agentService.createAgent({ name: "agent-persist-01" });
      const binding = await walletService.createAgentWallet(agent.id);

      agentId = agent.id;
      walletRef = binding.walletRef;
    } finally {
      first.client.close();
    }

    const second = connectSqlite(dbPath);
    try {
      const loadedAgent = await second.repositories.agents.findById(agentId);
      const loadedBinding = await second.repositories.walletBindings.findByAgentId(agentId);

      expect(loadedAgent?.id).toBe(agentId);
      expect(loadedAgent?.name).toBe("agent-persist-01");
      expect(loadedBinding?.walletRef).toBe(walletRef);
      expect(loadedBinding?.provider).toBe("privy");
    } finally {
      second.client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
