import * as THREE from "../vendor/three.module.js";

// Original, rigged character art. Static parts are batched by material; clones
// share their immutable geometry, materials and hand-painted face textures.
const materials = new Map();
const templates = new Map();
const faceMaterials = new Map();
const PI = Math.PI;
const palette = {
  emilia: {
    hair: 0xe9edff,
    shadow: 0x9580cc,
    dress: 0xfffaff,
    accent: 0x7937d6,
    magic: 0x27dfff,
    eye: "#a037d5",
  },
  rem: {
    hair: 0x3799ec,
    shadow: 0x1757b8,
    dress: 0x171c31,
    accent: 0x358dff,
    magic: 0x08bfff,
    eye: "#176bd5",
  },
  beatrice: {
    hair: 0xffc94e,
    shadow: 0xc78324,
    dress: 0xf15d9d,
    accent: 0xa71d66,
    magic: 0xd94dff,
    eye: "#177cc9",
  },
  subaru: {
    hair: 0x181c29,
    shadow: 0x080d18,
    dress: 0x202639,
    accent: 0xff821c,
    magic: 0xffa629,
    eye: "#79554c",
  },
};

function material(color, options = {}) {
  const k = `${color}:${JSON.stringify(options)}`;
  if (!materials.has(k))
    materials.set(
      k,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0,
        ...options,
      }),
    );
  return materials.get(k);
}
function mesh(geometry, color, options) {
  const o = new THREE.Mesh(geometry, material(color, options));
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function add(parent, object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
function group(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  return add(parent, g, x, y, z);
}
function box(w, h, d, c, bevel = 0.025) {
  if (!bevel) return mesh(new THREE.BoxGeometry(w, h, d), c);
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2,
    r = Math.min(bevel, w / 3, h / 3);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.005, d - 2 * r),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r * 0.5,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 5,
  });
  geo.translate(0, 0, -d / 2 + r);
  return mesh(geo, c);
}
function ellipsoid(rx, ry, rz, c, detail = 20) {
  const geo = new THREE.SphereGeometry(1, detail, Math.max(10, detail / 2));
  geo.scale(rx, ry, rz);
  return mesh(geo, c);
}
function tube(points, radius, c, segments = 16) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  return mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), c);
}
function shape(points, depth, c, bevel = 0.025) {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: !!bevel,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, c);
}
function bow(parent, x, y, z, size, color) {
  const left = shape(
    [
      [0, 0],
      [-0.8, 0.48],
      [-0.9, -0.33],
      [-0.2, -0.18],
    ],
    0.09,
    color,
  );
  left.scale.setScalar(size);
  add(parent, left, x, y, z);
  const right = left.clone();
  right.scale.x *= -1;
  add(parent, right, x, y, z);
  add(
    parent,
    ellipsoid(size * 0.2, size * 0.22, 0.075, color, 12),
    x,
    y,
    z + 0.025,
  );
}
function pleatedSkirt(top, bottom, height, color, scalloped = false) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, 48, 6, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const t = 0.5 - p.getY(i) / height;
    const f = 1 + Math.cos(a * 12) * (0.015 + t * 0.045);
    p.setX(i, p.getX(i) * f);
    p.setZ(i, p.getZ(i) * f);
    if (scalloped && t > 0.9) p.setY(i, p.getY(i) + Math.cos(a * 12) * 0.025);
  }
  geo.computeVertexNormals();
  return mesh(geo, color, { side: THREE.DoubleSide });
}
function ribbon(parent, y, radius, color, width = 0.035) {
  const r = mesh(new THREE.TorusGeometry(radius, width, 6, 48), color);
  r.rotation.x = PI / 2;
  add(parent, r, 0, y, 0);
  return r;
}
function hairLock(width, length, color, bend = 0, depth = 0.1) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.bezierCurveTo(
    -width * 0.72,
    -length * 0.32,
    -width * 0.22 + bend,
    -length * 0.78,
    bend,
    -length,
  );
  s.bezierCurveTo(
    width * 0.48 + bend,
    -length * 0.82,
    width * 0.55,
    -length * 0.22,
    width / 2,
    0,
  );
  s.quadraticCurveTo(0, width * 0.22, -width / 2, 0);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.028,
    bevelThickness: 0.025,
    steps: 1,
    curveSegments: 10,
  });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, color);
}

