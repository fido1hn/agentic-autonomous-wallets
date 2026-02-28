export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet" | "unknown";

export function resolveSolanaCluster(): SolanaCluster {
  const explicit = process.env.SOLANA_CLUSTER?.trim().toLowerCase();
  if (explicit === "mainnet" || explicit === "mainnet-beta") {
    return "mainnet-beta";
  }
  if (explicit === "devnet") {
    return "devnet";
  }
  if (explicit === "testnet") {
    return "testnet";
  }

  const rpc = process.env.SOLANA_RPC?.trim().toLowerCase() ?? "";
  if (rpc.includes("devnet")) {
    return "devnet";
  }
  if (rpc.includes("testnet")) {
    return "testnet";
  }
  if (rpc.includes("mainnet")) {
    return "mainnet-beta";
  }

  return "unknown";
}
