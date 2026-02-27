export const ReasonCodes = {
  policyRejected: "POLICY_REJECTED",
  policyInvalidAgentId: "POLICY_INVALID_AGENT_ID",
  policyInvalidAmount: "POLICY_INVALID_AMOUNT",
  policyMaxPerTxExceeded: "POLICY_MAX_PER_TX_EXCEEDED",
  policyDslMaxPerTxExceeded: "POLICY_DSL_MAX_PER_TX_EXCEEDED",
  policyDailyCapExceeded: "POLICY_DAILY_CAP_EXCEEDED",
  policyActionNotAllowed: "POLICY_ACTION_NOT_ALLOWED",
  policyMintNotAllowed: "POLICY_MINT_NOT_ALLOWED",
  policySwapMintRequired: "POLICY_SWAP_MINT_REQUIRED",
  policySwapSlippageRequired: "POLICY_SWAP_SLIPPAGE_REQUIRED",
  policyMaxSlippageExceeded: "POLICY_MAX_SLIPPAGE_EXCEEDED",
  policyRuleNotSupported: "POLICY_RULE_NOT_SUPPORTED",
  policyRpcSimulationUnavailable: "POLICY_RPC_SIMULATION_UNAVAILABLE",
  policyRpcSimulationFailed: "POLICY_RPC_SIMULATION_FAILED",
  txBuildFailed: "TX_BUILD_FAILED",
  signingFailed: "SIGNING_FAILED"
} as const;

export type ReasonCode = (typeof ReasonCodes)[keyof typeof ReasonCodes];
