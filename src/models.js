import * as THREE from '../vendor/three.module.js';

// Original, rigged character art. Static parts are batched by material; clones
// share their immutable geometry, materials and hand-painted face textures.
const materials = new Map();
const templates = new Map();
const faceMaterials = new Map();
const PI = Math.PI;
const palette = {
  emilia: { hair: 0xe8e9f4, shadow: 0xada7ce, dress: 0xf9f3ff, accent: 0x916ac2, magic: 0x9deeff, eye: '#9256c1' },
  rem: { hair: 0x73bcec, shadow: 0x3f83bd, dress: 0x28293c, accent: 0x99d6f4, magic: 0x68caff, eye: '#399bc6' },
  beatrice: { hair: 0xf3ce75, shadow: 0xc28a45, dress: 0xe397ad, accent: 0xa63e69, magic: 0xe6adff, eye: '#5a89b5' },
  subaru: { hair: 0x252a35, shadow: 0x101521, dress: 0x303440, accent: 0xf49a39, magic: 0xffbd6c, eye: '#79554c' },
};

function material(color, options = {}) {
  const k = `${color}:${JSON.stringify(options)}`;
  if (!materials.has(k)) materials.set(k, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: 0, ...options }));
  return materials.get(k);
}
function mesh(geometry, color, options) {
  const o = new THREE.Mesh(geometry, material(color, options));
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
function add(parent, object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z); parent.add(object); return object;
}
function group(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.name = name; return add(parent, g, x, y, z);
}
function box(w, h, d, c, bevel = .025) {
  if (!bevel) return mesh(new THREE.BoxGeometry(w, h, d), c);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2, r = Math.min(bevel, w / 3, h / 3);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(.005, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * .5, bevelSegments: 2, steps: 1, curveSegments: 5 });
  geo.translate(0, 0, -d / 2 + r);
  return mesh(geo, c);
}
function ellipsoid(rx, ry, rz, c, detail = 20) {
  const geo = new THREE.SphereGeometry(1, detail, Math.max(10, detail / 2)); geo.scale(rx, ry, rz);
  return mesh(geo, c);
}
function tube(points, radius, c, segments = 16) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), c);
}
function shape(points, depth, c, bevel = .025) {
  const s = new THREE.Shape(); s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: !!bevel, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, c);
}
function bow(parent, x, y, z, size, color) {
  const left = shape([[0, 0], [-.8, .48], [-.9, -.33], [-.2, -.18]], .09, color);
  left.scale.setScalar(size); add(parent, left, x, y, z);
  const right = left.clone(); right.scale.x *= -1; add(parent, right, x, y, z);
  add(parent, ellipsoid(size * .2, size * .22, .075, color, 12), x, y, z + .025);
}
function pleatedSkirt(top, bottom, height, color, scalloped = false) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, 48, 6, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const t = .5 - p.getY(i) / height;
    const f = 1 + Math.cos(a * 12) * (.015 + t * .045);
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
    if (scalloped && t > .9) p.setY(i, p.getY(i) + Math.cos(a * 12) * .025);
  }
  geo.computeVertexNormals(); return mesh(geo, color, { side: THREE.DoubleSide });
}
function ribbon(parent, y, radius, color, width = .035) {
  const r = mesh(new THREE.TorusGeometry(radius, width, 6, 48), color);
  r.rotation.x = PI / 2; add(parent, r, 0, y, 0); return r;
}
function hairLock(width, length, color, bend = 0, depth = .1) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.bezierCurveTo(-width * .72, -length * .32, -width * .22 + bend, -length * .78, bend, -length);
  s.bezierCurveTo(width * .48 + bend, -length * .82, width * .55, -length * .22, width / 2, 0);
  s.quadraticCurveTo(0, width * .22, -width / 2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 2, bevelSize: .028, bevelThickness: .025, steps: 1, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, color);
}

