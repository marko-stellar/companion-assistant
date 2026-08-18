/**
 * One-time migration: evolve the memories table from the stub schema
 * to the full long-term memory spec schema.
 *
 * Run: pnpm --filter @workspace/db exec tsx scripts/migrate-memories.ts
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Rename content → fact (skip if already renamed)
    const { rows: hasFact } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name='memories' AND column_name='fact'`,
    );
    if (hasFact.length === 0) {
      await client.query(`ALTER TABLE memories RENAME COLUMN content TO fact`);
      console.log("Renamed content → fact");
    } else {
      console.log("fact column already exists, skipping rename");
    }

    // 2. Drop old columns (idempotent)
    for (const col of ["importance", "tags"]) {
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name='memories' AND column_name=$1`,
        [col],
      );
      if (rows.length > 0) {
        await client.query(`ALTER TABLE memories DROP COLUMN "${col}"`);
        console.log(`Dropped column ${col}`);
      }
    }

    // 3. Add new columns (all idempotent via IF NOT EXISTS)
    const additions: string[] = [
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'EPISODIC'`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS subject text`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0.7`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'conversation'`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_message_id uuid
         REFERENCES conversation_messages(id) ON DELETE SET NULL`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS emotional_context text`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS supersedes_memory_id uuid
         REFERENCES memories(id) ON DELETE SET NULL`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_referenced_at timestamp`,
    ];

    for (const stmt of additions) {
      await client.query(stmt);
    }
    console.log("Added new columns");

    // 4. Fix source_conversation_id FK to SET NULL on delete (was NO ACTION)
    await client.query(`
      ALTER TABLE memories
        DROP CONSTRAINT IF EXISTS memories_source_conversation_id_conversations_id_fk
    `);
    await client.query(`
      ALTER TABLE memories
        ADD CONSTRAINT memories_source_conversation_id_conversations_id_fk
        FOREIGN KEY (source_conversation_id)
        REFERENCES conversations(id)
        ON DELETE SET NULL
    `);
    console.log("Updated source_conversation_id FK");

    // 5. Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS memories_type_idx ON memories (type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS memories_is_active_idx ON memories (is_active)`);
    console.log("Indexes created");

    await client.query("COMMIT");
    console.log("✓ Migration complete");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
