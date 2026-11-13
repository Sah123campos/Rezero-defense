import * as THREE from "../vendor/three.module.js?v=2.1.0";
import { getAttackOrigin } from "./models.js?v=2.1.0";

const COLORS = {
  emilia: 0x26e9ff,
  rem: 0x38a8ff,
  beatrice: 0xe557ff,
  subaru: 0xffc52e,
};
const UP = new THREE.Vector3(0, 1, 0);
function disposeObject(object, geometry = true) {
  const materials = new Set();
  object.traverse((node) => {
    if (geometry && node.isMesh) node.geometry.dispose();
    if (node.material)
      for (const m of Array.isArray(node.material)
        ? node.material
        : [node.material])
        materials.add(m);
  });
  for (const m of materials) m.dispose();
}
function unlit(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.17, "rgba(255,255,255,.85)");
  gradient.addColorStop(0.45, "rgba(255,255,255,.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Visible attack feedback uses real animation time; combat still uses fixed game time. */
export class CombatEffects {
  constructor(group, camera) {
    this.group = group;
    this.camera = camera;
    this.effects = [];
    this.projectiles = new Set();
    this.glow = glowTexture();
    this.particleGeometry = new THREE.OctahedronGeometry(0.13);
    this.flashMaterials = new Map();
    this.flashes = new Map();
    this.time = 0;
    this.low = false;
  }
  get limit() {
    return this.low ? 85 : 180;
  }
  sprite(color, size = 1, opacity = 0.8) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.scale.setScalar(size);
    return sprite;
  }
  add(mesh, life, kind = "fade", extra = {}) {
    if (this.effects.length >= this.limit) {
      disposeObject(mesh, extra.sharedGeometry !== true);
      return null;
    }
    const materials = [];
    mesh.traverse((node) => {
      if (node.material)
        materials.push({
          material: node.material,
          opacity: node.material.opacity,
        });
    });
    this.group.add(mesh);
    const e = { mesh, life, max: life, kind, materials, ...extra };
    this.effects.push(e);
    return e;
  }
  remove(effect) {
    this.group.remove(effect.mesh);
    disposeObject(effect.mesh, !effect.sharedGeometry);
  }
  clear() {
    for (const effect of this.effects) this.remove(effect);
    this.effects = [];
    for (const mesh of [...this.projectiles]) this.removeProjectile(mesh);
    for (const f of this.flashes.values()) this.restoreFlash(f);
    this.flashes.clear();
  }
  burst(x, z, color, count = 12, force = 1) {
    for (let i = 0; i < count && this.effects.length < this.limit; i++) {
      const mesh = new THREE.Mesh(
        this.particleGeometry,
        unlit(i % 3 === 0 ? 0xffffff : color),
      );
      mesh.position.set(x, 0.7 + Math.random() * 0.6, z);
      mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      this.add(mesh, 0.4 + Math.random() * 0.35, "particle", {
        sharedGeometry: true,
        vx: (Math.random() - 0.5) * 4 * force,
        vy: 1 + Math.random() * 3.8 * force,
        vz: (Math.random() - 0.5) * 4 * force,
      });
    }
  }
  shockwave(x, z, color, radius = 2) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40),
      unlit(color, 0.85),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.12, z);
    this.add(mesh, 0.42, "ring", { radius });
  }
  projectile(tower, target) {
    const color = COLORS[tower.key],
      group = new THREE.Group();
    group.name = `projectile-${tower.key}`;
    group.userData.projectile = true;
    group.userData.key = tower.key;
    group.userData.trail = 0;
    group.position.copy(getAttackOrigin(tower.group, new THREE.Vector3()));
    let shape;
    if (tower.key === "emilia") {
      shape = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.3),
        unlit(0xbdfaff),
      );
      shape.scale.set(0.7, 1.7, 0.7);
    } else if (tower.key === "rem") {
      shape = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.32, 1),
        new THREE.MeshStandardMaterial({
          color: 0x303e66,
          metalness: 0.65,
          roughness: 0.24,
        }),
      );
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.1, 0.25, 5),
          unlit(0xc4eeff),
        );
        spike.position.set(
          Math.cos((i * Math.PI) / 3) * 0.3,
          Math.sin((i * Math.PI) / 3) * 0.3,
          0,
        );
        spike.rotation.z = (i * Math.PI) / 3 - Math.PI / 2;
        group.add(spike);
      }
    } else if (tower.key === "beatrice") {
      shape = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.075, 5, 18),
        unlit(color),
      );
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.15),
        unlit(0xffffff),
      );
      group.add(core);
    } else {
      shape = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.7, 4),
        unlit(0xfff5b0),
      );
      shape.rotation.x = Math.PI / 2;
    }
    group.add(shape);
    group.add(this.sprite(color, 1.1, 0.6));
    this.group.add(group);
    this.projectiles.add(group);
    return group;
  }
  removeProjectile(mesh) {
    if (!this.projectiles.has(mesh)) return;
    this.projectiles.delete(mesh);
    this.group.remove(mesh);
    disposeObject(mesh);
  }
  attack(tower, target) {
    const color = COLORS[tower.key],
      start = getAttackOrigin(tower.group, new THREE.Vector3()),
      end = target.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    const midpoint = start.clone().lerp(end, 0.5);
    midpoint.y += tower.key === "rem" ? 0.9 : 0.3;
    const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
    const group = new THREE.Group();
    group.name = `attack-trace-${tower.key}`;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        12,
        tower.key === "subaru" ? 0.065 : 0.045,
        4,
        false,
      ),
      unlit(color, 0.72),
    );
    group.add(tube);
    if (tower.key === "emilia" || tower.key === "subaru") {
      const core = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 10, 0.018, 3, false),
        unlit(0xffffff, 0.9),
      );
      group.add(core);
    }
    const muzzle = this.sprite(color, 1.1, 0.8);
    muzzle.position.copy(start);
    group.add(muzzle);
    this.add(group, 0.3, "fade");
    if (tower.key === "beatrice") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.045, 5, 28),
        unlit(color),
      );
      ring.position.copy(start);
      ring.quaternion.copy(this.camera.quaternion);
      this.add(ring, 0.36, "portal");
    }
    if (tower.key === "rem" || tower.key === "subaru") {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.06, 4, 24, Math.PI * 1.35),
        unlit(tower.key === "rem" ? 0x5db9ff : 0xffd440, 0.95),
      );
      arc.position.copy(start);
      arc.quaternion.copy(this.camera.quaternion);
      arc.rotation.z += tower.key === "rem" ? 0.5 : -0.6;
      this.add(arc, 0.33, "slash");
    }
  }
  restoreFlash(f) {
    for (const { mesh, material } of f.parts) mesh.material = material;
  }
  impact(enemy, color) {
    const pos = enemy.group.position;
    const flash = this.sprite(color, 1.7, 0.95);
    flash.position.set(pos.x, 1, pos.z);
    this.add(flash, 0.22, "pop");
    this.burst(pos.x, pos.z, color, 5, 1.2);
    let f = this.flashes.get(enemy.id);
    if (!f) {
      if (this.flashes.size >= 60) {
        const [id, old] = this.flashes.entries().next().value;
        this.restoreFlash(old);
        this.flashes.delete(id);
      }
      const parts = [];
      enemy.group.traverse((mesh) => {
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        parts.push({ mesh, material: mesh.material });
      });
      f = { enemy, parts, life: 0 };
      this.flashes.set(enemy.id, f);
    }
    f.life = 0.11;
    for (const part of f.parts) {
      let flashMaterial = this.flashMaterials.get(part.material.uuid);
      if (!flashMaterial) {
        flashMaterial = new THREE.MeshBasicMaterial({
          color: 0xfff9ce,
          toneMapped: false,
          side: part.material.side,
        });
        this.flashMaterials.set(part.material.uuid, flashMaterial);
      }
      part.mesh.material = flashMaterial;
    }
  }
  blizzard(towers) {
    for (const tower of towers.filter((t) => t.key === "emilia")) {
      this.shockwave(tower.x, tower.z, 0x37edff, 6);
      this.shockwave(tower.x, tower.z, 0xffffff, 4);
      for (let i = 0; i < 18; i++) {
        const snow = new THREE.Mesh(
          this.particleGeometry,
          unlit(i % 2 ? 0x4ae7ff : 0xffffff),
        );
        snow.position.set(
          tower.x + (Math.random() - 0.5) * 9,
          2 + Math.random() * 4,
          tower.z + (Math.random() - 0.5) * 9,
        );
        snow.scale.set(0.7, 2, 0.7);
        this.add(snow, 1.2, "particle", {
          sharedGeometry: true,
          vx: 0.4,
          vy: -2.3,
          vz: 0.2,
        });
      }
    }
  }
  update(dt) {
    this.time += dt;
    for (const [id, f] of this.flashes) {
      f.life -= dt;
      if (f.life <= 0 || f.enemy.dead) {
        this.restoreFlash(f);
        this.flashes.delete(id);
      }
    }
    for (const p of this.projectiles) {
      p.userData.trail += dt;
      p.children[0].rotation.y += dt * 8;
      if (p.userData.trail > 0.025) {
        p.userData.trail = 0;
        const ghost = this.sprite(COLORS[p.userData.key], 0.7, 0.55);
        ghost.position.copy(p.position);
        this.add(ghost, 0.27, "ghost");
      }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.remove(e);
        this.effects.splice(i, 1);
        continue;
      }
      const ratio = e.life / e.max;
      for (const m of e.materials)
        m.material.opacity = m.opacity * Math.min(1, ratio * 1.6);
      if (e.kind === "particle") {
        e.mesh.position.x += e.vx * dt;
        e.mesh.position.y += e.vy * dt;
        e.mesh.position.z += e.vz * dt;
        e.vy -= dt * 3;
        e.mesh.rotation.x += dt * 3;
        e.mesh.rotation.z += dt * 4;
      } else if (e.kind === "ring") {
        const s = 0.3 + (1 - ratio) * e.radius;
        e.mesh.scale.setScalar(s);
      } else if (e.kind === "pop") {
        e.mesh.scale.setScalar(1.3 + (1 - ratio) * 1.1);
      } else if (e.kind === "ghost") {
        e.mesh.scale.setScalar(0.2 + ratio * 0.5);
      } else if (e.kind === "slash") {
        e.mesh.rotation.z += dt * 3;
        e.mesh.scale.setScalar(0.8 + (1 - ratio) * 0.5);
      } else if (e.kind === "portal") {
        e.mesh.rotation.z += dt * 4;
        e.mesh.scale.setScalar(0.65 + Math.sin(ratio * Math.PI) * 0.4);
      }
    }
  }
}