function faceMaterial(key) {
  if (faceMaterials.has(key)) return faceMaterials.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  const iris = palette[key].eye;
  // Gentle brows, upper lashes, almond whites and two-tone iris. Transparent
  // texture sits on a curved face patch rather than protruding spherical eyes.
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(256 + side * 106, 236); ctx.scale(side, 1);
    ctx.strokeStyle = key === 'subaru' ? '#34303a' : '#655263'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-44, -57); ctx.quadraticCurveTo(0, -72, 43, -58); ctx.stroke();
    ctx.fillStyle = '#fff9fc'; ctx.beginPath();
    ctx.moveTo(-57, -19); ctx.bezierCurveTo(-34, -57, 36, -54, 57, -13);
    ctx.bezierCurveTo(43, 42, -33, 48, -57, -19); ctx.fill();
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, -36, 0, 43); g.addColorStop(0, '#373752'); g.addColorStop(.5, iris); g.addColorStop(1, '#b7e1e6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(1, -1, 34, 48, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#26253b'; ctx.beginPath(); ctx.ellipse(0, -8, 14, 27, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-14, -21, 12, 15, -.3, 0, PI * 2); ctx.fill();
    ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(15, 20, 6, 0, PI * 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#3d3547'; ctx.lineWidth = key === 'subaru' ? 8 : 11;
    ctx.beginPath(); ctx.moveTo(-58, -19); ctx.bezierCurveTo(-28, -59, 37, -51, 59, -12); ctx.stroke();
    if (key !== 'subaru') { ctx.beginPath(); ctx.moveTo(48, -25); ctx.lineTo(65, -33); ctx.moveTo(54, -18); ctx.lineTo(70, -19); ctx.stroke(); }
    ctx.restore();
  }
  for (const x of [101, 411]) {
    const blush = ctx.createRadialGradient(x, 306, 1, x, 306, 43);
    blush.addColorStop(0, '#ed9b9970'); blush.addColorStop(1, '#ed9b9900'); ctx.fillStyle = blush; ctx.fillRect(x - 46, 264, 92, 84);
  }
  ctx.strokeStyle = '#c97a7d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(243, 351); ctx.quadraticCurveTo(256, 361, 269, 351); ctx.stroke();
  ctx.strokeStyle = '#da9e90'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(255, 296); ctx.lineTo(251, 307); ctx.lineTo(259, 308); ctx.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  faceMaterials.set(key, mat); return mat;
}

