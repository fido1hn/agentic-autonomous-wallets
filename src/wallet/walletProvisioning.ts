import type { ProviderName } from "../db/sqlite";
import { getPrivyClient } from "./privyClient";

function resolvePrivyPolicyIds(): string[] | undefined {
  const value = process.env.PRIVY_WALLET_POLICY_IDS;
  if (!value) {
    return undefined;
  }
  const policyIds = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return policyIds.length > 0 ? policyIds : undefined;
}

async function createPrivyWallet(agentId: string): Promise<{ walletRef: string; walletAddress?: string }> {
  const privy = getPrivyClient();
  const wallet = await privy.wallets().create({
    chain_type: "solana",
    policy_ids: resolvePrivyPolicyIds(),
    "privy-idempotency-key": `aegis-wallet-${agentId}`
  });

  const walletRef = wallet.id;
  if (!walletRef) {
    throw new Error("PRIVY_CREATE_WALLET_ERROR: missing wallet id in response");
  }

  const walletAddress = wallet.address?.trim() || undefined;
  if (walletAddress) {
    return { walletRef, walletAddress };
  }

  const loaded = await privy.wallets().get(walletRef);
  return {
    walletRef,
    walletAddress: loaded.address?.trim() || undefined
  };
}

export async function createWalletRefForAgent(
  agentId: string,
): Promise<{ provider: ProviderName; walletRef: string; walletAddress?: string }> {
  const wallet = await createPrivyWallet(agentId);
  return {
    provider: "privy",
    walletRef: wallet.walletRef,
    walletAddress: wallet.walletAddress
  };
}

export async function getWalletMetadataByRef(
  walletRef: string,
): Promise<{ provider: ProviderName; walletRef: string; walletAddress?: string }> {
  const privy = getPrivyClient();
  const wallet = await privy.wallets().get(walletRef);

  return {
    provider: "privy",
    walletRef,
    walletAddress: wallet.address?.trim() || undefined
  };
}
