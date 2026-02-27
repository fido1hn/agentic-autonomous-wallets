import { logger } from "./logger";

export interface AuditEvent {
  agentId: string;
  status: "approved" | "rejected";
  reasonCode?: string;
  provider?: "privy";
  txSignature?: string;
  policyChecks?: string[];
}

export function writeAuditEvent(event: AuditEvent): void {
  logger.info(
    {
      event: "intent.execution",
      ...event,
    },
    "Intent execution audit event",
  );
}
