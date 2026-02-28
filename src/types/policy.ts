import { z } from "zod";

const LamportsStringSchema = z
  .string()
  .trim()
  .regex(/^[0-9]+$/, "must be a non-negative integer string");

const AddressSchema = z.string().trim().min(1);
const MintSchema = z.string().trim().min(1);
const ActionSchema = z.enum(["swap", "transfer"]);
const SwapProtocolSchema = z.enum(["auto", "jupiter", "raydium", "orca"]);

const RuleMaxLamportsPerTxSchema = z.object({
  kind: z.literal("max_lamports_per_tx"),
  lteLamports: LamportsStringSchema
});

const RuleAllowedActionsSchema = z.object({
  kind: z.literal("allowed_actions"),
  actions: z.array(ActionSchema).min(1)
});

const RuleAllowedMintsSchema = z.object({
  kind: z.literal("allowed_mints"),
  mints: z.array(MintSchema).min(1)
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
  rules: z.array(PolicyRuleSchema).min(1)
});

const RuleAllowedRecipientsSchema = z.object({
  kind: z.literal("allowed_recipients"),
  addresses: z.array(AddressSchema).min(1)
});

const RuleBlockedRecipientsSchema = z.object({
  kind: z.literal("blocked_recipients"),
  addresses: z.array(AddressSchema).min(1)
});

const RuleAllowedSwapPairsSchema = z.object({
  kind: z.literal("allowed_swap_pairs"),
  pairs: z
    .array(
      z.object({
        fromMint: MintSchema,
        toMint: MintSchema
      })
    )
    .min(1)
});

const RuleAllowedSwapProtocolsSchema = z.object({
  kind: z.literal("allowed_swap_protocols"),
  protocols: z.array(SwapProtocolSchema).min(1)
});

const RuleMaxLamportsPerDayByActionSchema = z.object({
  kind: z.literal("max_lamports_per_day_by_action"),
  action: ActionSchema,
  lteLamports: LamportsStringSchema
});

const RuleMaxLamportsPerTxByActionSchema = z.object({
  kind: z.literal("max_lamports_per_tx_by_action"),
  action: ActionSchema,
  lteLamports: LamportsStringSchema
});

const RuleMaxLamportsPerTxByMintSchema = z.object({
  kind: z.literal("max_lamports_per_tx_by_mint"),
  mint: MintSchema,
  lteLamports: LamportsStringSchema
});

export const PolicyRuleV2Schema = z.union([
  RuleMaxLamportsPerTxSchema,
  RuleAllowedActionsSchema,
  RuleAllowedMintsSchema,
  RuleMaxSlippageBpsSchema,
  RuleAllowedRecipientsSchema,
  RuleBlockedRecipientsSchema,
  RuleAllowedSwapPairsSchema,
  RuleAllowedSwapProtocolsSchema,
  RuleMaxLamportsPerDayByActionSchema,
  RuleMaxLamportsPerTxByActionSchema,
  RuleMaxLamportsPerTxByMintSchema
]);

export const AegisPolicyDslV2Schema = z.object({
  version: z.literal("aegis.policy.v2"),
  rules: z.array(PolicyRuleV2Schema).min(1)
});

export const AegisPolicyDslSchema = z.union([AegisPolicyDslV1Schema, AegisPolicyDslV2Schema]);

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyRuleV2 = z.infer<typeof PolicyRuleV2Schema>;
export type AegisPolicyDslV1 = z.infer<typeof AegisPolicyDslV1Schema>;
export type AegisPolicyDslV2 = z.infer<typeof AegisPolicyDslV2Schema>;
export type AegisPolicyDsl = z.infer<typeof AegisPolicyDslSchema>;

export function parseAegisPolicyDslV1(input: unknown): AegisPolicyDslV1 {
  return AegisPolicyDslV1Schema.parse(input);
}

export function parseAegisPolicyDsl(input: unknown): AegisPolicyDsl {
  return AegisPolicyDslSchema.parse(input);
}
