import * as THREE from "../vendor/three.module.js";
import { createTree, fern } from "./foliage.js";

// Original, deterministic dioramas. All solid scenery is merged by material;
// vegetation uses instancing and only water and atmospheric motes animate.
const TAU = Math.PI * 2;
const palettes = [
  {
    turf: "#729850",
    turf2: "#a5bf67",
    leaf: [0x285944, 0x407a4c, 0x689447, 0xa0b857],
    bark: 0x6d5941,
    stone: 0xa3ad91,
    road: "#e8d2a0",
    bank: 0x9c9870,
    glow: 0x8ee1e1,
    flowers: [0xf1c45d, 0xd490b1, 0xb59bdc],
  },
  {
    turf: "#78a78d",
    turf2: "#9dc395",
    leaf: [0x3b735f, 0x538b70, 0x79a789, 0xa0c4a0],
    bark: 0x655544,
    stone: 0xa7b6b0,
    road: "#e4d8bc",
    bank: 0xa4a98a,
    glow: 0xffd79c,
    flowers: [0xd991a9, 0xffe0b9, 0xa38bd3],
  },
  {
    turf: "#899b86",
    turf2: "#a4b49a",
    leaf: [0x596d73, 0x718a88, 0x8ea797, 0xb2c0a1],
    bark: 0x665b63,
    stone: 0xadb8b0,
    road: "#d9d5be",
    bank: 0x969383,
    glow: 0xbd9cf4,
    flowers: [0xc3b8f7, 0xf2e6ff, 0xa8e0dc],
  },
];

function smoothRoute(points) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  return curve.getSpacedPoints(160).map((p) => [p.x, p.z]);
}

export const MAPS = [
  {
    id: "lugunica",
    name: "Floresta de Lugunica",
    subtitle: "CAPÍTULO I",
    description: "Entre copas douradas e águas cristalinas, a jornada começa.",
    route: smoothRoute([
      [-11.35, -3.95],
      [-8.2, -4.05],
      [-6.3, -2.8],
      [-5.9, 0.4],
      [-5.55, 3.65],
      [-3.8, 4.55],
      [-1.65, 3.95],
      [-0.75, 1.6],
      [-0.8, -2.65],
      [0.6, -4.35],
      [3.25, -4.35],
      [5.1, -2.9],
      [5.6, 1.2],
      [7.3, 4.35],
      [9.5, 4.55],
      [11.35, 4.4],
    ]),
  },
  {
    id: "roswaal",
    name: "Mansão Roswaal",
    subtitle: "CAPÍTULO II",
    description: "Jardins de rosas guardam os segredos de uma antiga mansão.",
    route: smoothRoute([
      [-11.35, 4.4],
      [-8, 4.4],
      [-6.3, 3.1],
      [-5.9, -1.8],
      [-5.2, -3.95],
      [-3.2, -4.55],
      [-1.6, -3.2],
      [-1.35, 2.2],
      [0.2, 4.5],
      [2.1, 4.3],
      [3.2, 2.1],
      [3.1, -1.5],
      [4.8, -2.8],
      [7.1, -2.3],
      [8.2, 0.95],
      [11.35, 1.1],
    ]),
  },
  {
    id: "sanctuary",
    name: "Santuário",
    subtitle: "CAPÍTULO III",
    description:
      "Ruínas esquecidas. Espíritos ancestrais. Um último juramento.",
    route: smoothRoute([
      [-11.35, -4],
      [-8.2, -4.1],
      [-6.4, -2.7],
      [-6.2, 2.7],
      [-4.4, 4.5],
      [-1.9, 4.4],
      [-0.6, 2.7],
      [-0.6, -2.8],
      [1.5, -4.45],
      [3.8, -3.8],
      [4.8, -1.4],
      [4.8, 3.2],
      [6.7, 4.6],
      [9.2, 3.8],
      [11.35, 3.7],
    ]),
  },
];

const rng = (seed) => {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
};
const materialCache = new Map();
function material(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...options }),
    );
  return materialCache.get(key);
}
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 10, 7),
  pebble: new THREE.IcosahedronGeometry(1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 9),
  leaf: new THREE.SphereGeometry(1, 14, 10),
};
{
  const flower = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU,
      r = 0.09 * (0.72 + 0.28 * Math.cos(a * 5));
    i
      ? flower.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      : flower.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  geo.flower = new THREE.ShapeGeometry(flower);
  geo.flower.rotateX(-Math.PI / 2);
  geo.flowerCenter = new THREE.SphereGeometry(1, 6, 4);
}
const sharedGeometries = new Set(Object.values(geo));
// Sculpt lobes into a single crown rather than stacking cone primitives.
{
  const p = geo.leaf.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const r =
      1 +
      0.09 * Math.sin(x * 8 + y * 3) * Math.cos(z * 6 - y * 4) +
      0.045 * Math.cos(x * 15 + z * 9);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  geo.leaf.computeVertexNormals();
}

