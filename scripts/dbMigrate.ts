import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDrizzleDb, resolveDbPath } from "../src/db/sqlite";

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  const migrationsFolder = "./src/db/drizzle_migrations";

  if (!existsSync(migrationsFolder)) {
    console.log(
      `No migrations found at ${migrationsFolder}. Run 'bun run db:generate' first.`,
    );
    return;
  }

  const { client, db } = createDrizzleDb();
  try {
    migrate(db, { migrationsFolder });
    console.log(`Drizzle migrations applied (db: ${dbPath})`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("DB migration failed", error);
  process.exit(1);
});
