-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "puzzle_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "seed" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "author_solution" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("puzzle_id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "attempt_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "puzzle_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "simulation_time" DOUBLE PRECISION,
    "force_cost" INTEGER,
    "tile_count" INTEGER,
    "path_length" DOUBLE PRECISION,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "solutions" (
    "solution_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "puzzle_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "placement_data" JSONB NOT NULL,
    "daily_rank" INTEGER,
    "daily_percentile" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solutions_pkey" PRIMARY KEY ("solution_id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "user_id" TEXT NOT NULL,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "games_solved" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "average_percentile" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_date_key" ON "puzzles"("date");

-- CreateIndex
CREATE INDEX "attempts_user_id_idx" ON "attempts"("user_id");

-- CreateIndex
CREATE INDEX "attempts_puzzle_id_idx" ON "attempts"("puzzle_id");

-- CreateIndex
CREATE UNIQUE INDEX "solutions_attempt_id_key" ON "solutions"("attempt_id");

-- CreateIndex
CREATE INDEX "solutions_user_id_idx" ON "solutions"("user_id");

-- CreateIndex
CREATE INDEX "solutions_puzzle_id_idx" ON "solutions"("puzzle_id");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("puzzle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("puzzle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("attempt_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
