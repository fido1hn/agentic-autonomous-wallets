import { createAppContext, closeAppContext } from "../src/api/appContext";
import { routeIntent } from "../src/core/intentRouter";

async function main(): Promise<void> {
  const appContext = await createAppContext();
  try {
    const agent = await appContext.agentService.createAgent({ name: "agent-mm-01" });

    const approved = await routeIntent({
      agentId: agent.id,
      action: "swap",
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountLamports: "1000000",
      maxSlippageBps: 100
    });

    const rejected = await routeIntent({
      agentId: agent.id,
      action: "swap",
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountLamports: "9000000000000",
      maxSlippageBps: 100
    });

    console.log("Approved flow:", approved);
    console.log("Rejected flow:", rejected);
  } finally {
    closeAppContext(appContext);
  }
}

main().catch((error) => {
  console.error("Demo failed", error);
  process.exit(1);
});
