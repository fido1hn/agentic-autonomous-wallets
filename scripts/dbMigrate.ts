import { createDrizzleDb, resolveDbPath, runDrizzleMigrations } from "../src/db/sqlite";

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  const { client, db } = createDrizzleDb();
  try {
    runDrizzleMigrations(db);
    console.log(`Drizzle migrations applied (db: ${dbPath})`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("DB migration failed", error);
  process.exit(1);
});
