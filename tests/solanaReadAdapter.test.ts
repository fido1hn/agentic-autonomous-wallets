import { afterEach, describe, expect, it } from "bun:test";
import { getWalletBalances, setSolanaReadConnectionFactoryForTests } from "../src/protocols/solanaReadAdapter";

describe("solanaReadAdapter", () => {
  afterEach(() => {
    setSolanaReadConnectionFactoryForTests(null);
  });

  it("returns native and token balances", async () => {
    setSolanaReadConnectionFactoryForTests(
      () =>
        ({
          getBalanceAndContext: async () => ({
            context: { slot: 10 },
            value: 2_500_000_000,
          }),
          getParsedTokenAccountsByOwner: async () => ({
            context: { slot: 12 },
            value: [
              {
                pubkey: { toBase58: () => "Ata111111111111111111111111111111111111111" },
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: "Mint111111111111111111111111111111111111111",
                        tokenAmount: {
                          amount: "2500000",
                          decimals: 6,
                          uiAmountString: "2.5",
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
        }) as any
    );

    const result = await getWalletBalances("7YttLkH4kKo3aonMh8M73PvvrLpzjAU6RzG32KzBSSMS");

    expect(result.native.lamports).toBe("2500000000");
    expect(result.tokens.length).toBe(1);
    expect(result.tokens[0]?.amountAtomic).toBe("2500000");
    expect(result.slot).toBe(12);
  });

  it("returns empty token list correctly", async () => {
    setSolanaReadConnectionFactoryForTests(
      () =>
        ({
          getBalanceAndContext: async () => ({
            context: { slot: 10 },
            value: 1000,
          }),
          getParsedTokenAccountsByOwner: async () => ({
            context: { slot: 10 },
            value: [],
          }),
        }) as any
    );

    const result = await getWalletBalances("7YttLkH4kKo3aonMh8M73PvvrLpzjAU6RzG32KzBSSMS");
    expect(result.tokens).toEqual([]);
  });
});
