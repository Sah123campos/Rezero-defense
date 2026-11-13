/** Budget viability check. Start npm run dev first, or supply BROWSER_URL. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
let playwright;
for (const entry of [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
].filter(Boolean)) {
  try {
    playwright = await import(entry);
    break;
  } catch {}
}
if (!playwright)
  throw Error(
    "Install Playwright with npm ci, then npx playwright install chromium.",
  );
const { chromium } = playwright;
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader-webgl",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("crash", () => console.log("BROWSER_PAGE_CRASHED"));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `${process.env.BROWSER_URL || "http://127.0.0.1:5173"}/?test=1`,
    );
    await page.waitForFunction(() => !!window.__ASTRAL_TEST__, null, {
      timeout: 60000,
    });

    const result = await page.evaluate(async () => {
      const api = window.__ASTRAL_TEST__;
      const { HEROES, createRoute, routePoint, upgradeState } = await import(
        "./src/rules.js"
      );
      const { MAPS } = await import("./src/world.js");
      api.view.setQuality("low");
      api.startMap(0);
      api.view.render = () => {};
      const route = createRoute(MAPS[0].route),
        samples = [];
      for (let d = 0; d < route.total; d += 0.35) {
        const p = routePoint(route, d);
        samples.push({ ...p, d });
      }
      const history = [],
        purchases = [];
      function findSpot(key) {
        const radius = HEROES[key].range;
        let best = null;
        for (let x = -10.5; x <= 10.5; x += 0.5)
          for (let z = -5.5; z <= 5.5; z += 0.5) {
            if (!api.placementValid(x, z)) continue;
            const covered = samples.filter(
              (p) => Math.hypot(p.x - x, p.z - z) < radius,
            );
            const count = covered.length;
            let support = 0;
            if (key === "beatrice")
              support =
                api.towers.filter((t) => Math.hypot(t.x - x, t.z - z) < radius)
                  .length * 20;
            const score = count + support;
            if (!best || score > best.score) best = { x, z, score };
          }
        return best;
      }
      function buy(key) {
        const spot = findSpot(key);
        if (!spot || api.state.gold < HEROES[key].cost) return false;
        const ok = api.place(key, spot.x, spot.z);
        if (ok)
          purchases.push({
            wave: api.state.wave,
            key,
            x: spot.x,
            z: spot.z,
            cost: HEROES[key].cost,
          });
        return ok;
      }
      buy("emilia");
      buy("rem");
      buy("subaru");
      const upgradePlan = {
        emilia: [1, 1, 0, 0, 0, 0, 0],
        rem: [1, 1, 0, 0, 0, 0, 0],
        subaru: [0, 0, 2, 2, 2, 2, 2],
        beatrice: [1, 1, 2, 2, 2, 2, 2],
      };
      function improve() {
        // First add aura support, then invest in the existing squad.
        if (
          !api.towers.some((t) => t.key === "beatrice") &&
          api.state.gold >= HEROES.beatrice.cost
        )
          buy("beatrice");
        let changed = true;
        while (changed) {
          changed = false;
          let choice = null;
          for (const t of api.towers) {
            const done = t.levels.reduce((a, b) => a + b, 0),
              branch = upgradePlan[t.key][done];
            if (branch === undefined) continue;
            const u = upgradeState(t.key, t.levels, branch);
            if (!u.allowed || u.cost > api.state.gold) continue;
            // Early upgrades first, damage priorities beat advanced expensive levels.
            const score = (done < 2 ? 10 : 0) + (1 / u.cost) * 1000;
            if (!choice || score > choice.score)
              choice = { id: t.id, branch, cost: u.cost, score, key: t.key };
          }
          if (choice) {
            api.select(choice.id);
            const ok = api.upgrade(choice.branch);
            if (ok) {
              purchases.push({
                wave: api.state.wave,
                key: choice.key,
                upgrade: choice.branch,
                cost: choice.cost,
              });
              changed = true;
            }
          }
        }
      }
      let totalStepped = 0;
      for (let wave = 1; wave <= 15; wave++) {
        if (api.state.ended) break;
        improve();
        const started = api.startWave();
        if (!started) {
          history.push({ error: "wave_not_started", ...api.snapshot() });
          break;
        }
        let time = 0,
          casts = 0;
        while (api.state.running && !api.state.ended && time < 300) {
          if (
            api.state.abilityCd <= 0 &&
            api.enemies.filter((e) => !e.dead).length >= 4
          ) {
            if (api.cast()) casts++;
          }
          api.step(1);
          api.view.update(1, api.towers, api.enemies, []);
          api.view.clearEffects();
          time++;
          totalStepped++;
        }
        history.push({
          wave: api.state.wave,
          completed:
            (!api.state.running && !api.state.ended) ||
            (api.state.wave === 15 && api.save.wins[0]),
          lives: api.state.lives,
          gold: api.state.gold,
          kills: api.state.kills,
          seconds: time,
          casts,
          towers: api.towers.map((t) => ({
            key: t.key,
            levels: [...t.levels],
          })),
        });
        if (api.state.ended) break;
      }
      return {
        history,
        purchases,
        totalStepped,
        final: api.snapshot(),
        routeLength: route.total,
      };
    });
    assert.deepEqual(errors, []);
    assert.equal(result.final.save.wins[0], true);
    assert.ok(result.final.lives > 0);
    assert.equal(result.history.length, 15);
    console.log(
      JSON.stringify(
        {
          passed: true,
          initialBudget: 500,
          seconds: result.totalStepped,
          lives: result.final.lives,
          kills: result.final.kills,
          gold: result.final.gold,
          waves: result.history.map(({ wave, lives, gold, seconds }) => ({
            wave,
            lives,
            gold,
            seconds,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
