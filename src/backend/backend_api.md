# Puttential Backend API Contract / Puttential

## 1. Overview

This document defines the initial backend API contract for the Puttential Iteration 1 prototype. The backend uses TypeScript, Prisma, and PostgreSQL, and is intended to be exposed through Next.js Route Handlers after the team selects and integrates the final Next.js frontend.


> **Current status:** The service layer and database logic can be implemented independently of the UI. The HTTP Route Handlers shown below are the intended interface and may not yet exist in the repository.

### Base URL

Local development：

```text
http://localhost:3000
```

Example endpoint：

```text
GET http://localhost:3000/api/puzzles/today
```

### Content Type

Requests with a body should use JSON.

```http
Content-Type: application/json
```

### Daily Puzzle Time Zone

The active daily puzzle is determined using U.S. Central Time with the IANA time zone `America/Chicago`. This automatically handles CST/CDT daylight-saving changes.

---

# 2. GET /api/puzzles/today

## Purpose

Returns the canonical puzzle for the current calendar day in U.S. Central Time.


## Request

No request body.

### TypeScript example

```ts
const response = await fetch("/api/puzzles/today");

if (!response.ok) {
  throw new Error("Failed to load today's puzzle");
}

const puzzle = await response.json();
```

### curl example

```bash
curl http://localhost:3000/api/puzzles/today
```

## Successful Response

**Status:** `200 OK`

```json
{
  "id": "puzzle-uuid",
  "date": "2026-09-28",
  "seed": "puttential-2026-09-28",
  "difficulty": 2,
  "configuration": {
    "id": "bar-through-gate",
    "version": 1,
    "gravity": {
      "x": 0,
      "y": 0
    },
    "dynamicBodies": [],
    "staticBodies": [],
    "fields": [],
    "prediction": {
      "maxTicks": 2400,
      "sampleEveryTicks": 12
    }
  }
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Database puzzle ID |
| `date` | `string` | Daily puzzle date in `YYYY-MM-DD` |
| `seed` | `string` | Puzzle seed / Puzzle seed |
| `difficulty` | `number` | Difficulty level |
| `configuration` | object | Game-engine level configuration; currently treated as an opaque JSON object until the game-engine branch is integrated |

## Error Response

**Recommended status:** `404 Not Found`

```json
{
  "error": "Today's puzzle was not found."
}
```

## Backend service

```ts
getTodaysPuzzle(): Promise<TodayPuzzleResponse | null>
```

Implemented in：

```text
src/backend/services/puzzle-service.ts
```

---

# 3. POST /api/attempts

## Purpose

Creates one gameplay attempt. An attempt represents one simulation run started by the player.

Anonymous attempts are supported. `userId` may be omitted or `null`.

## Request

```json
{
  "puzzleId": "puzzle-uuid",
  "success": false,
  "simulationTime": 5.21,
  "forceCost": 4,
  "tileCount": 2,
  "pathLength": 8.7
}
```

Authenticated example：

```json
{
  "puzzleId": "puzzle-uuid",
  "userId": "user-uuid",
  "success": true,
  "simulationTime": 4.82,
  "forceCost": 3,
  "tileCount": 2,
  "pathLength": 7.4
}
```

### TypeScript example

```ts
const response = await fetch("/api/attempts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    puzzleId,
    success,
    simulationTime,
    forceCost,
    tileCount,
    pathLength,
  }),
});

const result = await response.json();
```

### curl example

```bash
curl -X POST http://localhost:3000/api/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "puzzleId":"puzzle-uuid",
    "success":false,
    "simulationTime":5.21,
    "forceCost":4,
    "tileCount":2,
    "pathLength":8.7
  }'