function createHead(parent, key) {
  const p = palette[key], head = group(parent, 'head', 0, 1.63, .025);
  const geo = new THREE.SphereGeometry(.435, 32, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i);
    pos.setX(i, x * (y < 0 ? 1 + y * .38 : 1));
    pos.setY(i, y * .94); pos.setZ(i, pos.getZ(i) * .83);
  }
  geo.computeVertexNormals(); add(head, mesh(geo, 0xffddc9));
  const faceGeo = new THREE.PlaneGeometry(.71, .57, 24, 16);
  const fp = faceGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), y = fp.getY(i); fp.setZ(i, .37 - x * x * .76 - y * y * .4); }
  faceGeo.computeVertexNormals(); add(head, new THREE.Mesh(faceGeo, faceMaterial(key)), 0, -.03, 0);
  // Stop the cap above the brows. A hemispherical cap extended below eye height
  // previously hid the face patch behind an opaque band in the front view.
  const scalp = mesh(new THREE.SphereGeometry(.46, 28, 16, 0, PI * 2, 0, PI * .43), p.hair);
  scalp.scale.set(1, .92, .92); add(head, scalp, 0, .035, -.015);
  // Sculpted, overlapping fringe pieces form the silhouette and frame the face.
  const fringe = group(head, 'fringe', 0, .32, .255);
  const fringeCount = key === 'subaru' ? 7 : 5;
  for (let i = 0; i < fringeCount; i++) {
    const u = (i - (fringeCount - 1) / 2);
    const length = key === 'rem' ? .2 + (u > 0 ? .22 : .015) : key === 'subaru' ? .2 + (i % 3) * .055 : .18 + (i % 2) * .025;
    const lock = hairLock(key === 'subaru' ? .17 : .2, length, i % 3 === 0 ? p.shadow : p.hair, key === 'rem' ? -.05 : u * -.018);
    lock.rotation.z = key === 'subaru' ? -u * .23 : -u * .08;
    add(fringe, lock, u * (key === 'subaru' ? .1 : .145), -.025 * Math.abs(u), .065 - Math.abs(u) * .025);
  }
  if (key === 'emilia') {
    for (const s of [-1, 1]) {
      const ear = shape([[0, .11], [s * .25, .16], [s * .16, -.08], [0, -.1]], .035, 0xffddc9, .018);
      add(head, ear, s * .38, -.015, 0);
      const side = group(head, `hair-${s}`, s * .38, .18, -.06);
      for (let i = 0; i < 3; i++) {
        const lock = hairLock(.19, .99 + i * .06, i === 2 ? p.shadow : p.hair, s * (.12 - i * .04), .13);
        add(side, lock, s * (i * .075 - .03), -.03 * i, -.05 * i);
      }
    }
    const back = group(head, 'hair-back', 0, .18, -.31);
    for (let i = -2; i <= 2; i++) add(back, hairLock(.23, 1.04 - Math.abs(i) * .1, i % 2 ? p.shadow : p.hair, i * .035, .16), i * .13, 0, -.03);
    const flower = group(head, 'flower', -.37, .15, .21);
    for (let i = 0; i < 5; i++) { const petal = ellipsoid(.075, .12, .028, 0xffffff, 12); petal.rotation.z = i * PI * .4; add(flower, petal, Math.sin(i * PI * .4) * .07, Math.cos(i * PI * .4) * .07, 0); }
    add(flower, ellipsoid(.045, .045, .04, 0xd6b767, 12), 0, 0, .03);
  } else if (key === 'rem') {
    for (const s of [-1, 1]) {
      const lock = hairLock(.29, .54, p.hair, -s * .05, .22); lock.rotation.z = -s * .12;
      add(head, lock, s * .33, .1, -.05);
    }
    const back = ellipsoid(.425, .35, .27, p.shadow); add(head, back, 0, -.02, -.18);
    // White lace circlet follows the contour rather than a flat rectangular band.
    for (let i = -4; i <= 4; i++) {
      const a = i * .16, ruffle = shape([[-.065, 0], [-.055, .11], [0, .14], [.055, .11], [.065, 0]], .04, 0xfffbef, .012);
      ruffle.rotation.z = -a; add(head, ruffle, Math.sin(a) * .46, Math.cos(a) * .45, .02);
    }
    bow(head, -.35, .15, .29, .13, 0xf5c0cb);
    add(head, shape([[-.055, 0], [0, .17], [.055, 0]], .035, 0xf5c9dc, .012), -.08, .43, -.02);
  } else if (key === 'beatrice') {
    for (const s of [-1, 1]) {
      const curls = group(head, `hair-${s}`, s * .45, .18, -.02);
      const points = [];
      for (let i = 0; i <= 96; i++) { const t = i / 96, a = t * PI * 7; points.push([Math.cos(a) * (.12 - .035 * t), -.85 * t, Math.sin(a) * .13]); }
      add(curls, tube(points, .075, p.hair, 100));
      add(curls, tube([[0, .07, 0], [s * .035, .13, .02], [s * .12, .04, 0]], .07, p.shadow, 12));
      bow(head, s * .44, .24, .06, .22, p.accent);
    }
    const back = hairLock(.62, .47, p.hair, 0, .2); add(head, back, 0, .2, -.3);
    const tiara = tube([[-.27, .35, .13], [0, .44, .2], [.27, .35, .13]], .025, 0xf6edda, 20); add(head, tiara);
  } else {
    const spikes = group(head, 'hair-back', 0, .34, -.08);
    for (let i = -3; i <= 3; i++) {
      const lock = hairLock(.2, .18 + (3 - Math.abs(i)) * .022, p.hair, -i * .035, .15);
      lock.rotation.z = PI + i * .29; add(spikes, lock, i * .105, 0, -.07);
    }
    for (const s of [-1, 1]) add(head, hairLock(.16, .2, p.hair, s * .03), s * .4, .05, -.04);
  }
  return head;
}

