-- Community courses share the daily run, verification, progress and standings tables.
ALTER TABLE "puzzles" ALTER COLUMN "date" DROP NOT NULL;
ALTER TABLE "puzzles" ADD COLUMN "community_map_id" TEXT;
CREATE UNIQUE INDEX "puzzles_community_map_id_key" ON "puzzles"("community_map_id");
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_community_map_id_fkey"
  FOREIGN KEY ("community_map_id") REFERENCES "community_maps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_course_source_check"
  CHECK (("date" IS NOT NULL AND "community_map_id" IS NULL)
      OR ("date" IS NULL AND "community_map_id" IS NOT NULL));

-- Make previously published maps rankable without republishing or changing their URLs.
INSERT INTO "puzzles" ("puzzle_id", "community_map_id", "seed", "configuration", "difficulty",
                       "author_solution", "created_at", "title", "rules")
SELECT "id", "id", '', "configuration", 0, "author_solution", "created_at", "title", "rules"
FROM "community_maps";
