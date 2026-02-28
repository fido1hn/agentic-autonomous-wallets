import { describe, expect, it } from "bun:test";
import { validateExecutionIntent } from "../src/types/intents";

describe("validateExecutionIntent", () => {
  it("accepts a valid swap intent shape and normalizes amountAtomic", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "swap",
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountAtomic: "1000000",
      maxSlippageBps: 100
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.intent?.action).toBe("swap");
    expect(result.intent?.amountAtomic).toBe("1000000");
  });

  it("rejects missing required fields for swap", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "swap",
      amountAtomic: "1000000"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("FROM_MINT_REQUIRED_FOR_SWAP");
    expect(result.errors).toContain("TO_MINT_REQUIRED_FOR_SWAP");
  });

  it("accepts native transfer intent", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "transfer",
      transferAsset: "native",
      recipientAddress: "8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L",
      amountAtomic: "5000"
    });

    expect(result.ok).toBe(true);
    expect(result.intent?.transferAsset).toBe("native");
    expect(result.intent?.recipientAddress).toBe("8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L");
  });

  it("rejects transfer without recipient", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "transfer",
      transferAsset: "native",
      amountAtomic: "5000"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("RECIPIENT_ADDRESS_REQUIRED_FOR_TRANSFER");
  });

  it("rejects SPL transfer without mint", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "transfer",
      transferAsset: "spl",
      recipientAddress: "8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L",
      amountAtomic: "5000"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("MINT_ADDRESS_REQUIRED_FOR_SPL_TRANSFER");
  });

  it("accepts legacy amountLamports and normalizes to amountAtomic", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "swap",
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountLamports: "1000000"
    });

    expect(result.ok).toBe(true);
    expect(result.intent?.amountAtomic).toBe("1000000");
  });

  it("rejects non-positive atomic amount", () => {
    const result = validateExecutionIntent({
      agentId: "agent-mm-01",
      action: "transfer",
      transferAsset: "native",
      recipientAddress: "8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L",
      amountAtomic: "0"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AMOUNT_ATOMIC_INVALID");
  });
});
