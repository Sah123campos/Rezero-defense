/** Pure game rules. No browser state, rendering, or wall-clock dependencies. */
export const WAVES = 15;

const prices = [0.8, 1.2, 2, 3.4, 6];
const path = (baseCost, name, description, tiers, factor = 1) => ({
  name, description,
  tiers: tiers.map(([name, description], i) => ({
    name, description, cost: Math.round(baseCost * prices[i] * factor / 5) * 5,
  })),
});

export const HEROES = {
  emilia: {
    name: 'Emilia', role: 'Controle de gelo', cost: 165, damage: 19, range: 3.55,
    interval: 0.87, color: '#a5e6f7', element: 'gelo', symbol: '❄',
    description: 'Cristais de gelo desaceleram os inimigos. Especialista em conter o avanço das sombras.',
    paths: [
      path(165, 'Rainha do Gelo', 'Projéteis mais fortes e explosões de cristais.', [
        ['Cristal vivo', '+40% de dano dos cristais.'],
        ['Estilhaço polar', 'Mais dano em cada impacto.'],
        ['Lança glacial', 'Estilhaços atingem inimigos próximos.'],
        ['Coroa de inverno', 'Cristais maiores e explosões mais amplas.'],
        ['Era do gelo', 'Poder máximo da magia glacial.'],
      ]),
      path(165, 'Domínio Glacial', 'Mais alcance e lentidão para controlar a estrada.', [
        ['Alcance lunar', '+0,35 de alcance e gelo mais intenso.'],
        ['Geada persistente', 'A lentidão reduz ainda mais a velocidade inimiga.'],
        ['Círculo do inverno', 'Uma área maior fica sob o domínio de Emilia.'],
        ['Neve eterna', 'Lentidão profunda e alcance ampliado.'],
        ['Domínio absoluto', 'O avanço inimigo se torna quase imóvel.'],
      ], 0.9),
      path(165, 'Espírito Protetor', 'Conjuração veloz e apoio espiritual aos aliados.', [
        ['Afinidade espiritual', 'Conjura cristais 14% mais rápido.'],
        ['Dança dos espíritos', 'Aumenta a frequência dos ataques.'],
        ['Pacto de proteção', 'A aura espiritual acelera aliados próximos.'],
        ['Bênção de Puck', 'Conjuração e apoio mais fortes.'],
        ['Guardiã dos espíritos', 'Velocidade e aura em sua forma suprema.'],
      ], 1.05),
    ],
  },
  rem: {
    name: 'Rem', role: 'Impacto em área', cost: 220, damage: 34, range: 2.8,
    interval: 1.15, color: '#78bdf5', element: 'físico', symbol: '✦',
    description: 'A maça de corrente causa dano em área. Poderosa contra grupos que passam por curvas.',
    paths: [
      path(220, 'Força Oni', 'Impactos brutais e mais dano de explosão.', [
        ['Ferro reforçado', '+45% de dano por impacto.'],
        ['Impacto pesado', 'A maça causa ainda mais dano.'],
        ['Chifre desperto', 'Poder oni amplia a força e a área.'],
        ['Fúria azul', 'Impactos devastadores em grupos.'],
        ['Oni indomável', 'A força máxima de Rem desperta.'],
      ]),
      path(220, 'Dança da Corrente', 'Uma corrente mais longa cobre uma área maior.', [
        ['Elos longos', '+0,35 de alcance e de área de impacto.'],
        ['Giro amplo', 'Atinge mais inimigos ao redor do alvo.'],
        ['Órbita de ferro', 'Mais alcance para dominar as curvas.'],
        ['Dança mortal', 'A corrente controla uma área extensa.'],
        ['Tempestade de aço', 'Impactos cobrem grandes grupos.'],
      ], 0.95),
      path(220, 'Instinto Protetor', 'Ataques rápidos e golpes críticos.', [
        ['Reflexos atentos', 'Ataca 17% mais rápido.'],
        ['Passos leves', 'Mais velocidade e chance de golpe crítico.'],
        ['Instinto oni', 'A corrente gira em ritmo acelerado.'],
        ['Voto de proteção', 'Golpes rápidos e certeiros.'],
        ['Promessa inabalável', 'Velocidade máxima e críticos frequentes.'],
      ], 1.1),
    ],
  },
  beatrice: {
    name: 'Beatrice', role: 'Magia e suporte', cost: 245, damage: 13, range: 3.5,
    interval: 1.15, color: '#e0adea', element: 'yin', symbol: '✧',
    description: 'Magia yin enfraquece as sombras. Sua aura acelera os ataques dos guardiões próximos.',
    paths: [
      path(245, 'Biblioteca Proibida', 'Magia yin concentrada e rupturas em área.', [
        ['Mana densa', '+50% de dano mágico.'],
        ['Códice oculto', 'Feitiços de impacto mais forte.'],
        ['Selo yin', 'Rupturas atingem alvos próximos.'],
        ['Porta do vazio', 'Amplia o dano e a área das rupturas.'],
        ['Biblioteca infinita', 'O poder supremo do acervo proibido.'],
      ]),
      path(245, 'Pacto Espiritual', 'Uma aura maior fortalece os aliados.', [
        ['Aura ampla', '+0,35 de alcance e aura de apoio mais forte.'],
        ['Proteção do contrato', 'Aumenta a velocidade dos aliados na aura.'],
        ['Campo espiritual', 'Uma área maior recebe a bênção.'],
        ['Santuário de mana', 'Aliados próximos atacam ainda mais rápido.'],
        ['Pacto eterno', 'Alcance e apoio espiritual supremos.'],
      ], 1.05),
      path(245, 'Páginas do Tempo', 'Conjuração rápida e uma aura secundária.', [
        ['Leitura veloz', 'Conjura 17% mais rápido.'],
        ['Páginas vivas', 'Mais velocidade e apoio aos aliados.'],
        ['Ritual acelerado', 'Acelera o fluxo de magia.'],
        ['Dobra arcana', 'Conjuração em ritmo intenso.'],
        ['Tempo suspenso', 'Uma torrente de feitiços e apoio contínuo.'],
      ], 0.95),
    ],
  },
  subaru: {
    name: 'Subaru', role: 'Velocidade e apoio', cost: 115, damage: 13, range: 2.9,
    interval: 0.42, color: '#f3ae72', element: 'físico', symbol: '⚔',
    description: 'Um defensor acessível e rápido. Determinação, golpes críticos e táticas de apoio.',
    paths: [
      path(115, 'Vontade Inabalável', 'Golpes mais fortes e críticos mais frequentes.', [
        ['Golpe certeiro', '+42% de dano e mais chance de crítico.'],
        ['Coragem renovada', 'A determinação aumenta o dano.'],
        ['Persistência', 'Golpes críticos mais frequentes.'],
        ['Promessa ao destino', 'Aumenta a força de cada ataque.'],
        ['Herói improvável', 'Determinação e força em sua forma máxima.'],
      ]),
      path(115, 'Estrategista', 'Vigilância e coordenação do esquadrão.', [
        ['Olhar atento', '+0,30 de alcance.'],
        ['Plano de batalha', 'Aliados próximos ganham velocidade de ataque.'],
        ['Coordenar defesa', 'Alcance e apoio tático mais fortes.'],
        ['Linha de frente', 'Uma área maior recebe o apoio.'],
        ['Todos juntos', 'A coordenação acelera todo o grupo próximo.'],
      ], 1.05),
      path(115, 'Retorno do Herói', 'Reação, velocidade e contra-ataques críticos.', [
        ['Esquiva', 'Ataca 19% mais rápido.'],
        ['Contra-ataque', 'Mais velocidade e chance de crítico.'],
        ['Determinação', 'Não perde uma oportunidade de atacar.'],
        ['Ritmo intenso', 'Ataques em rápida sucessão.'],
        ['Ainda de pé', 'Velocidade máxima contra as sombras.'],
      ], 0.9),
    ],
  },
};

