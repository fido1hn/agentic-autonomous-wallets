import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { ReasonCodes } from "../core/reasonCodes";

export interface WalletBalanceToken {
  mint: string;
  amountAtomic: string;
  decimals: number;
  uiAmount: string;
  ata: string;
}

export interface WalletBalancesResult {
  walletAddress: string;
  native: {
    lamports: string;
    sol: string;
  };
  tokens: WalletBalanceToken[];
  slot: number;
}

function resolveSolanaRpc(): string {
  const rpc = process.env.SOLANA_RPC?.trim();
  if (!rpc) {
    throw new Error(`${ReasonCodes.solanaRpcReadFailed}: missing SOLANA_RPC`);
  }
  return rpc;
}

let createSolanaConnection = (): Connection => {
  return new Connection(resolveSolanaRpc(), "confirmed");
};

function asPublicKey(value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${ReasonCodes.solanaRpcReadFailed}: invalid public key`);
  }
}

export async function getWalletBalances(walletAddress: string): Promise<WalletBalancesResult> {
  const connection = createSolanaConnection();
  const owner = asPublicKey(walletAddress);

  try {
    const [nativeBalance, tokenAccounts] = await Promise.all([
      connection.getBalanceAndContext(owner, "confirmed"),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, "confirmed")
    ]);

    const tokens: WalletBalanceToken[] = tokenAccounts.value.map(({ pubkey, account }) => {
      const parsed = account.data.parsed as {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmountString?: string;
          };
        };
      };

      return {
        mint: parsed.info.mint,
        amountAtomic: parsed.info.tokenAmount.amount,
        decimals: parsed.info.tokenAmount.decimals,
        uiAmount: parsed.info.tokenAmount.uiAmountString ?? "0",
        ata: pubkey.toBase58()
      };
    });

    return {
      walletAddress,
      native: {
        lamports: nativeBalance.value.toString(),
        sol: (nativeBalance.value / LAMPORTS_PER_SOL).toString()
      },
      tokens,
      slot: Math.max(nativeBalance.context.slot, tokenAccounts.context.slot)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ReasonCodes.solanaRpcReadFailed}: ${message}`);
  }
}

export function setSolanaReadConnectionFactoryForTests(fn: (() => Connection) | null): void {
  createSolanaConnection = fn ?? (() => new Connection(resolveSolanaRpc(), "confirmed"));
}
