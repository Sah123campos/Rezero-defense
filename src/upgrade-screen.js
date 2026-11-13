import { HEROES, towerStats, upgradeState } from "./rules.js?v=2.1.0";

let screenCount = 0;
const PATH_COLORS = ["#69e7ff", "#dca2ff", "#ffc767"];
const PATH_SYMBOLS = ["✦", "◎", "➤"];
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmt = (value) => number.format(value);
const pct = (value) => `${percent.format(value * 100)}%`;
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
const normalizedLevels = (levels) =>
  Array.from({ length: 3 }, (_, i) =>
    Math.max(0, Math.min(5, Math.floor(Number(levels?.[i]) || 0))),
  );

/** A hypothetical build always obeys 5–2–0, even when browsing a locked path. */
function previewBuild(current, branch, tier) {
  const after = [0, 0, 0];
  after[branch] = tier;
  const secondary = current
    .map((level, index) => ({ level, index }))
    .filter((item) => item.index !== branch && item.level > 0)
    .sort((a, b) => b.level - a.level || a.index - b.index)[0];
  if (secondary)
    after[secondary.index] = Math.min(secondary.level, tier > 2 ? 2 : 5);
  const before = [...after];
  before[branch] = tier - 1;
  return {
    before,
    after,
    alternative: current.some(
      (level, index) => index !== branch && level !== after[index],
    ),
  };
}

function reachableUpgrade(key, levels, branch, tier) {
  const work = [...levels];
  while (work[branch] < tier) {
    const next = upgradeState(key, work, branch);
    if (!next.allowed) return { allowed: false, reason: next.reason };
    work[branch]++;
  }
  return { allowed: true, reason: "" };
}

const STAT_ROWS = [
  {
    key: "damage",
    label: "Dano por golpe",
    value: (stats) => stats.damage,
    format: fmt,
  },
  {
    key: "range",
    label: "Alcance",
    value: (stats) => stats.range,
    format: fmt,
  },
  {
    key: "speed",
    label: "Ataques / s",
    value: (stats) => 1 / stats.interval,
    format: fmt,
  },
  { key: "slow", label: "Lentidão", value: (stats) => stats.slow, format: pct },
  {
    key: "splash",
    label: "Raio de área",
    value: (stats) => stats.splash,
    format: fmt,
  },
  {
    key: "buff",
    label: "Aura de apoio",
    value: (stats) => stats.buff,
    format: pct,
  },
  {
    key: "critical",
    label: "Chance crítica",
    value: (stats) => stats.critical,
    format: pct,
  },
];

/** Every description here is calculated from the same rules as combat. */
function effects(before, after) {
  const changes = [];
  if (after.damage !== before.damage)
    changes.push({
      short: `Dano +${pct(after.damage / before.damage - 1)}`,
      sentence: `Cada golpe passa de ${fmt(before.damage)} para ${fmt(after.damage)} de dano (+${pct(after.damage / before.damage - 1)}).`,
    });
  if (after.range !== before.range)
    changes.push({
      short: `Alcance +${fmt(after.range - before.range)}`,
      sentence: `O alcance aumenta de ${fmt(before.range)} para ${fmt(after.range)} unidades do mapa.`,
    });
  if (after.interval !== before.interval)
    changes.push({
      short: `Ataques/s +${pct(before.interval / after.interval - 1)}`,
      sentence: `A cadência passa de ${fmt(1 / before.interval)} para ${fmt(1 / after.interval)} ataques por segundo (+${pct(before.interval / after.interval - 1)}).`,
    });
  if (after.slow !== before.slow)
    changes.push({
      short: `Lentidão +${percent.format((after.slow - before.slow) * 100)} p.p.`,
      sentence: `A redução de velocidade dos inimigos aumenta de ${pct(before.slow)} para ${pct(after.slow)}.`,
    });
  if (after.splash !== before.splash)
    changes.push({
      short: `Raio de área +${fmt(after.splash - before.splash)}`,
      sentence:
        before.splash > 0
          ? `O raio do impacto em área aumenta de ${fmt(before.splash)} para ${fmt(after.splash)} ao redor do alvo.`
          : `Os impactos passam a atingir inimigos próximos, em um raio de ${fmt(after.splash)} ao redor do alvo.`,
    });
  if (after.buff !== before.buff)
    changes.push({
      short: `Aura +${percent.format((after.buff - before.buff) * 100)} p.p.`,
      sentence:
        before.buff > 0
          ? `O bônus de velocidade de ataque para aliados na aura aumenta de ${pct(before.buff)} para ${pct(after.buff)}.`
          : `Desbloqueia uma aura que aumenta em ${pct(after.buff)} a velocidade de ataque dos aliados próximos.`,
    });
  if (after.critical !== before.critical)
    changes.push({
      short: `Crítico +${percent.format((after.critical - before.critical) * 100)} p.p.`,
      sentence: `A chance de golpe crítico passa de ${pct(before.critical)} para ${pct(after.critical)}.`,
    });
  return changes;
}

