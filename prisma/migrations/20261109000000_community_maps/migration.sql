CREATE TABLE "community_maps" (
  "id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "submission_hash" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "creator_name" TEXT NOT NULL,
  "configuration" JSONB NOT NULL,
  "rules" JSONB NOT NULL,
  "author_solution" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_maps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_maps_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "community_maps_author_id_request_id_key" ON "community_maps"("author_id", "request_id");
CREATE INDEX "community_maps_created_at_id_idx" ON "community_maps"("created_at", "id");
