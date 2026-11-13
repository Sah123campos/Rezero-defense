import * as THREE from "../vendor/three.module.js";
import { createWorld, animateWorld, MAPS } from "./world.js";
import { createHero, animateHero, animateEnemy } from "./models.js";

export class GameView {
  constructor(container, quality = "auto") {
    this.container = container;
    this.quality = quality;
    this.time = 0;
    this.screen = "menu";
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xe9eee4, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Diorama tridimensional de Lugunica",
    );
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x576c40, 1.05));
    this.sun = new THREE.DirectionalLight(0xffe3ad, 3.1);
    this.sun.position.set(-10, 22, 13);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
      near: 0.5,
      far: 65,
    });
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.00015;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0xc4dfff, 0.55);
    fill.position.set(12, 10, -9);
    this.scene.add(fill);
    this.camera = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 150);
    this.camera.position.set(12, 22, 27);
    this.camera.lookAt(0, 0, 0);
    this.actors = new THREE.Group();
    this.fx = new THREE.Group();
    this.scene.add(this.actors, this.fx);
    const rangeMat = new THREE.MeshBasicMaterial({
      color: 0xc1ecce,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.range = new THREE.Group();
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 80), rangeMat);
    disk.rotation.x = -Math.PI / 2;
    this.range.add(disk);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 80),
      new THREE.MeshBasicMaterial({
        color: 0xf3fff2,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.range.add(ring);
    this.range.visible = false;
    this.scene.add(this.range);
    this.marker = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.025, 4, 32, Math.PI / 3),
        new THREE.MeshBasicMaterial({ color: 0xf7f5c5 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = (i * Math.PI) / 2;
      this.marker.add(mesh);
    }
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.effects = [];
    this.effectGeometry = new THREE.OctahedronGeometry(0.09);
    this.effectMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
    });
    this.setQuality(quality);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }
  setQuality(value) {
    this.quality = value;
    this.low =
      value === "low" ||
      (value === "auto" &&
        (navigator.hardwareConcurrency <= 4 || innerWidth < 650));
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, this.low ? 1.15 : 1.75),
    );
    this.renderer.shadowMap.enabled = !this.low;
    const shadowSize = this.low ? 512 : 2048;
    if (this.sun.shadow.mapSize.x !== shadowSize && this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    // Rebuild scenery too: leaf and grass density are part of the quality preset.
    if (this.world) this.setWorld(this.mapIndex);
    this.resize();
  }
  setWorld(index) {
    if (this.world) {
      this.scene.remove(this.world);
      if (this.world.userData.dispose) this.world.userData.dispose();
    }
    this.world = createWorld(index, this.low ? "low" : "high");
    this.scene.add(this.world);
    this.mapIndex = index;
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    const ratio = width / height;
    const h = Math.max(9.3, 15 / ratio);
    this.camera.left = -h * ratio;
    this.camera.right = h * ratio;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }
  setScreen(screen) {
    this.screen = screen;
    this.resetCamera();
    this.resize();
  }
  resetCamera() {
    this.camera.position.set(12, 22, 27);
    this.camera.lookAt(0, 0, 0);
    this.camera.zoom = 1;
    this.panX = 0;
    this.panZ = 0;
    this.camera.updateProjectionMatrix();
  }
  zoom(delta) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + delta, 1, 1.8);
    if (this.camera.zoom === 1) this.resetCamera();
    this.camera.updateProjectionMatrix();
  }
  pan(dx, dy) {
    if (this.camera.zoom <= 1) return;
    const rect = this.container.getBoundingClientRect(),
      factor =
        (this.camera.right - this.camera.left) /
        (rect.width * this.camera.zoom);
    const right = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      0,
    );
    const back = new THREE.Vector3(12, 0, 27).normalize();
    const nx = THREE.MathUtils.clamp(
        (this.panX || 0) - right.x * dx * factor + (back.x * dy * factor) / 0.7,
        -5,
        5,
      ),
      nz = THREE.MathUtils.clamp(
        (this.panZ || 0) - right.z * dx * factor + (back.z * dy * factor) / 0.7,
        -4,
        4,
      );
    this.camera.position.x = 12 + nx;
    this.camera.position.z = 27 + nz;
    this.panX = nx;
    this.panZ = nz;
    this.camera.updateMatrixWorld();
  }

  point(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    return this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
  }
  project(x, z) {
    const v = new THREE.Vector3(x, 0, z).project(this.camera),
      r = this.container.getBoundingClientRect();
    return {
      x: r.left + ((v.x + 1) / 2) * r.width,
      y: r.top + ((1 - v.y) / 2) * r.height,
    };
  }
  clearPlacementGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    for (const mat of this.ghostMaterials) mat.dispose();
    this.ghost = null;
    this.ghostMaterials = [];
    this.ghostKey = null;
  }
  pickTower(event, towers) {
    // A model's head and weapon are selectable, even when its feet are far below
    // the pointer in the isometric projection. Fall back to ground hit for touch.
    this.point(event);
    const hits = this.raycaster.intersectObjects(
      towers.map((t) => t.group),
      true,
    );
    for (const hit of hits) {
      let node = hit.object;
      while (node && node.parent !== this.actors) node = node.parent;
      const tower = towers.find((t) => t.group === node);
      if (tower) return tower;
    }
    const p = this.point(event);
    return p
      ? towers.find((t) => Math.hypot(p.x - t.x, p.z - t.z) < 0.9)
      : null;
  }
  selection(tower) {
    this.clearPlacementGhost();
    this.range.visible = !!tower;
    this.marker.visible = !!tower;
    if (tower) {
      this.range.children.forEach((m) => m.material.color.setHex(0xc1ecce));
      this.range.position.set(tower.x, 0.08, tower.z);
      this.range.scale.set(tower.stats.range, 1, tower.stats.range);
      this.marker.position.set(tower.x, 0.12, tower.z);
    }
  }
  placement(x, z, radius, valid, key) {
    if (key && this.ghostKey !== key) {
      this.clearPlacementGhost();
      this.ghost = createHero(key);
      this.ghostKey = key;
      this.ghostMaterials = [];
      const mats = new Map();
      this.ghost.traverse((o) => {
        if (!o.isMesh) return;
        if (!mats.has(o.material)) {
          const mat = o.material.clone();
          mat.transparent = true;
          mat.opacity = 0.46;
          mat.depthWrite = false;
          mats.set(o.material, mat);
          this.ghostMaterials.push(mat);
        }
        o.material = mats.get(o.material);
        o.castShadow = false;
      });
      this.ghost.rotation.y = 0.25;
      this.scene.add(this.ghost);
    }
    if (this.ghost) this.ghost.position.set(x, 0.025, z);
    this.range.visible = true;
    this.range.position.set(x, 0.08, z);
    this.range.scale.set(radius, 1, radius);
    const col = valid ? 0x9be6c2 : 0xef8f83;
    this.range.children.forEach((m) => m.material.color.setHex(col));
    this.marker.visible = false;
  }
  clearEffects() {
    for (const e of this.effects) {
      this.fx.remove(e.mesh);
      if (e.ownedGeometry) e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.effects = [];
  }
  burst(x, z, color, count = 12, force = 1) {
    for (
      let i = 0;
      i < count && this.effects.length < (this.low ? 65 : 150);
      i++
    ) {
      const mesh = new THREE.Mesh(
        this.effectGeometry,
        this.effectMaterial.clone(),
      );
      mesh.material.color.set(color);
      mesh.position.set(x, 0.6 + Math.random(), z);
      this.fx.add(mesh);
      this.effects.push({
        mesh,
        life: 0.6 + Math.random() * 0.4,
        max: 1,
        vx: (Math.random() - 0.5) * 3 * force,
        vy: 1 + Math.random() * 3 * force,
        vz: (Math.random() - 0.5) * 3 * force,
      });
    }
  }
  shockwave(x, z, color, radius = 2) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    this.fx.add(mesh);
    this.effects.push({
      mesh,
      life: 0.65,
      max: 0.65,
      ring: true,
      radius,
      ownedGeometry: true,
    });
  }
  projectile(tower, target) {
    const color = tower.def.color,
      key = tower.key;
    let geometry;
    if (key === "emilia") geometry = new THREE.OctahedronGeometry(0.19);
    else if (key === "subaru")
      geometry = new THREE.BoxGeometry(0.06, 0.08, 0.42);
    else if (key === "rem") geometry = new THREE.IcosahedronGeometry(0.22);
    else geometry = new THREE.TorusGeometry(0.15, 0.05, 5, 10);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      }),
    );
    mesh.position.set(tower.x, 1.45, tower.z);
    this.fx.add(mesh);
    return mesh;
  }
  removeProjectile(mesh) {
    this.fx.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  update(dt, towers = [], enemies = [], preview = []) {
    this.time += dt;
    if (this.ghost) animateHero(this.ghost, this.time);
    if (this.world) animateWorld(this.world, this.time);
    for (const t of [...towers, ...preview])
      animateHero(t.group, this.time, t.attack || 0);
    for (const e of enemies)
      if (!e.dead) animateEnemy(e.group, this.time, true);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.fx.remove(e.mesh);
        if (e.ownedGeometry) e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      e.mesh.material.opacity = Math.min(1, e.life * 1.5);
      if (e.ring) {
        const s = e.radius * (1 - e.life / e.max) + 0.2;
        e.mesh.scale.setScalar(s);
      } else {
        e.mesh.position.x += e.vx * dt;
        e.mesh.position.y += e.vy * dt;
        e.mesh.position.z += e.vz * dt;
        e.vy -= 4 * dt;
        e.mesh.rotation.x += dt * 2;
        e.mesh.rotation.z += dt;
      }
    }
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  portraits(keys) {
    const width = this.renderer.domElement.width,
      height = this.renderer.domElement.height,
      pixel = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(300, 300, false);
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xeef6ff, 0x8d8170, 1.7));
    const light = new THREE.DirectionalLight(0xffeed7, 2.7);
    light.position.set(-3, 7, 5);
    s.add(light);
    const camera = new THREE.OrthographicCamera(
      -1.12,
      1.12,
      1.25,
      -1.25,
      0.1,
      30,
    );
    camera.position.set(2.3, 2.8, 8);
    camera.lookAt(0, 1.05, 0);
    const images = {};
    for (const key of keys) {
      const g = createHero(key);
      s.add(g);
      this.renderer.render(s, camera);
      images[key] = this.renderer.domElement.toDataURL("image/png");
      s.remove(g);
    }
    this.renderer.setPixelRatio(pixel);
    this.renderer.setSize(width / pixel, height / pixel, false);
    this.resize();
    return images;
  }
}
export { THREE, MAPS };
