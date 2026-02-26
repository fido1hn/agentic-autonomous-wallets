import { PrivyClient } from "@privy-io/node";

export interface PrivyRuntimeConfig {
  appId: string;
  appSecret: string;
}

let cachedClient: PrivyClient | null = null;

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`PRIVY_CONFIG_ERROR: missing ${name}. Add it to your environment before starting Aegis.`);
  }
  return value;
}

export function resolvePrivyRuntimeConfig(env: NodeJS.ProcessEnv = process.env): PrivyRuntimeConfig {
  return {
    appId: requireEnv("PRIVY_APP_ID", env.PRIVY_APP_ID),
    appSecret: requireEnv("PRIVY_APP_SECRET", env.PRIVY_APP_SECRET)
  };
}

export function createPrivyClient(config = resolvePrivyRuntimeConfig()): PrivyClient {
  return new PrivyClient({
    appId: config.appId,
    appSecret: config.appSecret
  });
}

export function getPrivyClient(): PrivyClient {
  if (!cachedClient) {
    cachedClient = createPrivyClient();
  }
  return cachedClient;
}

export function assertPrivyConfig(): void {
  resolvePrivyRuntimeConfig();
}

export function setPrivyClientForTests(client: PrivyClient | null): void {
  cachedClient = client;
}
