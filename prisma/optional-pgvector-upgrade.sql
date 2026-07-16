-- Optional pgvector performance upgrade for the RAG Engine's Embedding table.
--
-- NOT applied by `prisma migrate` — the `vector` Postgres extension isn't
-- guaranteed to be installed on every deployment target, and Prisma has no
-- built-in way to make a migration conditional on an extension existing.
-- src/lib/rag/vector-store.ts works correctly without this (brute-force
-- cosine similarity in Node over the always-populated Embedding.vector
-- Float[] column) — this script only adds a faster, ANN-indexed path once
-- your corpus grows large enough that brute-force scanning gets slow.
--
-- Prerequisites:
--   1. Install the extension package (Ubuntu/Debian):
--        sudo apt install postgresql-16-pgvector   (match your Postgres major version)
--   2. Restart Postgres: sudo systemctl restart postgresql
--   3. Run this script against your database:
--        psql "$DATABASE_URL" -f prisma/optional-pgvector-upgrade.sql
--
-- After running this, src/lib/rag/vector-store.ts's isPgVectorAvailable()
-- will start returning true; a future revision of semanticSearch() can then
-- route through "embedding_vector" below via the `<=>` cosine-distance
-- operator + the ivfflat index instead of the brute-force JS scan.

CREATE EXTENSION IF NOT EXISTS vector;

-- A native vector column, kept in sync with Embedding.vector by application
-- code (src/lib/rag/vector-store.ts's upsertEmbedding, once the pgvector
-- path is wired in) rather than a trigger, so a partial/failed pgvector
-- write never blocks the always-correct Float[] write.
CREATE TABLE IF NOT EXISTS "EmbeddingVector" (
  "embeddingId" TEXT PRIMARY KEY REFERENCES "Embedding"("id") ON DELETE CASCADE,
  "vector" vector(1536) -- widest dimension count in use (OpenAI text-embedding-3-small); Voyage/Cohere/Jina/BGE's 1024-dim vectors are zero-padded on write.
);

CREATE INDEX IF NOT EXISTS "EmbeddingVector_ivfflat_idx"
  ON "EmbeddingVector"
  USING ivfflat ("vector" vector_cosine_ops)
  WITH (lists = 100);

-- One-time backfill from the existing Float[] column for any Embedding rows
-- created before this upgrade was applied.
INSERT INTO "EmbeddingVector" ("embeddingId", "vector")
SELECT "id", "vector"::vector
FROM "Embedding"
ON CONFLICT ("embeddingId") DO NOTHING;
