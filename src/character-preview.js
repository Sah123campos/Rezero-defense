import * as THREE from "../vendor/three.module.js";
import { createHero, animateHero } from "./models.js";

// A modal owns this renderer. Disposing the renderer releases its GPU buffers;
// immutable character templates remain owned by the shared model cache.
export class CharacterPreview {
  constructor(container, key, low = false) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Modelo 3D: arraste para girar",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xddecff, 0x8b7761, 1.25));
    const sun = new THREE.DirectionalLight(0xffe7c1, 2.9);
    sun.position.set(-3, 7, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xc5eaff, 1.3);
    rim.position.set(2, 3, -3);
    this.scene.add(rim);
    this.hero = createHero(key);
    this.hero.rotation.y = 0.15;
    this.scene.add(this.hero);
    this.camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.25, -1.25, 0.1, 30);
    this.camera.position.set(0, 2.1, 7);
    this.camera.lookAt(0, 1.08, 0);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.78, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0xb5be9b, roughness: 0.9 }),
    );
    disc.position.y = -0.035;
    this.scene.add(disc);
    this.disc = disc;
    this.attack = 0;
    this.time = 0;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    const canvas = this.renderer.domElement;
    let pointer = null;
    canvas.onpointerdown = (e) => {
      pointer = { id: e.pointerId, x: e.clientX };
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (pointer?.id !== e.pointerId) return;
      this.rotate((e.clientX - pointer.x) * 0.015);
      pointer.x = e.clientX;
    };
    canvas.onpointerup = canvas.onpointercancel = () => {
      pointer = null;
    };
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!document.hidden) {
        this.time += dt;
        this.attack = Math.max(0, this.attack - dt * 2);
        animateHero(this.hero, this.time, this.attack);
        this.renderer.render(this.scene, this.camera);
      }
      this.frame = requestAnimationFrame(frame);
    };
    this.resize();
    this.frame = requestAnimationFrame(frame);
  }
  rotate(delta) {
    this.hero.rotation.y += delta;
  }
  strike() {
    this.attack = 1;
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height, false);
    const half = (1.25 * width) / height;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.updateProjectionMatrix();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.onpointerdown =
      canvas.onpointermove =
      canvas.onpointerup =
      canvas.onpointercancel =
        null;
    this.disc.geometry.dispose();
    this.disc.material.dispose();
    this.renderer.dispose();
    // Release the modal's WebGL context promptly instead of waiting for GC.
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
