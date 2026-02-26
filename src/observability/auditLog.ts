export interface AuditEvent {
  agentId: string;
  status: "approved" | "rejected";
  reasonCode?: string;
  provider?: "privy";
  txSignature?: string;
  policyChecks?: string[];
}

export function writeAuditEvent(event: AuditEvent): void {
  // TODO: Persist to DB when sqlite layer is wired. JSON logs keep audits visible now.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "intent.execution",
      ...event
    })
  );
}