export class UpgradeScreen {
  constructor({
    getGold = () => 0,
    buy = () => false,
    getPortrait = () => "",
    onOpen = () => {},
    onClose = () => {},
  } = {}) {
    this.getGold = getGold;
    this.buy = buy;
    this.getPortrait = getPortrait;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this._isOpen = false;
    this._signature = "";
    this._portraits = new Map();
    this._message = "";
    this.id = `evolution-screen-${++screenCount}`;
    if (!document.querySelector("link[data-evolution-styles]")) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = new URL(
        "./upgrade-screen.css?v=2.1.0",
        import.meta.url,
      ).href;
      stylesheet.dataset.evolutionStyles = "";
      document.head.append(stylesheet);
    }
    this.element = document.createElement("div");
    this.element.className = "evolution-overlay";
    this.element.hidden = true;
    this.element.innerHTML = `
      <section class="evolution-panel" role="dialog" aria-modal="true" aria-labelledby="${this.id}-title" aria-describedby="${this.id}-rule">
        <header class="evolution-header">
          <div class="evolution-header-title"><span class="evolution-header-icon" aria-hidden="true">✦</span><div><p>ESCOLHA O SEU PODER</p><h2 id="${this.id}-title">Evoluções dos guardiões</h2></div></div>
          <div class="evolution-wallet" aria-label="Moedas disponíveis"></div>
          <button class="evolution-close" type="button" data-action="close" aria-label="Fechar tela de evoluções">×</button>
        </header>
        <div class="evolution-rule" id="${this.id}-rule"><strong>5–2–0</strong><span>Um caminho até o nível <b>5</b>, outro até o <b>2</b>. O terceiro fica bloqueado.</span><span class="evolution-rule-hint">Toque em qualquer evolução para explorar.</span></div>
        <div class="evolution-main">
          <aside class="evolution-identity"></aside>
          <div class="evolution-path-area">
            <div class="evolution-tabs" role="tablist" aria-label="Caminhos de evolução"></div>
            <div class="evolution-paths"></div>
          </div>
        </div>
        <section class="evolution-detail" aria-label="Detalhes da evolução selecionada"></section>
      </section>`;
    document.body.append(this.element);
    this.wallet = this.element.querySelector(".evolution-wallet");
    this.identity = this.element.querySelector(".evolution-identity");
    this.tabs = this.element.querySelector(".evolution-tabs");
    this.paths = this.element.querySelector(".evolution-paths");
    this.detail = this.element.querySelector(".evolution-detail");
    this.element.addEventListener("click", (event) => this._click(event));
    this._handleKey = (event) => this._key(event);
  }

  get isOpen() {
    return this._isOpen;
  }

  open(towerOrKey) {
    const key = typeof towerOrKey === "string" ? towerOrKey : towerOrKey?.key;
    if (!Object.hasOwn(HEROES, key)) return false;
    const alreadyOpen = this._isOpen;
    this.key = key;
    this.tower = typeof towerOrKey === "string" ? null : towerOrKey;
    this.catalogue = !this.tower;
    const levels = normalizedLevels(this.tower?.levels);
    let branch = levels.findIndex(
      (_, i) => upgradeState(key, levels, i).allowed,
    );
    if (branch < 0) branch = 0;
    this.selected = { branch, tier: Math.min(5, levels[branch] + 1) };
    this.activePath = branch;
    this._message = "";
    this._signature = "";
    this._isOpen = true;
    this.element.hidden = false;
    if (!alreadyOpen) {
      this.returnFocus = document.activeElement;
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", this._handleKey, true);
      this.onOpen();
    }
    this.refresh();
    this.paths.scrollTop = 0;
    requestAnimationFrame(() => {
      if (this._isOpen)
        this.element
          .querySelector(".evolution-close")
          ?.focus({ preventScroll: true });
    });
    return true;
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.element.hidden = true;
    document.body.style.overflow = this.previousOverflow;
    document.removeEventListener("keydown", this._handleKey, true);
    this.onClose();
    if (this.returnFocus?.isConnected)
      this.returnFocus.focus({ preventScroll: true });
  }

  _portrait(levels) {
    const key = `${this.key}:${levels.join("-")}`;
    if (!this._portraits.has(key)) {
      try {
        this._portraits.set(key, this.getPortrait(this.key, [...levels]) || "");
      } catch {
        this._portraits.set(key, "");
      }
    }
    return this._portraits.get(key);
  }

  _status(branch, tier, levels) {
    if (!this.catalogue && tier <= levels[branch])
      return {
        kind: "owned",
        label: "Adquirido",
        reason: "Este nível já está ativo no guardião.",
      };
    const reachable = reachableUpgrade(this.key, levels, branch, tier);
    if (!reachable.allowed)
      return {
        kind: "locked",
        label: "Bloqueado · 5–2–0",
        reason: reachable.reason,
      };
    if (tier === levels[branch] + 1)
      return {
        kind: "next",
        label: this.catalogue ? "Primeiro nível" : "Próximo nível",
        reason: "",
      };
    return {
      kind: "future",
      label: `Exige o nível ${tier - 1}`,
      reason: `Conclua os níveis anteriores deste caminho, um por vez.`,
    };
  }

  refresh() {
    if (!this._isOpen) return;
    const levels = normalizedLevels(this.tower?.levels);
    const gold = Math.max(0, Math.floor(Number(this.getGold()) || 0));
    const signature = JSON.stringify([
      this.key,
      levels,
      gold,
      this.selected,
      this.activePath,
      this.catalogue,
      this._message,
    ]);
    if (signature === this._signature) return;
    this._signature = signature;
    const hero = HEROES[this.key];
    const focusKey = document.activeElement?.dataset.evolutionFocus;
    const scroll = this.paths.scrollTop;
    const { branch, tier } = this.selected;
    const preview = previewBuild(levels, branch, tier);
    const before = towerStats(this.key, preview.before);
    const after = towerStats(this.key, preview.after);
    const current = towerStats(this.key, levels);
    const portrait = this._portrait(preview.after);
    this.wallet.innerHTML = this.catalogue
      ? "<small>GUIA DOS</small><strong>GUARDIÕES</strong>"
      : `<small>SUAS MOEDAS</small><strong><span aria-hidden="true">◈</span> ${fmt(gold)}</strong>`;
    this.identity.innerHTML = `
      <div class="evolution-hero-name"><span>${escape(hero.symbol)}</span><div><h3>${escape(hero.name)}</h3><p>${escape(hero.role)}</p></div></div>
      <div class="evolution-portrait-stage" style="--evolution-hero-color:${escape(hero.color)}"><div class="evolution-portrait-orbit" aria-hidden="true"></div>${portrait ? `<img src="${escape(portrait)}" alt="Prévia de ${escape(hero.name)}, níveis ${preview.after.join("–")}">` : `<span class="evolution-portrait-fallback" aria-hidden="true">${escape(hero.symbol)}</span>`}<span class="evolution-preview-badge">PRÉVIA · ${preview.after.join("–")}</span></div>
      <div class="evolution-current-build">${this.catalogue ? "FORMA INICIAL" : "SEU GUARDIÃO"}<strong>${levels.join(" – ")}</strong></div>
      <div class="evolution-current-stats"><div><strong>${fmt(current.damage)}</strong><span>Dano</span></div><div><strong>${fmt(current.range)}</strong><span>Alcance</span></div><div><strong>${fmt(1 / current.interval)}</strong><span>Ataques/s</span></div></div>
      <p class="evolution-hero-description">${escape(hero.description)}</p>
      <p class="evolution-preview-note">O retrato mostra a evolução selecionada. Os atributos acima são ${this.catalogue ? "da forma inicial" : "do guardião atual"}.</p>`;
    this.tabs.innerHTML = hero.paths
      .map(
        (path, i) =>
          `<button type="button" role="tab" id="${this.id}-tab-${i}" aria-controls="${this.id}-path-${i}" aria-selected="${this.activePath === i}" tabindex="${this.activePath === i ? 0 : -1}" class="evolution-tab ${this.activePath === i ? "is-active" : ""}" style="--evolution-path-color:${PATH_COLORS[i]}" data-action="path" data-branch="${i}" data-evolution-focus="tab-${i}"><span>${PATH_SYMBOLS[i]}</span><strong>Caminho ${i + 1}</strong><small>${levels[i]} / 5</small></button>`,
      )
      .join("");
    this.paths.innerHTML = hero.paths
      .map(
        (path, i) => `
      <section class="evolution-path ${this.activePath === i ? "is-active" : ""}" id="${this.id}-path-${i}" aria-labelledby="${this.id}-path-title-${i}" style="--evolution-path-color:${PATH_COLORS[i]}">
        <header class="evolution-path-heading"><div><span class="evolution-path-symbol" aria-hidden="true">${PATH_SYMBOLS[i]}</span><p>CAMINHO ${i + 1}<small>${levels[i]} / 5</small></p></div><h3 id="${this.id}-path-title-${i}">${escape(path.name)}</h3><p>${escape(path.description)}</p></header>
        <div class="evolution-tier-list">${path.tiers
          .map((upgrade, j) => {
            const level = j + 1;
            const status = this._status(i, level, levels);
            const build = previewBuild(levels, i, level);
            const changes = effects(
              towerStats(this.key, build.before),
              towerStats(this.key, build.after),
            );
            const selected = branch === i && tier === level;
            return `<button type="button" class="evolution-tier is-${status.kind} ${selected ? "is-selected" : ""}" data-action="tier" data-branch="${i}" data-tier="${level}" data-evolution-focus="tier-${i}-${level}" aria-pressed="${selected}" aria-label="${escape(upgrade.name)}, nível ${level}, ${upgrade.cost} moedas. ${escape(status.label)}. Ver efeitos."><span class="evolution-tier-number">${status.kind === "owned" ? "✓" : level}</span><span class="evolution-tier-copy"><span class="evolution-tier-topline"><strong>${escape(upgrade.name)}</strong><span>◈ ${fmt(upgrade.cost)}</span></span><span class="evolution-tier-description">${escape(upgrade.description)}</span><span class="evolution-tier-effects">${changes.map((change) => `<span>${escape(change.short)}</span>`).join("")}</span><span class="evolution-tier-status">${status.kind === "locked" ? "▣ " : status.kind === "owned" ? "✓ " : status.kind === "next" ? "➜ " : ""}${escape(status.label)}</span></span></button>`;
          })
          .join("")}</div>
      </section>`,
      )
      .join("");
    this.paths.scrollTop = scroll;
    this._renderDetail(hero, levels, gold, preview, before, after);
    if (focusKey)
      this.element
        .querySelector(`[data-evolution-focus="${focusKey}"]`)
        ?.focus({ preventScroll: true });
  }

  _renderDetail(hero, levels, gold, preview, before, after) {
    const { branch, tier } = this.selected;
    const definition = hero.paths[branch].tiers[tier - 1];
    const status = this._status(branch, tier, levels);
    const next = upgradeState(this.key, levels, branch);
    const nextLevel = tier === levels[branch] + 1;
    const canBuy =
      !this.catalogue && nextLevel && next.allowed && gold >= next.cost;
    const changes = effects(before, after);
    let label = `Evoluir · ◈ ${fmt(definition.cost)}`;
    let condition =
      "Compra apenas este nível. As demais escolhas permanecem como estão.";
    if (this.catalogue) {
      label = `Convoque ${hero.name} para evoluir`;
      condition = `Este é o catálogo. Durante a partida, convoque ${hero.name} por ${fmt(hero.cost)} moedas e selecione o guardião no mapa.`;
    } else if (status.kind === "owned") {
      label = "Evolução adquirida";
      condition =
        "Este nível já faz parte do guardião. Explore os próximos para planejar sua estratégia.";
    } else if (status.kind === "locked") {
      label = "Combinação bloqueada";
      condition = `${status.reason} Um caminho pode chegar a 5; o secundário para no nível 2. Não é possível trocar as escolhas já compradas.`;
    } else if (!nextLevel) {
      label = `Conclua o nível ${levels[branch] + 1} primeiro`;
      condition = `Esta é uma prévia. Os níveis deste caminho precisam ser comprados na ordem, um por vez.`;
    } else if (gold < next.cost) {
      label = `Faltam ◈ ${fmt(next.cost - gold)}`;
      condition =
        "Derrote inimigos e conclua ondas para juntar as moedas que faltam.";
    }
    const previewText = preview.alternative
      ? "Prévia de outra estratégia: os demais caminhos foram ajustados para uma combinação 5–2–0 válida. Isso não altera nem permite trocar suas escolhas atuais."
      : this.catalogue
        ? `Prévia do nível ${tier}, com os níveis anteriores deste caminho. Compare abaixo o efeito específico desta evolução.`
        : status.kind === "owned"
          ? "Comparação deste nível com seu nível anterior. A evolução já está ativa."
          : nextLevel
            ? "Se comprar agora, estes serão os atributos do guardião. Valores antes → depois."
            : `Prévia do nível ${tier} após concluir seus requisitos. Valores do nível anterior → nível selecionado.`;
    this.detail.style.setProperty(
      "--evolution-path-color",
      PATH_COLORS[branch],
    );
    this.detail.innerHTML = `
      <div class="evolution-detail-copy"><div class="evolution-detail-title"><span class="evolution-selected-level">${tier}</span><div><p>${escape(hero.paths[branch].name)} · Nível ${tier}</p><h3>${escape(definition.name)}</h3></div><span class="evolution-detail-price">◈ ${fmt(definition.cost)}</span></div>
        <p class="evolution-actual-effects">${changes.map((change) => escape(change.sentence)).join(" ") || "Mantém os atributos deste caminho."}</p>
        <div class="evolution-stat-comparison" aria-label="Atributos antes e depois da evolução">${STAT_ROWS.map(
          (stat) => {
            const a = stat.value(before),
              b = stat.value(after),
              changed = Math.abs(a - b) > 0.000001;
            return `<div class="evolution-stat ${changed ? "is-improved" : ""}"><span>${stat.label}</span><div><small>${stat.format(a)}</small><span aria-hidden="true">→</span><strong>${stat.format(b)}</strong></div><span class="evolution-sr-only">${changed ? "Aumenta" : "Permanece igual"}</span></div>`;
          },
        ).join(
          "",
        )}</div><p class="evolution-comparison-note">${escape(previewText)} Auras de outros aliados e resistências dos inimigos não estão incluídas.</p>
      </div>
      <div class="evolution-purchase"><span class="evolution-purchase-label">${this.catalogue ? "EXPLORE E PLANEJE" : "SUA PRÓXIMA ESCOLHA"}</span><button type="button" class="evolution-buy" data-action="buy" data-evolution-focus="buy" ${canBuy ? "" : "disabled"}>${escape(label)}</button><p class="evolution-purchase-condition" aria-live="polite">${escape(this._message || condition)}</p></div>`;
  }

  _click(event) {
    if (!this._isOpen) return;
    if (event.target === this.element) {
      this.close();
      return;
    }
    const button = event.target.closest("button[data-action]");
    if (!button || !this.element.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action === "close") {
      this.close();
      return;
    }
    if (action === "tier") {
      this.selected = {
        branch: Number(button.dataset.branch),
        tier: Number(button.dataset.tier),
      };
      this.activePath = this.selected.branch;
      this._message = "";
      this.refresh();
    } else if (action === "path") {
      this._activatePath(Number(button.dataset.branch));
    } else if (action === "buy" && this.tower) {
      const levels = normalizedLevels(this.tower.levels);
      const next = upgradeState(this.key, levels, this.selected.branch);
      if (
        !next.allowed ||
        this.selected.tier !== levels[this.selected.branch] + 1 ||
        this.getGold() < next.cost
      ) {
        this._signature = "";
        this.refresh();
        return;
      }
      let purchased = false;
      try {
        purchased = this.buy(this.tower, this.selected.branch) === true;
      } catch {
        /* The owner controls the transaction; keep this screen usable. */
      }
      this._message = purchased
        ? "Evolução adquirida! O guardião já está mais forte."
        : "A evolução não foi concluída. Confira suas moedas e tente novamente.";
      this._signature = "";
      this.refresh();
    }
  }

  _activatePath(branch) {
    this.activePath = (branch + 3) % 3;
    const levels = normalizedLevels(this.tower?.levels);
    this.selected = {
      branch: this.activePath,
      tier: Math.min(5, levels[this.activePath] + 1),
    };
    this._message = "";
    this.paths.scrollTop = 0;
    this.refresh();
  }

  _key(event) {
    if (!this._isOpen) return;
    // The battlefield also uses Space, E and Escape. Keep those events here.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (
      event.target?.classList?.contains("evolution-tab") &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const branch =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : this.activePath + (event.key === "ArrowRight" ? 1 : -1);
      this._activatePath(branch);
      this.tabs.querySelector(`[data-branch="${this.activePath}"]`)?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = [
      ...this.element.querySelectorAll(
        'button:not([disabled]), [tabindex="0"]',
      ),
    ].filter(
      (element) => !element.hidden && element.getClientRects().length > 0,
    );
    const first = focusables[0],
      last = focusables.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !this.element.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !this.element.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
}
