import { afterEach, describe, expect, it, mock } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { buildJupiterSwap } from "../src/protocols/jupiterAdapter";
import { setOrcaDependenciesForTests } from "../src/protocols/orcaAdapter";
import { setRaydiumConnectionFactoryForTests } from "../src/protocols/raydiumAdapter";
import { buildSwapTransaction, resolveSwapProtocol } from "../src/protocols/swapAdapter";

describe("swap adapters", () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC;
  const originalCluster = process.env.SOLANA_CLUSTER;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.SOLANA_RPC = originalRpc;
    process.env.SOLANA_CLUSTER = originalCluster;
    setRaydiumConnectionFactoryForTests(null);
    setOrcaDependenciesForTests(null);
  });

  it("selects orca automatically on devnet", () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const protocol = resolveSwapProtocol({
      agentId: "agent-1",
      action: "swap",
      walletAddress: Keypair.generate().publicKey.toBase58(),
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: Keypair.generate().publicKey.toBase58(),
      amountAtomic: "1000",
    });

    expect(protocol).toBe("orca");
  });

  it("rejects Jupiter swaps on devnet with a stable reason code", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";

    await expect(
      buildJupiterSwap({
        agentId: "agent-1",
        action: "swap",
        walletAddress: Keypair.generate().publicKey.toBase58(),
        fromMint: "So11111111111111111111111111111111111111112",
        toMint: Keypair.generate().publicKey.toBase58(),
        amountAtomic: "1000",
      })
    ).rejects.toThrow("JUPITER_MAINNET_ONLY");
  });

  it("builds a Raydium swap payload on devnet", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const walletAddress = Keypair.generate().publicKey.toBase58();
    const outputMint = Keypair.generate().publicKey.toBase58();
    let call = 0;
    setRaydiumConnectionFactoryForTests(
      () =>
        ({
          getAccountInfo: async () => ({ executable: false }),
          getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" })
        }) as any
    );

    globalThis.fetch = mock(async (_input, init) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ success: true, data: { routePlan: [] } }));
      }
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          data: [{ transaction: "dGVzdA==" }, { transaction: "dGVzdDI=" }]
        })
      );
    }) as unknown as typeof fetch;

    const result = await buildSwapTransaction({
      agentId: "agent-1",
      action: "swap",
      walletAddress,
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: outputMint,
      amountAtomic: "1000",
      swapProtocol: "raydium",
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(["dGVzdA==", "dGVzdDI="]);
  });

  it("builds an Orca swap payload on devnet", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const walletAddress = Keypair.generate().publicKey.toBase58();
    const outputMint = Keypair.generate().publicKey.toBase58();

    setOrcaDependenciesForTests({
      setWhirlpoolsConfig: async () => {},
      setNativeMintWrappingStrategy: () => {},
      createRpc: () => ({}) as any,
      createNoopSigner: (value: string) => ({ address: value }) as any,
      fetchSplashPool: async () =>
        ({
          initialized: true,
          address: "pool-address"
        }) as any,
      swapInstructions: async () =>
        ({
          instructions: [
            {
              programAddress: "11111111111111111111111111111111",
              accounts: [],
              data: new Uint8Array()
            }
          ]
        }) as any,
      createConnection: () =>
        ({
          getLatestBlockhash: async () => ({
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 1
          })
        }) as any
    });

    const result = await buildSwapTransaction({
      agentId: "agent-1",
      action: "swap",
      walletAddress,
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: outputMint,
      amountAtomic: "1000",
      swapProtocol: "orca",
    });

    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
  });

  it("prepends ATA creation transaction when Raydium output token account is missing", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const walletAddress = Keypair.generate().publicKey.toBase58();
    const outputMint = Keypair.generate().publicKey.toBase58();
    let call = 0;
    setRaydiumConnectionFactoryForTests(
      () =>
        ({
          getAccountInfo: async () => null,
          getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" })
        }) as any
    );

    globalThis.fetch = mock(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ success: true, data: { routePlan: [] } }));
      }
      return new Response(
        JSON.stringify({
          data: [{ transaction: "dGVzdA==" }]
        })
      );
    }) as unknown as typeof fetch;

    const result = await buildSwapTransaction({
      agentId: "agent-1",
      action: "swap",
      walletAddress,
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: outputMint,
      amountAtomic: "1000",
      swapProtocol: "raydium",
    });

    expect(Array.isArray(result)).toBe(true);
    expect((result as string[]).length).toBe(2);
    expect((result as string[])[1]).toBe("dGVzdA==");
  });
});
