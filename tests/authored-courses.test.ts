import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  AUTHORED_COURSE_COUNT,
  authoredCourse,
  authoredIndexForDate,
} from '../src/backend/authored-courses';
import { parseLevel } from '../src/game';
import { isCourseObject } from '../src/game/objects/catalog';
import { decodePuzzle } from '../src/shared/response-validation';
import { puzzleFixture } from './iteration-two-fixtures';

test('every authored course is registered in the official daily rotation with its colors and inventory', async () => {
  const directory = 'src/game/levels/authored';
  const files = (await readdir(directory)).filter(
    (name) => name.endsWith('.json') && !name.endsWith('.editor.json'),
  );
  const rotation = Array.from({ length: AUTHORED_COURSE_COUNT }, (_, index) =>
    authoredCourse(index),
  );
  assert.deepEqual(
    rotation.map((course) => course.level.id).sort(),
    files.map((name) => name.slice(0, -5)).sort(),
  );
  for (const filename of files) {
    const source = parseLevel(JSON.parse(await readFile(`${directory}/${filename}`, 'utf8')));
    const course = rotation.find((entry) => entry.level.id === source.id)!;
    assert.deepEqual(course.level.colorScheme, source.colorScheme);
    assert.deepEqual(course.level.dynamicBodies, source.dynamicBodies);
    assert.deepEqual(course.level.staticBodies, source.staticBodies);
    assert.deepEqual(
      course.level.fields,
      source.fields.map((field) =>
        isCourseObject(field.force) ? field : { ...field, enabled: false },
      ),
    );
    assert.equal(
      course.solutions[0]!.commands.length,
      source.fields.filter((field) => !isCourseObject(field.force)).length * 3,
    );
    assert.doesNotThrow(() =>
      decodePuzzle({ ...puzzleFixture(), configuration: course.level, rules: course.rules }),
    );
  }
});

test('official multi-body courses use daily admission rather than community submission limits', () => {
  const rotation = Array.from({ length: AUTHORED_COURSE_COUNT }, (_, index) =>
    authoredCourse(index),
  );
  for (const id of ['big-boom', 'konami']) {
    const course = rotation.find((entry) => entry.level.id === id)!;
    assert.ok(course, `${id} must be included in the daily rotation`);
    assert.ok(course.level.dynamicBodies.length > 16);
    assert.ok(course.level.dynamicBodies.length <= 32);
    assert.doesNotThrow(() =>
      decodePuzzle({ ...puzzleFixture(), configuration: course.level, rules: course.rules }),
    );
  }
  // A full rotation schedules every designer course, and a date remains deterministic.
  const indexes = new Set<number>();
  for (let day = 1; day <= AUTHORED_COURSE_COUNT; day++) {
    const date = `2026-12-${String(day).padStart(2, '0')}`;
    const index = authoredIndexForDate(date);
    assert.equal(authoredIndexForDate(date), index);
    indexes.add(index);
  }
  assert.equal(indexes.size, AUTHORED_COURSE_COUNT);
});