function createBody(parent, key) {
  const p = palette[key], body = group(parent, 'body');
  const isSubaru = key === 'subaru';
  for (const s of [-1, 1]) {
    const leg = group(body, `leg-${s}`, s * .145, .43, 0);
    add(leg, mesh(new THREE.CylinderGeometry(.095, .08, .35, 10), key === 'emilia' ? 0xf5edf3 : key === 'subaru' ? 0x272b36 : 0xf5e5e0), 0, -.06, 0);
    add(leg, box(.19, .16, .32, isSubaru ? 0xe8e8e3 : key === 'emilia' ? 0xe5dbea : 0x292939, .035), 0, -.24, .065);
    add(leg, box(.2, .045, .33, isSubaru ? 0x53535c : 0x686278, .01), 0, -.31, .065);
    if (isSubaru) add(leg, box(.12, .035, .02, p.accent, .005), 0, -.2, .23);
  }
  if (!isSubaru) {
    const skirtColor = key === 'rem' ? 0x292b3c : p.dress;
    add(body, pleatedSkirt(.22, key === 'beatrice' ? .49 : .43, .57, skirtColor, true), 0, .64, 0);
    add(body, pleatedSkirt(.26, key === 'beatrice' ? .5 : .45, .11, 0xfff4eb, true), 0, .39, 0);
    ribbon(body, .435, key === 'beatrice' ? .475 : .427, p.accent, .018);
    add(body, mesh(new THREE.CylinderGeometry(.27, .22, .44, 20), p.dress), 0, 1.01, 0);
    if (key === 'rem') {
      const apron = shape([[-.16, .22], [.16, .22], [.12, -.02], [.29, -.43], [-.29, -.43], [-.12, -.02]], .018, 0xfff8ec, .01);
      add(body, apron, 0, .98, .276);
      for (const s of [-1, 1]) { const strap = box(.065, .38, .025, 0xfff8ec, .012); strap.rotation.z = s * .12; add(body, strap, s * .16, 1.1, .22); }
      bow(body, 0, .86, -.27, .23, 0xfff6ea);
    } else {
      const bodice = shape([[-.18, .22], [.18, .22], [.14, -.21], [-.14, -.21]], .02, key === 'emilia' ? 0xc8b7e3 : 0xa94873, .015);
      add(body, bodice, 0, 1.01, .245);
      for (let i = 0; i < 3; i++) add(body, box(.08, .018, .018, 0xf8e7d2, .004), 0, .95 + i * .07, .278);
      if (key === 'emilia') {
        for (const s of [-1, 1]) {
          const panel = shape([[0, .22], [s * .12, .16], [s * .22, -.42], [s * .02, -.34]], .02, 0xffffff, .012);
          add(body, panel, s * .13, .89, .31);
        }
      }
    }
    // Two separate scalloped collar panels and chest bow.
    for (const s of [-1, 1]) {
      const collar = shape([[0, .05], [s * .21, .07], [s * .16, -.09]], .025, 0xfffbf3, .012);
      add(body, collar, s * .01, 1.24, .21);
    }
    bow(body, 0, 1.19, .29, key === 'beatrice' ? .15 : .115, p.accent);
    if (key === 'beatrice') for (const s of [-1, 1]) {
      const panel = shape([[0, .08], [s * .12, .08], [s * .23, -.35], [s * .04, -.3]], .025, 0xf8e9db, .012);
      add(body, panel, s * .13, .78, .37);
    }
  } else {
    add(body, box(.55, .62, .34, p.dress, .075), 0, .96, 0);
    add(body, shape([[-.23, .22], [.23, .22], [.17, .06], [-.17, .06]], .035, 0xf3efe5, .015), 0, 1.08, .19);
    for (const s of [-1, 1]) add(body, box(.045, .52, .025, p.accent, .005), s * .18, .98, .2);
    add(body, box(.016, .47, .02, 0xbbbcc2, .003), 0, 1.0, .213);
    add(body, box(.06, .03, .035, 0xfff3de, .006), 0, 1.16, .225);
    add(body, box(.52, .055, .36, 0x222632, .01), 0, .655, 0);
  }
  add(body, mesh(new THREE.CylinderGeometry(.1, .12, .17, 16), 0xffddc9), 0, 1.31, 0);
  for (const s of [-1, 1]) {
    const arm = group(parent, `arm-${s}`, s * .31, 1.19, 0);
    arm.rotation.z = -s * .1;
    if (!isSubaru) {
      add(arm, ellipsoid(.145, .16, .15, key === 'rem' ? 0xf6f0e8 : p.dress, 16), s * .025, -.04, 0);
      add(arm, mesh(new THREE.CylinderGeometry(.085, .065, .27, 12), key === 'emilia' ? 0xf5f0f7 : 0xffddc9), s * .045, -.21, .01);
      add(arm, mesh(new THREE.CylinderGeometry(.085, .09, .08, 12), key === 'rem' ? 0xfffbf2 : p.accent), s * .045, -.32, .01);
    } else {
      add(arm, mesh(new THREE.CylinderGeometry(.12, .09, .37, 12), p.dress), s * .025, -.16, 0);
      add(arm, box(.035, .31, .13, p.accent, .008), s * .11, -.16, .02);
      add(arm, mesh(new THREE.CylinderGeometry(.092, .095, .07, 12), 0xeee9de), s * .025, -.345, 0);
    }
    add(arm, ellipsoid(.09, .11, .085, 0xffddc9, 16), s * .04, -.39, .025);
  }
  return body;
}

