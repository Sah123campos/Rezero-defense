import * as THREE from "../vendor/three.module.js";

// Original botanical meshes. Leaves are folded along a central vein and
// instanced over irregular crowns; no spherical meshes form the visible canopy.
const TAU = Math.PI * 2;
function randomSource(seed) {
  let n = seed | 0;
  return () =>
    ((n = (Math.imul(n, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
}
function leafGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, -0.18, 0.025, 0.18, -0.22, 0.04, 0.39, -0.12, 0.06, 0.61, 0,
        0.035, 0.79, 0.12, 0.06, 0.61, 0.22, 0.04, 0.39, 0.18, 0.025, 0.18, 0,
        0.12, 0.3, 0, 0.14, 0.52,
      ],
      3,
    ),
  );
  g.setIndex([
    0, 1, 8, 1, 2, 8, 2, 3, 9, 2, 9, 8, 3, 4, 9, 4, 5, 9, 5, 6, 9, 6, 8, 9, 6,
    7, 8, 7, 0, 8,
  ]);
  g.computeVertexNormals();
  return g;
}
function branch(parent, a, b, bottom, top, mat) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const d = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(top, bottom, d.length(), 9, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      angle = Math.atan2(p.getZ(i), p.getX(i));
    const r = 1 + Math.sin(angle * 5 + y * 3) * 0.08;
    p.setX(i, p.getX(i) * r + Math.sin(y * 2) * bottom * 0.12);
    p.setZ(i, p.getZ(i) * r);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  m.position.copy(start.add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(m);
}
export function createTree(
  parent,
  x,
  z,
  scale,
  palette,
  seed,
  quality = "high",
  mats,
) {
  const random = randomSource(seed),
    root = new THREE.Group();
  root.name = "leafy-tree";
  root.position.set(x, 0, z);
  root.scale.setScalar(scale);
  root.rotation.y = random() * TAU;
  parent.add(root);
  const bark = mats.bark;
  branch(root, [0, 0, 0], [0.12, 2.55, -0.04], 0.25, 0.065, bark);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    branch(
      root,
      [0.02, 0.33, 0],
      [Math.cos(a) * 0.65, 0.02, Math.sin(a) * 0.65],
      0.09,
      0.025,
      bark,
    );
  }
  const crowns = [
    [-0.73, 2.45, 0.05, 0.95, 0.73, 0.83],
    [0.64, 2.66, -0.1, 1.05, 0.78, 0.92],
    [-0.12, 3.09, -0.36, 1.04, 0.8, 0.94],
    [-0.05, 2.58, 0.67, 1, 0.67, 0.8],
    [0.15, 3.62, 0.16, 0.77, 0.65, 0.72],
  ];
  const count = quality === "low" ? 65 : 110;
  const leaves = new THREE.InstancedMesh(
    leafGeometry(),
    mats.leaf,
    count * crowns.length,
  );
  leaves.name = "folded-leaves";
  leaves.castShadow = leaves.receiveShadow = true;
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  let n = 0;
  for (let k = 0; k < crowns.length; k++) {
    const [cx, cy, cz, rx, ry, rz] = crowns[k];
    branch(
      root,
      [0.08, 1.25 + k * 0.18, 0],
      [cx, cy - 0.1, cz],
      0.11,
      0.035,
      bark,
    );
    // A serrated, hand-shaped inner volume closes gaps between individual leaves.
    const g = new THREE.SphereGeometry(1, 20, 12),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i),
        py = p.getY(i),
        pz = p.getZ(i);
      const a = Math.atan2(pz, px),
        r =
          0.9 +
          Math.sin(a * 9 + py * 7) * 0.08 +
          Math.cos(py * 18 + a * 3) * 0.045;
      p.setXYZ(i, px * r * rx, py * r * ry, pz * r * rz);
    }
    g.computeVertexNormals();
    const core = new THREE.Mesh(g, mats.crown[Math.min(3, k % 3)]);
    core.name = "sculpted-crown";
    core.position.set(cx, cy, cz);
    core.castShadow = core.receiveShadow = true;
    root.add(core);
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count,
        a = i * 2.399963 + random() * 0.15;
      const r = Math.sqrt(1 - y * y),
        nx = Math.cos(a) * r,
        nz = Math.sin(a) * r;
      dummy.position.set(
        cx + nx * rx * 0.97,
        cy + y * ry * 0.97,
        cz + nz * rz * 0.97,
      );
      dummy.rotation.set(
        (random() - 0.5) * 1.05,
        a + random() * 0.7,
        (random() - 0.5) * 0.55,
      );
      dummy.scale.setScalar(0.6 + random() * 0.35);
      dummy.updateMatrix();
      leaves.setMatrixAt(n, dummy.matrix);
      color.setHex(
        palette.leaf[Math.min(3, Math.floor(random() * 3) + (y > 0.2 ? 1 : 0))],
      );
      color.multiplyScalar(0.86 + random() * 0.25);
      leaves.setColorAt(n++, color);
    }
  }
  root.add(leaves);
  // Ivy curls and tiny shelf fungi on the shaded trunk.
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 5),
      mats.fungi[i % 2],
    );
    m.position.set(-0.17, 0.42 + i * 0.19, 0.08);
    m.scale.set(0.16, 0.045, 0.12);
    root.add(m);
  }
  return root;
}

export function fern(parent, x, z, scale, color, seed) {
  const random = randomSource(seed),
    positions = [],
    indices = [];
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * TAU + random() * 0.2;
    for (let j = 1; j <= 6; j++) {
      const t = j / 7,
        r = t * 0.75,
        y = Math.sin(t * Math.PI * 0.8) * 0.4;
      for (const side of [-1, 1]) {
        const w = (1 - t) * 0.17,
          base = positions.length / 3;
        const point = (along, cross, h) => [
          (Math.sin(a) * along + Math.cos(a) * cross) * scale + x,
          h * scale,
          (Math.cos(a) * along - Math.sin(a) * cross) * scale + z,
        ];
        positions.push(
          ...point(r, 0, y),
          ...point(r + 0.09, side * w, y + 0.035),
          ...point(r + 0.2, side * w * 0.8, y - 0.015),
        );
        indices.push(base, base + 1, base + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  m.receiveShadow = true;
  parent.add(m);
}