function mesh(
  parent,
  geometry,
  mat,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(parent, x, y, z, w, h, d, color, options) {
  return mesh(parent, geo.box, material(color, options), x, y, z, w, h, d);
}
function ellipsoid(parent, x, y, z, rx, ry, rz, color) {
  return mesh(parent, geo.leaf, material(color), x, y, z, rx, ry, rz);
}
function branch(parent, a, b, r1, r2, color) {
  const va = new THREE.Vector3(...a),
    vb = new THREE.Vector3(...b),
    v = vb.clone().sub(va);
  const m = mesh(
    parent,
    new THREE.CylinderGeometry(r2, r1, v.length(), 7),
    material(color),
  );
  m.position.copy(va.add(vb).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return m;
}
function shapeMesh(parent, points, depth, mat, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape();
  points.forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  return mesh(parent, g, mat, x, y, z);
}

function texture(color, accent, seed, road = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d"),
    random = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < (road ? 1500 : 650); i++) {
    ctx.globalAlpha = road ? 0.04 + random() * 0.1 : 0.035 + random() * 0.07;
    ctx.fillStyle = i % 3 === 0 ? "#ffffff" : accent;
    const r = road ? random() * 1.8 + 0.3 : random() * 13 + 1;
    ctx.beginPath();
    ctx.ellipse(
      random() * 256,
      random() * 256,
      r,
      r * (0.4 + random() * 0.6),
      random() * TAU,
      0,
      TAU,
    );
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(road ? 2 : 3, road ? 6 : 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function topOutline(scale = 1) {
  return Array.from({ length: 80 }, (_, i) => {
    const a = (i / 80) * TAU,
      c = Math.cos(a),
      s = Math.sin(a),
      wobble = 1 + 0.017 * Math.sin(a * 7) + 0.012 * Math.cos(a * 11);
    return [
      Math.sign(c) * Math.abs(c) ** 0.65 * 12.1 * scale * wobble,
      Math.sign(s) * Math.abs(s) ** 0.72 * 7.05 * scale * wobble,
    ];
  });
}
function cliffFragment(seed) {
  const random = rng(seed),
    sides = 7,
    vertices = [],
    indices = [];
  const rings = [
    { y: 0.7, r: 0.66 },
    { y: 0.28, r: 1 },
    { y: -0.3, r: 0.9 },
    { y: -0.85, r: 0.48 },
  ];
  for (const ring of rings)
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU,
        r = ring.r * (0.83 + random() * 0.25);
      vertices.push(
        Math.cos(a) * r,
        ring.y + (random() - 0.5) * 0.2,
        Math.sin(a) * r,
      );
    }
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < sides; i++) {
      const n = j * sides + i,
        next = j * sides + ((i + 1) % sides);
      indices.push(n, next, n + sides, next, next + sides, n + sides);
    }
  for (let i = 1; i < sides - 1; i++) indices.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

function ground(parent, p, index) {
  const outline = topOutline();
  const s = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d"),
    paint = rng(index + 74);
  ctx.fillStyle = p.turf;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    const x = paint() * 1024,
      y = paint() * 1024,
      r = 15 + paint() * 110;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(
      0,
      i % 3 === 0 ? "#d5d27a55" : i % 3 === 1 ? "#284f3e44" : "#b2d78355",
    );
    gradient.addColorStop(1, "#81a26000");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 11000; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#eef3b216" : "#355e3e12";
    ctx.fillRect(
      paint() * 1024,
      paint() * 1024,
      1 + paint() * 2,
      1 + paint() * 3,
    );
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const groundGeo = new THREE.ShapeGeometry(s),
    pos = groundGeo.attributes.position;
  const uv = groundGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) + 12.5) / 25, (pos.getY(i) + 7.5) / 15);
  const top = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.receiveShadow = true;
  parent.add(top);
  const positions = [],
    colors = [];
  const shade = new THREE.Color();
  const rings = [
    { y: -0.035, s: 1, c: 0x73924e },
    { y: -0.23, s: 1.005, c: 0x779152 },
    { y: -0.58, s: 1, c: 0x9b865c },
    { y: -1.38, s: 0.985, c: 0x9b7954 },
    { y: -1.85, s: 0.94, c: 0x76634d },
    { y: -2, s: 0.87, c: 0x645d4d },
  ];
  const random = rng(321);
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < outline.length; i++) {
      const n = (i + 1) % outline.length,
        a = outline[i],
        b = outline[n],
        ra = rings[j],
        rb = rings[j + 1];
      const vs = [
        [a[0] * ra.s, ra.y, a[1] * ra.s],
        [b[0] * ra.s, ra.y, b[1] * ra.s],
        [a[0] * rb.s, rb.y, a[1] * rb.s],
        [b[0] * rb.s, rb.y, b[1] * rb.s],
      ];
      for (const v of [0, 2, 1, 1, 2, 3]) {
        positions.push(...vs[v]);
        shade
          .setHex(v === 0 || v === 1 ? ra.c : rb.c)
          .multiplyScalar(0.9 + random() * 0.18);
        colors.push(shade.r, shade.g, shade.b);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  mesh(parent, g, material(0xffffff, { vertexColors: true }));
  // A few exposed pieces of limestone tell the story of the island's geology.
  // Fractured rock faces, moss ledges and roots at the exposed edge.
  for (let i = 0; i < 38; i++) {
    const a = (i / 38) * TAU,
      [x, z] = outline[Math.floor((i / 38) * outline.length)];
    const m = mesh(
      parent,
      cliffFragment(320 + i),
      material(i % 3 ? 0x8a8870 : 0xb5ac8d),
      x * 0.987,
      -0.66 - (i % 4) * 0.13,
      z * 0.987,
      0.45 + (i % 3) * 0.16,
      0.58 + (i % 4) * 0.12,
      0.38 + (i % 2) * 0.15,
    );
    m.rotation.set(a * 0.13, a, 0.13 * Math.sin(a * 5));
    if (i % 2 === 0)
      ellipsoid(
        parent,
        x * 0.992,
        -0.035,
        z * 0.992,
        0.48,
        0.1,
        0.3,
        p.leaf[1],
      );
  }
}

function road(parent, route, p, index) {
  function ribbon(width, y, mat) {
    const pos = [],
      uv = [];
    route.forEach(([x, z], i) => {
      const a = route[Math.max(0, i - 1)],
        b = route[Math.min(route.length - 1, i + 1)];
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        l = Math.hypot(dx, dz),
        nx = -dz / l,
        nz = dx / l;
      pos.push(
        x + nx * width,
        y,
        z + nz * width,
        x - nx * width,
        y,
        z - nz * width,
      );
      uv.push(0, i / 10, 1, i / 10);
    });
    const idx = [];
    for (let i = 0; i < route.length - 1; i++) {
      let n = i * 2;
      idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = mesh(parent, g, mat);
    m.receiveShadow = true;
    m.castShadow = false;
  }
  ribbon(0.86, 0.009, material(p.bank));
  ribbon(
    0.71,
    0.035,
    new THREE.MeshStandardMaterial({
      map: texture(p.road, "#958775", 90 + index, true),
      roughness: 1,
    }),
  );
  const random = rng(99 + index);
  // Irregular pale cobbles are embedded along the verge, not a raised toy track.
  for (let i = 1; i < route.length - 1; i += 3) {
    const a = route[i - 1],
      b = route[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      l = Math.hypot(dx, dz);
    for (const side of [-1, 1]) {
      if (random() < 0.21) continue;
      const [x, z] = route[i],
        w = 0.77 + random() * 0.025;
      const peb = mesh(
        parent,
        geo.pebble,
        material(i % 4 ? 0xd2cfaf : 0xaaa78c),
        x - (dz / l) * w * side,
        0.075,
        z + (dx / l) * w * side,
        0.12 + random() * 0.09,
        0.065,
        0.1 + random() * 0.1,
      );
      peb.rotation.y = random() * TAU;
    }
  }
  for (let i = 3; i < route.length - 3; i += 5) {
    const [x, z] = route[i],
      a = route[i - 1],
      b = route[i + 1];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let j = 0; j < 3; j++) {
      const offset = (j - 1) * 0.33 + (random() - 0.5) * 0.1;
      const stone = mesh(
        parent,
        geo.pebble,
        material(j % 2 ? 0xd6c79c : 0xcdbb8e),
        x - Math.sin(angle) * offset,
        0.043,
        z + Math.cos(angle) * offset,
        0.13 + random() * 0.09,
        0.018,
        0.09 + random() * 0.07,
      );
      stone.rotation.y = angle + random() * 0.7;
    }
  }
}
function routeDistance(x, z, route) {
  let best = 1e5;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i],
      b = route[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
      );
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

function rock(parent, x, z, s, p, seed = 1) {
  const m = mesh(
    parent,
    geo.pebble,
    material(p.stone),
    x,
    s * 0.32,
    z,
    s,
    s * 0.55,
    s * 0.7,
  );
  m.rotation.set(0.1, seed, seed * 0.1);
  if (s > 0.5)
    ellipsoid(
      parent,
      x + 0.08,
      s * 0.64,
      z + 0.02,
      s * 0.66,
      0.09,
      s * 0.46,
      p.leaf[1],
    );
}
function mushroom(parent, x, z, s, color) {
  mesh(
    parent,
    geo.cylinder,
    material(0xe5d7b9),
    x,
    0.14 * s,
    z,
    0.055 * s,
    0.25 * s,
    0.055 * s,
  );
  const cap = mesh(
    parent,
    geo.sphere,
    material(color),
    x,
    0.29 * s,
    z,
    0.22 * s,
    0.13 * s,
    0.2 * s,
  );
  for (let i = 0; i < 3; i++)
    mesh(
      parent,
      geo.sphere,
      material(0xfff1d4),
      x + Math.cos(i * 2.1) * 0.1 * s,
      0.38 * s,
      z + Math.sin(i * 2.1) * 0.08 * s,
      0.03 * s,
      0.012 * s,
      0.03 * s,
    );
  return cap;
}

function vegetation(parent, route, p, index, quality, obstacles, water) {
  const random = rng(738 + index * 153),
    spots = [];
  const foliageMaterials = {
    bark: material(p.bark),
    crown: p.leaf.map((c) => material(c)),
    leaf: material(0xffffff, { roughness: 0.83, side: THREE.DoubleSide }),
    fungi: [material(0xad7b54), material(0xcba477)],
  };
  const inWater = (x, z) =>
    water &&
    ((x - water.x) / water.rx) ** 2 + ((z - water.z) / water.rz) ** 2 < 1.25;
  const free = (x, z, r = 0.5) =>
    routeDistance(x, z, route) > r + 1 &&
    !inWater(x, z) &&
    !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r);
  // Keep the centre open for meaningful tower placement; tall trees frame the edges.
  const treeSpots = [
    [-10.8, -5.6, 1],
    [-8.8, -5.9, 1.1],
    [-4.2, -5.8, 0.92],
    [-1.2, -5.9, 0.76],
    [2.5, -5.8, 0.88],
    [-10.5, 0.8, 0.95],
    [-11.1, 4.7, 0.85],
    [-9.1, 5.65, 0.82],
    [-5.7, 5.8, 0.7],
    [-0.2, 5.8, 0.7],
    [3.8, 5.75, 0.72],
    [10.5, 5.6, 0.66],
    [10.9, -0.7, 0.72],
  ];
  if (index === 0) treeSpots.push([6.2, -5.8, 0.7], [11, -5.8, 0.85]);
  if (index === 2) treeSpots.push([7.2, -5.6, 0.9], [10.7, -5.8, 0.7]);
  treeSpots.forEach(([x, z, s], i) => {
    if (free(x, z, 0.7 * s)) {
      createTree(
        parent,
        x,
        z,
        s,
        p,
        i * 51 + index + 1,
        quality,
        foliageMaterials,
      );
      obstacles.push({ x, z, r: 0.56 * s });
    }
  });
  for (let i = 0; i < 38; i++) {
    const x = (random() - 0.5) * 22,
      z = (random() - 0.5) * 12.3;
    if (!free(x, z, 0.15)) continue;
    if (i % 5 === 0) {
      rock(parent, x, z, 0.23 + random() * 0.42, p, i);
      obstacles.push({ x, z, r: 0.25 });
    } else if (i % 3 === 0) {
      const s = 0.3 + random() * 0.23;
      ellipsoid(parent, x, s * 0.48, z, s, 0.26, s * 0.66, p.leaf[i % 3]);
      ellipsoid(
        parent,
        x + s * 0.4,
        s * 0.5,
        z + 0.08,
        s * 0.6,
        0.19,
        s * 0.6,
        p.leaf[(i + 1) % 3],
      );
    } else if (index === 0 && i % 4 === 0)
      mushroom(
        parent,
        x,
        z,
        0.65 + random() * 0.45,
        i % 2 ? 0xcf9d70 : 0xb96754,
      );
    else {
      spots.push([x, z]);
      fern(parent, x, z, 0.65 + random() * 0.5, p.leaf[1], i + index * 31);
    }
  }
  // Three splayed blades per tuft stay readable on small screens, in one draw.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.035, 0, 0, 0.035, 0, 0, 0.012, 0.3, 0.025, -0.025, 0, -0.025, 0.025,
        0, 0.025, -0.09, 0.23, 0.04, 0.025, 0, -0.025, -0.025, 0, 0.025, 0.095,
        0.25, -0.02,
      ],
      3,
    ),
  );
  blade.computeVertexNormals();
  const grassMat = material(index === 2 ? 0x829d83 : 0x78a75d, {
    side: THREE.DoubleSide,
  });
  const count = quality === "low" ? 170 : 430,
    grass = new THREE.InstancedMesh(blade, grassMat, count),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const x = (random() - 0.5) * 23.5,
      z = (random() - 0.5) * 13;
    if (!free(x, z, -0.1)) continue;
    dummy.position.set(x, 0.03, z);
    dummy.rotation.set(0, random() * TAU, (random() - 0.5) * 0.3);
    dummy.scale.setScalar(0.55 + random() * 0.65);
    dummy.updateMatrix();
    grass.setMatrixAt(n, dummy.matrix);
    color
      .setHex(index === 2 ? 0xa7b79d : 0x9dbb70)
      .multiplyScalar(0.75 + random() * 0.4);
    grass.setColorAt(n, color);
    n++;
  }
  grass.count = n;
  grass.castShadow = false;
  grass.receiveShadow = true;
  parent.add(grass);
  // Petal outlines replace six tiny spheres: richer clustered flowers at a
  // fraction of the triangles, still batched into only three blossom materials.
  const flower = (x, z, color, s = 1) => {
    const stem = (0.15 + random() * 0.12) * s;
    mesh(
      parent,
      geo.cylinder,
      material(0x4f7951),
      x,
      stem / 2,
      z,
      0.012,
      stem,
      0.012,
    );
    const bloom = mesh(
      parent,
      geo.flower,
      material(color, { side: THREE.DoubleSide }),
      x,
      stem,
      z,
      s,
      1,
      s,
    );
    bloom.rotation.y = random() * TAU;
    mesh(
      parent,
      geo.flowerCenter,
      material(0xe3b84e),
      x,
      stem + 0.013,
      z,
      0.024 * s,
      0.017,
      0.024 * s,
    );
  };
  for (let i = 0; i < (quality === "low" ? 24 : 45); i++) {
    const x = (random() - 0.5) * 22.8,
      z = (random() - 0.5) * 12.7;
    if (free(x, z, -0.05)) flower(x, z, p.flowers[i % 3]);
  }
  spots.slice(0, quality === "low" ? 6 : 12).forEach(([x, z], i) => {
    ellipsoid(parent, x, 0.055, z, 0.29, 0.06, 0.22, p.leaf[2]);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU,
        r = 0.1 + random() * 0.17,
        fx = x + Math.cos(a) * r,
        fz = z + Math.sin(a) * r;
      if (free(fx, fz, -0.1))
        flower(fx, fz, p.flowers[i % 3], 0.95 + random() * 0.35);
    }
  });
}

