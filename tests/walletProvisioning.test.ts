import { describe, expect, it } from "bun:test";
import { createWalletRefForAgent } from "../src/wallet/walletProvisioning";
import { setPrivyClientForTests } from "../src/wallet/privyClient";

describe("wallet provisioning", () => {
  it("creates privy wallet refs through Privy wallet API", async () => {
    const fakeClient = {
      wallets: () => ({
        create: async () => ({ id: "wallet_test_001", address: "So1anaPubKey11111111111111111111111111111111" })
      })
    } as any;

    setPrivyClientForTests(fakeClient);
    try {
      const result = await createWalletRefForAgent("agt_001");
      expect(result.provider).toBe("privy");
      expect(result.walletRef).toBe("wallet_test_001");
      expect(result.walletAddress).toBe("So1anaPubKey11111111111111111111111111111111");
    } finally {
      setPrivyClientForTests(null);
    }
  });
});
