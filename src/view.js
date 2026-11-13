import * as THREE from "../vendor/three.module.js?v=2.1.0";
import { createWorld, animateWorld, MAPS } from "./world.js?v=2.1.0";
import { createHero, animateHero, animateEnemy } from "./models.js?v=2.1.0";
import { CombatEffects } from "./combat-effects.js?v=2.1.0";

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
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x122b62, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Diorama tridimensional de Lugunica",
    );
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xbbe5ff, 0x496932, 1.3));
    this.sun = new THREE.DirectionalLight(0xffedc9, 2.7);
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
    const fill = new THREE.DirectionalLight(0xb3caff, 0.7);
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
    this.visuals = new CombatEffects(this.fx, this.camera);
    this.portraitCache = new Map();
    this.menuMotion = 0;
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
    this.sun.shadow.mapSize.set(this.low ? 512 : 2048, this.low ? 512 : 2048);
    this.visuals.low = this.low;
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
  selection(tower) {
    this.range.visible = !!tower;
    this.marker.visible = !!tower;
    if (tower) {
      this.range.children.forEach((m) => m.material.color.setHex(0xc1ecce));
      this.range.position.set(tower.x, 0.08, tower.z);
      this.range.scale.set(tower.stats.range, 1, tower.stats.range);
      this.marker.position.set(tower.x, 0.12, tower.z);
    }
  }
  placement(x, z, radius, valid) {
    this.range.visible = true;
    this.range.position.set(x, 0.08, z);
    this.range.scale.set(radius, 1, radius);
    const col = valid ? 0x9be6c2 : 0xef8f83;
    this.range.children.forEach((m) => m.material.color.setHex(col));
    this.marker.visible = false;
  }
  get effects() {
    return this.visuals.effects;
  }
  clearEffects() {
    this.visuals.clear();
  }
  burst(...args) {
    this.visuals.burst(...args);
  }
  shockwave(...args) {
    this.visuals.shockwave(...args);
  }
  projectile(...args) {
    return this.visuals.projectile(...args);
  }
  removeProjectile(mesh) {
    this.visuals.removeProjectile(mesh);
  }
  attackCue(tower, enemy) {
    this.visuals.attack(tower, enemy);
  }
  impact(enemy, color) {
    this.visuals.impact(enemy, color);
  }
  blizzard(towers) {
    this.visuals.blizzard(towers);
  }
  update(dt, towers = [], enemies = [], preview = []) {
    this.time += dt;
    if (this.world) animateWorld(this.world, this.time);
    for (const t of [...towers, ...preview]) {
      t.attack = Math.max(0, (t.attack || 0) - dt / 0.42);
      animateHero(t.group, this.time, t.attack);
    }
    for (const e of enemies)
      if (!e.dead) animateEnemy(e.group, this.time, true);
    this.visuals.update(dt);
    if (this.portal) {
      this.portal.visible = this.screen === "menu";
      if (this.portal.visible) {
        this.portal.position.y = 3.1 + Math.sin(this.time * 0.9) * 0.14;
        this.portal.children.forEach((child, i) => {
          if (child.userData.orbit)
            child.rotation.z = this.time * (i % 2 ? -0.13 : 0.18);
        });
      }
    }
    if (this.screen === "menu" && preview.length) {
      this.menuMotion += dt;
      if (this.menuMotion > 2.8) {
        this.menuMotion = 0;
        const t = preview[Math.floor(this.time / 2.8) % preview.length];
        t.attack = 1;
        this.burst(t.group.position.x, t.group.position.z, 0x6eefff, 6, 0.7);
      }
    }
  }
  showcase() {
    if (this.portal) return;
    this.portal = new THREE.Group();
    this.portal.position.set(0.8, 3.1, -2.8);
    this.portal.rotation.y = 0.35;
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          2.4 + i * 0.15,
          i === 1 ? 0.055 : 0.025,
          6,
          100,
        ),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xc47aff : 0x65e9ff,
          transparent: true,
          opacity: 0.7,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      ring.userData.orbit = true;
      for (let j = 0; j < 12; j++) {
        const rune = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.075),
          new THREE.MeshBasicMaterial({
            color: i === 1 ? 0xf8d768 : 0xb8faff,
            toneMapped: false,
          }),
        );
        const a = (j * Math.PI) / 6;
        rune.position.set(
          Math.cos(a) * (2.4 + i * 0.15),
          Math.sin(a) * (2.4 + i * 0.15),
          0,
        );
        ring.add(rune);
      }
      this.portal.add(ring);
    }
    const glow = this.visuals.sprite(0x4268ff, 7, 0.65);
    this.portal.add(glow);
    this.scene.add(this.portal);
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  portrait(key, levels = [0, 0, 0]) {
    const cacheKey = key + ":" + levels.join(",");
    if (!this.portraitCache.has(cacheKey)) this.portraits([key], levels);
    return this.portraitCache.get(cacheKey);
  }
  portraits(keys, levels = [0, 0, 0]) {
    const width = this.renderer.domElement.width,
      height = this.renderer.domElement.height,
      pixel = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(300, 300, false);
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xcceaff, 0x50476d, 1.4));
    const light = new THREE.DirectionalLight(0xfff2df, 2.6);
    light.position.set(-3, 7, 5);
    s.add(light);
    const camera = new THREE.OrthographicCamera(
      -1.12,
      1.12,
      1.4,
      -1.4,
      0.1,
      30,
    );
    camera.position.set(2.3, 2.8, 8);
    camera.lookAt(0, 1.2, 0);
    const images = {};
    for (const key of keys) {
      const g = createHero(key, levels);
      s.add(g);
      this.renderer.render(s, camera);
      images[key] = this.renderer.domElement.toDataURL("image/png");
      this.portraitCache.set(key + ":" + levels.join(","), images[key]);
      s.remove(g);
    }
    this.renderer.setPixelRatio(pixel);
    this.renderer.setSize(width / pixel, height / pixel, false);
    this.resize();
    return images;
  }
}
export { THREE, MAPS };