```

## Request fields

| Field | Required | Description |
|---|---|---|
| `puzzleId` | Yes | Puzzle associated with the attempt |
| `userId` | No | Registered user ID; omit for anonymous play |
| `success` | No | Prototype success flag; defaults to `false` |
| `simulationTime` | No | Simulated completion/runtime metric; must be non-negative / Simulation |
| `forceCost` | No | Non-negative integer force cost |
| `tileCount` | No | Non-negative integer tile count |
| `pathLength` | No | Non-negative path length |

## Successful Response

**Recommended status:** `201 Created`

```json
{
  "attemptId": "attempt-uuid"
}
```

## Current validation

The backend service currently checks that the puzzle exists, verifies a supplied user ID exists, and rejects invalid negative/non-finite metrics or non-integer discrete metrics.

> **Important:** `success` is currently caller-reported because the game engine does not yet expose a formal win/goal condition. Server-side physics validation is future work.

## Backend service

```ts
createAttempt(input: CreateAttemptRequest): Promise<CreateAttemptResponse>
```

Implemented in：

```text
src/backend/services/attempt-service.ts
```

---

# 4. POST /api/solutions

## Purpose

Stores replay/placement data for a successful Attempt. The stored commands are intended to support replay and future server-side validation.

## Request

```json
{
  "puzzleId": "puzzle-uuid",
  "attemptId": "attempt-uuid",
  "placementData": {
    "levelId": "bar-through-gate",
    "levelVersion": 1,
    "simulationVersion": "puttential-core-1|rapier-0.20.0|dt-1/120",
    "commands": [
      {
        "type": "move-field",
        "fieldId": "lift-field",
        "xQ": -3379,
        "yQ": 1024,
        "sequence": 1
      },
      {
        "type": "set-field-enabled",
        "fieldId": "lift-field",
        "enabled": true,
        "sequence": 2
      }
    ]
  }
}
```

Authenticated players may also include `userId`.

### TypeScript example

```ts
const response = await fetch("/api/solutions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    puzzleId,
    attemptId,
    placementData,
  }),
});

const result = await response.json();
```

### curl example

```bash
curl -X POST http://localhost:3000/api/solutions \
  -H "Content-Type: application/json" \
  -d '{
    "puzzleId":"puzzle-uuid",
    "attemptId":"attempt-uuid",
    "placementData":{
      "levelId":"bar-through-gate",
      "levelVersion":1,
      "commands":[]
    }
  }'
```

## Successful Response

**Recommended status:** `201 Created`

```json
{
  "solutionId": "solution-uuid"
}
```

## Current validation

The current service checks that the Attempt exists, belongs to the specified Puzzle, is marked successful, does not already have a Solution, and matches the supplied user when a user ID is provided. Replay command structure is also checked for required IDs, non-negative integer sequence numbers, unique sequences, and integer quantized coordinates for `move-field` commands.

## Future server-side physics validation

The current game engine does not yet expose a formal goal/success rule, so the backend cannot independently verify whether a submitted solution truly completes the puzzle.

Intended future flow：

```text
Client submits Solution
        ↓
Backend loads Puzzle.configuration
        ↓
Backend replays placementData.commands
        ↓
Shared TypeScript physics engine
        ↓
Verify formal goal condition
        ↓
Valid → store Solution
Invalid → reject Solution
```

## Backend service

```ts
createSolution(input: CreateSolutionRequest): Promise<CreateSolutionResponse>
```

Implemented in：

```text
src/backend/services/solution-service.ts
```

---

# 5. Recommended HTTP Error Mapping

The current service layer throws JavaScript errors. When Next.js Route Handlers are added, the Route Handlers should translate those service errors into HTTP status codes.

| Situation | Recommended Status |
|---|---|
| Invalid request body | `400 Bad Request` |
| Puzzle/User/Attempt not found | `404 Not Found` |
| Solution already exists | `409 Conflict` |
| Database/internal error | `500 Internal Server Error` |

Recommended error body：

```json
{
  "error": "Human-readable error message"
}
```

---

# 6. Planned Route Handler Structure

After the final Next.js app is selected, the HTTP layer can be added without rewriting the service layer.

```text
app/
└── api/
    ├── puzzles/
    │   └── today/
    │       └── route.ts
    ├── attempts/
    │   └── route.ts
    └── solutions/
        └── route.ts
```

The Route Handlers should call the existing backend services. / Route Handlers 应直接调用现有 backend services。

```text
Route Handler
      ↓
Backend Service
      ↓
Prisma
      ↓
PostgreSQL
```

---

# 7. Future APIs

These endpoints are not part of the minimum Iteration 1 backend prototype and should be added only when the corresponding feature is integrated.

| Endpoint | Purpose |
|---|---|
| `GET /api/leaderboard` | Daily leaderboard |
| `GET /api/archive` | Historical puzzles |
| `GET /api/users/:id/stats` | Player statistics |
| Auth routes | Login/account support |