function pond(parent, p, animated) {
  const water = { x: 8.9, z: -3.95, rx: 2.35, rz: 1.7 };
  const shape = new THREE.Shape();
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * TAU,
      r = 1 + 0.07 * Math.sin(a * 3) + 0.025 * Math.cos(a * 7),
      x = Math.cos(a) * water.rx * r,
      z = Math.sin(a) * water.rz * r;
    i ? shape.lineTo(x, -z) : shape.moveTo(x, -z);
  }
  const bank = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    material(0xbcc795),
  );
  bank.rotation.x = -Math.PI / 2;
  bank.position.set(water.x, 0.016, water.z);
  bank.scale.setScalar(1.07);
  bank.receiveShadow = true;
  parent.add(bank);
  const waves = document.createElement("canvas");
  waves.width = waves.height = 128;
  const ctx = waves.getContext("2d");
  ctx.fillStyle = "#7fbfbe";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#b4ded4";
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    for (let x = 0; x < 128; x++) {
      const y = i * 9 + Math.sin(x * 0.09 + i) * 2;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(waves);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x64c2bf,
    map: t,
    roughness: 0.2,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.94,
  });
  const lake = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(water.x, 0.033, water.z);
  lake.userData.dynamic = true;
  parent.add(lake);
  animated.push({ type: "water", mesh: lake });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU,
      x = water.x + Math.cos(a) * water.rx * 1.03,
      z = water.z + Math.sin(a) * water.rz * 1.03;
    rock(parent, x, z, 0.16 + (i % 3) * 0.055, p, i);
    if (i % 4 === 0) {
      for (let k = 0; k < 3; k++)
        branch(
          parent,
          [x, 0.05, z],
          [x + (k - 1) * 0.06, 0.35 + k * 0.1, z + 0.03],
          0.013,
          0.006,
          0x5d8e64,
        );
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = water.x + (i - 1.5) * 0.4,
      z = water.z + 0.65 + Math.sin(i) * 0.15;
    const pad = mesh(
      parent,
      new THREE.CircleGeometry(0.2, 15, 0.2, TAU - 0.4),
      material(0x669b70, { side: THREE.DoubleSide }),
      x,
      0.055,
      z,
    );
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = i * 2;
    if (i === 1)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const m = mesh(
          parent,
          geo.sphere,
          material(0xf4d5d7),
          x + Math.cos(a) * 0.05,
          0.105,
          z + Math.sin(a) * 0.05,
          0.06,
          0.045,
          0.03,
        );
        m.rotation.y = -a;
      }
  }
  // A little arched garden bridge gives scale and craftsmanship to the grove.
  const bridge = new THREE.Group();
  bridge.position.set(water.x, 0.07, water.z - 0.25);
  bridge.rotation.y = 0.14;
  parent.add(bridge);
  for (let i = 0; i < 15; i++) {
    const x = (i - 7) * 0.19,
      y = 0.15 + Math.cos((((i - 7) / 7) * Math.PI) / 2) * 0.22;
    const plank = box(
      bridge,
      x,
      y,
      0,
      0.18,
      0.09,
      0.9,
      i % 2 ? 0xa4865c : 0xb49468,
    );
    plank.rotation.z = -(i - 7) * 0.027;
  }
  for (const z of [-0.51, 0.51]) {
    for (const x of [-1.26, 0, 1.26])
      box(
        bridge,
        x,
        0.54 + (0.12 - Math.abs(x) * 0.05),
        z,
        0.065,
        0.72,
        0.065,
        0x735b43,
      );
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.3, 0.84, z),
      new THREE.Vector3(0, 1.02, z),
      new THREE.Vector3(1.3, 0.84, z),
    ]);
    mesh(
      bridge,
      new THREE.TubeGeometry(c, 16, 0.035, 5, false),
      material(0x8f7250),
    );
  }
  for (let i = 0; i < 3; i++) {
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.34 + i * 0.21, 0.353 + i * 0.21, 36),
      new THREE.MeshBasicMaterial({
        color: 0xcdf8ed,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(water.x - 0.8, 0.046, water.z + 0.5);
    ripple.userData.dynamic = true;
    parent.add(ripple);
    animated.push({ type: "ripple", mesh: ripple, phase: i * 2.1 });
  }
  return water;
}

