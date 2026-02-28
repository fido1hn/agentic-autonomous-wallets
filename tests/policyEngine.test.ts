import { describe, expect, it } from "bun:test";
import type { PolicyRecord } from "../src/db/sqlite";
import type { ExecutionIntent } from "../src/types/intents";
import {
  evaluateAssignedPolicies,
  evaluateBaselineIntent,
  evaluateSimulation,
  setSimulateSerializedTransactionForTests
} from "../src/core/policyEngine";

function baseIntent(overrides?: Partial<ExecutionIntent>): ExecutionIntent {
  return {
    agentId: "agent-1",
    action: "swap",
    fromMint: "So11111111111111111111111111111111111111112",
    toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountAtomic: "1000000",
    maxSlippageBps: 100,
    ...overrides
  };
}

function policyRecord(overrides?: Partial<PolicyRecord>): PolicyRecord {
  return {
    id: "ply_1",
    ownerAgentId: "agent-1",
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
    expect(result.match?.ruleKind).toBe("allowed_actions");
    expect(result.match?.ruleConfig).toEqual({ actions: ["swap"] });
  });

  it("rejects when max lamports per tx rule is exceeded", async () => {
    const result = await evaluateAssignedPolicies(baseIntent({ amountAtomic: "2000000" }), [
      policyRecord({
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "max_lamports_per_tx", lteLamports: "1000000" }]
        }
      })
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_DSL_MAX_PER_TX_EXCEEDED");
    expect(result.match?.ruleKind).toBe("max_lamports_per_tx");
    expect(result.match?.ruleConfig).toEqual({ lteLamports: "1000000" });
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
    expect(result.match?.ruleKind).toBe("allowed_mints");
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
    expect(result.match?.ruleKind).toBe("max_slippage_bps");
    expect(result.match?.ruleConfig).toEqual({ lteBps: 100 });
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

  it("applies allowed_mints rule to SPL transfers", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({
        action: "transfer",
        transferAsset: "spl",
        recipientAddress: "8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L",
        mintAddress: "Mint111111111111111111111111111111111111111",
        fromMint: undefined,
        toMint: undefined
      }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v1",
            rules: [{ kind: "allowed_mints", mints: ["OtherMint11111111111111111111111111111111111"] }]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_MINT_NOT_ALLOWED");
  });

  it("rejects transfer when recipient is not in allowed list", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({
        action: "transfer",
        transferAsset: "native",
        recipientAddress: "recipient-2",
        fromMint: undefined,
        toMint: undefined
      }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [{ kind: "allowed_recipients", addresses: ["recipient-1"] }]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_RECIPIENT_NOT_ALLOWED");
    expect(result.match?.ruleKind).toBe("allowed_recipients");
  });

  it("rejects transfer when recipient is blocked", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({
        action: "transfer",
        transferAsset: "native",
        recipientAddress: "blocked-recipient",
        fromMint: undefined,
        toMint: undefined
      }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [{ kind: "blocked_recipients", addresses: ["blocked-recipient"] }]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_RECIPIENT_BLOCKED");
    expect(result.match?.ruleKind).toBe("blocked_recipients");
  });

  it("rejects swap when pair is not allowlisted", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent(),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [
              {
                kind: "allowed_swap_pairs",
                pairs: [
                  {
                    fromMint: "So11111111111111111111111111111111111111112",
                    toMint: "DifferentMint111111111111111111111111111111111"
                  }
                ]
              }
            ]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_SWAP_PAIR_NOT_ALLOWED");
    expect(result.match?.ruleKind).toBe("allowed_swap_pairs");
  });

  it("rejects swap when protocol is not allowlisted", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({ swapProtocol: "raydium" }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [{ kind: "allowed_swap_protocols", protocols: ["orca"] }]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_SWAP_PROTOCOL_NOT_ALLOWED");
    expect(result.match?.ruleKind).toBe("allowed_swap_protocols");
  });

  it("rejects when action-scoped daily cap is exceeded", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({ action: "transfer", transferAsset: "native", recipientAddress: "recipient-1", fromMint: undefined, toMint: undefined, amountAtomic: "200" }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [{ kind: "max_lamports_per_day_by_action", action: "transfer", lteLamports: "500" }]
          }
        })
      ],
      {
        currentDailySpentLamports: "0",
        currentDailySpentByActionLamports: { transfer: "400" }
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_DSL_DAILY_ACTION_CAP_EXCEEDED");
    expect(result.match?.ruleKind).toBe("max_lamports_per_day_by_action");
  });

  it("rejects when action-specific tx cap is exceeded", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({ amountAtomic: "2000" }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [{ kind: "max_lamports_per_tx_by_action", action: "swap", lteLamports: "1000" }]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_DSL_MAX_PER_ACTION_TX_EXCEEDED");
    expect(result.match?.ruleKind).toBe("max_lamports_per_tx_by_action");
  });

  it("rejects when mint-specific tx cap is exceeded", async () => {
    const result = await evaluateAssignedPolicies(
      baseIntent({
        action: "transfer",
        transferAsset: "spl",
        recipientAddress: "recipient-1",
        mintAddress: "Mint111111111111111111111111111111111111111",
        fromMint: undefined,
        toMint: undefined,
        amountAtomic: "2000"
      }),
      [
        policyRecord({
          dsl: {
            version: "aegis.policy.v2",
            rules: [
              {
                kind: "max_lamports_per_tx_by_mint",
                mint: "Mint111111111111111111111111111111111111111",
                lteLamports: "1000"
              }
            ]
          }
        })
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_DSL_MAX_PER_MINT_TX_EXCEEDED");
    expect(result.match?.ruleKind).toBe("max_lamports_per_tx_by_mint");
  });
});