function faceMaterial(key) {
  if (faceMaterials.has(key)) return faceMaterials.get(key);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const iris = palette[key].eye;
  // Gentle brows, upper lashes, almond whites and two-tone iris. Transparent
  // texture sits on a curved face patch rather than protruding spherical eyes.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(256 + side * 106, 236);
    ctx.scale(side, 1);
    ctx.strokeStyle = key === "subaru" ? "#34303a" : "#655263";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-44, -57);
    ctx.quadraticCurveTo(0, -72, 43, -58);
    ctx.stroke();
    ctx.fillStyle = "#fff9fc";
    ctx.beginPath();
    ctx.moveTo(-57, -19);
    ctx.bezierCurveTo(-34, -57, 36, -54, 57, -13);
    ctx.bezierCurveTo(43, 42, -33, 48, -57, -19);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, -36, 0, 43);
    g.addColorStop(0, "#373752");
    g.addColorStop(0.5, iris);
    g.addColorStop(1, "#b7e1e6");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(1, -1, 34, 48, 0, 0, PI * 2);
    ctx.fill();
    ctx.fillStyle = "#26253b";
    ctx.beginPath();
    ctx.ellipse(0, -8, 14, 27, 0, 0, PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-14, -21, 12, 15, -0.3, 0, PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(15, 20, 6, 0, PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#3d3547";
    ctx.lineWidth = key === "subaru" ? 8 : 11;
    ctx.beginPath();
    ctx.moveTo(-58, -19);
    ctx.bezierCurveTo(-28, -59, 37, -51, 59, -12);
    ctx.stroke();
    if (key !== "subaru") {
      ctx.beginPath();
      ctx.moveTo(48, -25);
      ctx.lineTo(65, -33);
      ctx.moveTo(54, -18);
      ctx.lineTo(70, -19);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const x of [101, 411]) {
    const blush = ctx.createRadialGradient(x, 306, 1, x, 306, 43);
    blush.addColorStop(0, "#ed9b9970");
    blush.addColorStop(1, "#ed9b9900");
    ctx.fillStyle = blush;
    ctx.fillRect(x - 46, 264, 92, 84);
  }
  ctx.strokeStyle = "#c97a7d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(243, 351);
  ctx.quadraticCurveTo(256, 361, 269, 351);
  ctx.stroke();
  ctx.strokeStyle = "#da9e90";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(255, 296);
  ctx.lineTo(251, 307);
  ctx.lineTo(259, 308);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  faceMaterials.set(key, mat);
  return mat;
}

function createHead(parent, key) {
  const p = palette[key],
    head = group(parent, "head", 0, 1.63, 0.025);
  const geo = new THREE.SphereGeometry(0.435, 32, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i),
      x = pos.getX(i);
    pos.setX(i, x * (y < 0 ? 1 + y * 0.38 : 1));
    pos.setY(i, y * 0.94);
    pos.setZ(i, pos.getZ(i) * 0.83);
  }
  geo.computeVertexNormals();
  add(head, mesh(geo, 0xffddc9));
  const faceGeo = new THREE.PlaneGeometry(0.71, 0.57, 24, 16);
  const fp = faceGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i),
      y = fp.getY(i);
    fp.setZ(i, 0.37 - x * x * 0.76 - y * y * 0.4);
  }
  faceGeo.computeVertexNormals();
  add(head, new THREE.Mesh(faceGeo, faceMaterial(key)), 0, -0.03, 0);
  // Stop the cap above the brows. A hemispherical cap extended below eye height
  // previously hid the face patch behind an opaque band in the front view.
  const scalp = mesh(
    new THREE.SphereGeometry(0.46, 28, 16, 0, PI * 2, 0, PI * 0.43),
    p.hair,
  );
  scalp.scale.set(1, 0.92, 0.92);
  add(head, scalp, 0, 0.035, -0.015);
  // Sculpted, overlapping fringe pieces form the silhouette and frame the face.
  const fringe = group(head, "fringe", 0, 0.32, 0.255);
  const fringeCount = key === "subaru" ? 7 : 5;
  for (let i = 0; i < fringeCount; i++) {
    const u = i - (fringeCount - 1) / 2;
    const length =
      key === "rem"
        ? 0.2 + (u > 0 ? 0.22 : 0.015)
        : key === "subaru"
          ? 0.2 + (i % 3) * 0.055
          : 0.18 + (i % 2) * 0.025;
    const lock = hairLock(
      key === "subaru" ? 0.17 : 0.2,
      length,
      i % 3 === 0 ? p.shadow : p.hair,
      key === "rem" ? -0.05 : u * -0.018,
    );
    lock.rotation.z = key === "subaru" ? -u * 0.23 : -u * 0.08;
    add(
      fringe,
      lock,
      u * (key === "subaru" ? 0.1 : 0.145),
      -0.025 * Math.abs(u),
      0.065 - Math.abs(u) * 0.025,
    );
  }
  if (key === "emilia") {
    for (const s of [-1, 1]) {
      const ear = shape(
        [
          [0, 0.11],
          [s * 0.25, 0.16],
          [s * 0.16, -0.08],
          [0, -0.1],
        ],
        0.035,
        0xffddc9,
        0.018,
      );
      add(head, ear, s * 0.38, -0.015, 0);
      const side = group(head, `hair-${s}`, s * 0.38, 0.18, -0.06);
      for (let i = 0; i < 3; i++) {
        const lock = hairLock(
          0.19,
          0.99 + i * 0.06,
          i === 2 ? p.shadow : p.hair,
          s * (0.12 - i * 0.04),
          0.13,
        );
        add(side, lock, s * (i * 0.075 - 0.03), -0.03 * i, -0.05 * i);
      }
    }
    const back = group(head, "hair-back", 0, 0.18, -0.31);
    for (let i = -2; i <= 2; i++)
      add(
        back,
        hairLock(
          0.23,
          1.04 - Math.abs(i) * 0.1,
          i % 2 ? p.shadow : p.hair,
          i * 0.035,
          0.16,
        ),
        i * 0.13,
        0,
        -0.03,
      );
    const flower = group(head, "flower", -0.37, 0.15, 0.21);
    for (let i = 0; i < 5; i++) {
      const petal = ellipsoid(0.075, 0.12, 0.028, 0xffffff, 12);
      petal.rotation.z = i * PI * 0.4;
      add(
        flower,
        petal,
        Math.sin(i * PI * 0.4) * 0.07,
        Math.cos(i * PI * 0.4) * 0.07,
        0,
      );
    }
    add(flower, ellipsoid(0.045, 0.045, 0.04, 0xd6b767, 12), 0, 0, 0.03);
  } else if (key === "rem") {
    for (const s of [-1, 1]) {
      const lock = hairLock(0.29, 0.54, p.hair, -s * 0.05, 0.22);
      lock.rotation.z = -s * 0.12;
      add(head, lock, s * 0.33, 0.1, -0.05);
    }
    const back = ellipsoid(0.425, 0.35, 0.27, p.shadow);
    add(head, back, 0, -0.02, -0.18);
    // White lace circlet follows the contour rather than a flat rectangular band.
    for (let i = -4; i <= 4; i++) {
      const a = i * 0.16,
        ruffle = shape(
          [
            [-0.065, 0],
            [-0.055, 0.11],
            [0, 0.14],
            [0.055, 0.11],
            [0.065, 0],
          ],
          0.04,
          0xfffbef,
          0.012,
        );
      ruffle.rotation.z = -a;
      add(head, ruffle, Math.sin(a) * 0.46, Math.cos(a) * 0.45, 0.02);
    }
    bow(head, -0.35, 0.15, 0.29, 0.13, 0xf5c0cb);
    add(
      head,
      shape(
        [
          [-0.055, 0],
          [0, 0.17],
          [0.055, 0],
        ],
        0.035,
        0xf5c9dc,
        0.012,
      ),
      -0.08,
      0.43,
      -0.02,
    );
  } else if (key === "beatrice") {
    for (const s of [-1, 1]) {
      const curls = group(head, `hair-${s}`, s * 0.45, 0.18, -0.02);
      const points = [];
      for (let i = 0; i <= 96; i++) {
        const t = i / 96,
          a = t * PI * 7;
        points.push([
          Math.cos(a) * (0.12 - 0.035 * t),
          -0.85 * t,
          Math.sin(a) * 0.13,
        ]);
      }
      add(curls, tube(points, 0.075, p.hair, 100));
      add(
        curls,
        tube(
          [
            [0, 0.07, 0],
            [s * 0.035, 0.13, 0.02],
            [s * 0.12, 0.04, 0],
          ],
          0.07,
          p.shadow,
          12,
        ),
      );
      bow(head, s * 0.44, 0.24, 0.06, 0.22, p.accent);
    }
    const back = hairLock(0.62, 0.47, p.hair, 0, 0.2);
    add(head, back, 0, 0.2, -0.3);
    const tiara = tube(
      [
        [-0.27, 0.35, 0.13],
        [0, 0.44, 0.2],
        [0.27, 0.35, 0.13],
      ],
      0.025,
      0xf6edda,
      20,
    );
    add(head, tiara);
  } else {
    const spikes = group(head, "hair-back", 0, 0.34, -0.08);
    for (let i = -3; i <= 3; i++) {
      const lock = hairLock(
        0.2,
        0.18 + (3 - Math.abs(i)) * 0.022,
        p.hair,
        -i * 0.035,
        0.15,
      );
      lock.rotation.z = PI + i * 0.29;
      add(spikes, lock, i * 0.105, 0, -0.07);
    }
    for (const s of [-1, 1])
      add(head, hairLock(0.16, 0.2, p.hair, s * 0.03), s * 0.4, 0.05, -0.04);
  }
  return head;
}