function lantern(parent, x, z, p, obstacles) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  mesh(g, geo.cylinder, material(0x706c59), 0, 0.06, 0, 0.21, 0.12, 0.21);
  box(g, 0, 0.62, 0, 0.055, 1.18, 0.055, 0x645f50);
  box(g, 0, 1.23, 0, 0.36, 0.065, 0.32, 0x77755e);
  box(g, 0, 1.4, 0, 0.22, 0.3, 0.2, p.glow, {
    emissive: p.glow,
    emissiveIntensity: 0.28,
    roughness: 0.35,
  });
  for (const a of [-0.13, 0.13])
    for (const b of [-0.12, 0.12])
      box(g, a, 1.4, b, 0.035, 0.35, 0.035, 0x77755e);
  const top = shapeMesh(
    g,
    [
      [-0.24, 0],
      [0, 0.21],
      [0.24, 0],
    ],
    0.37,
    material(0x74765b),
    0,
    1.59,
    -0.185,
  );
  top.castShadow = true;
  obstacles.push({ x, z, r: 0.26 });
}
function gates(parent, route, p, animated) {
  for (let i = 0; i < 2; i++) {
    const [x, z] = route[i ? route.length - 1 : 0],
      g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 2;
    parent.add(g);
    const a = route[i ? route.length - 3 : 2];
    g.rotation.y = -Math.atan2(a[1] - z, a[0] - x) + Math.PI / 2;
    for (const sign of [-1, 1]) {
      box(g, sign * 0.64, 0.11, 0, 0.46, 0.22, 0.5, 0xb0b399);
      box(g, sign * 0.64, 0.8, 0, 0.28, 1.28, 0.28, 0xa0a78d);
      box(g, sign * 0.64, 1.49, 0, 0.4, 0.14, 0.38, 0xc1c4a9);
      box(
        g,
        sign * 0.64,
        0.89,
        0.158,
        0.07,
        0.59,
        0.02,
        i ? 0xffdca0 : 0x9ee8d3,
        { emissive: i ? 0xf7cf8f : 0x8bcdb9, emissiveIntensity: 0.25 },
      );
      ellipsoid(g, sign * 0.74, 0.2, -0.14, 0.28, 0.17, 0.26, p.leaf[1]);
    }
    const arch = new THREE.TorusGeometry(0.64, 0.12, 7, 20, Math.PI);
    mesh(g, arch, material(0xc0c2a8), 0, 1.4, 0);
    const emblem = mesh(
      g,
      new THREE.OctahedronGeometry(0.15, 0),
      material(i ? 0xffdfa4 : 0xa4e8df, {
        emissive: i ? 0xf9ca7b : 0x80d1cd,
        emissiveIntensity: 0.4,
      }),
      0,
      1.98,
      0,
    );
    emblem.userData.dynamic = true;
    animated.push({ type: "sigil", mesh: emblem, phase: i * 2 });
  }
}

