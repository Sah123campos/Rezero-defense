import test from "node:test";
import assert from "node:assert/strict";
import {
  HEROES,
  WAVES,
  upgradeState,
  towerStats,
  enemyStats,
  wavePlan,
  sanitizeSave,
  createRoute,
  routePoint,
  distanceToRoute,
} from "../src/rules.js";

test("four initial heroes offer three complete, affordable upgrade paths", () => {
  assert.deepEqual(Object.keys(HEROES), [
    "emilia",
    "rem",
    "beatrice",
    "subaru",
  ]);
  assert.deepEqual(
    Object.values(HEROES).map((h) => h.cost),
    [165, 220, 245, 115],
  );
  for (const hero of Object.values(HEROES)) {
    assert.equal(hero.paths.length, 3);
    for (const path of hero.paths) {
      assert.equal(path.tiers.length, 5);
      let previous = 0;
      for (const tier of path.tiers) {
        assert.ok(tier.name && tier.description);
        assert.ok(Number.isInteger(tier.cost) && tier.cost > previous);
        previous = tier.cost;
      }
    }
  }
});

test("crosspaths permit a 5-2-0 strategy and block all invalid combinations", () => {
  assert.equal(upgradeState("emilia", [0, 0, 0], 0).allowed, true);
  assert.equal(upgradeState("emilia", [4, 2, 0], 0).allowed, true);
  assert.equal(upgradeState("emilia", [5, 1, 0], 1).allowed, true);
  assert.equal(upgradeState("emilia", [5, 2, 0], 1).allowed, false);
  assert.equal(upgradeState("emilia", [1, 1, 0], 2).allowed, false);
  assert.equal(upgradeState("emilia", [2, 2, 0], 0).allowed, true);
  assert.equal(upgradeState("emilia", [2, 3, 0], 0).allowed, false);
  assert.equal(upgradeState("emilia", [5, 0, 0], 0).tier, null);
  assert.equal(upgradeState("missing", [0, 0, 0], 0).allowed, false);
  assert.equal(upgradeState("emilia", [0, 0, 0], 4).allowed, false);
});

test("every allowed full crosspath has finite stats and a strategic tradeoff", () => {
  for (const key of Object.keys(HEROES)) {
    const base = towerStats(key);
    assert.ok(towerStats(key, [5, 2, 0]).damage > base.damage * 4);
    assert.ok(towerStats(key, [0, 5, 2]).range > base.range);
    assert.ok(towerStats(key, [2, 0, 5]).interval < base.interval / 2);
    for (const levels of [
      [5, 2, 0],
      [0, 5, 2],
      [2, 0, 5],
    ]) {
      const stats = towerStats(key, levels);
      assert.ok(Object.values(stats).every(Number.isFinite));
      assert.ok(stats.interval > 0 && stats.critical < 1 && stats.slow < 1);
    }
  }
  assert.ok(towerStats("emilia").slow > 0);
  assert.ok(towerStats("rem").splash > 0);
  assert.ok(towerStats("beatrice").buff > 0);
  assert.ok(towerStats("subaru").critical > 0);
});

test("fifteen increasing waves introduce armor, magic, and a boss every fifth wave", () => {
  assert.equal(WAVES, 15);
  let previous = 0;
  for (let wave = 1; wave <= WAVES; wave++) {
    const plan = wavePlan(wave);
    assert.ok(plan.length > previous);
    assert.equal(
      plan.filter((type) => type === "boss").length,
      wave % 5 === 0 ? 1 : 0,
    );
    if (wave % 5 === 0) assert.equal(plan.at(-1), "boss");
    previous = plan.length;
  }
  assert.equal(wavePlan(1).includes("armored"), false);
  assert.equal(wavePlan(2).includes("armored"), true);
  assert.equal(wavePlan(6).includes("wraith"), true);
  assert.ok(enemyStats("boss", 15).hp > enemyStats("boss", 5).hp);
  assert.ok(enemyStats("armored", 5).hp > enemyStats("runner", 5).hp);
  assert.ok(enemyStats("runner", 5).speed > enemyStats("armored", 5).speed);
  assert.equal(enemyStats("unknown", 1).hp, enemyStats("shade", 1).hp);
});

test("save validation survives corrupted JSON contents and clamps settings", () => {
  for (const bad of [null, false, "hello", 42, [], undefined]) {
    const save = sanitizeSave(bad);
    assert.equal(save.unlocked, 1);
    assert.deepEqual(save.best, [0, 0, 0]);
    assert.deepEqual(save.wins, [false, false, false]);
  }
  const save = sanitizeSave({
    unlocked: 999,
    best: [-4, NaN, 99],
    wins: [false, "yes", false],
    victories: -1,
    settings: { music: 4, sfx: -2, quality: "ultra" },
  });
  assert.equal(save.version, 2);
  assert.equal(save.unlocked, 3);
  assert.deepEqual(save.best, [0, 0, 15]);
  assert.deepEqual(save.wins, [false, false, false]);
  assert.deepEqual(save.settings, { music: 1, sfx: 0, quality: "auto" });
  assert.equal(save.victories, 0);
});

test("legacy campaign saves retain progress without sharing mutable arrays", () => {
  const legacy = { unlocked: 1, best: [12, 0, 0], wins: [true, false, false] };
  const save = sanitizeSave(legacy);
  assert.equal(save.unlocked, 2);
  assert.deepEqual(save.best, [15, 0, 0]);
  assert.equal(save.victories, 1);
  save.best[0] = 2;
  assert.equal(legacy.best[0], 12);
  assert.equal(sanitizeSave().best[0], 0);
});

test("route movement clamps both ends and follows length through corners", () => {
  const route = createRoute([
    [0, 0],
    [0, 0],
    [3, 0],
    [3, 4],
  ]);
  assert.equal(route.total, 7);
  assert.deepEqual(route.lengths, [3, 4]);
  assert.deepEqual(routePoint(route, -5), {
    x: 0,
    z: 0,
    angle: Math.PI / 2,
    length: 7,
  });
  assert.deepEqual(routePoint(route, 5), { x: 3, z: 2, angle: 0, length: 7 });
  assert.deepEqual(routePoint(route, 100), { x: 3, z: 4, angle: 0, length: 7 });
  assert.equal(
    routePoint(
      [
        [0, 0],
        [1, 0],
      ],
      0.5,
    ).x,
    0.5,
  );
  assert.equal(distanceToRoute(2, 2, route), 1);
  assert.equal(distanceToRoute(-3, -4, route), 5);
  assert.equal(distanceToRoute(NaN, 0, route), Infinity);
  assert.throws(
    () =>
      createRoute([
        [0, 0],
        [0, 0],
      ]),
    RangeError,
  );
});
