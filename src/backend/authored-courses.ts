// import { parseLevel } from '../game';
// import { defaultRules, makePlacement, type TileDraft } from '../game/run-evaluation';
// import { isCourseObject } from '../game/objects/catalog';
// import type { Level } from '../game';
// import cinderFord from '../game/levels/authored/cinder-ford.json';
// import emberAlley from '../game/levels/authored/ember-alley.json';
// import openWaterHop from '../game/levels/authored/open-water-hop.json';
// import tidalTransfer from '../game/levels/authored/tidal-transfer.json';

// /**
//  * Designer-made courses in the daily rotation. Each one ships with an enabled
//  * launch layout that solves it (see levels/authored/README.md). Add a course here
//  * only when it has two known solutions.
//  */
// const AUTHORED = [cinderFord, emberAlley, openWaterHop, tidalTransfer].map((raw) =>
//   parseLevel(raw),
// );
// export const AUTHORED_COURSE_COUNT = AUTHORED.length;

// const titleFromId = (id: string) =>
//   id
//     .split('-')
//     .map((word) => word[0]!.toUpperCase() + word.slice(1))
//     .join(' ');

// /** The same date always gets the same course, whichever day the schedule runs. */
// export function authoredIndexForDate(date: string): number {
//   const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
//   return ((day % AUTHORED.length) + AUTHORED.length) % AUTHORED.length;
// }

// export function authoredCourse(index: number) {
//   const authored = AUTHORED[((index % AUTHORED.length) + AUTHORED.length) % AUTHORED.length]!;
//   // Players start with every tile switched off; the authored layout is the reference solution.
//   const level: Level = parseLevel({
//     ...authored,
//     fields: authored.fields.map((f) => (isCourseObject(f.force) ? f : { ...f, enabled: false })),
//   });
//   const rules = defaultRules(level);
//   const tiles = authored.fields.filter((f) => !isCourseObject(f.force));
//   const solution = (launchShiftY: number) =>
//     makePlacement(
//       level,
//       Object.fromEntries(
//         tiles.map((f): [string, TileDraft] => [
//           f.id,
//           {
//             position: { x: f.position.x, y: f.position.y + (f.id === 'launch' ? launchShiftY : 0) },
//             angle: f.angle,
//             enabled: f.enabled,
//           },
//         ]),
//       ),
//       rules,
//     );
//   return {
//     level,
//     rules,
//     title: titleFromId(authored.id),
//     // The README documents both: the authored layout, and the launch tile 0.125 higher.
//     solutions: [solution(0), solution(0.125)],
//   };
// }

import { parseLevel } from '../game';
import { defaultRules, makePlacement, type TileDraft } from '../game/run-evaluation';
import { isCourseObject } from '../game/objects/catalog';
import bigBertha from '../game/levels/authored/big-bertha.json';
import bigU from '../game/levels/authored/big-u.json';
import cinderFord from '../game/levels/authored/cinder-ford.json';
import emberAlley from '../game/levels/authored/ember-alley.json';
import jailed from '../game/levels/authored/jailed.json';
import openWaterHop from '../game/levels/authored/open-water-hop.json';
import porcupine from '../game/levels/authored/porcupine.json';
import prismRelay from '../game/levels/authored/prism-relay.json';
import straightForward from '../game/levels/authored/straight-forward.json';
import tidalTransfer from '../game/levels/authored/tidal-transfer.json';
import whirlyGig from '../game/levels/authored/whirly-gig.json';

/** Every designer-made course from the level editor, in daily rotation order. */
const RAW = [
  bigBertha,
  bigU,
  cinderFord,
  emberAlley,
  jailed,
  openWaterHop,
  porcupine,
  prismRelay,
  straightForward,
  tidalTransfer,
  whirlyGig,
];
export const AUTHORED_COURSE_COUNT = RAW.length;

const titleFromId = (id: string) =>
  id
    .split('-')
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');

/** The same date always gets the same course, whichever day the schedule runs. */
export function authoredIndexForDate(date: string): number {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return ((day % RAW.length) + RAW.length) % RAW.length;
}

/** Builds the daily version of a designer course. Throws if the file is invalid. */
export function authoredCourse(index: number) {
  const authored = parseLevel(RAW[((index % RAW.length) + RAW.length) % RAW.length]);
  // Players start with every tile switched off.
  const level = parseLevel({
    ...authored,
    fields: authored.fields.map((f) => (isCourseObject(f.force) ? f : { ...f, enabled: false })),
  });
  const rules = defaultRules(level);
  // The editor layout is kept as the reference. Not every course has been re-tuned for the
  // current physics yet, so it is stored without requiring a successful replay.
  const reference = makePlacement(
    level,
    Object.fromEntries(
      authored.fields
        .filter((f) => !isCourseObject(f.force))
        .map((f): [string, TileDraft] => [
          f.id,
          { position: f.position, angle: f.angle, enabled: f.enabled },
        ]),
    ),
    rules,
  );
  return { level, rules, title: titleFromId(authored.id), solutions: [reference] };
}
