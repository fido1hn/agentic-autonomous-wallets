import type { SqliteContext } from "../db/sqlite";
import { connectSqlite, resolveDbPath, runDrizzleMigrations } from "../db/sqlite";
import { AgentService } from "../services/agentService";
import { AgentWalletService } from "../services/agentWalletService";
import { clearActiveAegisContainer, setActiveAegisContainer } from "./container";

export interface AegisRuntime {
  db: SqliteContext;
  agentService: AgentService;
  agentWalletService: AgentWalletService;
  stop: () => void;
}

export async function startAegisRuntime(): Promise<AegisRuntime> {
  const db = connectSqlite();
  const path = resolveDbPath();
  runDrizzleMigrations(db.db);
  const agentService = new AgentService(db.repositories.agents);
  const agentWalletService = new AgentWalletService(db.repositories.agents, db.repositories.walletBindings);

  setActiveAegisContainer({
    db,
    agentService,
    agentWalletService
  });

  console.log(`Aegis runtime started (db: ${path})`);

  return {
    db,
    agentService,
    agentWalletService,
    stop: () => {
      clearActiveAegisContainer();
      db.client.close();
      console.log("Aegis runtime stopped");
    }
  };
}