function createBody(parent, key) {
  const p = palette[key],
    body = group(parent, "body");
  const isSubaru = key === "subaru";
  for (const s of [-1, 1]) {
    const leg = group(body, `leg-${s}`, s * 0.145, 0.43, 0);
    add(
      leg,
      mesh(
        new THREE.CylinderGeometry(0.095, 0.08, 0.35, 10),
        key === "emilia" ? 0xf5edf3 : key === "subaru" ? 0x272b36 : 0xf5e5e0,
      ),
      0,
      -0.06,
      0,
    );
    add(
      leg,
      box(
        0.19,
        0.16,
        0.32,
        isSubaru ? 0xe8e8e3 : key === "emilia" ? 0xe5dbea : 0x292939,
        0.035,
      ),
      0,
      -0.24,
      0.065,
    );
    add(
      leg,
      box(0.2, 0.045, 0.33, isSubaru ? 0x53535c : 0x686278, 0.01),
      0,
      -0.31,
      0.065,
    );
    if (isSubaru)
      add(leg, box(0.12, 0.035, 0.02, p.accent, 0.005), 0, -0.2, 0.23);
  }
  if (!isSubaru) {
    const skirtColor = key === "rem" ? 0x292b3c : p.dress;
    add(
      body,
      pleatedSkirt(
        0.22,
        key === "beatrice" ? 0.49 : 0.43,
        0.57,
        skirtColor,
        true,
      ),
      0,
      0.64,
      0,
    );
    add(
      body,
      pleatedSkirt(0.26, key === "beatrice" ? 0.5 : 0.45, 0.11, 0xfff4eb, true),
      0,
      0.39,
      0,
    );
    ribbon(body, 0.435, key === "beatrice" ? 0.475 : 0.427, p.accent, 0.018);
    add(
      body,
      mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.44, 20), p.dress),
      0,
      1.01,
      0,
    );
    if (key === "rem") {
      const apron = shape(
        [
          [-0.16, 0.22],
          [0.16, 0.22],
          [0.12, -0.02],
          [0.29, -0.43],
          [-0.29, -0.43],
          [-0.12, -0.02],
        ],
        0.018,
        0xfff8ec,
        0.01,
      );
      add(body, apron, 0, 0.98, 0.276);
      for (const s of [-1, 1]) {
        const strap = box(0.065, 0.38, 0.025, 0xfff8ec, 0.012);
        strap.rotation.z = s * 0.12;
        add(body, strap, s * 0.16, 1.1, 0.22);
      }
      bow(body, 0, 0.86, -0.27, 0.23, 0xfff6ea);
    } else {
      const bodice = shape(
        [
          [-0.18, 0.22],
          [0.18, 0.22],
          [0.14, -0.21],
          [-0.14, -0.21],
        ],
        0.02,
        key === "emilia" ? 0xb69ae9 : 0xb9236e,
        0.015,
      );
      add(body, bodice, 0, 1.01, 0.245);
      for (let i = 0; i < 3; i++)
        add(
          body,
          box(0.08, 0.018, 0.018, 0xf8e7d2, 0.004),
          0,
          0.95 + i * 0.07,
          0.278,
        );
      if (key === "emilia") {
        for (const s of [-1, 1]) {
          const panel = shape(
            [
              [0, 0.22],
              [s * 0.12, 0.16],
              [s * 0.22, -0.42],
              [s * 0.02, -0.34],
            ],
            0.02,
            0xffffff,
            0.012,
          );
          add(body, panel, s * 0.13, 0.89, 0.31);
        }
      }
    }
    // Two separate scalloped collar panels and chest bow.
    for (const s of [-1, 1]) {
      const collar = shape(
        [
          [0, 0.05],
          [s * 0.21, 0.07],
          [s * 0.16, -0.09],
        ],
        0.025,
        0xfffbf3,
        0.012,
      );
      add(body, collar, s * 0.01, 1.24, 0.21);
    }
    bow(body, 0, 1.19, 0.29, key === "beatrice" ? 0.15 : 0.115, p.accent);
    if (key === "beatrice")
      for (const s of [-1, 1]) {
        const panel = shape(
          [
            [0, 0.08],
            [s * 0.12, 0.08],
            [s * 0.23, -0.35],
            [s * 0.04, -0.3],
          ],
          0.025,
          0xf8e9db,
          0.012,
        );
        add(body, panel, s * 0.13, 0.78, 0.37);
      }
  } else {
    add(body, box(0.55, 0.62, 0.34, p.dress, 0.075), 0, 0.96, 0);
    add(
      body,
      shape(
        [
          [-0.23, 0.22],
          [0.23, 0.22],
          [0.17, 0.06],
          [-0.17, 0.06],
        ],
        0.035,
        0xf3efe5,
        0.015,
      ),
      0,
      1.08,
      0.19,
    );
    for (const s of [-1, 1])
      add(body, box(0.045, 0.52, 0.025, p.accent, 0.005), s * 0.18, 0.98, 0.2);
    add(body, box(0.016, 0.47, 0.02, 0xbbbcc2, 0.003), 0, 1.0, 0.213);
    add(body, box(0.06, 0.03, 0.035, 0xfff3de, 0.006), 0, 1.16, 0.225);
    add(body, box(0.52, 0.055, 0.36, 0x222632, 0.01), 0, 0.655, 0);
  }
  add(
    body,
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.17, 16), 0xffddc9),
    0,
    1.31,
    0,
  );
  for (const s of [-1, 1]) {
    const arm = group(parent, `arm-${s}`, s * 0.31, 1.19, 0);
    arm.rotation.z = -s * 0.1;
    if (!isSubaru) {
      add(
        arm,
        ellipsoid(0.145, 0.16, 0.15, key === "rem" ? 0xf6f0e8 : p.dress, 16),
        s * 0.025,
        -0.04,
        0,
      );
      add(
        arm,
        mesh(
          new THREE.CylinderGeometry(0.085, 0.065, 0.27, 12),
          key === "emilia" ? 0xf5f0f7 : 0xffddc9,
        ),
        s * 0.045,
        -0.21,
        0.01,
      );
      add(
        arm,
        mesh(
          new THREE.CylinderGeometry(0.085, 0.09, 0.08, 12),
          key === "rem" ? 0xfffbf2 : p.accent,
        ),
        s * 0.045,
        -0.32,
        0.01,
      );
    } else {
      add(
        arm,
        mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.37, 12), p.dress),
        s * 0.025,
        -0.16,
        0,
      );
      add(arm, box(0.035, 0.31, 0.13, p.accent, 0.008), s * 0.11, -0.16, 0.02);
      add(
        arm,
        mesh(new THREE.CylinderGeometry(0.092, 0.095, 0.07, 12), 0xeee9de),
        s * 0.025,
        -0.345,
        0,
      );
    }
    add(
      arm,
      ellipsoid(0.09, 0.11, 0.085, 0xffddc9, 16),
      s * 0.04,
      -0.39,
      0.025,
    );
  }
  return body;
}

