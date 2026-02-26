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

async function createPrivyWalletRef(agentId: string): Promise<string> {
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

  return walletRef;
}

export async function createWalletRefForAgent(
  agentId: string,
): Promise<{ provider: ProviderName; walletRef: string }> {
  return {
    provider: "privy",
    walletRef: await createPrivyWalletRef(agentId),
  };
}