function manor(parent, p, obstacles) {
  const g = new THREE.Group();
  g.position.set(7.8, 0, -5.05);
  g.rotation.y = -0.08;
  g.scale.setScalar(0.92);
  parent.add(g);
  obstacles.push({ x: 7.8, z: -5.05, r: 2.5 });
  const ivory = 0xe6ddc9,
    wood = 0x695c67,
    roof = 0x70677b;
  box(g, 0, 0.14, 0, 5.4, 0.28, 3.3, 0xb4b4a5);
  box(g, 0, 1.35, 0, 4.7, 2.4, 2.55, ivory);
  box(g, 0, 0.4, 1.36, 4.85, 0.2, 0.12, 0xc6bfae);
  box(g, 0, 1.56, 1.3, 4.74, 0.09, 0.07, wood);
  for (const x of [-2.25, 0, 2.25])
    box(g, x, 1.45, 1.3, 0.11, 2.18, 0.08, wood);
  const roofShape = [
    [-2.65, 0],
    [0, 1.2],
    [2.65, 0],
  ];
  shapeMesh(g, roofShape, 3.05, material(roof), 0, 2.56, -1.52);
  for (let r = 0; r < 4; r++)
    for (let n = 0; n < 9; n++) {
      const y = 2.63 + r * 0.245,
        x = (n - 4) * 0.5 * (1 - r * 0.12),
        z = 1.56 - r * 0.015;
      const shingle = box(
        g,
        x,
        y,
        z,
        0.42,
        0.055,
        0.07,
        r % 2 ? 0x80778c : 0x625d72,
      );
      shingle.rotation.z = x > 0 ? -0.42 : 0.42;
    }
  for (const x of [-1.48, 1.48]) {
    box(g, x, 1.8, 1.34, 0.68, 0.9, 0.09, 0x746e7e);
    box(g, x, 1.8, 1.4, 0.53, 0.72, 0.035, 0x9ccbd3, { roughness: 0.3 });
    box(g, x, 1.8, 1.43, 0.045, 0.76, 0.025, ivory);
    box(g, x, 1.8, 1.43, 0.55, 0.045, 0.025, ivory);
    box(g, x, 1.27, 1.53, 0.83, 0.16, 0.34, 0xa78d78);
    for (let k = 0; k < 5; k++)
      ellipsoid(g, x + (k - 2) * 0.13, 1.42, 1.54, 0.11, 0.13, 0.1, p.leaf[1]);
    for (let k = 0; k < 3; k++)
      mesh(
        g,
        geo.sphere,
        material(0xddb8cd),
        x + (k - 1) * 0.19,
        1.51,
        1.56,
        0.06,
        0.06,
        0.06,
      );
  }
  box(g, 0, 0.86, 1.35, 0.78, 1.22, 0.08, 0x736574);
  box(g, 0, 0.86, 1.41, 0.55, 1.06, 0.04, 0xa68b9a);
  mesh(
    g,
    geo.sphere,
    material(0xe2c491, { metalness: 0.45, roughness: 0.4 }),
    0.18,
    0.86,
    1.46,
    0.04,
    0.04,
    0.04,
  );
  for (let i = 0; i < 3; i++)
    box(
      g,
      0,
      0.07 + i * 0.075,
      1.69 - i * 0.14,
      1.35 - i * 0.08,
      0.08,
      0.4,
      0xc4c1b1,
    );
  // Side turret with a faceted, custom pyramidal slate roof.
  box(g, -2.15, 1.85, -0.55, 1.15, 3.6, 1.25, ivory);
  const turret = new THREE.ConeGeometry(1.02, 1.22, 4);
  turret.rotateY(Math.PI / 4);
  mesh(g, turret, material(0x766c85), -2.15, 4.23, -0.55, 1, 1, 0.95);
  box(g, -2.15, 2.95, 0.1, 0.43, 0.72, 0.045, 0xa9cdda, { roughness: 0.3 });
  box(g, -2.15, 2.95, 0.14, 0.04, 0.76, 0.025, wood);
  box(g, 1.2, 3.25, -0.4, 0.42, 0.9, 0.5, 0xc7b7a8);
  box(g, 1.2, 3.75, -0.4, 0.51, 0.11, 0.59, 0x9d9790);
  // Formal garden hedges and low iron fence.
  for (const x of [-3.15, 3.2])
    for (let i = 0; i < 5; i++)
      ellipsoid(g, x, 0.4, -1.2 + i * 0.57, 0.4, 0.44, 0.44, p.leaf[0]);
  for (let i = 0; i < 13; i++) {
    const x = (i - 6) * 0.48;
    box(g, x, 0.39, -1.9, 0.035, 0.74, 0.035, 0x656d67);
  }
  box(g, 0, 0.54, -1.9, 6, 0.035, 0.035, 0x656d67);
}