function heroEquipment(root, key, levels) {
  const p = palette[key],
    right = root.getObjectByName("arm-1"),
    left = root.getObjectByName("arm--1");
  const tier = Math.max(...levels),
    power = levels[0];
  if (key === "emilia") {
    const magic = group(right, "weapon", 0.15, -0.3, 0.12);
    const crystal = mesh(
      new THREE.OctahedronGeometry(0.15 + power * 0.012, 0),
      p.magic,
      {
        metalness: 0.25,
        roughness: 0.22,
        emissive: p.magic,
        emissiveIntensity: 0.35,
      },
    );
    crystal.scale.y = 1.55;
    add(magic, crystal, 0, 0.03, 0);
    for (let i = 0; i < 4; i++) {
      const tiny = mesh(new THREE.OctahedronGeometry(0.04, 0), 0xffffff);
      add(
        magic,
        tiny,
        Math.cos((i * PI) / 2) * 0.2,
        Math.sin((i * PI) / 2) * 0.2,
        0,
      );
    }
  } else if (key === "rem") {
    const weapon = group(right, "weapon", 0.02, -0.4, 0.025);
    add(weapon, box(0.055, 0.23, 0.055, 0x59444a, 0.01), 0, -0.07, 0);
    const points = [
      [0, -0.17, 0],
      [0.15, -0.27, 0.02],
      [0.28, -0.2, 0.05],
      [0.38, -0.36, 0.05],
      [0.48, -0.42, 0.06],
    ];
    add(weapon, tube(points, 0.015, 0xb9c7cf, 24));
    const ball = group(weapon, "mace", 0.5, -0.43, 0.06);
    add(
      ball,
      mesh(new THREE.IcosahedronGeometry(0.205 + power * 0.008, 1), 0x6a7c91, {
        metalness: 0.65,
        roughness: 0.3,
      }),
    );
    for (const v of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const spike = mesh(new THREE.ConeGeometry(0.055, 0.14, 4), 0xd6e0e6, {
        metalness: 0.6,
        roughness: 0.3,
      });
      spike.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...v),
      );
      add(ball, spike, v[0] * 0.22, v[1] * 0.22, v[2] * 0.22);
    }
  } else if (key === "beatrice") {
    const book = group(left, "weapon", -0.05, -0.31, 0.17);
    book.rotation.set(-0.25, -0.3, 0.05);
    add(book, box(0.3, 0.38, 0.09, 0x86184f, 0.018));
    add(book, box(0.27, 0.345, 0.07, 0xf9eccb, 0.008), 0.007, 0, 0.015);
    add(book, box(0.32, 0.39, 0.025, 0xc22b80, 0.012), 0, 0, 0.065);
    for (const y of [-0.14, 0.14])
      add(book, box(0.28, 0.016, 0.018, 0xe1b96c, 0.003), 0, y, 0.084);
    const seal = mesh(new THREE.TorusGeometry(0.065, 0.012, 5, 16), 0xe8c985);
    add(book, seal, 0, 0, 0.087);
    add(
      book,
      shape(
        [
          [-0.02, 0.03],
          [0.02, 0.03],
          [0.02, -0.18],
          [0, -0.14],
          [-0.02, -0.18],
        ],
        0.01,
        0xf2c777,
        0.003,
      ),
      0.07,
      -0.15,
      0.08,
    );
    // This small cast glyph is part of the rig, not a per-frame particle. It
    // follows Beatrice's open hand and appears only during the release pose.
    const focus = group(right, "cast-focus", 0.06, -0.42, 0.18);
    const glyphMaterial = { emissive: p.magic, emissiveIntensity: 1.25, roughness: 0.35 };
    add(focus, mesh(new THREE.TorusGeometry(0.19, 0.017, 6, 36), p.magic, glyphMaterial));
    const diamond = mesh(new THREE.TorusGeometry(0.125, 0.012, 4, 4), p.magic, glyphMaterial);
    diamond.rotation.z = PI / 4;
    add(focus, diamond);
    focus.visible = false;
  } else {
    const whip = group(right, "weapon", 0.05, -0.38, 0.01);
    add(whip, box(0.055, 0.24, 0.055, 0x5d4541, 0.009), 0, -0.03, 0);
    add(
      whip,
      tube(
        [
          [0, -0.13, 0],
          [0.16, -0.2, 0.05],
          [0.26, -0.4, 0.04],
          [0.4, -0.49, -0.02],
          [0.55, -0.36, 0],
        ],
        0.018,
        0xbca47c,
        26,
      ),
    );
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = "attack-muzzle";
  const muzzleHolder = key === "beatrice"
    ? root.getObjectByName("cast-focus")
    : key === "rem" ? root.getObjectByName("mace") : root.getObjectByName("weapon");
  muzzleHolder.add(muzzle);
  muzzle.position.z = key === "subaru" ? 0.06 : 0.03;
  if (tier > 0) {
    const head = root.getObjectByName("head");
    for (let i = 0; i < Math.min(5, tier); i++)
      add(
        root.getObjectByName("body"),
        mesh(new THREE.OctahedronGeometry(0.035, 0), p.magic, {
          emissive: p.magic,
          emissiveIntensity: 0.5,
        }),
        -0.12 + i * 0.06,
        0.76,
        0.315,
      );
    if (tier >= 3) {
      const cape = shape(
        [
          [-0.23, 0.15],
          [0.23, 0.15],
          [0.44, -0.7],
          [0.23, -0.82],
          [0, -0.72],
          [-0.23, -0.82],
          [-0.44, -0.7],
        ],
        0.025,
        p.accent,
        0.018,
      );
      cape.rotation.x = -0.1;
      add(root.getObjectByName("body"), cape, 0, 1.1, -0.24);
      for (const s of [-1, 1])
        add(
          head,
          mesh(new THREE.OctahedronGeometry(0.07), p.magic, {
            emissive: p.magic,
            emissiveIntensity: 0.6,
          }),
          s * 0.46,
          0.15,
          0.02,
        );
    }
    if (tier >= 5) {
      const crown = group(head, "crown", 0, 0.44, 0);
      ribbon(crown, 0.02, 0.26, 0xf0cf80, 0.027);
      for (let i = 0; i < 5; i++) {
        const a = (i * PI * 2) / 5,
          gem = mesh(new THREE.OctahedronGeometry(0.075), p.magic, {
            emissive: p.magic,
            emissiveIntensity: 0.45,
          });
        gem.scale.y = 1.5;
        add(crown, gem, Math.sin(a) * 0.25, 0.1, Math.cos(a) * 0.25);
      }
    }
  }
}

