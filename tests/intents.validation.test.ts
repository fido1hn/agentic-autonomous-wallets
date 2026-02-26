import { describe, expect, it } from "bun:test";
import { validateExecutionIntent } from "../src/types/intents";

describe("validateExecutionIntent", () => {
  it("accepts a valid swap intent shape", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "swap",
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountLamports: "1000000",
      maxSlippageBps: 100
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.intent?.action).toBe("swap");
    expect(result.intent?.amountLamports).toBe("1000000");
  });

  it("rejects missing required fields for swap", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "swap",
      amountLamports: "1000000"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("FROM_MINT_REQUIRED_FOR_SWAP");
    expect(result.errors).toContain("TO_MINT_REQUIRED_FOR_SWAP");
  });

  it("rejects non-positive lamports", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "transfer",
      amountLamports: "0"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AMOUNT_LAMPORTS_INVALID");
  });
});
