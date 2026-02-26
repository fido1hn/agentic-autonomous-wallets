import { describe, expect, it } from "bun:test";
import type { PolicyRecord } from "../src/db/sqlite";
import type { ExecutionIntent } from "../src/types/intents";
import { evaluateAssignedPolicies } from "../src/core/policyEngine";

function baseIntent(overrides?: Partial<ExecutionIntent>): ExecutionIntent {
  return {
    agentId: "agent-1",
    action: "swap",
    fromMint: "So11111111111111111111111111111111111111112",
    toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountLamports: "1000000",
    maxSlippageBps: 100,
    ...overrides
  };
}

function policyRecord(overrides?: Partial<PolicyRecord>): PolicyRecord {
  return {
    id: "ply_1",
    name: "default",
    description: null,
    status: "active",
    dsl: {
      version: "aegis.policy.v1",
      rules: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("evaluateAssignedPolicies", () => {
  it("allows when no policies are assigned", async () => {
    const result = await evaluateAssignedPolicies(baseIntent(), []);
    expect(result.allowed).toBe(true);
    expect(result.checks.includes("assigned_policies:none")).toBe(true);
  });

  it("rejects when action is not allowed", async () => {
    const result = await evaluateAssignedPolicies(baseIntent({ action: "transfer" }), [
      policyRecord({
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "allowed_actions", actions: ["swap"] }]
        }
      })
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_ACTION_NOT_ALLOWED");
  });

  it("rejects when max lamports per tx rule is exceeded", async () => {
    const result = await evaluateAssignedPolicies(baseIntent({ amountLamports: "2000000" }), [
      policyRecord({
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "max_lamports_per_tx", lteLamports: "1000000" }]
        }
      })
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_DSL_MAX_PER_TX_EXCEEDED");
  });

  it("rejects swap when mint is not in allowlist", async () => {
    const result = await evaluateAssignedPolicies(baseIntent(), [
      policyRecord({
        dsl: {
          version: "aegis.policy.v1",
          rules: [
            {
              kind: "allowed_mints",
              mints: ["So11111111111111111111111111111111111111112"]
            }
          ]
        }
      })
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_MINT_NOT_ALLOWED");
  });

  it("rejects swap when max slippage rule exists and intent omits slippage", async () => {
    const result = await evaluateAssignedPolicies(baseIntent({ maxSlippageBps: undefined }), [
      policyRecord({
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "max_slippage_bps", lteBps: 100 }]
        }
      })
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_SWAP_SLIPPAGE_REQUIRED");
  });

  it("allows when all assigned policy rules pass", async () => {
    const result = await evaluateAssignedPolicies(baseIntent(), [
      policyRecord({
        dsl: {
          version: "aegis.policy.v1",
          rules: [
            { kind: "allowed_actions", actions: ["swap"] },
            { kind: "max_lamports_per_tx", lteLamports: "5000000" },
            {
              kind: "allowed_mints",
              mints: [
                "So11111111111111111111111111111111111111112",
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
              ]
            },
            { kind: "max_slippage_bps", lteBps: 1000 }
          ]
        }
      })
    ]);

    expect(result.allowed).toBe(true);
  });
});
