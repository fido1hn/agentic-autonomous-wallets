import { describe, expect, it } from "bun:test";
import { createAgentSession } from "../src/demo/agent/session";

describe("agent demo session store", () => {
  it("stores credentials and wallet bindings in memory", () => {
    const session = createAgentSession("agent-alpha");
    expect(session.get().name).toBe("agent-alpha");
    expect(session.get().agentId).toBeUndefined();

    session.setCredentials({
      agentId: "agent-1",
      name: "agent-alpha",
      status: "active",
      apiKey: "aegis_sk_demo",
    });

    session.setWallet({
      agentId: "agent-1",
      walletRef: "wlt_123",
      walletAddress: "So1anaPubKey11111111111111111111111111111111",
      provider: "privy",
      updatedAt: "2026-02-27T00:00:00.000Z",
    });

    expect(session.get().agentId).toBe("agent-1");
    expect(session.get().walletRef).toBe("wlt_123");
    expect(session.get().walletAddress).toBe("So1anaPubKey11111111111111111111111111111111");
  });
});
