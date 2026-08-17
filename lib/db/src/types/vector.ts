import { customType } from "drizzle-orm/pg-core";

/**
 * pgvector column type for semantic embeddings.
 * Requires the `vector` PostgreSQL extension (pgvector).
 * The extension is created in the first migration.
 */
export const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${config.dimensions})`;
    },
    fromDriver(value: string): number[] {
      // pgvector returns "[1,2,3]" style strings
      return value
        .slice(1, -1)
        .split(",")
        .map(Number);
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
  })(name);