const boundedInt = (value, fallback, min, max) => Number.isFinite(value)
  ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;

const levelsFor = levels => Array.from({ length: 3 }, (_, i) =>
  boundedInt(Array.isArray(levels) ? levels[i] : 0, 0, 0, 5));

/** One primary path up to tier 5, one secondary path up to tier 2. */
export function upgradeState(key, levels = [0, 0, 0], branch = 0) {
  const hero = HEROES[key];
  if (!hero || !Number.isInteger(branch) || branch < 0 || branch > 2) {
    return { allowed: false, cost: 0, reason: 'Evolução inválida.', tier: null };
  }
  const current = levelsFor(levels);
  const level = current[branch];
  const tier = hero.paths[branch].tiers[level] || null;
  if (!tier) return { allowed: false, cost: 0, reason: 'Caminho completo.', tier: null };
  const result = { allowed: true, cost: tier.cost, reason: '', tier };
  if (level === 0 && current.filter(n => n > 0).length >= 2) {
    return { ...result, allowed: false, reason: 'Escolha no máximo dois caminhos.' };
  }
  if (level >= 2 && current.some((n, i) => i !== branch && n > 2)) {
    return { ...result, allowed: false, reason: 'O caminho secundário vai até o nível 2.' };
  }
  return result;
}

export function towerStats(key, levels = [0, 0, 0]) {
  const hero = HEROES[key];
  if (!hero) throw new RangeError(`Guardião desconhecido: ${key}`);
  const [power, reach, pace] = levelsFor(levels);
  const result = {
    damage: hero.damage, range: hero.range, interval: hero.interval,
    slow: 0, splash: 0, buff: 0, critical: 0,
  };
  switch (key) {
    case 'emilia':
      result.damage *= 1.4 ** power;
      result.range += reach * 0.35;
      result.interval *= 0.86 ** pace;
      result.slow = Math.min(0.9, 0.52 + reach * 0.075);
      result.splash = power >= 3 ? 0.35 + (power - 3) * 0.2 : 0;
      result.buff = pace >= 3 ? pace * 0.04 : 0;
      break;
    case 'rem':
      result.damage *= 1.45 ** power;
      result.range += reach * 0.35;
      result.interval *= 0.83 ** pace;
      result.splash = 0.92 + power * 0.15 + reach * 0.35;
      result.critical = pace * 0.04;
      break;
    case 'beatrice':
      result.damage *= 1.5 ** power;
      result.range += reach * 0.35;
      result.interval *= 0.83 ** pace;
      result.splash = power >= 3 ? 0.5 + (power - 3) * 0.2 : 0;
      result.buff = 0.12 + reach * 0.05 + pace * 0.025;
      break;
    case 'subaru':
      result.damage *= 1.42 ** power;
      result.range += reach * 0.3;
      result.interval *= 0.81 ** pace;
      result.buff = reach >= 2 ? reach * 0.04 : 0;
      result.critical = 0.13 + power * 0.02 + pace * 0.03;
      break;
  }
  return result;
}

