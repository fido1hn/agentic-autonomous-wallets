export interface ClassifiedFailure {
  reasonCode: string;
  reasonDetail?: string;
}

export function classifySolanaFailure(
  raw: unknown,
  fallbackCode: string,
  fallbackDetail: string
): ClassifiedFailure {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  const normalized = text.toLowerCase();

  if (
    normalized.includes("insufficient funds") ||
    normalized.includes("insufficient lamports") ||
    normalized.includes("attempt to debit an account but found no record of a prior credit")
  ) {
    return {
      reasonCode: "INSUFFICIENT_FUNDS",
      reasonDetail: "Wallet does not have enough balance to complete this action."
    };
  }

  if (
    normalized.includes("accountnotfound") ||
    normalized.includes("invalid account data for instruction") ||
    normalized.includes("token account not found") ||
    normalized.includes("could not find account")
  ) {
    return {
      reasonCode: "TOKEN_ACCOUNT_NOT_FOUND",
      reasonDetail: "Required token account was not found or is not initialized."
    };
  }

  return {
    reasonCode: fallbackCode,
    reasonDetail: fallbackDetail
  };
}