function fountain(parent, x, z, p, obstacles, animated) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  obstacles.push({ x, z, r: 1.15 });
  mesh(
    g,
    new THREE.CylinderGeometry(1.05, 1.13, 0.2, 20),
    material(0xb5b8ab),
    0,
    0.1,
    0,
  );
  mesh(
    g,
    new THREE.TorusGeometry(0.9, 0.12, 7, 28),
    material(0xd0d2be),
    0,
    0.24,
    0,
  ).rotation.x = Math.PI / 2;
  mesh(
    g,
    new THREE.CircleGeometry(0.85, 28),
    material(0x91c9cd, { roughness: 0.2 }),
    0,
    0.2,
    0,
  ).rotation.x = -Math.PI / 2;
  mesh(
    g,
    new THREE.CylinderGeometry(0.12, 0.27, 1.02, 9),
    material(0xc1c6b8),
    0,
    0.72,
    0,
  );
  mesh(
    g,
    new THREE.CylinderGeometry(0.58, 0.14, 0.22, 18),
    material(0xd0d2be),
    0,
    1.18,
    0,
  );
  const stream = mesh(
    g,
    new THREE.CylinderGeometry(0.025, 0.045, 0.5, 7),
    material(0xafe3e2, { transparent: true, opacity: 0.6, roughness: 0.1 }),
    0,
    1.54,
    0,
  );
  stream.userData.dynamic = true;
  animated.push({ type: "fountain", mesh: stream });
}

