import { parseLevel } from "@game";
import type { Level } from "@game";
import barAroundCorner from "../../../src/game/levels/bar-around-corner.json";
import cornerPocket from "../../../src/game/levels/corner-pocket.json";
import keyTurn from "../../../src/game/levels/key-turn.json";
import radialRelay from "../../../src/game/levels/radial-relay.json";
import spinCycle from "../../../src/game/levels/spin-cycle.json";

/** Today's puzzle first; the archive lists the rest. */
export const LEVELS: readonly { level: Level; day: string }[] = [
  { level: parseLevel(barAroundCorner), day: "Today" },
  { level: parseLevel(radialRelay), day: "Yesterday" },
  { level: parseLevel(spinCycle), day: "Sep 20" },
  { level: parseLevel(keyTurn), day: "Sep 19" },
  { level: parseLevel(cornerPocket), day: "Sep 18" },
];