function heroEquipment(root, key, levels) {
  const p = palette[key], right = root.getObjectByName('arm-1'), left = root.getObjectByName('arm--1');
  const tier = Math.max(...levels), power = levels[0];
  if (key === 'emilia') {
    const magic = group(right, 'weapon', .15, -.3, .12);
    const crystal = mesh(new THREE.OctahedronGeometry(.15 + power * .012, 0), p.magic, { metalness: .25, roughness: .22, emissive: p.magic, emissiveIntensity: .35 });
    crystal.scale.y = 1.55; add(magic, crystal, 0, .03, 0);
    for (let i = 0; i < 4; i++) { const tiny = mesh(new THREE.OctahedronGeometry(.04, 0), 0xffffff); add(magic, tiny, Math.cos(i * PI / 2) * .2, Math.sin(i * PI / 2) * .2, 0); }
  } else if (key === 'rem') {
    const weapon = group(right, 'weapon', .02, -.4, .025);
    add(weapon, box(.055, .23, .055, 0x59444a, .01), 0, -.07, 0);
    const points = [[0, -.17, 0], [.15, -.27, .02], [.28, -.2, .05], [.38, -.36, .05], [.48, -.42, .06]];
    add(weapon, tube(points, .015, 0xb9c7cf, 24));
    const ball = group(weapon, 'mace', .5, -.43, .06);
    add(ball, mesh(new THREE.IcosahedronGeometry(.205 + power * .008, 1), 0x6a7c91, { metalness: .65, roughness: .3 }));
    for (const v of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const spike = mesh(new THREE.ConeGeometry(.055, .14, 4), 0xd6e0e6, { metalness: .6, roughness: .3 });
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...v));
      add(ball, spike, v[0] * .22, v[1] * .22, v[2] * .22);
    }
  } else if (key === 'beatrice') {
    const book = group(left, 'weapon', -.05, -.31, .17); book.rotation.set(-.25, -.3, .05);
    add(book, box(.3, .38, .09, 0x71384f, .018));
    add(book, box(.27, .345, .07, 0xf9eccb, .008), .007, 0, .015);
    add(book, box(.32, .39, .025, 0x9a4467, .012), 0, 0, .065);
    for (const y of [-.14, .14]) add(book, box(.28, .016, .018, 0xe1b96c, .003), 0, y, .084);
    const seal = mesh(new THREE.TorusGeometry(.065, .012, 5, 16), 0xe8c985); add(book, seal, 0, 0, .087);
    add(book, shape([[-.02, .03], [.02, .03], [.02, -.18], [0, -.14], [-.02, -.18]], .01, 0xf2c777, .003), .07, -.15, .08);
  } else {
    const whip = group(right, 'weapon', .05, -.38, .01);
    add(whip, box(.055, .24, .055, 0x5d4541, .009), 0, -.03, 0);
    add(whip, tube([[0, -.13, 0], [.16, -.2, .05], [.26, -.4, .04], [.4, -.49, -.02], [.55, -.36, 0]], .018, 0xbca47c, 26));
  }
  if (tier > 0) {
    const head = root.getObjectByName('head');
    for (let i = 0; i < Math.min(5, tier); i++) add(root.getObjectByName('body'), mesh(new THREE.OctahedronGeometry(.035, 0), p.magic, { emissive: p.magic, emissiveIntensity: .5 }), -.12 + i * .06, .76, .315);
    if (tier >= 3) {
      const cape = shape([[-.23, .15], [.23, .15], [.44, -.7], [.23, -.82], [0, -.72], [-.23, -.82], [-.44, -.7]], .025, p.accent, .018);
      cape.rotation.x = -.1; add(root.getObjectByName('body'), cape, 0, 1.1, -.24);
      for (const s of [-1, 1]) add(head, mesh(new THREE.OctahedronGeometry(.07), p.magic, { emissive: p.magic, emissiveIntensity: .6 }), s * .46, .15, .02);
    }
    if (tier >= 5) {
      const crown = group(head, 'crown', 0, .44, 0);
      ribbon(crown, .02, .26, 0xf0cf80, .027);
      for (let i = 0; i < 5; i++) {
        const a = i * PI * 2 / 5, gem = mesh(new THREE.OctahedronGeometry(.075), p.magic, { emissive: p.magic, emissiveIntensity: .45 });
        gem.scale.y = 1.5; add(crown, gem, Math.sin(a) * .25, .1, Math.cos(a) * .25);
      }
    }
  }
}