function sanctuary(parent, p, obstacles, animated) {
  const g = new THREE.Group();
  g.position.set(8.2, 0, -4.5);
  g.rotation.y = -0.22;
  parent.add(g);
  obstacles.push({ x: 8.2, z: -4.5, r: 2.05 });
  box(g, 0, 0.12, 0, 3.8, 0.24, 2.6, 0xa4aca5);
  box(g, 0, 0.29, 0, 3.2, 0.16, 2.16, 0xc2c9b7);
  for (const x of [-1.2, 1.2]) {
    box(g, x, 0.48, 0, 0.7, 0.24, 0.7, 0x9aa69b);
    mesh(
      g,
      new THREE.CylinderGeometry(0.22, 0.26, 1.8, 10),
      material(0xbcc4b4),
      x,
      1.45,
      0,
    );
    box(g, x, 2.42, 0, 0.64, 0.22, 0.64, 0xc9cdbd);
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU;
      branch(
        g,
        [x + Math.cos(a) * 0.22, 0.62, Math.sin(a) * 0.22],
        [x + Math.cos(a) * 0.19, 2.27, Math.sin(a) * 0.19],
        0.019,
        0.018,
        0x9da99e,
      );
    }
  }
  shapeMesh(
    g,
    [
      [-1.65, 0],
      [0, 0.78],
      [1.65, 0],
    ],
    0.68,
    material(0xbac0af),
    0,
    2.55,
    -0.34,
  );
  shapeMesh(
    g,
    [
      [-1.22, 0],
      [0, 0.47],
      [1.22, 0],
    ],
    0.035,
    material(0x889787),
    0,
    2.69,
    0.352,
  );
  const ring = mesh(
    g,
    new THREE.TorusGeometry(0.64, 0.055, 6, 32),
    material(0xb9a1df, { emissive: 0xb098e1, emissiveIntensity: 0.52 }),
    0,
    1.55,
    0.14,
  );
  ring.userData.dynamic = true;
  animated.push({ type: "portal", mesh: ring });
  const sigil = mesh(
    g,
    new THREE.OctahedronGeometry(0.32, 0),
    material(0xbca0e8, {
      emissive: 0xa58acd,
      emissiveIntensity: 0.3,
      metalness: 0.12,
      roughness: 0.3,
    }),
    0,
    1.55,
    0.14,
  );
  sigil.userData.dynamic = true;
  animated.push({ type: "sigil", mesh: sigil, phase: 2 });
  for (let i = 0; i < 5; i++) {
    const x = -2.15 + i * 0.22,
      z = 1.1 + (i % 2) * 0.3;
    box(g, x, 0.2, z, 0.44, 0.4, 0.6, 0x9eaaa0).rotation.y = i * 0.5;
  }
  const crystalMat = material(0xafb6e2, {
    roughness: 0.28,
    metalness: 0.12,
    emissive: 0x5c6a8a,
    emissiveIntensity: 0.12,
  });
  for (const [x, z, s] of [
    [-9.6, 4.8, 0.8],
    [1.4, -5.4, 1],
    [10.7, -0.2, 0.75],
    [-3.8, -5.4, 0.6],
  ]) {
    rock(parent, x, z, 0.42, p, x);
    obstacles.push({ x, z, r: 0.45 });
    for (let j = 0; j < 3; j++) {
      const gem = mesh(
        parent,
        new THREE.OctahedronGeometry(1, 0),
        crystalMat,
        x + (j - 1) * 0.25,
        0.4 + (j === 1 ? 0.2 : 0),
        z + (j % 2) * 0.13,
        0.18 + j * 0.025,
        (j === 1 ? 0.9 : 0.6) * s,
        0.18,
      );
      gem.rotation.z = (j - 1) * 0.2;
    }
  }
  // Fallen memorial stones, ivy, and a half-buried arch make the ruins readable.
  for (const [x, z, a] of [
    [-8.8, -5.5, 0.2],
    [3.2, 5.5, 1.4],
  ]) {
    const stone = box(parent, x, 0.5, z, 0.58, 1, 0.22, 0xb6bca9);
    stone.rotation.y = a;
    obstacles.push({ x, z, r: 0.4 });
    box(parent, x, 0.96, z, 0.75, 0.16, 0.28, 0xc9ccba).rotation.y = a;
    ellipsoid(parent, x, 0.12, z + 0.16, 0.44, 0.13, 0.34, p.leaf[0]);
  }
}

