# src/db

Persistence layer.

Responsibilities:
- Store agent configs, policy references, and wallet metadata.
- Store intents, approvals, rejections, and execution outcomes.
- Provide deterministic query access for audits and debugging.

## File map

- `schema.ts`: Drizzle table definitions (source of truth for DB shape).
- `types.ts`: DB-facing TS contracts (records, create inputs, repository interfaces).
- `sqlite.ts`: connection/context wiring and repository composition.
- `repositories/*.ts`: table-specific data access logic.
- `drizzle_migrations/`: generated migration files (commit these).

## Key runtime objects

- `SqliteContext`:
  - `client`: low-level SQLite handle (needed to close connections cleanly).
  - `db`: Drizzle query instance.
  - `repositories`: typed repo facade used by services.

- `connectSqlite()`:
  - opens DB connection
  - builds Drizzle instance
  - returns repositories for app logic

- `createDrizzleDb()`:
  - lower-level helper used when you only need DB/client (e.g., migration scripts)
