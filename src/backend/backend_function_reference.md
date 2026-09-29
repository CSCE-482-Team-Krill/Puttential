# Puttential Backend Code Reference

## 1. Project Setup

### Current Structure

```text
Puttential/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── generated/
│   └── prisma/
├── src/
│   └── backend/
│       ├── prisma.ts
│       ├── types.ts
│       └── services/
│           ├── puzzle-service.ts
│           ├── attempt-service.ts
│           └── solution-service.ts
├── .env
├── package.json
└── prisma7.config.ts
```

The current backend prototype uses **TypeScript + Prisma + PostgreSQL**.  

The Next.js Route Handlers have not been connected yet. They will be added after the final frontend structure is selected.  

### Start the Project

1. Install dependencies

```bash
npm install
```

2. Make sure PostgreSQL is running

On Windows, PostgreSQL normally runs as a Windows service. You can also confirm the database is available in pgAdmin.  

3. Configure `.env`

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/puttential"
```

4. Generate Prisma Client

```bash
npx prisma generate
```

5. Apply database migrations

```bash
npx prisma migrate dev
```

6. Optional: open Prisma Studio

```bash
npx prisma studio
```

After the final Next.js app is integrated, the frontend/backend app will normally start with:  

```bash
npm run dev
```

---

# 2. Files and Functions

## `src/backend/prisma.ts`

### Purpose

Creates and exports one shared Prisma client for the backend.  

### Export

#### `prisma`

- **Purpose:** Shared database client.
- **Parameters:** None
- **Returns:** `PrismaClient`
- **Uses:** `PrismaClient`, `PrismaPg`, `DATABASE_URL`

---

## `src/backend/types.ts`

### Purpose

Defines shared TypeScript data types used between the frontend, backend, and future game-engine integration.  

### Main Types

#### `TodayPuzzleResponse`
Daily puzzle data returned to the frontend.  

#### `CreateAttemptRequest`
Data required to create one gameplay attempt.  

#### `CreateAttemptResponse`
Returns the new `attemptId`.  

#### `ReplayCommand`
Represents game-engine commands such as `move-field` and `set-field-enabled`.  

#### `SolutionPlacementData`
Stores level information and replay commands for a solution.  

#### `CreateSolutionRequest`
Data required to save a successful solution.  

#### `CreateSolutionResponse`
Returns the new `solutionId`.  

---

## `src/backend/services/puzzle-service.ts`

### Purpose

Reads daily puzzle data from PostgreSQL.  

### Functions

#### `getCentralDateString(date)`

- **Purpose:** Converts a JavaScript `Date` into `YYYY-MM-DD` using U.S. Central Time (`America/Chicago`).
- **Parameter:** `date: Date`
- **Returns:** `string`
- **Uses:** `Intl.DateTimeFormat`

#### `databaseDate(dateString)`

- **Purpose:** Converts `YYYY-MM-DD` into a Date value Prisma can query.
- **Parameter:** `dateString: string`
- **Returns:** `Date`
- **Uses:** JavaScript `Date`

#### `getPuzzleByDate(date)`

- **Purpose:** Finds the puzzle for a specific Central Time calendar date.
- **Parameter:** `date: Date`
- **Returns:** `Promise<TodayPuzzleResponse | null>`
- **Uses:** `prisma.puzzle.findUnique()`

#### `getTodaysPuzzle()`

- **Purpose:** Returns today's puzzle using U.S. Central Time.
- **Parameters:** None / 无
- **Returns:** `Promise<TodayPuzzleResponse | null>`
- **Uses:** `getPuzzleByDate()`

---

## `src/backend/services/attempt-service.ts`

### Purpose

Validates and stores gameplay attempts. Anonymous attempts are supported.  

### Functions

#### `validateOptionalNonNegativeNumber(value, fieldName)`

- **Purpose:** Checks optional numeric values such as simulation time or path length.
- **Parameters:** `value`, `fieldName`
- **Returns:** `void`
- **Uses:** No external API

#### `validateOptionalNonNegativeInteger(value, fieldName)`

- **Purpose:** Checks integer values such as force cost and tile count.
- **Parameters:** `value`, `fieldName`
- **Returns:** `void`
- **Uses:** No external API

#### `createAttempt(input)`

- **Purpose:** Creates one Attempt record in PostgreSQL.
- **Parameter:** `input: CreateAttemptRequest`
- **Returns:** `Promise<CreateAttemptResponse>`
- **Uses:**  
  - `prisma.puzzle.findUnique()`  
  - `prisma.user.findUnique()`  
  - `prisma.attempt.create()`

---

## `src/backend/services/solution-service.ts`

### Purpose

Validates basic solution data and stores a Solution for a successful Attempt.  

### Functions

#### `validatePlacementData(placementData)`

- **Purpose:** Checks the basic structure of replay commands before saving them.
- **Parameter:** `placementData: SolutionPlacementData`
- **Returns:** `void`
- **Uses:** No external API

#### `createSolution(input)`

- **Purpose:** Creates a Solution linked to an existing successful Attempt.
- **Parameter:** `input: CreateSolutionRequest`
- **Returns:** `Promise<CreateSolutionResponse>`
- **Uses:**  
  - `prisma.attempt.findUnique()`  
  - `prisma.solution.create()`

---

# 3. Current Backend Flow

```text
Frontend / Future Next.js Route Handler
                ↓
        Backend Service
                ↓
             Prisma
                ↓
           PostgreSQL
```

Current service flow：

```text
Daily Puzzle
GET /api/puzzles/today
        ↓
getTodaysPuzzle()
        ↓
PostgreSQL
```

```text
Gameplay Attempt
POST /api/attempts
        ↓
createAttempt()
        ↓
PostgreSQL
```

```text
Successful Solution
POST /api/solutions
        ↓
createSolution()
        ↓
PostgreSQL
```

The HTTP Route Handlers are planned but not implemented yet.  