// Geometry batches keep the detailed little characters practical on mobile.
// Each rig node remains a node; only its rigid mesh children are merged.
function batchRigidParts(root) {
  for (const child of [...root.children])
    if (child.isGroup) batchRigidParts(child);
  const batches = new Map();
  for (const child of [...root.children]) {
    if (!child.isMesh || child.material.transparent) continue;
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(child);
  }
  for (const [mat, children] of batches) {
    if (children.length < 2) continue;
    let length = 0;
    const geometries = children.map((c) => {
      c.updateMatrix();
      const g = c.geometry.index
        ? c.geometry.toNonIndexed()
        : c.geometry.clone();
      g.applyMatrix4(c.matrix);
      length += g.attributes.position.count;
      return g;
    });
    const positions = new Float32Array(length * 3),
      normals = new Float32Array(length * 3);
    let offset = 0;
    for (const g of geometries) {
      positions.set(g.attributes.position.array, offset);
      normals.set(g.attributes.normal.array, offset);
      offset += g.attributes.position.array.length;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    const combined = new THREE.Mesh(geo, mat);
    combined.castShadow = true;
    combined.receiveShadow = true;
    root.add(combined);
    for (const c of children) {
      root.remove(c);
      c.geometry.dispose();
    }
  }
}

function connectRig(root) {
  const weapon = root.getObjectByName("weapon");
  root.userData.muzzle = root.getObjectByName("attack-muzzle");
  root.userData.rig = {
    body: root.getObjectByName("body"),
    head: root.getObjectByName("head"),
    left: root.getObjectByName("arm--1"),
    right: root.getObjectByName("arm-1"),
    hair: ["hair--1", "hair-1", "hair-back", "fringe"]
      .map((n) => root.getObjectByName(n))
      .filter(Boolean),
    weapon,
    mace: root.getObjectByName("mace"),
    focus: root.getObjectByName("cast-focus"),
    weaponRest: weapon ? {
      x: weapon.position.x, y: weapon.position.y, z: weapon.position.z,
      rx: weapon.rotation.x, ry: weapon.rotation.y, rz: weapon.rotation.z,
    } : null,
  };
  return root;
}

export function createHero(key, levels = [0, 0, 0]) {
  if (!palette[key]) key = "emilia";
  const cacheKey = `${key}:${levels.join(",")}`;
  if (!templates.has(cacheKey)) {
    const root = new THREE.Group();
    root.name = `hero-${key}`;
    root.userData.hero = key;
    createBody(root, key);
    createHead(root, key);
    heroEquipment(root, key, levels);
    batchRigidParts(root);
    templates.set(cacheKey, root);
  }
  return connectRig(templates.get(cacheKey).clone(true));
}

// Callers can reuse their own target Vector3. Refreshing matrices here lets a
// projectile originate at the posed hand/weapon, including rotated heroes.
export function getAttackOrigin(root, target = new THREE.Vector3()) {
  root.updateWorldMatrix(true, true);
  return (root.userData.muzzle || root.userData.rig?.right || root).getWorldPosition(target);
}

export function animateHero(root, time, attack = 0) {
  const rig = root.userData.rig;
  if (!rig) return;
  const hero = root.userData.hero;
  const phase = time * 2.3 + (hero === "subaru" ? 1.5 : 0);
  const breath = Math.sin(phase);
  // The engine supplies a countdown from 1 to 0. A brief anticipation gives
  // way to a much larger release gesture, then settles back into idle. The
  // envelopes are zero at both ends and never accumulate transforms.
  const progress = 1 - Math.max(0, Math.min(1, attack));
  const windup = attack > 0 ? Math.sin(Math.min(1, progress / 0.3) * PI) : 0;
  const release = attack > 0 ? Math.sin(Math.min(1, Math.max(0, (progress - 0.18) / 0.82)) * PI) : 0;
  const recoil = attack > 0 ? Math.sin(progress * PI * 2) * Math.sin(progress * PI) : 0;

  rig.head.position.y = 1.63 + breath * 0.012 - release * 0.035;
  rig.head.rotation.set(release * 0.06, Math.sin(time * 0.7) * 0.04, breath * 0.03);
  rig.body.rotation.set(breath * 0.018, Math.sin(phase * 0.7) * 0.025, breath * 0.012);
  rig.body.scale.y = 1 + breath * 0.006;
  rig.left.position.y = rig.right.position.y = 1.19 + breath * 0.009;
  rig.left.rotation.set(breath * 0.045, 0, 0.14 + Math.sin(phase + 0.7) * 0.04);
  rig.right.rotation.set(-breath * 0.045, 0, -0.14 - Math.sin(phase + 0.7) * 0.04);

  const weapon = rig.weapon;
  const rest = rig.weaponRest;
  if (weapon) {
    weapon.position.set(rest.x, rest.y, rest.z);
    weapon.rotation.set(rest.rx, rest.ry, rest.rz);
    weapon.scale.setScalar(1);
  }
  if (hero === "emilia") {
    // Gather an ice crystal beside the shoulder, then cast with an extended
    // hand; the second arm opens to frame the spell silhouette.
    rig.right.rotation.x += windup * 0.55 - release * 1.5;
    rig.right.rotation.y = -windup * 0.25 - release * 0.2;
    rig.right.rotation.z += windup * 0.32 - release * 0.38;
    rig.left.rotation.x -= release * 0.8;
    rig.left.rotation.z += release * 0.48;
    rig.body.rotation.x += windup * 0.06 - release * 0.14;
    rig.body.rotation.y += windup * 0.15 - release * 0.18;
    weapon.rotation.y = time * 1.1 + release * 2.4;
    weapon.scale.setScalar(1 + release * 0.55);
  } else if (hero === "rem") {
    // A broad shoulder-led mace sweep, with the chain/ball carried by their
    // own weapon pivot instead of a barely visible wrist twitch.
    rig.right.rotation.x += windup * 0.8 - release * 1.35;
    rig.right.rotation.y = -windup * 0.65 + release * 0.85;
    rig.right.rotation.z += windup * 0.55 - release * 0.95;
    rig.left.rotation.x -= release * 0.4;
    rig.left.rotation.z += release * 0.55;
    rig.body.rotation.x += windup * 0.07 - release * 0.2;
    rig.body.rotation.y += -windup * 0.28 + release * 0.5;
    rig.head.rotation.z -= release * 0.08;
    weapon.rotation.y += -windup * 0.35 + release * 1.2;
    weapon.rotation.z += windup * 0.4 - release * 1.3;
    if (rig.mace) rig.mace.rotation.set(release * 2.4, time * 0.3, -release * 1.6);
  } else if (hero === "beatrice") {
    // Lift the grimoire into reading position and push a yin seal outward
    // with the free hand. The book remains attached to the left-hand pivot.
    rig.left.rotation.x += windup * 0.12 - release * 0.9;
    rig.left.rotation.y = -release * 0.18;
    rig.left.rotation.z += release * 0.34;
    rig.right.rotation.x += windup * 0.4 - release * 1.45;
    rig.right.rotation.z -= release * 0.42;
    rig.body.rotation.x += windup * 0.05 - release * 0.12;
    rig.head.rotation.x += release * 0.1;
    weapon.rotation.x -= release * 0.32;
    weapon.rotation.y += release * 0.2;
    weapon.position.y += Math.sin(phase * 0.8) * 0.01 + release * 0.04;
    if (rig.focus) {
      rig.focus.visible = release > 0.1;
      rig.focus.scale.setScalar(0.75 + release * 0.9);
      rig.focus.rotation.z = time * 0.9 + release * 1.1;
    }
  } else {
    // Subaru puts his weight into a quick whip lash, with the other arm
    // counterbalancing the torso. No external root placement is modified.
    rig.right.rotation.x += windup * 0.65 - release * 1.4;
    rig.right.rotation.y = -windup * 0.65 + release * 0.85;
    rig.right.rotation.z += windup * 0.45 - release * 0.8;
    rig.left.rotation.x -= release * 0.35;
    rig.left.rotation.z += release * 0.58;
    rig.body.rotation.x += windup * 0.09 - release * 0.21;
    rig.body.rotation.y += -windup * 0.25 + release * 0.42;
    weapon.rotation.x -= release * 0.5;
    weapon.rotation.y += -windup * 0.45 + release * 1.15;
    weapon.rotation.z -= release * 0.7;
  }
  for (let i = 0; i < rig.hair.length; i++) {
    rig.hair[i].rotation.z = Math.sin(phase + i * 0.8) * 0.034 + recoil * (i % 2 ? 1 : -1) * 0.055;
    rig.hair[i].rotation.x = Math.sin(phase * 0.8 + i) * 0.022 + release * 0.075;
  }
}

function enemyBody(type) {
  const boss = type === "boss",
    armored = type === "armored",
    runner = type === "runner",
    wraith = type === "wraith";
  const root = new THREE.Group();
  root.name = `enemy-${type}`;
  root.userData.enemy = type;
  const body = group(root, "body");
  const ink = boss
    ? 0x69264f
    : armored
      ? 0x465674
      : runner
        ? 0x257d9c
        : wraith
          ? 0x7c3aa7
          : 0x57378c;
  const glow = boss ? 0xff3c8e : runner ? 0x42edff : 0xd58bff;
  if (runner) {
    // A masked shadow fox: distinct fast, low silhouette with four legs and tail.
    add(body, ellipsoid(0.27, 0.31, 0.56, ink), 0, 0.48, -0.03);
    for (const s of [-1, 1])
      for (const z of [-0.3, 0.27]) {
        const leg = group(root, `leg-${s}-${z}`, s * 0.21, 0.38, z);
        add(leg, box(0.12, 0.34, 0.15, 0x283f50, 0.025), 0, -0.15, 0.03);
        add(leg, box(0.14, 0.08, 0.24, 0x273644, 0.015), 0, -0.31, 0.08);
      }
    const head = group(root, "head", 0, 0.73, 0.42);
    add(head, ellipsoid(0.3, 0.25, 0.31, ink));
    for (const s of [-1, 1]) {
      const ear = shape(
        [
          [0, 0],
          [s * 0.06, 0.36],
          [s * 0.22, 0.02],
        ],
        0.1,
        ink,
        0.02,
      );
      add(head, ear, s * 0.08, 0.1, -0.05);
      const eye = box(0.1, 0.055, 0.025, glow, 0.012);
      eye.rotation.z = s * -0.15;
      add(head, eye, s * 0.16, 0.03, 0.27);
    }
    add(
      head,
      shape(
        [
          [-0.14, 0.06],
          [0.14, 0.06],
          [0, -0.1],
        ],
        0.12,
        0xd4dfd2,
        0.02,
      ),
      0,
      -0.09,
      0.27,
    );
    add(
      body,
      tube(
        [
          [0, 0.5, -0.4],
          [0.1, 0.75, -0.75],
          [0.12, 0.94, -0.82],
          [0.05, 1.02, -0.7],
        ],
        0.11,
        ink,
        18,
      ),
    );
    add(
      body,
      tube(
        [
          [0.05, 0.94, -0.8],
          [0.05, 1.02, -0.7],
        ],
        0.105,
        glow,
        8,
      ),
    );
  } else {
    add(
      body,
      pleatedSkirt(0.24, boss ? 0.64 : 0.4, boss ? 0.9 : 0.72, ink, true),
      0,
      boss ? 0.65 : 0.5,
      0,
    );
    add(
      body,
      ellipsoid(
        boss ? 0.48 : 0.29,
        boss ? 0.52 : 0.35,
        boss ? 0.33 : 0.25,
        ink,
      ),
      0,
      boss ? 1.12 : 0.87,
      0,
    );
    const head = group(root, "head", 0, boss ? 1.67 : 1.2, 0.01);
    // Hood is a shaped shell; a pale, angular mask provides a readable face.
    add(
      head,
      ellipsoid(
        boss ? 0.49 : 0.35,
        boss ? 0.5 : 0.36,
        boss ? 0.36 : 0.28,
        boss ? 0x34243f : 0x302d49,
      ),
      0,
      0,
      -0.02,
    );
    const mask = shape(
      [
        [-0.24, 0.17],
        [0.24, 0.17],
        [0.22, -0.12],
        [0, -0.28],
        [-0.22, -0.12],
      ],
      0.045,
      boss ? 0xffd4e6 : 0xf0e6ff,
      0.035,
    );
    mask.scale.setScalar(boss ? 1.3 : 1);
    add(head, mask, 0, -0.01, boss ? 0.32 : 0.255);
    for (const s of [-1, 1]) {
      const eye = shape(
        [
          [-0.075, 0.025],
          [0.075, 0.04],
          [0.055, -0.025],
          [-0.055, -0.04],
        ],
        0.015,
        glow,
        0.007,
      );
      eye.material = material(glow, { emissive: glow, emissiveIntensity: 0.8 });
      add(head, eye, s * (boss ? 0.15 : 0.11), 0.015, boss ? 0.377 : 0.306);
      const arm = group(
        root,
        `arm-${s}`,
        s * (boss ? 0.45 : 0.29),
        boss ? 1.16 : 0.89,
        0,
      );
      arm.rotation.z = s * -0.2;
      add(
        arm,
        hairLock(boss ? 0.28 : 0.17, boss ? 0.57 : 0.42, ink, s * 0.08, 0.18),
        0,
        0,
        0,
      );
      add(
        arm,
        shape(
          [
            [-0.075, 0.03],
            [0.075, 0.03],
            [0.09, -0.15],
            [0, -0.09],
            [-0.09, -0.15],
          ],
          0.065,
          0xb8abc8,
          0.01,
        ),
        0,
        boss ? -0.51 : -0.36,
        0.02,
      );
      if (boss) {
        const horn = tube(
          [
            [s * 0.27, 0.24, 0],
            [s * 0.49, 0.45, -0.07],
            [s * 0.57, 0.75, -0.1],
            [s * 0.42, 0.9, -0.08],
          ],
          0.09,
          0xc0a2bf,
          16,
        );
        add(head, horn);
        add(body, box(0.4, 0.2, 0.44, 0x9c758f, 0.035), s * 0.42, 1.25, 0);
      }
    }
    if (armored || boss) {
      const armor = shape(
        [
          [-0.28, 0.2],
          [0.28, 0.2],
          [0.25, -0.17],
          [0, -0.27],
          [-0.25, -0.17],
        ],
        0.09,
        boss ? 0xab427d : 0x8498bd,
        0.025,
      );
      armor.scale.setScalar(boss ? 1.4 : 1);
      add(body, armor, 0, boss ? 1.1 : 0.89, boss ? 0.35 : 0.26);
      add(
        body,
        mesh(new THREE.OctahedronGeometry(boss ? 0.12 : 0.075), glow, {
          emissive: glow,
          emissiveIntensity: 0.6,
        }),
        0,
        boss ? 1.12 : 0.91,
        boss ? 0.43 : 0.34,
      );
    }
    if (wraith) {
      for (const s of [-1, 1]) {
        const wing = shape(
          [
            [0, 0.1],
            [s * 0.6, 0.42],
            [s * 0.47, -0.02],
            [s * 0.66, -0.3],
            [s * 0.25, -0.2],
          ],
          0.045,
          0xa852ce,
          0.018,
        );
        add(body, wing, s * 0.18, 0.9, -0.14);
      }
      ribbon(body, 0.2, 0.38, glow, 0.014);
    }
    if (!boss && !wraith)
      for (const s of [-1, 1]) {
        const foot = group(root, `leg-${s}`, s * 0.13, 0.15, 0);
        add(foot, box(0.13, 0.17, 0.2, 0x28263d, 0.02), 0, -0.02, 0.08);
      }
  }
  batchRigidParts(root);
  return root;
}

export function createEnemy(type = "shade") {
  if (!["shade", "runner", "armored", "wraith", "boss"].includes(type))
    type = "shade";
  const key = `enemy:${type}`;
  if (!templates.has(key)) templates.set(key, enemyBody(type));
  const root = templates.get(key).clone(true);
  root.userData.rig = {
    head: root.getObjectByName("head"),
    body: root.getObjectByName("body"),
    arms: [
      root.getObjectByName("arm--1"),
      root.getObjectByName("arm-1"),
    ].filter(Boolean),
    legs: root.children.filter((c) => c.name.startsWith("leg-")),
  };
  return root;
}

export function animateEnemy(root, time, moving = true) {
  const rig = root.userData.rig;
  if (!rig) return;
  const fox = root.userData.enemy === "runner",
    stride = moving ? Math.sin(time * (fox ? 15 : 7)) : 0;
  rig.body.rotation.z = stride * (fox ? 0.025 : 0.045);
  if (rig.head) rig.head.rotation.z = -stride * 0.025;
  rig.arms.forEach((a, i) => {
    a.rotation.x = stride * (i ? 1 : -1) * 0.22;
  });
  rig.legs.forEach((a, i) => {
    a.rotation.x = stride * (i % 2 ? 1 : -1) * 0.38;
  });
}
