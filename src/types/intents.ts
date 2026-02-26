import type { WalletProviderName } from "../core/walletProvider";

export type SerializedTransaction = string;

export interface ExecutionIntent {
  agentId: string;
  action: "swap" | "rebalance" | "transfer";
  walletAddress?: string;
  fromMint?: string;
  toMint?: string;
  amountLamports: string;
  maxSlippageBps?: number;
  idempotencyKey?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reasonCode?: string;
  checks: string[];
}

export interface SignatureResult {
  txSignature: string;
  provider: WalletProviderName;
}

export type ExecutionResult =
  | {
      status: "approved";
      provider: WalletProviderName;
      txSignature: string;
      policyChecks: string[];
    }
  | {
      status: "rejected";
      reasonCode: string;
      policyChecks?: string[];
    };

export interface IntentValidationResult {
  ok: boolean;
  errors: string[];
  intent?: ExecutionIntent;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAction(value: unknown): ExecutionIntent["action"] | null {
  if (value === "swap" || value === "rebalance" || value === "transfer") {
    return value;
  }
  return null;
}

function parsePositiveIntegerString(value: unknown): string | null {
  const maybe = asString(value);
  if (!maybe) {
    return null;
  }
  try {
    const parsed = BigInt(maybe);
    if (parsed > 0n) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function validateExecutionIntent(input: unknown): IntentValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["INTENT_MUST_BE_OBJECT"] };
  }

  const payload = input as Record<string, unknown>;
  const errors: string[] = [];

  const agentId = asString(payload.agentId);
  if (!agentId) {
    errors.push("AGENT_ID_REQUIRED");
  }

  const action = parseAction(payload.action);
  if (!action) {
    errors.push("ACTION_INVALID");
  }

  const amountLamports = parsePositiveIntegerString(payload.amountLamports);
  if (!amountLamports) {
    errors.push("AMOUNT_LAMPORTS_INVALID");
  }

  const idempotencyKey = asString(payload.idempotencyKey) ?? undefined;
  const walletAddress = asString(payload.walletAddress) ?? undefined;
  const fromMint = asString(payload.fromMint) ?? undefined;
  const toMint = asString(payload.toMint) ?? undefined;

  let maxSlippageBps: number | undefined;
  if (payload.maxSlippageBps !== undefined) {
    if (
      typeof payload.maxSlippageBps !== "number" ||
      !Number.isInteger(payload.maxSlippageBps) ||
      payload.maxSlippageBps < 1 ||
      payload.maxSlippageBps > 10_000
    ) {
      errors.push("MAX_SLIPPAGE_BPS_INVALID");
    } else {
      maxSlippageBps = payload.maxSlippageBps;
    }
  }

  if (action === "swap") {
    if (!fromMint) {
      errors.push("FROM_MINT_REQUIRED_FOR_SWAP");
    }
    if (!toMint) {
      errors.push("TO_MINT_REQUIRED_FOR_SWAP");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    intent: {
      agentId: agentId as string,
      action: action as ExecutionIntent["action"],
      amountLamports: amountLamports as string,
      fromMint,
      toMint,
      walletAddress,
      idempotencyKey,
      maxSlippageBps
    }
  };
}
