import type { ExecutionIntent, ExecutionResult } from "../types/intents";
import { getActiveAppContext } from "../api/appContext";

export async function routeIntent(intent: ExecutionIntent): Promise<ExecutionResult> {
  const { intentExecutionService } = getActiveAppContext();
  return intentExecutionService.submitIntent(intent);
}
