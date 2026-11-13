/** Visual regressions for readable combat feedback and the complete upgrade screen. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
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
const output =
  process.env.QA_OUTPUT || resolve(tmpdir(), "rezero-readability-qa");
const pixelSize = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 0.05,
    `Expected ${expected}px, received ${actual}px`,
  );

test(
  "readable enemy health, visible hero attacks, defense rules and all evolutions",
  {
    skip: !playwright ? "Playwright is not installed." : false,
    timeout: 360000,
  },
  async (t) => {
    let server, browser;
    const errors = [];
    await mkdir(output, { recursive: true });
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
          ".woff2": "font/woff2",
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
        headless: true,
        executablePath:
          process.env.CHROMIUM_PATH ||
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
      });
      const watch = (page) => {
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(m.text());
        });
      };
      const setup = (context) =>
        context.addInitScript(() =>
          localStorage.setItem(
            "rezero-astral3d-save",
            JSON.stringify({ settings: { quality: "low", music: 0, sfx: 0 } }),
          ),
        );
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      });
      await setup(context);
      const page = await context.newPage();
      watch(page);
      await page.goto(`${url}/?test=1`);
      await page.waitForFunction(() => window.__ASTRAL_TEST__, {
        timeout: 90000,
      });
      const shot = (name, p = page) =>
        p.screenshot({
          path: resolve(output, `qa-${name}.png`),
          fullPage: true,
        });
      await shot("desktop-menu");

      await t.test(
        "complete upgrade screen pauses combat and shows every price, description and stat",
        async () => {
          await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("emilia", -10, -2.3);
            a.startWave();
            a.state.plan = ["armored"];
            a.step(0.1);
          });
          await page.locator("#showEvolutions").click();
          assert.equal(await page.locator(".evolution-tier").count(), 15);
          assert.equal(await page.locator(".evolution-path").count(), 3);
          assert.equal(await page.locator(".evolution-stat").count(), 7);
          const before = await page.evaluate(() =>
            window.__ASTRAL_TEST__.snapshot(),
          );
          assert.equal(before.paused, true);
          const after = await page.evaluate(() => {
            window.__ASTRAL_TEST__.step(3);
            return window.__ASTRAL_TEST__.snapshot();
          });
          assert.deepEqual(after.enemies, before.enemies);
          assert.equal(after.gold, before.gold);
          const cards = await page
            .locator(".evolution-tier")
            .evaluateAll((nodes) =>
              nodes.map((n) => ({
                price: n.querySelector(".evolution-tier-topline>span")
                  .textContent,
                description: n.querySelector(".evolution-tier-description")
                  .textContent,
                effects: n.querySelector(".evolution-tier-effects").textContent,
              })),
            );
          assert.ok(
            cards.every(
              (c) =>
                /\d/.test(c.price) &&
                c.description.length > 10 &&
                c.effects.length > 3,
            ),
          );
          assert.ok(
            (await page.locator(".evolution-stat.is-improved").count()) > 0,
          );
          assert.match(
            await page.locator(".evolution-comparison-note").textContent(),
            /antes.*depois|antes → depois/i,
          );
          await page
            .locator('[data-action="tier"][data-branch="0"][data-tier="5"]')
            .click();
          assert.equal(await page.locator(".evolution-buy").isDisabled(), true);
          assert.match(
            await page.locator(".evolution-purchase-condition").textContent(),
            /ordem/,
          );
          await page
            .locator('[data-action="tier"][data-branch="0"][data-tier="1"]')
            .click();
          const coins = await page.evaluate(
            () => window.__ASTRAL_TEST__.state.gold,
          );
          await page.locator(".evolution-buy").click();
          const bought = await page.evaluate(() =>
            window.__ASTRAL_TEST__.snapshot(),
          );
          assert.equal(bought.gold, coins - 130);
          assert.deepEqual(bought.towers[0].levels, [1, 0, 0]);
          assert.match(
            await page.locator(".evolution-purchase-condition").textContent(),
            /adquirida/,
          );
          await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.state.gold = 50000;
            for (let n = 0; n < 4; n++) a.upgrade(0);
            a.upgrade(1);
            a.upgrade(1);
            a.evolutions.refresh();
          });
          await page
            .locator('[data-action="tier"][data-branch="2"][data-tier="1"]')
            .click();
          assert.equal(await page.locator(".evolution-buy").isDisabled(), true);
          assert.match(
            await page.locator(".evolution-buy").textContent(),
            /bloqueada/,
          );
          await page
            .locator('[data-action="tier"][data-branch="1"][data-tier="3"]')
            .click();
          assert.equal(await page.locator(".evolution-buy").isDisabled(), true);
          const locked = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__,
              gold = a.state.gold;
            return {
              denied: a.upgrade(2),
              goldBefore: gold,
              goldAfter: a.state.gold,
              levels: a.towers[0].levels,
            };
          });
          assert.equal(locked.denied, false);
          assert.equal(locked.goldBefore, locked.goldAfter);
          assert.deepEqual(locked.levels, [5, 2, 0]);
          await shot("desktop-evolutions");
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator(".evolution-overlay").isVisible(),
            false,
          );
          assert.equal(
            (await page.evaluate(() => window.__ASTRAL_TEST__.snapshot()))
              .paused,
            false,
          );
        },
      );

      await t.test(
        "all four guardian catalogues expose fifteen tiers without purchasing",
        async () => {
          await page.evaluate(() => window.__ASTRAL_TEST__.home());
          for (const [key, name] of [
            ["emilia", "Emilia"],
            ["rem", "Rem"],
            ["beatrice", "Beatrice"],
            ["subaru", "Subaru"],
          ]) {
            await page.locator(`[data-guardian="${key}"]`).click();
            await page
              .locator("#modalActions button")
              .filter({ hasText: "Ver todas as evoluções" })
              .click();
            assert.equal(
              await page.locator(".evolution-hero-name h3").textContent(),
              name,
            );
            assert.equal(await page.locator(".evolution-tier").count(), 15);
            assert.equal(await page.locator(".evolution-stat").count(), 7);
            assert.equal(
              await page.locator(".evolution-buy").isDisabled(),
              true,
            );
            assert.match(
              await page.locator(".evolution-purchase-condition").textContent(),
              /catálogo/,
            );
            if (key === "beatrice") await shot("desktop-evolution-catalogue");
            await page.keyboard.press("Escape");
          }
        },
      );

      await t.test(
        "defense starts at 25/25, explains 1/2/5 losses, and counts leaked enemies",
        async () => {
          await page.evaluate(() => window.__ASTRAL_TEST__.startMap(0));
          assert.equal(await page.locator("#hp").textContent(), "25");
          const defenseHelp = await page.locator("#defenseInfo").boundingBox();
          assert.ok(
            defenseHelp.width >= 44 && defenseHelp.height >= 44,
            "Defense help needs a full touch target",
          );
          assert.match(
            await page.locator("#hp").locator("..").textContent(),
            /25\s*\/\s*25/,
          );
          await page.locator("#defenseInfo").click();
          assert.equal(await page.locator(".defense-rules>div").count(), 3);
          assert.deepEqual(
            await page.locator(".defense-rules b").allTextContents(),
            ["−1", "−2", "−5"],
          );
          assert.match(
            await page.locator("#modalContent").textContent(),
            /25.*13.*5/s,
          );
          assert.equal(
            (await page.evaluate(() => window.__ASTRAL_TEST__.snapshot()))
              .paused,
            true,
          );
          await shot("defense-guide");
          await page.locator("#modalClose").click();
          for (const [type, loss] of [
            ["shade", 1],
            ["armored", 2],
            ["boss", 5],
          ]) {
            const result = await page.evaluate(async (type) => {
              const a = window.__ASTRAL_TEST__;
              a.startMap(0);
              a.place("subaru", 9.2, 2.5);
              a.startWave();
              a.state.plan = [type];
              a.step(0.05);
              const [{ createRoute }, { MAPS }] = await Promise.all([
                import("./src/rules.js"),
                import("./src/world.js"),
              ]);
              const enemy = a.enemies[0],
                hp = enemy.hp;
              enemy.dist = createRoute(MAPS[0].route).total - 0.001;
              a.step(1 / 60);
              return {
                lives: a.state.lives,
                leaked: a.state.leaked,
                lostDefense: a.state.lostDefense,
                kills: a.state.kills,
                hpBefore: hp,
                hpAfter: enemy.hp,
                gold: a.state.gold,
              };
            }, type);
            assert.equal(result.lives, 25 - loss);
            assert.equal(result.leaked, 1);
            assert.equal(result.lostDefense, loss);
            assert.equal(result.kills, 0);
            assert.equal(result.hpBefore, result.hpAfter);
            assert.match(
              await page.locator("#leakCount").textContent(),
              /1 atravessaram/,
            );
          }
          await page.locator("#defenseInfo").click();
          assert.match(
            await page.locator("#modalContent").textContent(),
            /20.*10.*4/s,
          );
          await page.locator("#modalClose").click();
        },
      );

      // Stop the animation clock for reproducible screenshots of short-lived effects.
      // An explicit epoch avoids racing the host/browser clocks on slower CI.
      // The next fixture resets the scene immediately after this instant jump.
      const visualEpoch = new Date("2030-01-01T00:00:00Z");
      await page.clock.install({ time: visualEpoch });
      await page.clock.pauseAt(new Date(visualEpoch.getTime() + 60_000));
      await t.test(
        "desktop health has strong color, numeric HP, damage fill and a fixed zoom-independent size",
        async () => {
          const first = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("emilia", -10, -2.3);
            a.startWave();
            a.state.plan = ["armored"];
            a.step(0.05);
            const e = a.enemies[0],
              el = document.querySelector(".enemy-health"),
              r = el.getBoundingClientRect(),
              fill = el.querySelector(".enemy-health-fill");
            return {
              width: r.width,
              height: r.height,
              visibility: getComputedStyle(el).visibility,
              color: getComputedStyle(fill).backgroundColor,
              opacity: getComputedStyle(fill).opacity,
              label: el.querySelector(".enemy-health-label").textContent,
              id: e.id,
            };
          });
          pixelSize(first.width, 54);
          pixelSize(first.height, 13);
          assert.equal(first.visibility, "visible");
          assert.match(first.label, /^\d+$/);
          assert.equal(first.opacity, "1");
          const rgb = first.color.match(/\d+/g).map(Number);
          assert.ok(rgb[1] > 180 && rgb[0] < 150, first.color);
          const hit = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.step(0.5);
            const e = a.enemies[0],
              el = document.querySelector(".enemy-health");
            return {
              hp: e.hp,
              maxHp: e.maxHp,
              ratio: Number(el.dataset.ratio),
              fill: parseFloat(
                el.querySelector(".enemy-health-fill").style.width,
              ),
              label: el.querySelector(".enemy-health-label").textContent,
              bar: a.snapshot().enemies[0].bar,
            };
          });
          assert.ok(hit.hp < hit.maxHp);
          assert.ok(Math.abs(hit.ratio - hit.hp / hit.maxHp) < 0.0001);
          assert.ok(Math.abs(hit.fill - hit.ratio * 100) < 0.02);
          assert.equal(hit.label, String(Math.ceil(hit.hp)));
          assert.equal(hit.bar, hit.hp / hit.maxHp);
          const zoom = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.view.zoom(0.6);
            a.combatHUD.update(0, a.enemies);
            return document
              .querySelector(".enemy-health")
              .getBoundingClientRect()
              .toJSON();
          });
          pixelSize(zoom.width, 54);
          pixelSize(zoom.height, 13);
          await page.evaluate(() => window.__ASTRAL_TEST__.view.resetCamera());
          const threshold = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__,
              e = a.enemies[0];
            e.hp = e.maxHp * 0.24;
            a.combatHUD.damage(e, 10, "#fff");
            a.combatHUD.update(0, a.enemies);
            return {
              critical: document
                .querySelector(".enemy-health")
                .classList.contains("is-critical"),
              color: getComputedStyle(
                document.querySelector(".enemy-health-fill"),
              ).backgroundColor,
            };
          });
          assert.equal(threshold.critical, true);
          assert.match(threshold.color, /255/);
          await shot("desktop-health");
        },
      );

      await t.test(
        "boss health is 84 by 16 pixels and shows current/max HP",
        async () => {
          const boss = await page.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("subaru", 9.2, 2.5);
            a.state.wave = 4;
            a.startWave();
            a.state.plan = ["boss"];
            a.step(0.05);
            const el = document.querySelector(".enemy-health-boss"),
              r = el.getBoundingClientRect();
            return {
              width: r.width,
              height: r.height,
              label: el.querySelector(".enemy-health-label").textContent,
              ratio: Number(el.dataset.ratio),
            };
          });
          pixelSize(boss.width, 84);
          pixelSize(boss.height, 16);
          assert.match(boss.label, /^\d+ \/ \d+$/);
          assert.equal(boss.ratio, 1);
          await shot("desktop-boss-health");
        },
      );

      await t.test(
        "all four attacks have distinct visible geometry, persistent visual-time trails and real hit flashes",
        async () => {
          const shapes = [];
          for (const key of ["emilia", "rem", "beatrice", "subaru"])
            for (const speed of [1, 3]) {
              const attack = await page.evaluate(
                ({ key, speed }) => {
                  const a = window.__ASTRAL_TEST__;
                  a.startMap(0);
                  a.place(key, -10, -2.3);
                  a.state.wave = 4;
                  a.state.speed = speed;
                  a.startWave();
                  a.state.plan = ["boss"];
                  a.step(0.05);
                  const trace = a.view.visuals.effects.find(
                      (e) => e.mesh.name === `attack-trace-${key}`,
                    ),
                    projectile = a.view.fx.getObjectByName(`projectile-${key}`);
                  if (!trace || !projectile)
                    throw Error(`Missing visible ${key} attack at ${speed}x`);
                  const geometry = projectile.children
                      .filter((c) => c.isMesh)
                      .map((c) => c.geometry.type)
                      .join(","),
                    initial = trace.life,
                    elapsed = a.state.elapsed;
                  a.view.update(0.1, a.towers, a.enemies);
                  a.view.render();
                  a.combatHUD.update(0, a.enemies);
                  return {
                    geometry,
                    initial,
                    remaining: trace.life,
                    max: trace.max,
                    elapsedBefore: elapsed,
                    elapsedAfter: a.state.elapsed,
                    ghost: a.view.visuals.effects.some(
                      (e) => e.kind === "ghost",
                    ),
                    toneMapped: trace.materials.some(
                      (m) => m.material.toneMapped,
                    ),
                  };
                },
                { key, speed },
              );
              assert.ok(attack.geometry.length > 0);
              assert.equal(attack.max, 0.3);
              assert.ok(Math.abs(attack.remaining - 0.2) < 0.001);
              assert.equal(attack.elapsedAfter, attack.elapsedBefore);
              assert.equal(attack.ghost, true);
              assert.equal(attack.toneMapped, false);
              if (speed === 1) shapes.push(attack.geometry);
              await shot(`attack-${key}-${speed}x`);
              const flash = await page.evaluate(() => {
                const a = window.__ASTRAL_TEST__;
                const before = a.enemies[0].hp;
                a.step(0.5);
                const e = a.enemies[0],
                  flash = a.view.visuals.flashes.get(e.id);
                return {
                  before,
                  after: e.hp,
                  flashing:
                    !!flash &&
                    flash.parts.some(
                      (p) =>
                        p.mesh.material !== p.material &&
                        p.mesh.material.isMeshBasicMaterial,
                    ),
                  numbers: document.querySelectorAll(".combat-damage").length,
                };
              });
              assert.ok(flash.after < flash.before);
              assert.equal(flash.flashing, true);
              assert.ok(flash.numbers > 0);
            }
          assert.equal(new Set(shapes).size, 4);
        },
      );
      await page.clock.resume();
      await context.close();

      await t.test(
        "touch health, scrollable fifth tiers, path tabs, purchase CTA and Escape remain readable on mobile",
        async () => {
          const mobile = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 1,
          });
          await setup(mobile);
          const touch = await mobile.newPage();
          watch(touch);
          await touch.goto(`${url}/?test=1`);
          await touch.waitForFunction(() => window.__ASTRAL_TEST__, {
            timeout: 90000,
          });
          await touch.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.startMap(0);
            a.place("emilia", -10, -2.3);
            a.startWave();
            a.state.plan = ["armored"];
            a.step(0.05);
          });
          const bar = await touch
            .locator(".enemy-health")
            .first()
            .boundingBox();
          pixelSize(bar.width, 44);
          pixelSize(bar.height, 12);
          await shot("mobile-health", touch);
          await touch.locator("#showEvolutions").tap();
          assert.equal(await touch.locator(".evolution-tab").count(), 3);
          assert.equal(await touch.locator(".evolution-stat").count(), 7);
          for (let path = 0; path < 3; path++) {
            await touch.locator(`.evolution-tab[data-branch="${path}"]`).tap();
            const tier = touch.locator(
              `[data-action="tier"][data-branch="${path}"][data-tier="5"]`,
            );
            await tier.scrollIntoViewIfNeeded();
            await tier.tap();
            assert.equal(
              await touch.locator(".evolution-selected-level").textContent(),
              "5",
            );
            assert.equal(
              await touch
                .locator(".evolution-path.is-active .evolution-tier")
                .count(),
              5,
            );
            assert.equal(
              await touch.locator(".evolution-buy").isDisabled(),
              true,
            );
            const size = await tier.boundingBox();
            assert.ok(size.width > 300 && size.height >= 100);
            assert.ok(
              Number(
                await tier
                  .locator(".evolution-tier-description")
                  .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
              ) >= 13,
            );
          }
          await touch.locator('.evolution-tab[data-branch="0"]').tap();
          await touch
            .locator('[data-action="tier"][data-branch="0"][data-tier="1"]')
            .scrollIntoViewIfNeeded();
          await touch
            .locator('[data-action="tier"][data-branch="0"][data-tier="1"]')
            .tap();
          await touch.locator(".evolution-buy").scrollIntoViewIfNeeded();
          assert.equal(await touch.locator(".evolution-buy").isEnabled(), true);
          const gold = await touch.evaluate(
            () => window.__ASTRAL_TEST__.state.gold,
          );
          await touch.locator(".evolution-buy").tap();
          assert.equal(
            await touch.evaluate(() => window.__ASTRAL_TEST__.state.gold),
            gold - 130,
          );
          assert.equal(
            await touch.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          assert.equal(
            await touch
              .locator(".evolution-panel")
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            true,
          );
          await shot("mobile-evolutions", touch);
          await touch.keyboard.press("Escape");
          assert.equal(
            await touch.locator(".evolution-overlay").isVisible(),
            false,
          );
          await touch.setViewportSize({ width: 844, height: 390 });
          await touch.waitForTimeout(100);
          assert.equal(
            await touch.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await shot("mobile-landscape", touch);
          await touch.evaluate(() => {
            const a = window.__ASTRAL_TEST__;
            a.state.gold = 1000;
            a.select(a.towers[0].id);
          });
          await touch.locator("#showEvolutions").tap();
          const landscapeMain = await touch
            .locator(".evolution-main")
            .boundingBox();
          assert.ok(
            landscapeMain && landscapeMain.height > 150,
            `Landscape upgrade paths must retain usable height: ${JSON.stringify(landscapeMain)}`,
          );
          assert.equal(
            await touch.locator(".evolution-tab:visible").count(),
            3,
          );
          assert.equal(await touch.locator(".evolution-stat").count(), 7);
          for (let path = 0; path < 3; path++) {
            await touch.locator(`.evolution-tab[data-branch="${path}"]`).tap();
            const fifthTier = touch.locator(
              `[data-action="tier"][data-branch="${path}"][data-tier="5"]`,
            );
            await fifthTier.scrollIntoViewIfNeeded();
            await fifthTier.tap();
            assert.equal(
              await touch.locator(".evolution-selected-level").textContent(),
              "5",
            );
            assert.equal(
              await touch
                .locator(".evolution-path.is-active .evolution-tier")
                .count(),
              5,
            );
            const purchase = await touch
              .locator(".evolution-buy")
              .boundingBox();
            assert.ok(
              purchase &&
                purchase.y >= 0 &&
                purchase.y + purchase.height <= 390,
              `The purchase button must stay inside the landscape viewport: ${JSON.stringify(purchase)}`,
            );
          }
          await touch.locator('.evolution-tab[data-branch="0"]').tap();
          const nextTier = touch.locator(
            '[data-action="tier"][data-branch="0"][data-tier="2"]',
          );
          await nextTier.scrollIntoViewIfNeeded();
          await nextTier.tap();
          assert.equal(await touch.locator(".evolution-buy").isEnabled(), true);
          assert.match(
            await touch.locator(".evolution-detail-price").textContent(),
            /200/,
          );
          await touch.locator(".evolution-buy").tap();
          const landscapePurchase = await touch.evaluate(() => ({
            gold: window.__ASTRAL_TEST__.state.gold,
            levels: [...window.__ASTRAL_TEST__.towers[0].levels],
          }));
          assert.equal(landscapePurchase.gold, 800);
          assert.deepEqual(landscapePurchase.levels, [2, 0, 0]);
          assert.equal(
            await touch
              .locator(".evolution-panel")
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            true,
          );
          await shot("landscape-evolutions", touch);
          await touch.keyboard.press("Escape");
          assert.equal(
            await touch.locator(".evolution-overlay").isVisible(),
            false,
          );
          await mobile.close();
        },
      );
      await t.test("no uncaught JavaScript or console errors", () =>
        assert.deepEqual(errors, []),
      );
    } finally {
      await browser?.close();
      if (server) await new Promise((r) => server.close(r));
    }
  },
);
