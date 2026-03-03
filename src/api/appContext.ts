import { connectSqlite, resolveDbPath, runDrizzleMigrations, type SqliteContext } from "../db/sqlite";
import { AgentAuthService } from "../services/agentAuthService";
import { AgentService } from "../services/agentService";
import { IntentExecutionService } from "../services/intentExecutionService";
import { AgentWalletService } from "../services/agentWalletService";
import { PolicyService } from "../services/policyService";
import { assertPrivyConfig } from "../wallet/privyClient";

export interface AppContext {
  db: SqliteContext;
  dbPath: string;
  agentService: AgentService;
  agentWalletService: AgentWalletService;
  agentAuthService: AgentAuthService;
  policyService: PolicyService;
  intentExecutionService: IntentExecutionService;
}

let activeAppContext: AppContext | null = null;

export function getActiveAppContext(): AppContext {
  if (!activeAppContext) {
    throw new Error("AEGIS_APP_CONTEXT_NOT_INITIALIZED");
  }
  return activeAppContext;
}

export function clearActiveAppContext(): void {
  activeAppContext = null;
}

export function setActiveAppContextForTests(context: AppContext | null): void {
  activeAppContext = context;
}

export async function createAppContext(): Promise<AppContext> {
  assertPrivyConfig();

  const db = connectSqlite();
  runDrizzleMigrations(db.db);
  const dbPath = resolveDbPath();

  const agentService = new AgentService(db.repositories.agents);
  const agentWalletService = new AgentWalletService(db.repositories.agents, db.repositories.walletBindings);
  const agentAuthService = new AgentAuthService(db.repositories.agents, db.repositories.agentApiKeys);
  const policyService = new PolicyService(
    db.repositories.policies,
    db.repositories.walletBindings,
    db.repositories.walletPolicyAssignments
  );
  const intentExecutionService = new IntentExecutionService(db, agentWalletService, policyService);

  const context: AppContext = {
    db,
    dbPath,
    agentService,
    agentWalletService,
    agentAuthService,
    policyService,
    intentExecutionService
  };

  activeAppContext = context;
  await intentExecutionService.resumeRecoverableExecutions();
  return context;
}

export function closeAppContext(context: AppContext): void {
  if (activeAppContext === context) {
    clearActiveAppContext();
  }
  context.db.client.close();
}