// Geometry batches keep the detailed little characters practical on mobile.
// Each rig node remains a node; only its rigid mesh children are merged.
function batchRigidParts(root) {
  for (const child of [...root.children]) if (child.isGroup) batchRigidParts(child);
  const batches = new Map();
  for (const child of [...root.children]) {
    if (!child.isMesh || child.material.transparent) continue;
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(child);
  }
  for (const [mat, children] of batches) {
    if (children.length < 2) continue;
    let length = 0;
    const geometries = children.map(c => { c.updateMatrix(); const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()); g.applyMatrix4(c.matrix); length += g.attributes.position.count; return g; });
    const positions = new Float32Array(length * 3), normals = new Float32Array(length * 3);
    let offset = 0;
    for (const g of geometries) {
      positions.set(g.attributes.position.array, offset); normals.set(g.attributes.normal.array, offset);
      offset += g.attributes.position.array.length; g.dispose();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3)); geo.computeBoundingSphere();
    const combined = new THREE.Mesh(geo, mat); combined.castShadow = true; combined.receiveShadow = true; root.add(combined);
    for (const c of children) { root.remove(c); c.geometry.dispose(); }
  }
}

function connectRig(root) {
  root.userData.rig = {
    body: root.getObjectByName('body'), head: root.getObjectByName('head'),
    left: root.getObjectByName('arm--1'), right: root.getObjectByName('arm-1'),
    hair: ['hair--1', 'hair-1', 'hair-back', 'fringe'].map(n => root.getObjectByName(n)).filter(Boolean),
    weapon: root.getObjectByName('weapon'),
  };
  return root;
}