// BufferGeometryUtils-style merging kept local so the entire game is offline-ready.
function batchStatics(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(),
    remove = [];
  root.traverse((obj) => {
    if (
      !obj.isMesh ||
      obj.isInstancedMesh ||
      obj.userData.dynamic ||
      obj.material.transparent ||
      Array.isArray(obj.material)
    )
      return;
    const key = obj.material.uuid;
    if (!groups.has(key))
      groups.set(key, { material: obj.material, meshes: [] });
    groups.get(key).meshes.push(obj);
    remove.push(obj);
  });
  for (const entry of groups.values()) {
    if (entry.meshes.length < 2) continue;
    const positions = [],
      normals = [],
      uvs = [],
      colors = [],
      normalMatrix = new THREE.Matrix3(),
      v = new THREE.Vector3(),
      n = new THREE.Vector3();
    for (const m of entry.meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry,
        p = g.attributes.position,
        no = g.attributes.normal,
        uv = g.attributes.uv,
        col = g.attributes.color;
      normalMatrix.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        positions.push(v.x, v.y, v.z);
        if (no)
          n.fromBufferAttribute(no, i).applyMatrix3(normalMatrix).normalize();
        else n.set(0, 1, 0);
        normals.push(n.x, n.y, n.z);
        uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        if (entry.material.vertexColors)
          colors.push(
            col ? col.getX(i) : 1,
            col ? col.getY(i) : 1,
            col ? col.getZ(i) : 1,
          );
      }
      if (g !== m.geometry) g.dispose();
      if (!sharedGeometries.has(m.geometry)) m.geometry.dispose();
      m.parent.remove(m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    if (colors.length)
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.Mesh(g, entry.material);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
}

function atmosphere(parent, p, animated, quality) {
  const count = quality === "low" ? 10 : 24,
    positions = new Float32Array(count * 3),
    random = rng(707),
    origins = [];
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * 22,
      y = 0.5 + random() * 2.6,
      z = (random() - 0.5) * 12;
    positions.set([x, y, z], i * 3);
    origins.push([x, y, z, random() * TAU]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const motes = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      color: p.glow,
      size: 0.09,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  parent.add(motes);
  animated.push({ type: "motes", mesh: motes, origins });
}

export function createWorld(index = 0, quality = "high") {
  index = Math.max(0, Math.min(MAPS.length - 1, index));
  const root = new THREE.Group(),
    p = palettes[index],
    obstacles = [],
    animated = [];
  root.name = `world-${MAPS[index].id}`;
  ground(root, p, index);
  road(root, MAPS[index].route, p, index);
  let water = null;
  if (index === 0) water = pond(root, p, animated);
  if (index === 1) {
    manor(root, p, obstacles);
    fountain(root, -8.8, -0.9, p, obstacles, animated);
  }
  if (index === 2) sanctuary(root, p, obstacles, animated);
  vegetation(root, MAPS[index].route, p, index, quality, obstacles, water);
  for (const [x, z] of index === 0
    ? [
        [-8.3, -1.9],
        [2.1, 4.7],
        [4, -4.7],
      ]
    : index === 1
      ? [
          [-7.6, 4.7],
          [-3.8, -4.9],
          [5, 4.8],
        ]
      : [
          [-8.3, -1.4],
          [1.7, 4.6],
          [5.7, -4.5],
        ])
    lantern(root, x, z, p, obstacles);
  gates(root, MAPS[index].route, p, animated);
  batchStatics(root);
  atmosphere(root, p, animated, quality);
  root.userData = {
    groundY: 0,
    obstacles,
    water,
    animated,
    index,
    dispose: () => disposeWorld(root),
  };
  return root;
}

export function animateWorld(group, time) {
  for (const a of group.userData.animated || []) {
    if (a.type === "water") {
      a.mesh.material.map.offset.set(time * 0.008, time * 0.005);
    } else if (a.type === "ripple") {
      const t = (time * 0.45 + a.phase) % 3;
      a.mesh.scale.setScalar(0.65 + t * 0.25);
      a.mesh.material.opacity = (1 - t / 3) * 0.26;
    } else if (a.type === "sigil") {
      a.mesh.rotation.y = time * 0.7;
      a.mesh.position.y +=
        Math.sin(time * 1.8 + a.phase) * 0.06 - (a.last || 0);
      a.last = Math.sin(time * 1.8 + a.phase) * 0.06;
    } else if (a.type === "portal") {
      a.mesh.rotation.z = time * 0.17;
    } else if (a.type === "fountain") {
      a.mesh.scale.x = 0.9 + Math.sin(time * 7) * 0.1;
      a.mesh.material.opacity = 0.5 + Math.sin(time * 4) * 0.08;
    } else if (a.type === "motes") {
      const p = a.mesh.geometry.attributes.position;
      a.origins.forEach(([x, y, z, phase], i) =>
        p.setXYZ(
          i,
          x + Math.sin(time * 0.18 + phase) * 0.36,
          y + Math.sin(time * 0.5 + phase) * 0.23,
          z + Math.cos(time * 0.15 + phase) * 0.3,
        ),
      );
      p.needsUpdate = true;
    }
  }
}

export function disposeWorld(group) {
  const persistentMaterials = new Set(materialCache.values()),
    geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((object) => {
    if (object.geometry && !sharedGeometries.has(object.geometry))
      geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const mat of list) {
      if (!mat || persistentMaterials.has(mat)) continue;
      materials.add(mat);
      for (const key of [
        "map",
        "normalMap",
        "roughnessMap",
        "bumpMap",
        "alphaMap",
      ])
        if (mat[key]) textures.add(mat[key]);
    }
  });
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
  for (const m of materials) m.dispose();
  group.clear();
}
