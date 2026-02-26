import { z } from "zod";

const LamportsStringSchema = z
  .string()
  .trim()
  .regex(/^[0-9]+$/, "must be a non-negative integer string");

const RuleMaxLamportsPerTxSchema = z.object({
  kind: z.literal("max_lamports_per_tx"),
  lteLamports: LamportsStringSchema
});

const RuleAllowedActionsSchema = z.object({
  kind: z.literal("allowed_actions"),
  actions: z.array(z.enum(["swap", "transfer", "rebalance"])).min(1)
});

const RuleAllowedMintsSchema = z.object({
  kind: z.literal("allowed_mints"),
  mints: z.array(z.string().trim().min(1)).min(1)
});

const RuleMaxSlippageBpsSchema = z.object({
  kind: z.literal("max_slippage_bps"),
  lteBps: z.number().int().min(0).max(10_000)
});

export const PolicyRuleSchema = z.union([
  RuleMaxLamportsPerTxSchema,
  RuleAllowedActionsSchema,
  RuleAllowedMintsSchema,
  RuleMaxSlippageBpsSchema
]);

export const AegisPolicyDslV1Schema = z.object({
  version: z.literal("aegis.policy.v1"),
  rules: z.array(PolicyRuleSchema)
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type AegisPolicyDslV1 = z.infer<typeof AegisPolicyDslV1Schema>;

export function parseAegisPolicyDslV1(input: unknown): AegisPolicyDslV1 {
  return AegisPolicyDslV1Schema.parse(input);
}
