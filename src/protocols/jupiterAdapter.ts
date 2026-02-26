import type { ExecutionIntent, SerializedTransaction } from "../types/intents";

function mockSerializedSwap(intent: ExecutionIntent): string {
  return JSON.stringify({
    protocol: "jupiter",
    mode: "mock",
    action: intent.action,
    walletAddress: intent.walletAddress,
    fromMint: intent.fromMint,
    toMint: intent.toMint,
    amountLamports: intent.amountLamports,
    maxSlippageBps: intent.maxSlippageBps ?? 100
  });
}

export async function buildJupiterSwap(intent: ExecutionIntent): Promise<SerializedTransaction> {
  if (!intent.walletAddress || !intent.fromMint || !intent.toMint) {
    throw new Error("JUPITER_BUILD_ERROR: missing walletAddress/fromMint/toMint");
  }

  const allowMock = process.env.AEGIS_ALLOW_MOCK_TX_BUILD !== "false";
  const quoteUrl = process.env.JUPITER_QUOTE_URL ?? "https://lite-api.jup.ag/swap/v1/quote";
  const swapUrl = process.env.JUPITER_SWAP_URL ?? "https://lite-api.jup.ag/swap/v1/swap";

  try {
    const quoteParams = new URLSearchParams({
      inputMint: intent.fromMint,
      outputMint: intent.toMint,
      amount: intent.amountLamports,
      slippageBps: String(intent.maxSlippageBps ?? 100)
    });

    const quoteResponse = await fetch(`${quoteUrl}?${quoteParams.toString()}`);
    if (!quoteResponse.ok) {
      throw new Error(`Quote failed with status ${quoteResponse.status}`);
    }
    const quote = (await quoteResponse.json()) as Record<string, unknown>;

    const swapResponse = await fetch(swapUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: intent.walletAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true
      })
    });

    if (!swapResponse.ok) {
      throw new Error(`Swap build failed with status ${swapResponse.status}`);
    }

    const swapData = (await swapResponse.json()) as {
      swapTransaction?: string;
    };

    if (!swapData.swapTransaction) {
      throw new Error("Missing swapTransaction in Jupiter response");
    }

    return swapData.swapTransaction;
  } catch (error) {
    if (!allowMock) {
      throw error;
    }
    return mockSerializedSwap(intent);
  }
}