export function createHero(key, levels = [0, 0, 0]) {
  if (!palette[key]) key = 'emilia';
  const cacheKey = `${key}:${levels.join(',')}`;
  if (!templates.has(cacheKey)) {
    const root = new THREE.Group(); root.name = `hero-${key}`; root.userData.hero = key;
    createBody(root, key); createHead(root, key); heroEquipment(root, key, levels);
    batchRigidParts(root); templates.set(cacheKey, root);
  }
  return connectRig(templates.get(cacheKey).clone(true));
}

export function animateHero(root, time, attack = 0) {
  const rig = root.userData.rig; if (!rig) return;
  const phase = time * 2.3 + (root.userData.hero === 'subaru' ? 1.5 : 0);
  rig.head.rotation.z = Math.sin(phase) * .025;
  rig.head.rotation.y = Math.sin(time * .7) * .04;
  rig.body.rotation.x = Math.sin(phase) * .012 - attack * .07;
  rig.left.rotation.z = .12 + Math.sin(phase + .7) * .025 - attack * .13;
  rig.right.rotation.x = Math.sin(phase) * .04 - attack * 1.05;
  rig.right.rotation.z = -.12 - attack * .35;
  for (let i = 0; i < rig.hair.length; i++) rig.hair[i].rotation.z = Math.sin(phase + i * .8) * .022;
  if (rig.weapon && root.userData.hero === 'emilia') rig.weapon.rotation.y = time * .8;
}

