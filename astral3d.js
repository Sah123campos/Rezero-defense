import { GameView, THREE, MAPS } from "./src/view.js";
import { createHero, createEnemy } from "./src/models.js";
import {
  HEROES,
  WAVES,
  towerStats,
  upgradeState,
  enemyStats,
  wavePlan,
  sanitizeSave,
  createRoute,
  routePoint,
  distanceToRoute,
} from "./src/rules.js";
import { AudioManager } from "./src/audio.js";

const $ = (id) => document.getElementById(id),
  icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const SAVE_KEY = "rezero-astral3d-save";
let raw;
try {
  raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
} catch {}
let save = sanitizeSave(raw),
  storageAvailable = true;
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    storageAvailable = false;
  }
};
const audio = new AudioManager(save.settings);
let view,
  images = {},
  mapImages = [],
  preview = [],
  towers = [],
  enemies = [],
  projectiles = [],
  route;
let state = {
  screen: "menu",
  map: 0,
  wave: 0,
  gold: 500,
  lives: 25,
  running: false,
  ended: false,
  speed: 1,
  elapsed: 0,
  plan: [],
  spawned: 0,
  spawnTimer: 0,
  selected: null,
  placing: null,
  abilityCd: 0,
  kills: 0,
};
let modalOpen = false,
  modalDismiss = null,
  returnFocus = null,
  lastHUD = "",
  nextId = 1,
  uiTimer = 0,
  accumulator = 0;
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.add("hidden"), 2800);
}
function paused() {
  return modalOpen || document.hidden;
}
function syncAudio() {
  audio.pause(document.hidden || (modalOpen && state.screen === "battle"));
}
function closeModal() {
  if (!modalOpen) return;
  modalOpen = false;
  $("modal").classList.add("hidden");
  modalDismiss = null;
  syncAudio();
  returnFocus?.focus?.();
  returnFocus = null;
}
function openModal({
  title,
  content = "",
  eyebrow = "O DESTINO ESTÁ EM SUAS MÃOS",
  sigil = "✧",
  actions = [],
  dismiss = closeModal,
}) {
  returnFocus = modalOpen ? returnFocus : document.activeElement;
  modalOpen = true;
  modalDismiss = dismiss;
  $("modalTitle").textContent = title;
  $("modalContent").innerHTML = content;
  $("modalEyebrow").textContent = eyebrow;
  $("modalSigil").textContent = sigil;
  $("modalActions").replaceChildren();
  for (const action of actions) {
    const b = document.createElement("button");
    b.className = action.secondary ? "secondary-button" : "primary-button";
    b.textContent = action.label;
    b.onclick = action.run;
    $("modalActions").append(b);
  }
  $("modalClose").classList.toggle("hidden", !dismiss);
  $("modal").classList.remove("hidden");
  syncAudio();
  requestAnimationFrame(() =>
    $("modal").querySelector("button:not(.hidden)")?.focus(),
  );
}
function switchScreen(screen) {
  closeModal();
  state.screen = screen;
  document.body.dataset.screen = screen;
  for (const name of ["menu", "campaign", "battle"])
    $(name).classList.toggle("hidden", screen !== name);
  $("mainHeader").classList.toggle("hidden", screen === "battle");
  view.setScreen(screen);
  window.scrollTo(0, 0);
  audio.setMood(screen === "battle" ? "battle" : "menu");
  syncAudio();
}
function removeActors() {
  for (const t of towers) view.actors.remove(t.group);
  for (const e of enemies) {
    view.actors.remove(e.group);
    removeHealth(e);
  }
  for (const p of projectiles) view.removeProjectile(p.mesh);
  for (const p of preview) view.actors.remove(p.group);
  towers = [];
  enemies = [];
  projectiles = [];
  preview = [];
  view.clearEffects();
  view.selection(null);
}
function menuPreview() {
  removeActors();
  view.setWorld(0);
  const spots = [
    [-4.3, -0.3],
    [-2.8, 1.2],
    [1.5, 0.4],
    [3.2, 2.3],
  ];
  Object.keys(HEROES).forEach((key, i) => {
    const g = createHero(key);
    g.position.set(spots[i][0], 0, spots[i][1]);
    g.rotation.y = 0.3;
    g.scale.setScalar(1.25);
    view.actors.add(g);
    preview.push({ group: g });
  });
  view.render();
}
function home() {
  state.running = false;
  state.placing = null;
  state.selected = null;
  menuPreview();
  switchScreen("menu");
}
function campaign() {
  state.running = false;
  state.placing = null;
  state.selected = null;
  removeActors();
  view.setWorld(0);
  switchScreen("campaign");
  $("campaignGrid").innerHTML = MAPS.map(
    (m, i) =>
      `<button class="map-card ${i >= save.unlocked ? "locked" : ""}" data-map="${i}" ${i >= save.unlocked ? "disabled" : ""}><div class="map-illustration"><img src="${mapImages[i]}" alt="Diorama de ${m.name}">${i >= save.unlocked ? `<span class="map-lock">${icon("lock")}</span>` : ""}</div><div class="map-info"><div class="eyebrow">${m.subtitle}</div><h2>${m.name}</h2><p>${m.description}</p><div class="map-bottom"><span>${i >= save.unlocked ? "Complete o capítulo anterior" : save.wins[i] ? "Capítulo concluído · Jogar novamente" : `Melhor onda: ${save.best[i]} / ${WAVES}`}</span>${icon(i >= save.unlocked ? "lock" : "arrow")}</div></div></button>`,
  ).join("");
  document
    .querySelectorAll("[data-map]")
    .forEach((b) => (b.onclick = () => startMap(Number(b.dataset.map))));
}
function startMap(index) {
  if (index >= save.unlocked) return false;
  removeActors();
  uiTimer = 0;
  accumulator = 0;
  view.resetCamera();
  state = {
    ...state,
    map: index,
    wave: 0,
    gold: 500,
    lives: 25,
    running: false,
    ended: false,
    speed: 1,
    elapsed: 0,
    plan: [],
    spawned: 0,
    spawnTimer: 0,
    selected: null,
    placing: null,
    abilityCd: 0,
    kills: 0,
  };
  route = createRoute(MAPS[index].route);
  view.setWorld(index);
  switchScreen("battle");
  $("battleName").textContent = MAPS[index].name;
  $("battleChapter").textContent = MAPS[index].subtitle;
  lastHUD = "";
  renderDetails();
  renderHUD();
  toast("Convoque seus guardiões perto das curvas da estrada.");
  if (!storageAvailable)
    toast("O navegador não permitiu salvar. Esta partida continua disponível.");
  return true;
}
function placementValid(x, z) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > 10.7 ||
    Math.abs(z) > 5.9
  )
    return false;
  if (distanceToRoute(x, z, route) < 1.02) return false;
  if (towers.some((t) => Math.hypot(t.x - x, t.z - z) < 1.28)) return false;
  const data = view.world.userData;
  if (
    (data.obstacles || []).some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.5)
  )
    return false;
  const water = data.water;
  if (
    water &&
    ((x - water.x) / (water.rx + 0.4)) ** 2 +
      ((z - water.z) / (water.rz + 0.4)) ** 2 <
      1
  )
    return false;
  return true;
}
function chooseHero(key) {
  if (state.screen !== "battle" || state.ended || state.gold < HEROES[key].cost)
    return;
  state.selected = null;
  state.placing = state.placing === key ? null : key;
  view.selection(null);
  renderDetails();
  renderHUD(true);
  audio.play("select");
  $("hint").textContent = state.placing
    ? `Convoque ${HEROES[key].name} em um terreno livre.`
    : "";
  $("placementHint").classList.toggle("hidden", !state.placing);
}
function cancelPlacement() {
  state.placing = null;
  view.selection(state.selected);
  $("placementHint").classList.add("hidden");
  renderHUD(true);
  renderDetails();
}
function place(key, x, z) {
  if (state.screen !== "battle" || state.ended || !HEROES[key]) return false;
  const def = HEROES[key];
  if (state.gold < def.cost) {
    toast("Moedas insuficientes para esta convocação.");
    return false;
  }
  if (!placementValid(x, z)) {
    toast("Escolha um terreno livre, fora da estrada e da vegetação.");
    return false;
  }
  const group = createHero(key);
  group.position.set(x, 0.02, z);
  group.rotation.y = 0.25;
  view.actors.add(group);
  const t = {
    id: nextId++,
    key,
    def,
    group,
    x,
    z,
    levels: [0, 0, 0],
    stats: towerStats(key),
    paid: def.cost,
    cooldown: 0,
    attack: 0,
    kills: 0,
  };
  state.gold -= def.cost;
  towers.push(t);
  state.placing = null;
  select(t);
  $("placementHint").classList.add("hidden");
  view.burst(x, z, def.color, 15);
  view.shockwave(x, z, def.color, 1.2);
  audio.play("place");
  renderHUD(true);
  return true;
}
function select(t) {
  state.selected = t;
  state.placing = null;
  view.selection(t);
  $("placementHint").classList.add("hidden");
  renderDetails();
  renderHUD(true);
}
function upgrade(branch) {
  const t = state.selected;
  if (!t || state.ended) return false;
  const next = upgradeState(t.key, t.levels, branch);
  if (!next.allowed || state.gold < next.cost) {
    toast(next.reason || "Você precisa de mais moedas.");
    return false;
  }
  state.gold -= next.cost;
  t.paid += next.cost;
  t.levels[branch]++;
  t.stats = towerStats(t.key, t.levels);
  const g = createHero(t.key, t.levels);
  g.position.copy(t.group.position);
  g.rotation.copy(t.group.rotation);
  view.actors.remove(t.group);
  t.group = g;
  view.actors.add(g);
  view.selection(t);
  view.burst(t.x, t.z, t.def.color, 22, 1.3);
  view.shockwave(t.x, t.z, t.def.color, 2);
  audio.play("upgrade");
  renderDetails();
  renderHUD(true);
  toast(`${t.def.name}: ${next.tier.name}`);
  return true;
}
function sell() {
  const t = state.selected;
  if (!t || state.ended) return;
  state.gold += Math.floor(t.paid * 0.7);
  view.actors.remove(t.group);
  towers = towers.filter((x) => x !== t);
  select(null);
  renderHUD(true);
  audio.play("sell");
}
function renderDetails() {
  const el = $("details"),
    t = state.selected;
  $("shop").classList.toggle("has-selection", !!t);
  if (!t) {
    el.innerHTML = `<div class="empty-details">${icon("shield")}<strong>${state.placing ? `Posicione ${HEROES[state.placing].name}.` : "Juntos, somos mais fortes."}</strong><p>Selecione um guardião no mapa para descobrir suas evoluções.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="unit-detail-heading"><img class="mini-portrait" src="${images[t.key]}" alt=""><div><h3>${t.def.name}</h3><small>${t.def.role} · ${t.levels.join("–")}</small></div><button class="detail-close" id="unselect" aria-label="Fechar evoluções">×</button></div><div class="unit-stats"><span>${Math.round(t.stats.damage)}<small>DANO</small></span><span>${t.stats.range.toFixed(1)}<small>ALCANCE</small></span><span>${(1 / t.stats.interval).toFixed(1)}<small>ATAQUES/S</small></span></div><div class="upgrade-caption">Um caminho até nível 5 + outro até nível 2.</div><div class="upgrade-list">${t.def.paths
    .map((p, i) => {
      const u = upgradeState(t.key, t.levels, i);
      return `<button class="upgrade-row ${!u.tier ? "maxed" : ""}" data-upgrade="${i}" ${!u.allowed || u.cost > state.gold || state.ended ? "disabled" : ""} title="${u.reason || u.tier?.description || p.description}"><span class="upgrade-head"><span>${p.name}</span><span class="upgrade-price">${!u.tier ? "COMPLETO" : !u.allowed ? "BLOQUEADO" : "◈ " + u.cost}</span></span><small>${u.tier?.name || "Forma suprema"}</small><span class="upgrade-pips">${Array.from({ length: 5 }, (_, j) => `<i class="${j < t.levels[i] ? "filled" : ""}"></i>`).join("")}</span></button>`;
    })
    .join(
      "",
    )}</div><button class="sell-button" id="sellButton">Vender guardião · +${Math.floor(t.paid * 0.7)} moedas</button>`;
  $("unselect").onclick = () => select(null);
  $("sellButton").onclick = sell;
  el.querySelectorAll("[data-upgrade]").forEach(
    (b) => (b.onclick = () => upgrade(Number(b.dataset.upgrade))),
  );
}
function renderHUD(force = false) {
  const sig = [
    state.gold,
    state.lives,
    state.wave,
    state.running,
    state.ended,
    state.placing,
    state.speed,
  ].join("|");
  if (force || lastHUD !== sig) {
    lastHUD = sig;
    $("hp").textContent = Math.max(0, state.lives);
    $("coins").textContent = state.gold;
    $("waveNo").innerHTML = `${state.wave}<small> / ${WAVES}</small>`;
    $("startWave").disabled = state.running || state.ended;
    $("startWave").querySelector("span").textContent = state.ended
      ? "Jornada concluída"
      : state.running
        ? "Onda em curso"
        : `Iniciar onda ${state.wave + 1}`;
    $("speed").innerHTML = `${state.speed}<span>×</span>`;
    $("waveStatus").textContent = state.running
      ? `Onda ${state.wave} em curso`
      : state.ended
        ? "Fim da jornada"
        : "Prepare sua defesa";
    document.querySelectorAll("[data-hero]").forEach((b) => {
      b.disabled = state.ended || state.gold < HEROES[b.dataset.hero].cost;
      b.classList.toggle("active", state.placing === b.dataset.hero);
    });
    if (state.selected) renderDetails();
  }
  $("enemiesLeft").textContent = state.running
    ? `${enemies.filter((e) => !e.dead).length + state.plan.length - state.spawned} sombras restantes`
    : "";
  const emilia = towers.some((t) => t.key === "emilia");
  $("magic").disabled =
    !state.running || state.ended || state.abilityCd > 0 || !emilia;
  $("abilityState").textContent = !emilia
    ? "Convoque Emilia"
    : state.abilityCd > 0
      ? `Recarga · ${Math.ceil(state.abilityCd)}s`
      : state.running
        ? "Pronta para conjurar"
        : "Disponível na onda";
  const boss = enemies.find((e) => e.boss && !e.dead);
  $("bossBar").classList.toggle("hidden", !boss);
  if (boss) {
    $("bossHp").textContent =
      `${Math.ceil(Math.max(0, boss.hp))} / ${boss.maxHp}`;
    $("bossFill").style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
  }
}
function startWave() {
  if (state.running || state.ended || state.screen !== "battle" || modalOpen)
    return false;
  if (!towers.length) {
    toast("Convoque pelo menos um guardião antes da primeira onda.");
    return false;
  }
  state.running = true;
  state.wave++;
  state.plan = wavePlan(state.wave);
  state.spawned = 0;
  state.spawnTimer = 0.72;
  audio.setMood(state.wave % 5 === 0 ? "boss" : "battle");
  audio.play("wave");
  $("roundTip").textContent =
    state.wave % 5 === 0
      ? "Um poder ancestral se aproxima. Prepare sua magia."
      : "Combine controle, impacto e apoio para defender a estrada.";
  renderHUD(true);
  return true;
}
const barGeometry = new THREE.PlaneGeometry(0.85, 0.07),
  barBackMaterial = new THREE.MeshBasicMaterial({
    color: 0x403e4c,
    depthTest: false,
    transparent: true,
    opacity: 0.6,
  }),
  barMaterial = new THREE.MeshBasicMaterial({
    color: 0x97cb7f,
    depthTest: false,
  });
function attachHealth(e) {
  const g = new THREE.Group(),
    back = new THREE.Mesh(barGeometry, barBackMaterial),
    front = new THREE.Mesh(barGeometry, barMaterial);
  g.add(back, front);
  front.position.z = 0.005;
  g.quaternion.copy(view.camera.quaternion);
  g.renderOrder = 10;
  back.renderOrder = 10;
  front.renderOrder = 11;
  view.actors.add(g);
  e.health = g;
  e.bar = front;
}
function removeHealth(e) {
  if (e.health) view.actors.remove(e.health);
}
function spawn() {
  const type = state.plan[state.spawned++],
    def = enemyStats(type, state.wave),
    group = createEnemy(type);
  const p = routePoint(route, 0);
  group.position.set(p.x, 0.04, p.z);
  group.rotation.y = p.angle;
  view.actors.add(group);
  const e = {
    id: nextId++,
    type,
    ...def,
    group,
    hp: def.hp,
    maxHp: def.hp,
    dist: 0,
    slowLeft: 0,
    slow: 0,
    blizzardLeft: 0,
    dead: false,
  };
  attachHealth(e);
  enemies.push(e);
  if (e.boss) {
    view.shockwave(p.x, p.z, "#dc6d9d", 3);
    toast("O Guardião das Sombras despertou.");
    audio.play("wave");
  }
}
function kill(e, tower) {
  if (e.dead) return;
  e.dead = true;
  state.gold += e.reward;
  state.kills++;
  if (tower) tower.kills++;
  view.burst(
    e.group.position.x,
    e.group.position.z,
    e.color,
    e.boss ? 35 : 7,
    e.boss ? 2 : 1,
  );
  view.actors.remove(e.group);
  removeHealth(e);
  if (e.boss) {
    view.shockwave(e.group.position.x, e.group.position.z, e.color, 4);
    audio.play("win");
  }
}
function hit(e, value, tower) {
  if (e.dead) return;
  let amount = value;
  if (e.type === "armored" && tower?.def.element === "físico") amount *= 0.7;
  if (e.type === "wraith" && tower?.def.element === "yin") amount *= 0.8;
  e.hp -= amount;
  if (tower?.stats.slow) {
    e.slow = tower.stats.slow * (e.boss ? 0.55 : 1);
    e.slowLeft = 1.6;
  }
  if (e.hp <= 0) kill(e, tower);
}
function fire(t, e) {
  t.attack = 1;
  t.group.rotation.y = Math.atan2(
    e.group.position.x - t.x,
    e.group.position.z - t.z,
  );
  const mesh = view.projectile(t, e);
  projectiles.push({
    mesh,
    target: e,
    tower: t,
    life: 3.5,
    damage: t.stats.damage * (Math.random() < t.stats.critical ? 2 : 1),
  });
  if (t.key === "rem") view.shockwave(t.x, t.z, t.def.color, 0.7);
}
function cast() {
  if (
    !state.running ||
    state.ended ||
    state.abilityCd > 0 ||
    !towers.some((t) => t.key === "emilia") ||
    paused()
  )
    return false;
  state.abilityCd = 24;
  for (const e of enemies) {
    if (e.dead) continue;
    e.blizzardLeft = 4;
    hit(e, e.boss ? 180 : 155);
    view.burst(e.group.position.x, e.group.position.z, "#b6edff", 5);
  }
  for (const t of towers.filter((t) => t.key === "emilia")) {
    t.attack = 1;
    view.shockwave(t.x, t.z, "#a7edff", 6);
  }
  audio.play("ability");
  toast("Nevasca · o inverno chegou a Lugunica.");
  renderHUD(true);
  return true;
}
function finishWave() {
  state.running = false;
  for (const p of projectiles) view.removeProjectile(p.mesh);
  projectiles = [];
  const bonus = 85 + state.wave * 23;
  state.gold += bonus;
  save.best[state.map] = Math.max(save.best[state.map], state.wave);
  if (state.wave >= WAVES) {
    state.ended = true;
    save.wins[state.map] = true;
    save.unlocked = Math.min(3, Math.max(save.unlocked, state.map + 2));
    save.victories++;
    persist();
    audio.play("win");
    openModal({
      title: "O destino floresceu.",
      eyebrow: "CAPÍTULO CONCLUÍDO",
      sigil: "♧",
      content: `<p>Você protegeu ${MAPS[state.map].name} e superou as 15 ondas.<br>${state.map < 2 ? "Um novo capítulo espera por você." : "Lugunica está em paz. Sua jornada está completa."}</p><div class="hero-traits"><span>${state.kills} sombras derrotadas</span><span>${state.lives} vidas preservadas</span></div>`,
      actions: [
        { label: "Continuar a jornada", run: campaign },
        {
          label: "Jogar novamente",
          secondary: true,
          run: () => startMap(state.map),
        },
      ],
      dismiss: null,
    });
  } else {
    persist();
    audio.play("select");
    toast(
      `Onda ${state.wave} superada · +${bonus} moedas. Reforce sua defesa.`,
    );
  }
  renderHUD(true);
}
function defeat() {
  state.running = false;
  state.ended = true;
  save.best[state.map] = Math.max(
    save.best[state.map],
    Math.max(0, state.wave - 1),
  );
  persist();
  audio.play("lose");
  openModal({
    title: "Ainda há uma nova chance.",
    eyebrow: "O DESTINO PODE SER REESCRITO",
    sigil: "✧",
    content: `<p>A estrada foi tomada pelas sombras na onda ${state.wave}.<br>Novos laços e uma nova estratégia podem mudar essa história.</p>`,
    actions: [
      { label: "Recomeçar o capítulo", run: () => startMap(state.map) },
      { label: "Voltar à campanha", secondary: true, run: campaign },
    ],
    dismiss: null,
  });
  renderHUD(true);
}
function simulate(dt) {
  if (state.screen !== "battle" || state.ended) return;
  state.elapsed += dt;
  state.abilityCd = Math.max(0, state.abilityCd - dt);
  for (const t of towers) t.attack = Math.max(0, t.attack - dt * 3);
  if (!state.running) return;
  state.spawnTimer += dt;
  while (state.spawned < state.plan.length && state.spawnTimer >= 0.72) {
    state.spawnTimer -= 0.72;
    spawn();
  }
  for (const e of enemies) {
    if (e.dead) continue;
    e.slowLeft = Math.max(0, e.slowLeft - dt);
    e.blizzardLeft = Math.max(0, e.blizzardLeft - dt);
    e.dist +=
      e.speed *
      (1 -
        Math.max(e.slowLeft > 0 ? e.slow : 0, e.blizzardLeft > 0 ? 0.82 : 0)) *
      dt;
    if (e.dist >= route.total) {
      e.dead = true;
      state.lives -= e.leak;
      view.actors.remove(e.group);
      removeHealth(e);
      if (state.lives <= 0) {
        defeat();
        return;
      }
      continue;
    }
    const p = routePoint(route, e.dist);
    e.group.position.set(p.x, 0.04, p.z);
    e.group.rotation.y = p.angle;
    e.health.position.set(p.x, e.boss ? 3 : 1.75, p.z);
    e.bar.scale.x = Math.max(0.001, e.hp / e.maxHp);
    e.bar.position.x = -(1 - e.bar.scale.x) * 0.425;
  }
  for (const t of towers) {
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    let target = null;
    for (const e of enemies)
      if (
        !e.dead &&
        Math.hypot(e.group.position.x - t.x, e.group.position.z - t.z) <
          t.stats.range &&
        (!target || target.dist < e.dist)
      )
        target = e;
    if (target) {
      const buff = Math.min(
        0.8,
        towers.reduce(
          (n, a) =>
            a !== t &&
            a.stats.buff &&
            Math.hypot(a.x - t.x, a.z - t.z) < a.stats.range
              ? n + a.stats.buff
              : n,
          0,
        ),
      );
      t.cooldown += t.stats.interval / (1 + buff);
      fire(t, target);
    } else t.cooldown = 0;
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.target.dead || p.life <= 0) {
      view.removeProjectile(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    const destination = p.target.group.position
        .clone()
        .add(new THREE.Vector3(0, 0.9, 0)),
      diff = destination.sub(p.mesh.position),
      distance = diff.length(),
      move = 13 * dt;
    p.mesh.rotation.x += dt * 8;
    if (distance < move + 0.15) {
      const center = p.target.group.position.clone();
      hit(p.target, p.damage, p.tower);
      if (p.tower.stats.splash > 0) {
        view.shockwave(
          center.x,
          center.z,
          p.tower.def.color,
          p.tower.stats.splash,
        );
        for (const other of enemies)
          if (
            other !== p.target &&
            !other.dead &&
            other.group.position.distanceTo(center) < p.tower.stats.splash
          )
            hit(other, p.damage * 0.5, p.tower);
      }
      view.burst(center.x, center.z, p.tower.def.color, 3);
      if (state.elapsed - uiTimer > 0.14) {
        audio.play(
          { emilia: "ice", rem: "impact", beatrice: "yin", subaru: "sword" }[
            p.tower.key
          ],
        );
        uiTimer = state.elapsed;
      }
      view.removeProjectile(p.mesh);
      projectiles.splice(i, 1);
    } else p.mesh.position.addScaledVector(diff, move / distance);
  }
  enemies = enemies.filter((e) => !e.dead);
  if (state.spawned >= state.plan.length && !enemies.length) finishWave();
}
function settings() {
  openModal({
    title: "Do seu jeito.",
    eyebrow: "CONFIGURAÇÕES",
    sigil: "☼",
    content: `<div class="settings-row"><span>Música<small>Uma trilha original para sua jornada</small></span><input id="musicVolume" type="range" aria-label="Volume da música" min="0" max="100" value="${save.settings.music * 100}"></div><div class="settings-row"><span>Efeitos sonoros<small>Magia, impacto e pequenas conquistas</small></span><input id="sfxVolume" type="range" aria-label="Volume dos efeitos" min="0" max="100" value="${save.settings.sfx * 100}"></div><div class="settings-row"><span>Qualidade gráfica<small>Leve reduz sombras e resolução</small></span><select id="qualitySelect" aria-label="Qualidade gráfica"><option value="auto">Automática</option><option value="high">Alta</option><option value="low">Leve</option></select></div>`,
    actions: [{ label: "Tudo pronto", run: closeModal }],
  });
  $("qualitySelect").value = save.settings.quality;
  for (const id of ["musicVolume", "sfxVolume"])
    $(id).oninput = () => {
      save.settings.music = Number($("musicVolume").value) / 100;
      save.settings.sfx = Number($("sfxVolume").value) / 100;
      audio.setVolumes(save.settings.music, save.settings.sfx);
      persist();
    };
  $("qualitySelect").onchange = () => {
    save.settings.quality = $("qualitySelect").value;
    view.setQuality(save.settings.quality);
    persist();
  };
}
function how() {
  openModal({
    title: "Pequenos laços. Grandes defesas.",
    eyebrow: "COMO JOGAR",
    content: `<div class="tutorial-steps"><div><b>01</b><p><strong>Convoque seus guardiões.</strong><br>Escolha um aliado e toque em um terreno livre, perto da estrada.</p></div><div><b>02</b><p><strong>Crie uma estratégia.</strong><br>Gelo controla, a maça atinge grupos e a magia fortalece os aliados.</p></div><div><b>03</b><p><strong>Evolua com propósito.</strong><br>Toque no guardião: um caminho vai até o nível 5 e outro até o nível 2.</p></div><div><b>04</b><p><strong>Reescreva o destino.</strong><br>Sobreviva às 15 ondas. Convoque Emilia para ativar Nevasca. Chefes chegam a cada 5 ondas.</p></div></div><p>Computador: clique para posicionar · E conjura Nevasca · Espaço inicia ou pausa · Esc cancela ou pausa.</p>`,
    actions: [{ label: "Meu destino me espera", run: closeModal }],
  });
}
function guardian(key) {
  const h = HEROES[key];
  audio.play("select");
  openModal({
    title: h.name,
    eyebrow: h.role,
    sigil: "",
    content: `<img class="detail-modal-portrait" src="${images[key]}" alt="Modelo 3D de ${h.name}"><p>${h.description}</p><div class="hero-traits">${h.paths.map((p) => `<span>${p.name}</span>`).join("")}</div><p>Convocação: ${h.cost} moedas · Três caminhos de evolução</p>`,
    actions: [{ label: "Levar este laço à jornada", run: campaign }],
  });
}
function pauseMenu() {
  if (state.screen !== "battle" || state.ended) return;
  openModal({
    title: "Um respiro antes do destino.",
    eyebrow: "PARTIDA PAUSADA",
    sigil: "Ⅱ",
    content: "<p>Sua defesa está a salvo. Continue quando estiver pronto.</p>",
    actions: [
      { label: "Continuar a defesa", run: closeModal },
      { label: "Configurações", secondary: true, run: settings },
      { label: "Voltar à campanha", secondary: true, run: confirmExit },
    ],
  });
}
function confirmExit() {
  openModal({
    title: "Deixar este capítulo?",
    eyebrow: "A JORNADA CONTINUA",
    content:
      "<p>A defesa atual será encerrada. As ondas concluídas e os capítulos desbloqueados permanecem salvos.</p>",
    actions: [
      { label: "Continuar a defesa", run: closeModal },
      { label: "Voltar à campanha", secondary: true, run: campaign },
    ],
  });
}
function bindUI() {
  for (const id of ["play", "navCampaign"]) $(id).onclick = campaign;
  $("navGuardians").onclick = () => {
    if (state.screen !== "menu") home();
    $("rosterSection").scrollIntoView({ behavior: "smooth", block: "center" });
  };
  $("brandHome").onclick = (e) => {
    e.preventDefault();
    home();
  };
  $("campaignBack").onclick = home;
  $("how").onclick = how;
  $("settings").onclick = settings;
  $("battleSettings").onclick = settings;
  $("exit").onclick = confirmExit;
  $("pause").onclick = pauseMenu;
  $("cancelPlacement").onclick = cancelPlacement;
  $("speed").onclick = () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
    renderHUD(true);
  };
  $("startWave").onclick = startWave;
  $("magic").onclick = cast;
  $("modalClose").onclick = () => modalDismiss?.();
  const canvas = view.renderer.domElement;
  let pointer = null;
  canvas.addEventListener("pointerdown", (event) => {
    audio.unlock();
    if (state.screen !== "battle" || state.ended || paused()) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (paused() || state.screen !== "battle") return;
    if (pointer && pointer.id === event.pointerId && !state.placing) {
      const dx = event.clientX - pointer.x,
        dy = event.clientY - pointer.y;
      if (
        Math.hypot(
          event.clientX - pointer.startX,
          event.clientY - pointer.startY,
        ) > 7
      )
        pointer.moved = true;
      if (pointer.moved) view.pan(dx, dy);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
    if (state.placing) {
      const p = view.point(event);
      if (p)
        view.placement(
          p.x,
          p.z,
          HEROES[state.placing].range,
          placementValid(p.x, p.z),
        );
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const moved = pointer.moved;
    pointer = null;
    if (state.screen !== "battle" || state.ended || paused() || moved) return;
    const p = view.point(event);
    if (!p) return;
    if (state.placing) {
      place(state.placing, p.x, p.z);
      return;
    }
    let found = null;
    for (const t of towers)
      if (Math.hypot(p.x - t.x, p.z - t.z) < 0.9) found = t;
    select(found);
  });
  canvas.addEventListener("pointercancel", () => {
    pointer = null;
  });
  canvas.addEventListener("pointerleave", () => {
    if (state.placing && !pointer) view.selection(null);
  });
  $("zoomIn").onclick = () => view.zoom(0.2);
  $("zoomOut").onclick = () => view.zoom(-0.2);
  $("resetView").onclick = () => view.resetCamera();
  document.addEventListener("pointerdown", () => audio.unlock(), {
    once: true,
  });
  document.addEventListener("keydown", (e) => {
    audio.unlock();
    if (e.key === "Tab" && modalOpen) {
      const focusables = [
        ...$("modal").querySelectorAll("button:not(.hidden),input,select"),
      ].filter((el) => !el.disabled);
      const first = focusables[0],
        last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        last?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first?.focus();
        e.preventDefault();
      }
      return;
    }
    if (["INPUT", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (modalOpen) modalDismiss?.();
      else if (state.placing) cancelPlacement();
      else if (state.screen === "battle") pauseMenu();
      return;
    }
    if (modalOpen || state.screen !== "battle") return;
    if (e.code === "Space") {
      e.preventDefault();
      state.running ? pauseMenu() : startWave();
    }
    if (e.key.toLowerCase() === "e") cast();
  });
  document.addEventListener("visibilitychange", syncAudio);
  window.addEventListener("pagehide", () => audio.destroy());
}
function roster() {
  const bg = {
    emilia: "#dfe9e6",
    rem: "#d6e3e8",
    beatrice: "#ede2dd",
    subaru: "#e8e3d6",
  };
  $("menuRoster").innerHTML = Object.entries(HEROES)
    .map(
      ([key, h]) =>
        `<button class="guardian-card" data-guardian="${key}" style="--accent:${h.color}"><img src="${images[key]}" alt="Modelo 3D de ${h.name}"><span class="element">${h.symbol}</span><span><strong>${h.name}</strong><small>${h.role}</small></span><svg class="card-arrow"><use href="#i-arrow"/></svg></button>`,
    )
    .join("");
  $("shopUnits").innerHTML = Object.entries(HEROES)
    .map(
      ([key, h]) =>
        `<button class="shop-unit" data-hero="${key}" style="--accent:${h.color};--card-bg:${bg[key]}" aria-label="Convocar ${h.name}, ${h.cost} moedas"><img src="${images[key]}" alt=""><span class="unit-badge">${h.symbol}</span><strong>${h.name}</strong><small>${icon("coin")}${h.cost}</small></button>`,
    )
    .join("");
  document
    .querySelectorAll("[data-guardian]")
    .forEach((b) => (b.onclick = () => guardian(b.dataset.guardian)));
  document
    .querySelectorAll("[data-hero]")
    .forEach((b) => (b.onclick = () => chooseHero(b.dataset.hero)));
}
let previous = performance.now(),
  hudClock = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!view) return;
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (!document.hidden) {
    if (!paused()) {
      if (state.screen === "battle") {
        accumulator += dt * state.speed;
        while (accumulator >= 1 / 60 && !paused()) {
          simulate(1 / 60);
          accumulator -= 1 / 60;
        }
      }
      view.update(dt, towers, enemies, preview);
    }
    view.render();
    hudClock += dt;
    if (hudClock > 0.12 && state.screen === "battle") {
      renderHUD();
      hudClock = 0;
    }
  }
}
function testingAPI() {
  if (new URLSearchParams(location.search).has("test"))
    window.__ASTRAL_TEST__ = {
      get state() {
        return state;
      },
      get towers() {
        return towers;
      },
      get enemies() {
        return enemies;
      },
      get save() {
        return save;
      },
      get view() {
        return view;
      },
      snapshot: () => ({
        screen: state.screen,
        wave: state.wave,
        gold: state.gold,
        lives: state.lives,
        running: state.running,
        ended: state.ended,
        paused: paused(),
        abilityCd: state.abilityCd,
        kills: state.kills,
        towers: towers.map((t) => ({
          id: t.id,
          key: t.key,
          x: t.x,
          z: t.z,
          levels: [...t.levels],
          stats: { ...t.stats },
        })),
        enemies: enemies.map((e) => ({
          hp: e.hp,
          maxHp: e.maxHp,
          dist: e.dist,
          boss: e.boss,
          bar: e.bar.scale.x,
        })),
        save: structuredClone(save),
      }),
      step: (seconds) => {
        const count = Math.ceil(seconds * 60);
        for (let i = 0; i < count; i++) {
          if (paused()) break;
          simulate(1 / 60);
        }
        renderHUD(true);
        view.render();
      },
      startMap,
      startWave,
      place,
      placementValid,
      select: (id) => select(towers.find((t) => t.id === id)),
      upgrade,
      cast,
      closeModal,
      home,
      campaign,
      project: (x, z) => view.project(x, z),
      persist,
    };
}
async function init() {
  try {
    view = new GameView($("stage"), save.settings.quality);
    images = view.portraits(Object.keys(HEROES));
    for (let i = 0; i < MAPS.length; i++) {
      view.setWorld(i);
      view.render();
      mapImages[i] = view.renderer.domElement.toDataURL("image/webp", 0.85);
    }
    menuPreview();
    roster();
    bindUI();
    testingAPI();
    $("loading").classList.add("hidden");
    requestAnimationFrame(frame);
    persist();
  } catch (error) {
    console.error(error);
    $("fatal").classList.remove("hidden");
    $("fatalMessage").textContent =
      `Não foi possível abrir o mundo 3D. Ative a aceleração gráfica ou tente um navegador atualizado. (${error.message})`;
  }
}
init();