describe("evaluateBaselineIntent", () => {
  it("rejects when projected daily spend exceeds cap using persisted current spend", async () => {
    process.env.AEGIS_DAILY_LAMPORTS_CAP = "100";
    const result = await evaluateBaselineIntent(baseIntent({ amountAtomic: "60" }), "50");
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("POLICY_DAILY_CAP_EXCEEDED");
  });

  it("rejects transfer when recipient is missing", async () => {
    const result = await evaluateBaselineIntent(
      baseIntent({
        action: "transfer",
        transferAsset: "native",
        recipientAddress: undefined,
        fromMint: undefined,
        toMint: undefined
      }),
      "0"
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("TRANSFER_RECIPIENT_REQUIRED");
  });

  it("rejects SPL transfer when mint is missing", async () => {
    const result = await evaluateBaselineIntent(
      baseIntent({
        action: "transfer",
        transferAsset: "spl",
        recipientAddress: "8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L",
        mintAddress: undefined,
        fromMint: undefined,
        toMint: undefined
      }),
      "0"
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("TRANSFER_MINT_REQUIRED");
  });

  it("rejects transfer when recipient equals wallet address", async () => {
    const walletAddress = "8YfZ6E8wHcQW1E6x4jES8m7fVt4P8Jho7W4g7a7v1e2L";
    const result = await evaluateBaselineIntent(
      baseIntent({
        action: "transfer",
        transferAsset: "native",
        walletAddress,
        recipientAddress: walletAddress,
        fromMint: undefined,
        toMint: undefined
      }),
      "0"
    );

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("TRANSFER_SELF_NOT_ALLOWED");
    expect(result.reasonDetail).toBe("Recipient address must be different from the agent wallet address.");
  });
});

describe("evaluateSimulation", () => {
  it("maps insufficient funds simulation failures to a stable reason code", async () => {
    setSimulateSerializedTransactionForTests(async () => {
      throw new Error("insufficient funds for fee");
    });

    const result = await evaluateSimulation("dGVzdA==");

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("INSUFFICIENT_FUNDS");
    expect(result.reasonDetail).toBe("Wallet does not have enough balance to complete this action.");
    setSimulateSerializedTransactionForTests(null);
  });
});
