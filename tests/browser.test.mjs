/** Browser integration tests. Optional: install Playwright and Chromium, or set
 * PLAYWRIGHT_MODULE / CHROMIUM_PATH. QA_OUTPUT chooses the screenshot directory.
 * The suite serves its own local copy unless BROWSER_URL is supplied. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

let playwright;
for (const module of [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
].filter(Boolean)) {
  try {
    playwright = await import(module);
    break;
  } catch {}
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.QA_OUTPUT || resolve(tmpdir(), "rezero-defense-qa");

test(
  "playable 3D campaign, economy, upgrades, combat, persistence and touch UI",
  {
    skip: !playwright
      ? "Playwright is not installed; pure rules tests still run."
      : false,
    timeout: 240000,
  },
  async (t) => {
    await mkdir(output, { recursive: true });
    let server, browser;
    const errors = [];
    try {
      let url = process.env.BROWSER_URL;
      if (!url) {
        const mime = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".svg": "image/svg+xml",
        };
        server = createServer(async (req, res) => {
          try {
            let file = resolve(
              root,
              "." +
                decodeURIComponent(new URL(req.url, "http://local").pathname),
            );
            if (file !== root && !file.startsWith(root + sep))
              throw Error("Forbidden");
            if ((await stat(file)).isDirectory())
              file = resolve(file, "index.html");
            res.writeHead(200, {
              "Content-Type": mime[extname(file)] || "application/octet-stream",
            });
            res.end(await readFile(file));
          } catch {
            res.writeHead(404);
            res.end("Not found");
          }
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${server.address().port}`;
      }
      browser = await playwright.chromium.launch({
        executablePath:
          process.env.CHROMIUM_PATH ||
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        headless: true,
        args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
      });
      const watch = (page) => {
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
      };
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      watch(page);
      await page.goto(`${url}/?test=1`);
      await page.waitForFunction(() => window.__ASTRAL_TEST__, {
        timeout: 60000,
      });
      const shot = (name) =>
        page.screenshot({
          path: resolve(output, `after-desktop-${name}.png`),
          fullPage: true,
        });

      await t.test(
        "menu, tutorial, guardian previews, settings, campaign locks",
        async () => {
          assert.equal(await page.locator("#menu").isVisible(), true);
          assert.equal(await page.locator("#loading").isVisible(), false);
          assert.equal(await page.locator("#fatal").isVisible(), false);
          assert.equal(await page.locator("[data-guardian]").count(), 4);
          await shot("menu");
          await page.locator("#how").click();
          assert.equal(await page.locator(".tutorial-steps>div").count(), 4);
          await page.locator("#modalClose").click();
          await page.locator('[data-guardian="beatrice"]').click();
          assert.equal(
            await page.locator("#modalTitle").textContent(),
            "Beatrice",
          );
          await page.locator("#modalClose").click();
          await page.locator("#settings").click();
          await page.locator("#qualitySelect").selectOption("low");
          await page.locator("#musicVolume").evaluate((el) => {
            el.value = "15";
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await page.locator("#sfxVolume").evaluate((el) => {
            el.value = "25";
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await page.locator("#modalClose").click();
          const settings = await page.evaluate(
            () => window.__ASTRAL_TEST__.snapshot().save.settings,
          );
          assert.deepEqual(settings, {
            music: 0.15,
            sfx: 0.25,
            quality: "low",
          });
          await page.locator("#play").click();
          assert.equal(await page.locator("[data-map]").count(), 3);
          assert.equal(await page.locator("[data-map]:disabled").count(), 2);
          await shot("campaign");
          await page.locator('[data-map="0"]').click();
          assert.equal(await page.locator("#battle").isVisible(), true);
        },
      );

      await t.test(
        "pointer placement, invalid terrain, purchase price and 5–2–0 upgrades",
        async () => {
          const invalid = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__,
              gold = a.state.gold;
            return {
              outside: a.place("emilia", 100, 100),
              road: a.place("emilia", -5.9, 0.4),
              goldBefore: gold,
              goldAfter: a.state.gold,
            };
          });
          assert.equal(invalid.outside, false);
          assert.equal(invalid.road, false);
          assert.equal(invalid.goldAfter, invalid.goldBefore);
          const point = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            for (let x = -10; x <= 10; x += 1.5)
              for (let z = -5; z <= 5; z += 1.5)
                if (a.placementValid(x, z)) {
                  const p = a.project(x, z);
                  if (document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS")
                    return { ...p, worldX: x, worldZ: z };
                }
            throw Error("No visible placement terrain");
          });
          await page.locator('[data-hero="emilia"]').click();
          await page.mouse.click(point.x, point.y);
          const placed = await page.evaluate(() =>
            window.__ASTRAL_TEST__.snapshot(),
          );
          assert.equal(placed.towers.length, 1);
          assert.equal(placed.towers[0].key, "emilia");
          assert.equal(placed.gold, 335);
          const overlap = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__,
              t = a.towers[0],
              gold = a.state.gold;
            return {
              placed: a.place("subaru", t.x, t.z),
              before: gold,
              after: a.state.gold,
            };
          });
          assert.equal(overlap.placed, false);
          assert.equal(overlap.before, overlap.after);
          await page.locator('[data-upgrade="0"]').click();
          assert.equal(
            (await page.evaluate(() => window.__ASTRAL_TEST__.snapshot())).gold,
            205,
          );
          const up = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.state.gold = 100000;
            for (let i = 0; i < 4; i++) a.upgrade(0);
            a.upgrade(1);
            a.upgrade(1);
            const before = a.state.gold;
            return {
              blocked: [a.upgrade(0), a.upgrade(1), a.upgrade(2)],
              before,
              after: a.state.gold,
              snapshot: a.snapshot(),
            };
          });
          assert.deepEqual(up.snapshot.towers[0].levels, [5, 2, 0]);
          assert.deepEqual(up.blocked, [false, false, false]);
          assert.equal(up.before, up.after);
          assert.ok(up.snapshot.towers[0].stats.damage > 80);
          await shot("upgrades");
        },
      );

      await t.test(
        "combat kills enemies, rewards gold and completes a real wave",
        async () => {
          const preparation = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.state.gold = 100000;
            for (const [key, x, z] of [
              ["emilia", -10, -2.3],
              ["rem", -8.4, -5.5],
              ["beatrice", -8.4, -0.7],
              ["subaru", -5.2, -3.9],
            ])
              if (a.placementValid(x, z)) {
                a.place(key, x, z);
                a.upgrade(0);
                a.upgrade(0);
                a.upgrade(1);
                a.upgrade(1);
              }
            const gold = a.state.gold;
            a.startWave();
            a.step(4);
            return { goldBefore: gold, ...a.snapshot() };
          });
          assert.ok(preparation.enemies.length > 0);
          assert.ok(preparation.enemies.every((e) => Number.isFinite(e.bar)));
          await shot("combat");
          const outcome = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.step(90);
            return a.snapshot();
          });
          assert.equal(outcome.wave, 1);
          assert.equal(outcome.running, false);
          assert.equal(outcome.ended, false);
          assert.ok(outcome.kills > 0);
          assert.ok(outcome.gold > preparation.goldBefore);
          assert.equal(outcome.save.best[0], 1);
          const orphanProjectiles = await page.evaluate(() => {
            const v = window.__ASTRAL_TEST__.view;
            return v.fx.children.filter(
              (mesh) => !v.effects.some((effect) => effect.mesh === mesh),
            ).length;
          });
          assert.equal(
            orphanProjectiles,
            0,
            "A completed wave must remove every projectile mesh",
          );
          await shot("battle");
        },
      );

      await t.test(
        "Beatrice aura actually accelerates an allied attack",
        async () => {
          const result = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("subaru", -10, -2.3);
            a.startWave();
            a.step(1 / 30);
            const plain = a.towers[0].cooldown;
            a.startMap(0);
            a.state.gold = 1000;
            a.place("subaru", -10, -2.3);
            a.place("beatrice", -8.4, -0.7);
            a.startWave();
            a.step(1 / 30);
            return {
              plain,
              buffed: a.towers[0].cooldown,
              buff: a.towers[1].stats.buff,
              attacked: a.towers[0].attack,
            };
          });
          assert.ok(result.attacked > 0);
          assert.ok(result.buff > 0);
          assert.ok(result.buffed < result.plain, JSON.stringify(result));
        },
      );

      await t.test(
        "Nevasca requires Emilia, pause freezes waves and cooldown uses game time",
        async () => {
          const setup = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("subaru", -10, -2.3);
            a.startWave();
            a.step(1);
            const denied = a.cast();
            a.state.gold = 1000;
            a.place("emilia", -8.4, -0.7);
            const cast = a.cast(),
              recast = a.cast(),
              initial = a.state.abilityCd;
            a.step(2);
            return { denied, cast, recast, initial, after: a.state.abilityCd };
          });
          assert.equal(setup.denied, false);
          assert.equal(setup.cast, true);
          assert.equal(setup.recast, false);
          assert.equal(setup.initial, 24);
          assert.ok(Math.abs(setup.after - 22) < 0.001);
          await page.locator("#pause").click();
          const before = await page.evaluate(() =>
            window.__ASTRAL_TEST__.snapshot(),
          );
          await page.waitForTimeout(250);
          const after = await page.evaluate(() => {
            window.__ASTRAL_TEST__.step(10);
            return window.__ASTRAL_TEST__.snapshot();
          });
          assert.equal(before.paused, true);
          assert.equal(after.abilityCd, before.abilityCd);
          assert.deepEqual(after.enemies, before.enemies);
          await page.locator("#modalClose").click();
          assert.equal(
            (await page.evaluate(() => window.__ASTRAL_TEST__.snapshot()))
              .paused,
            false,
          );
        },
      );

      await t.test(
        "60 Hz simulation preserves Nevasca through subsequent ice hits",
        async () => {
          const result = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("emilia", -10, -2.3);
            a.step(1 / 60);
            const tick = a.state.elapsed;
            a.state.wave = 4;
            a.startWave();
            a.state.plan = ["boss"];
            a.step(0.05);
            a.cast();
            const enemy = a.enemies[0],
              hp = enemy.hp,
              dist = enemy.dist;
            a.step(1);
            return {
              tick,
              hpBefore: hp,
              hpAfter: enemy.hp,
              blizzardLeft: enemy.blizzardLeft,
              iceSlowLeft: enemy.slowLeft,
              speed: enemy.speed,
              movement: enemy.dist - dist,
            };
          });
          assert.ok(Math.abs(result.tick - 1 / 60) < 0.00001);
          assert.ok(
            result.hpAfter < result.hpBefore,
            "An Emilia projectile must hit during Nevasca",
          );
          assert.ok(result.iceSlowLeft > 0);
          assert.ok(Math.abs(result.blizzardLeft - 3) < 0.001);
          assert.ok(
            Math.abs(result.movement - result.speed * 0.18) < 0.001,
            JSON.stringify(result),
          );
        },
      );

      await t.test(
        "boss health bars remain finite and a leaked wave reaches defeat",
        async () => {
          const boss = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("subaru", 9.2, 2.5);
            a.state.wave = 4;
            a.startWave();
            a.state.plan = ["boss"];
            a.step(0.5);
            return a.snapshot();
          });
          assert.equal(boss.enemies.length, 1);
          assert.equal(boss.enemies[0].boss, true);
          assert.ok(Number.isFinite(boss.enemies[0].bar));
          assert.ok(boss.enemies[0].maxHp > 1000);
          assert.equal(await page.locator("#bossBar").isVisible(), true);
          assert.ok(
            !/NaN/.test(await page.locator("#bossFill").getAttribute("style")),
          );
          await shot("boss");
          const defeat = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("subaru", 9.2, 2.5);
            a.state.lives = 1;
            a.state.wave = 14;
            a.startWave();
            a.step(150);
            return a.snapshot();
          });
          assert.equal(defeat.ended, true);
          assert.ok(defeat.lives <= 0);
          assert.equal(defeat.paused, true);
          assert.match(
            await page.locator("#modalTitle").textContent(),
            /nova chance/,
          );
          await shot("defeat");
        },
      );

      await t.test(
        "15 simulated waves resolve through combat and save campaign unlocks",
        async () => {
          const campaignResult = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.state.gold = 100000;
            let placed = 0;
            for (let x = -10; x <= 10; x += 1.7)
              for (let z = -5.5; z <= 5.5; z += 1.7) {
                if (!a.placementValid(x, z)) continue;
                const key = ["emilia", "rem", "beatrice", "subaru"][placed % 4];
                a.place(key, x, z);
                for (let n = 0; n < 5; n++) a.upgrade(0);
                for (let n = 0; n < 2; n++) a.upgrade(1);
                placed++;
                if (placed >= 20) break;
              }
            const results = [];
            for (let wave = 1; wave <= 15; wave++) {
              if (a.state.ended) break;
              a.startWave();
              a.step(150);
              results.push({
                wave: a.state.wave,
                running: a.state.running,
                lives: a.state.lives,
                kills: a.state.kills,
              });
            }
            return { results, placed, ...a.snapshot() };
          });
          assert.equal(
            campaignResult.wave,
            15,
            JSON.stringify(campaignResult.results),
          );
          assert.equal(campaignResult.ended, true);
          assert.ok(
            campaignResult.lives > 0,
            JSON.stringify(campaignResult.results),
          );
          assert.equal(campaignResult.save.wins[0], true);
          assert.equal(campaignResult.save.best[0], 15);
          assert.equal(campaignResult.save.unlocked, 2);
          assert.ok(campaignResult.kills > 100);
          await shot("victory");
          await page.reload();
          await page.waitForFunction(() => window.__ASTRAL_TEST__, {
            timeout: 60000,
          });
          const restored = await page.evaluate(
            () => window.__ASTRAL_TEST__.snapshot().save,
          );
          assert.equal(restored.wins[0], true);
          assert.equal(restored.unlocked, 2);
        },
      );

      await t.test(
        "legacy progress migrates and all unlocked map worlds load",
        async () => {
          await page.evaluate(() =>
            localStorage.setItem(
              "rezero-astral3d-save",
              JSON.stringify({
                unlocked: 1,
                best: [12, 0, 0],
                wins: [true, false, false],
              }),
            ),
          );
          await page.reload();
          await page.waitForFunction(() => window.__ASTRAL_TEST__, {
            timeout: 60000,
          });
          const migrated = await page.evaluate(
            () => window.__ASTRAL_TEST__.snapshot().save,
          );
          assert.equal(migrated.version, 2);
          assert.equal(migrated.unlocked, 2);
          assert.deepEqual(migrated.best, [15, 0, 0]);
          const maps = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.save.unlocked = 3;
            a.persist();
            return [0, 1, 2].map((i) => {
              const ok = a.startMap(i);
              a.view.render();
              return {
                index: a.state.map,
                loaded: ok,
                obstacles: a.view.world.userData.obstacles.length,
              };
            });
          });
          assert.equal(maps.length, 3);
          assert.ok(maps.every((m) => m.loaded && m.obstacles > 0));
          await shot("sanctuary");
          await page.evaluate(() => window.__ASTRAL_TEST__.startMap(1));
          await shot("manor");
        },
      );
      await context.close();

      await t.test(
        "mobile touch placement and portrait/landscape layouts fit the viewport",
        async () => {
          const mobile = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 1,
          });
          const touch = await mobile.newPage();
          watch(touch);
          await touch.goto(`${url}/?test=1`);
          await touch.waitForFunction(() => window.__ASTRAL_TEST__, {
            timeout: 60000,
          });
          assert.equal(
            await touch.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await touch.screenshot({
            path: resolve(output, "after-mobile-menu.png"),
            fullPage: true,
          });
          await touch.locator("#play").tap();
          await touch.screenshot({
            path: resolve(output, "after-mobile-campaign.png"),
            fullPage: true,
          });
          await touch.locator('[data-map="0"]').tap();
          const point = await touch.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            for (let x = -10; x <= 10; x += 1.5)
              for (let z = -5; z <= 5; z += 1.5)
                if (a.placementValid(x, z)) {
                  const p = a.project(x, z);
                  if (document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS")
                    return p;
                }
            throw Error("No mobile placement target");
          });
          await touch.locator('[data-hero="emilia"]').tap();
          await touch.touchscreen.tap(point.x, point.y);
          assert.equal(
            (await touch.evaluate(() => window.__ASTRAL_TEST__.snapshot()))
              .towers.length,
            1,
          );
          assert.equal(
            await touch.locator('[data-upgrade="0"]').isVisible(),
            true,
          );
          await touch.locator('[data-upgrade="0"]').tap();
          assert.deepEqual(
            (await touch.evaluate(() => window.__ASTRAL_TEST__.snapshot()))
              .towers[0].levels,
            [1, 0, 0],
          );
          await touch.locator("#zoomIn").tap();
          assert.ok(
            (await touch.evaluate(
              () => window.__ASTRAL_TEST__.view.camera.zoom,
            )) > 1,
          );
          const stage = await touch.locator("#stage").boundingBox(),
            cx = stage.x + stage.width * 0.5,
            cy = stage.y + stage.height * 0.5;
          const cdp = await mobile.newCDPSession(touch);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: cx, y: cy }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: cx + 45, y: cy + 12 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          const panned = await touch.evaluate(() => ({
            x: window.__ASTRAL_TEST__.view.panX,
            z: window.__ASTRAL_TEST__.view.panZ,
            towers: window.__ASTRAL_TEST__.towers.length,
          }));
          assert.ok(Math.abs(panned.x) + Math.abs(panned.z) > 0);
          assert.equal(panned.towers, 1);
          await touch.screenshot({
            path: resolve(output, "after-mobile-zoom.png"),
            fullPage: true,
          });
          await touch.locator("#resetView").tap();
          assert.deepEqual(
            await touch.evaluate(() => ({
              zoom: window.__ASTRAL_TEST__.view.camera.zoom,
              x: window.__ASTRAL_TEST__.view.panX,
              z: window.__ASTRAL_TEST__.view.panZ,
            })),
            { zoom: 1, x: 0, z: 0 },
          );
          assert.equal(
            await touch.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await touch.screenshot({
            path: resolve(output, "after-mobile-battle.png"),
            fullPage: true,
          });
          await touch.setViewportSize({ width: 844, height: 390 });
          await touch.waitForTimeout(150);
          assert.equal(
            await touch.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          const bounds = await touch.locator("#stage").boundingBox();
          assert.ok(
            bounds.width > 400 && bounds.height > 150,
            JSON.stringify(bounds),
          );
          await touch.screenshot({
            path: resolve(output, "after-mobile-landscape.png"),
            fullPage: true,
          });
          await mobile.close();
        },
      );
      await t.test("no uncaught JavaScript or browser console errors", () =>
        assert.deepEqual(errors, []),
      );
    } finally {
      await browser?.close();
      if (server) await new Promise((r) => server.close(r));
    }
  },
);