const ENEMIES = {
  shade: { hp: 48, speed: 1.3, reward: 15, leak: 1, color: '#8979b9' },
  runner: { hp: 36, speed: 2.1, reward: 17, leak: 1, color: '#61c1cc' },
  armored: { hp: 130, speed: 0.83, reward: 27, leak: 2, color: '#c8a674' },
  wraith: { hp: 88, speed: 1.5, reward: 22, leak: 1, color: '#c985bd' },
  boss: { hp: 900, speed: 0.6, reward: 220, leak: 5, color: '#dc6d9d' },
};

export function enemyStats(type, wave = 1) {
  const kind = ENEMIES[type] ? type : 'shade';
  const base = ENEMIES[kind];
  const round = boundedInt(wave, 1, 1, WAVES);
  return {
    ...base,
    hp: Math.round(base.hp * (1 + round * (kind === 'boss' ? 0.26 : 0.17))),
    speed: base.speed * (1 + round * 0.012),
    boss: kind === 'boss',
  };
}

export function wavePlan(wave = 1) {
  const round = boundedInt(wave, 1, 1, WAVES);
  const count = 8 + round * 2 + Math.floor(round / 3);
  const plan = Array.from({ length: count }, (_, i) => {
    if (round >= 6 && i % 7 === 0) return 'wraith';
    if (round >= 2 && i % 6 === 0) return 'armored';
    return i % 4 === 0 ? 'runner' : 'shade';
  });
  if (round % 5 === 0) plan.push('boss');
  return plan;
}

/** Accepts the legacy rezero-astral3d-save shape and always returns fresh data. */
export function sanitizeSave(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const wins = Array.from({ length: 3 }, (_, i) => Array.isArray(input.wins) && input.wins[i] === true);
  const best = Array.from({ length: 3 }, (_, i) => wins[i] ? WAVES :
    boundedInt(Array.isArray(input.best) ? input.best[i] : 0, 0, 0, WAVES));
  const wonUnlock = wins[1] || wins[2] ? 3 : wins[0] ? 2 : 1;
  const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  const volume = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  return {
    version: 2,
    unlocked: Math.max(wonUnlock, boundedInt(input.unlocked, 1, 1, 3)),
    best, wins,
    settings: {
      music: volume(settings.music, 0.3),
      sfx: volume(settings.sfx, 0.6),
      quality: ['high', 'low', 'auto'].includes(settings.quality) ? settings.quality : 'auto',
    },
    victories: Math.max(wins.filter(Boolean).length, boundedInt(input.victories, 0, 0, 1_000_000)),
  };
}

export function createRoute(route) {
  const points = [];
  for (const point of Array.isArray(route) ? route : []) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const last = points.at(-1);
    if (!last || point[0] !== last[0] || point[1] !== last[1]) points.push([point[0], point[1]]);
  }
  if (points.length < 2) throw new RangeError('O caminho precisa de pelo menos dois pontos distintos.');
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  return { points, lengths, total: lengths.reduce((sum, length) => sum + length, 0) };
}

const asRoute = route => Array.isArray(route) ? createRoute(route) : route;

/** angle rotates a model facing +Z toward the current segment. */
export function routePoint(route, distance = 0) {
  const data = asRoute(route);
  let remaining = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const end = data.lengths.length - 1;
  for (let i = 0; i <= end; i++) {
    const length = data.lengths[i];
    if (remaining <= length || i === end) {
      const a = data.points[i], b = data.points[i + 1];
      const t = Math.min(1, remaining / length);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t,
        angle: Math.atan2(b[0] - a[0], b[1] - a[1]), length: data.total };
    }
    remaining -= length;
  }
}

export function distanceToRoute(x, z, route) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return Infinity;
  const data = asRoute(route);
  let best = Infinity;
  for (let i = 1; i < data.points.length; i++) {
    const a = data.points[i - 1], b = data.points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}