function enemyBody(type) {
  const boss = type === 'boss', armored = type === 'armored', runner = type === 'runner', wraith = type === 'wraith';
  const root = new THREE.Group(); root.name = `enemy-${type}`; root.userData.enemy = type;
  const body = group(root, 'body');
  const ink = boss ? 0x3f2646 : armored ? 0x53506c : runner ? 0x3c6a75 : wraith ? 0x644476 : 0x4b4366;
  const glow = boss ? 0xff5b95 : runner ? 0x8ffff0 : 0xd9abff;
  if (runner) {
    // A masked shadow fox: distinct fast, low silhouette with four legs and tail.
    add(body, ellipsoid(.27, .31, .56, ink), 0, .48, -.03);
    for (const s of [-1, 1]) for (const z of [-.3, .27]) {
      const leg = group(root, `leg-${s}-${z}`, s * .21, .38, z);
      add(leg, box(.12, .34, .15, 0x283f50, .025), 0, -.15, .03);
      add(leg, box(.14, .08, .24, 0x273644, .015), 0, -.31, .08);
    }
    const head = group(root, 'head', 0, .73, .42);
    add(head, ellipsoid(.3, .25, .31, ink));
    for (const s of [-1, 1]) {
      const ear = shape([[0, 0], [s * .06, .36], [s * .22, .02]], .1, ink, .02); add(head, ear, s * .08, .1, -.05);
      const eye = box(.1, .055, .025, glow, .012); eye.rotation.z = s * -.15; add(head, eye, s * .16, .03, .27);
    }
    add(head, shape([[-.14, .06], [.14, .06], [0, -.1]], .12, 0xd4dfd2, .02), 0, -.09, .27);
    add(body, tube([[0, .5, -.4], [.1, .75, -.75], [.12, .94, -.82], [.05, 1.02, -.7]], .11, ink, 18));
    add(body, tube([[.05, .94, -.8], [.05, 1.02, -.7]], .105, glow, 8));
  } else {
    add(body, pleatedSkirt(.24, boss ? .64 : .4, boss ? .9 : .72, ink, true), 0, boss ? .65 : .5, 0);
    add(body, ellipsoid(boss ? .48 : .29, boss ? .52 : .35, boss ? .33 : .25, ink), 0, boss ? 1.12 : .87, 0);
    const head = group(root, 'head', 0, boss ? 1.67 : 1.2, .01);
    // Hood is a shaped shell; a pale, angular mask provides a readable face.
    add(head, ellipsoid(boss ? .49 : .35, boss ? .5 : .36, boss ? .36 : .28, boss ? 0x34243f : 0x302d49), 0, 0, -.02);
    const mask = shape([[-.24, .17], [.24, .17], [.22, -.12], [0, -.28], [-.22, -.12]], .045, boss ? 0xe1c4d8 : 0xd6d5e2, .035);
    mask.scale.setScalar(boss ? 1.3 : 1); add(head, mask, 0, -.01, boss ? .32 : .255);
    for (const s of [-1, 1]) {
      const eye = shape([[-.075, .025], [.075, .04], [.055, -.025], [-.055, -.04]], .015, glow, .007);
      eye.material = material(glow, { emissive: glow, emissiveIntensity: .8 });
      add(head, eye, s * (boss ? .15 : .11), .015, boss ? .377 : .306);
      const arm = group(root, `arm-${s}`, s * (boss ? .45 : .29), boss ? 1.16 : .89, 0);
      arm.rotation.z = s * -.2;
      add(arm, hairLock(boss ? .28 : .17, boss ? .57 : .42, ink, s * .08, .18), 0, 0, 0);
      add(arm, shape([[-.075, .03], [.075, .03], [.09, -.15], [0, -.09], [-.09, -.15]], .065, 0xb8abc8, .01), 0, boss ? -.51 : -.36, .02);
      if (boss) {
        const horn = tube([[s * .27, .24, 0], [s * .49, .45, -.07], [s * .57, .75, -.1], [s * .42, .9, -.08]], .09, 0xc0a2bf, 16);
        add(head, horn); add(body, box(.4, .2, .44, 0x9c758f, .035), s * .42, 1.25, 0);
      }
    }
    if (armored || boss) {
      const armor = shape([[-.28, .2], [.28, .2], [.25, -.17], [0, -.27], [-.25, -.17]], .09, boss ? 0x8c597a : 0x8c91a0, .025);
      armor.scale.setScalar(boss ? 1.4 : 1); add(body, armor, 0, boss ? 1.1 : .89, boss ? .35 : .26);
      add(body, mesh(new THREE.OctahedronGeometry(boss ? .12 : .075), glow, { emissive: glow, emissiveIntensity: .6 }), 0, boss ? 1.12 : .91, boss ? .43 : .34);
    }
    if (wraith) {
      for (const s of [-1, 1]) {
        const wing = shape([[0, .1], [s * .6, .42], [s * .47, -.02], [s * .66, -.3], [s * .25, -.2]], .045, 0x9069a8, .018);
        add(body, wing, s * .18, .9, -.14);
      }
      ribbon(body, .2, .38, glow, .014);
    }
    if (!boss && !wraith) for (const s of [-1, 1]) {
      const foot = group(root, `leg-${s}`, s * .13, .15, 0);
      add(foot, box(.13, .17, .2, 0x28263d, .02), 0, -.02, .08);
    }
  }
  batchRigidParts(root); return root;
}

export function createEnemy(type = 'shade') {
  if (!['shade', 'runner', 'armored', 'wraith', 'boss'].includes(type)) type = 'shade';
  const key = `enemy:${type}`;
  if (!templates.has(key)) templates.set(key, enemyBody(type));
  const root = templates.get(key).clone(true);
  root.userData.rig = {
    head: root.getObjectByName('head'), body: root.getObjectByName('body'),
    arms: [root.getObjectByName('arm--1'), root.getObjectByName('arm-1')].filter(Boolean),
    legs: root.children.filter(c => c.name.startsWith('leg-')),
  };
  return root;
}

export function animateEnemy(root, time, moving = true) {
  const rig = root.userData.rig; if (!rig) return;
  const fox = root.userData.enemy === 'runner', stride = moving ? Math.sin(time * (fox ? 15 : 7)) : 0;
  rig.body.rotation.z = stride * (fox ? .025 : .045);
  if (rig.head) rig.head.rotation.z = -stride * .025;
  rig.arms.forEach((a, i) => { a.rotation.x = stride * (i ? 1 : -1) * .22; });
  rig.legs.forEach((a, i) => { a.rotation.x = stride * (i % 2 ? 1 : -1) * .38; });
}
