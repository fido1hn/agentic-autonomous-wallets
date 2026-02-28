import type { WalletProviderName } from "../core/walletProvider";

export type SerializedTransaction = string;

export interface ExecutionIntent {
  agentId: string;
  action: "swap" | "transfer";
  walletAddress?: string;
  amountAtomic: string;
  transferAsset?: "native" | "spl";
  recipientAddress?: string;
  mintAddress?: string;
  // Legacy compatibility during migration to amountAtomic.
  fromMint?: string;
  toMint?: string;
  maxSlippageBps?: number;
  idempotencyKey?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reasonCode?: string;
  reasonDetail?: string;
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
      reasonDetail?: string;
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
  if (value === "swap" || value === "transfer") {
    return value;
  }
  return null;
}

function parseTransferAsset(value: unknown): ExecutionIntent["transferAsset"] | null {
  if (value === undefined) {
    return null;
  }
  if (value === "native" || value === "spl") {
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

  const amountAtomic =
    parsePositiveIntegerString(payload.amountAtomic) ??
    parsePositiveIntegerString(payload.amountLamports);
  if (!amountAtomic) {
    errors.push("AMOUNT_ATOMIC_INVALID");
  }

  const idempotencyKey = asString(payload.idempotencyKey) ?? undefined;
  const walletAddress = asString(payload.walletAddress) ?? undefined;
  const recipientAddress = asString(payload.recipientAddress) ?? undefined;
  const mintAddress = asString(payload.mintAddress) ?? undefined;
  const fromMint = asString(payload.fromMint) ?? undefined;
  const toMint = asString(payload.toMint) ?? undefined;
  const transferAsset = parseTransferAsset(payload.transferAsset) ?? undefined;
  if (payload.transferAsset !== undefined && !transferAsset) {
    errors.push("TRANSFER_ASSET_INVALID");
  }

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

  if (action === "transfer") {
    if (!recipientAddress) {
      errors.push("RECIPIENT_ADDRESS_REQUIRED_FOR_TRANSFER");
    }
    if (!transferAsset) {
      errors.push("TRANSFER_ASSET_REQUIRED");
    }
    if (transferAsset === "spl" && !mintAddress) {
      errors.push("MINT_ADDRESS_REQUIRED_FOR_SPL_TRANSFER");
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
      amountAtomic: amountAtomic as string,
      transferAsset,
      recipientAddress,
      mintAddress,
      fromMint,
      toMint,
      walletAddress,
      idempotencyKey,
      maxSlippageBps
    }
  };
}
