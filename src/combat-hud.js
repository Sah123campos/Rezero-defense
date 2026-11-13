import * as THREE from '../vendor/three.module.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalColor = '#43f27b';

/** Screen-space combat feedback. Sizes stay readable when the camera zooms out. */
export class CombatHUD {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.entries = new Map();
    this.damageActive = [];
    this.damagePool = [];
    this.positioned = [];
    this.projector = new THREE.Vector3();
    this.worldPosition = new THREE.Vector3();
    this.bounds = new THREE.Box3();
    this.frame = 0;
    this.serial = 0;
    this.mobile = this.isMobile();
    this.layer = document.createElement('div');
    this.layer.className = 'combat-hud';
    this.layer.setAttribute('aria-hidden', 'true');
    Object.assign(this.layer.style, {
      position: 'absolute', inset: '0', overflow: 'hidden',
      pointerEvents: 'none', zIndex: '4',
    });
    container.append(this.layer);
  }

  isMobile() {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse), (max-width: 760px)').matches
      : window.innerWidth <= 760;
  }

  add(enemy) {
    if (!enemy?.group || enemy.id === undefined || this.entries.has(enemy.id))
      return this.entries.get(enemy?.id);
    const element = document.createElement('div');
    element.className = `enemy-health${enemy.boss ? ' enemy-health-boss' : ''}`;
    element.dataset.enemyId = String(enemy.id);
    element.dataset.enemyType = enemy.type || 'shade';
    const fill = document.createElement('span');
    fill.className = 'enemy-health-fill';
    const label = document.createElement('span');
    label.className = 'enemy-health-label';
    Object.assign(element.style, {
      position: 'absolute', left: '0', top: '0', boxSizing: 'border-box',
      border: '2px solid var(--enemy-health-border, #07152b)',
      borderRadius: '5px', background: 'var(--enemy-health-background, #10213c)',
      boxShadow: '0 2px 0 #0007, 0 0 0 1px #ffffff33',
      overflow: 'hidden', pointerEvents: 'none', visibility: 'hidden',
    });
    Object.assign(fill.style, {
      position: 'absolute', left: '0', top: '0', bottom: '0', width: '100%',
      background: `var(--enemy-health-healthy, ${normalColor})`,
      boxShadow: 'inset 0 2px 0 #ffffff40',
      transition: 'width 90ms linear',
    });
    Object.assign(label.style, {
      position: 'absolute', inset: '0', display: 'grid', placeItems: 'center',
      color: 'var(--enemy-health-text, #ffffff)',
      fontFamily: 'Arial, sans-serif', fontWeight: '900', lineHeight: '1',
      textShadow: '-1px 0 #061020, 1px 0 #061020, 0 -1px #061020, 0 1px #061020',
      whiteSpace: 'nowrap',
    });
    element.append(fill, label);
    this.layer.append(element);
    // Measure the actual hood/horns once, rather than assuming one enemy height.
    this.bounds.setFromObject(enemy.group);
    enemy.group.getWorldPosition(this.worldPosition);
    const head = this.bounds.isEmpty()
      ? 1.5 : Math.max(0.7, this.bounds.max.y - this.worldPosition.y);
    const record = {
      enemy, element, fill, label, boss: !!enemy.boss, headOffset: head + 0.18,
      flash: 0, seen: 0, screenX: 0, screenY: 0,
      staggerOrder: Number.isFinite(enemy.id) ? enemy.id % 2 : this.serial++ % 2,
    };
    this.resizeEntry(record);
    this.entries.set(enemy.id, record);
    this.refresh(record, enemy);
    return record;
  }

  resizeEntry(record) {
    record.width = record.boss ? 84 : this.mobile ? 44 : 54;
    record.height = record.boss ? 16 : this.mobile ? 12 : 13;
    record.element.style.width = `var(--enemy-health-width, ${record.width}px)`;
    record.element.style.height = `var(--enemy-health-height, ${record.height}px)`;
    record.label.style.fontSize = record.boss ? '9px' : this.mobile ? '8px' : '8.5px';
  }

  refresh(record, enemy) {
    const maxHp = Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 ? enemy.maxHp : 1;
    const hp = Number.isFinite(enemy.hp) ? Math.max(0, enemy.hp) : 0;
    const ratio = clamp(hp / maxHp, 0, 1);
    record.element.dataset.ratio = ratio.toFixed(4);
    record.element.dataset.hp = String(Math.ceil(hp));
    record.element.dataset.maxHp = String(Math.ceil(maxHp));
    record.fill.style.width = `${ratio * 100}%`;
    record.fill.style.background = ratio <= 0.25
      ? 'var(--enemy-health-critical, #ff496a)'
      : ratio <= 0.5 ? 'var(--enemy-health-warning, #ffda46)'
        : `var(--enemy-health-healthy, ${normalColor})`;
    record.element.classList.toggle('is-critical', ratio <= 0.25);
    record.element.classList.toggle('is-wounded', ratio <= 0.5 && ratio > 0.25);
    record.label.textContent = record.boss
      ? `${Math.ceil(hp)} / ${Math.ceil(maxHp)}` : String(Math.ceil(hp));
  }

  remove(enemy) {
    const id = enemy && typeof enemy === 'object' ? enemy.id : enemy;
    const record = this.entries.get(id);
    if (!record) return;
    record.element.remove();
    this.entries.delete(id);
  }

  damage(enemy, value, color) {
    const record = this.entries.get(enemy?.id) || this.add(enemy);
    if (!record) return;
    this.refresh(record, enemy);
    record.flash = 0.18;
    record.element.classList.add('is-hit');
    record.fill.style.filter = 'brightness(1.7)';
    if (!Number.isFinite(value) || value <= 0) return;
    const limit = this.mobile ? 20 : 45;
    let number;
    if (this.damageActive.length >= limit) number = this.damageActive.shift();
    else number = this.damagePool.pop();
    if (!number) {
      const element = document.createElement('span');
      element.className = 'combat-damage';
      Object.assign(element.style, {
        position: 'absolute', left: '0', top: '0', pointerEvents: 'none',
        whiteSpace: 'nowrap', fontFamily: 'Arial, sans-serif', fontWeight: '900',
        lineHeight: '1', zIndex: '2',
        textShadow: '-1px -1px 0 #0a112c, 1px -1px 0 #0a112c, -1px 1px 0 #0a112c, 1px 1px 0 #0a112c, 0 2px 2px #000b',
      });
      this.layer.append(element);
      number = { element };
    }
    enemy.group.getWorldPosition(this.worldPosition);
    number.x = this.worldPosition.x;
    number.y = this.worldPosition.y + record.headOffset * 0.72;
    number.z = this.worldPosition.z;
    number.life = number.total = 0.75;
    number.drift = ((this.serial++ % 5) - 2) * 5;
    number.element.textContent = `−${Math.max(1, Math.round(value))}`;
    number.element.style.color = color || (value >= 100 ? '#ffe46b' : '#fffef2');
    number.element.style.fontSize = this.mobile ? '14px' : '16px';
    number.element.style.display = 'block';
    number.element.style.visibility = 'hidden';
    number.element.style.opacity = '1';
    this.damageActive.push(number);
  }

  update(dt, enemies = []) {
    if (!this.container || !this.camera) return;
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const mobile = this.isMobile();
    if (mobile !== this.mobile) {
      this.mobile = mobile;
      for (const record of this.entries.values()) this.resizeEntry(record);
    }
    const rect = this.container.getBoundingClientRect();
    const width = rect.width, height = rect.height;
    if (width < 2 || height < 2) {
      this.layer.style.visibility = 'hidden';
      return;
    }
    this.layer.style.visibility = 'visible';
    this.camera.updateMatrixWorld();
    this.frame++;
    this.positioned.length = 0;
    for (const enemy of enemies) {
      if (!enemy?.group || enemy.dead || enemy.hp <= 0) continue;
      const record = this.entries.get(enemy.id) || this.add(enemy);
      record.seen = this.frame;
      this.refresh(record, enemy);
      record.flash = Math.max(0, record.flash - elapsed);
      if (!record.flash) {
        record.element.classList.remove('is-hit');
        record.fill.style.filter = '';
      }
      enemy.group.getWorldPosition(this.worldPosition);
      this.projector.copy(this.worldPosition);
      this.projector.y += record.headOffset;
      this.projector.project(this.camera);
      const px = (this.projector.x + 1) * width / 2;
      const py = (1 - this.projector.y) * height / 2;
      if (this.projector.z < -1 || this.projector.z > 1 || px < 0 || px > width || py < 0 || py > height) {
        record.element.style.visibility = 'hidden';
        continue;
      }
      const x = clamp(px, record.width / 2 + 2, width - record.width / 2 - 2);
      const baseY = clamp(py, record.height + 2, height - 2);
      let bestY = baseY, leastOverlap = Infinity;
      // Keep clustered labels near their owners: no staggering beyond 16px.
      const direction = record.staggerOrder ? 1 : -1;
      for (let candidate = 0; candidate < 5; candidate++) {
        const offset = candidate === 0 ? 0
          : Math.ceil(candidate / 2) * 8 * (candidate % 2 ? direction : -direction);
        const y = clamp(baseY + offset, record.height + 2, height - 2);
        let overlap = 0;
        for (const other of this.positioned)
          if (Math.abs(x - other.screenX) < (record.width + other.width) / 2 + 2 &&
              Math.abs(y - other.screenY) < (record.height + other.height) / 2 + 2)
            overlap++;
        if (overlap < leastOverlap) { leastOverlap = overlap; bestY = y; }
        if (!overlap) break;
      }
      record.screenX = x;
      record.screenY = bestY;
      record.element.style.transform = `translate3d(${x.toFixed(1)}px,${bestY.toFixed(1)}px,0) translate(-50%,-100%)`;
      record.element.style.visibility = 'visible';
      this.positioned.push(record);
    }
    for (const [id, record] of this.entries)
      if (record.seen !== this.frame) this.remove(id);
    const limit = this.mobile ? 20 : 45;
    for (let i = this.damageActive.length - 1; i >= 0; i--) {
      const number = this.damageActive[i];
      number.life -= elapsed;
      if (number.life <= 0 || i >= limit) {
        number.element.style.display = 'none';
        this.damageActive.splice(i, 1);
        this.damagePool.push(number);
        continue;
      }
      const progress = 1 - number.life / number.total;
      this.projector.set(number.x, number.y, number.z).project(this.camera);
      const x = (this.projector.x + 1) * width / 2 + number.drift * progress;
      const y = (1 - this.projector.y) * height / 2 - progress * 34;
      if (this.projector.z < -1 || this.projector.z > 1 || x < 0 || x > width || y < 0 || y > height) {
        number.element.style.visibility = 'hidden';
        continue;
      }
      number.element.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
      number.element.style.visibility = 'visible';
      number.element.style.opacity = String(Math.min(1, number.life / 0.22));
    }
  }

  clear() {
    for (const record of this.entries.values()) record.element.remove();
    this.entries.clear();
    for (const number of this.damageActive) {
      number.element.style.display = 'none';
      this.damagePool.push(number);
    }
    this.damageActive.length = 0;
    this.positioned.length = 0;
  }

  dispose() {
    this.clear();
    this.layer.remove();
    this.damagePool.length = 0;
    this.camera = null;
    this.container = null;
  }
}

export default CombatHUD;
