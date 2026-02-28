import { afterEach, describe, expect, it } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { resolveKnownToken } from "../src/protocols/tokenResolver";

describe("tokenResolver", () => {
  const originalRpc = process.env.SOLANA_RPC;
  const originalCluster = process.env.SOLANA_CLUSTER;

  afterEach(() => {
    process.env.SOLANA_RPC = originalRpc;
    process.env.SOLANA_CLUSTER = originalCluster;
  });

  it("resolves USDC on devnet", () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const resolved = resolveKnownToken({ symbolOrMint: "USDC", protocol: "auto" });
    expect(resolved?.mint).toBe("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
    expect(resolved?.cluster).toBe("devnet");
  });

  it("resolves USDC on devnet to the standard mint for Raydium/Jupiter", () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const resolved = resolveKnownToken({ symbolOrMint: "USDC", protocol: "raydium" });
    expect(resolved?.mint).toBe("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    expect(resolved?.cluster).toBe("devnet");
  });

  it("resolves USDC on mainnet", () => {
    process.env.SOLANA_CLUSTER = "mainnet-beta";
    const resolved = resolveKnownToken({ symbolOrMint: "usdc" });
    expect(resolved?.mint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(resolved?.cluster).toBe("mainnet-beta");
  });

  it("passes through explicit mint addresses", () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const resolved = resolveKnownToken({ symbolOrMint: mint });
    expect(resolved?.mint).toBe(mint);
    expect(resolved?.symbol).toBe("CUSTOM");
  });

  it("returns null for unsupported symbols", () => {
    const resolved = resolveKnownToken({ symbolOrMint: "USDT" });
    expect(resolved).toBeNull();
  });
});
