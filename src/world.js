import * as THREE from '../vendor/three.module.js';

// Original, deterministic dioramas. All solid scenery is merged by material;
// vegetation uses instancing and only water and atmospheric motes animate.
const TAU = Math.PI * 2;
const palettes = [
  { turf: '#78a75c', turf2: '#92b969', leaf: [0x3f7754, 0x568c55, 0x75a65f, 0x9abb67], bark: 0x6d5941, stone: 0xa3ad91, road: '#e8d2a0', bank: 0x9c9870, glow: 0x8ee1e1, flowers: [0xffe6b0, 0xe9b5d8, 0xece8fd] },
  { turf: '#78a78d', turf2: '#9dc395', leaf: [0x3b735f, 0x538b70, 0x79a789, 0xa0c4a0], bark: 0x655544, stone: 0xa7b6b0, road: '#e4d8bc', bank: 0xa4a98a, glow: 0xffd79c, flowers: [0xf4c3cc, 0xffeee3, 0xbba5e5] },
  { turf: '#899b86', turf2: '#a4b49a', leaf: [0x596d73, 0x718a88, 0x8ea797, 0xb2c0a1], bark: 0x665b63, stone: 0xadb8b0, road: '#d9d5be', bank: 0x969383, glow: 0xbd9cf4, flowers: [0xc3b8f7, 0xf2e6ff, 0xa8e0dc] },
];

function smoothRoute(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  return curve.getSpacedPoints(160).map(p => [p.x, p.z]);
}

export const MAPS = [
  {
    id: 'lugunica', name: 'Floresta de Lugunica', subtitle: 'CAPÍTULO I',
    description: 'Entre copas douradas e águas cristalinas, a jornada começa.',
    route: smoothRoute([[-11.35,-3.95],[-8.2,-4.05],[-6.3,-2.8],[-5.9,.4],[-5.55,3.65],[-3.8,4.55],[-1.65,3.95],[-.75,1.6],[-.8,-2.65],[.6,-4.35],[3.25,-4.35],[5.1,-2.9],[5.6,1.2],[7.3,4.35],[9.5,4.55],[11.35,4.4]]),
  },
  {
    id: 'roswaal', name: 'Mansão Roswaal', subtitle: 'CAPÍTULO II',
    description: 'Jardins de rosas guardam os segredos de uma antiga mansão.',
    route: smoothRoute([[-11.35,4.4],[-8,4.4],[-6.3,3.1],[-5.9,-1.8],[-5.2,-3.95],[-3.2,-4.55],[-1.6,-3.2],[-1.35,2.2],[.2,4.5],[2.1,4.3],[3.2,2.1],[3.1,-1.5],[4.8,-2.8],[7.1,-2.3],[8.2,.95],[11.35,1.1]]),
  },
  {
    id: 'sanctuary', name: 'Santuário', subtitle: 'CAPÍTULO III',
    description: 'Ruínas esquecidas. Espíritos ancestrais. Um último juramento.',
    route: smoothRoute([[-11.35,-4],[-8.2,-4.1],[-6.4,-2.7],[-6.2,2.7],[-4.4,4.5],[-1.9,4.4],[-.6,2.7],[-.6,-2.8],[1.5,-4.45],[3.8,-3.8],[4.8,-1.4],[4.8,3.2],[6.7,4.6],[9.2,3.8],[11.35,3.7]]),
  },
];

const rng = seed => {
  let s = seed | 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
};
const materialCache = new Map();
function material(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .86, ...options }));
  return materialCache.get(key);
}
const geo = {
  box: new THREE.BoxGeometry(1,1,1),
  sphere: new THREE.SphereGeometry(1,10,7),
  pebble: new THREE.IcosahedronGeometry(1,1),
  cylinder: new THREE.CylinderGeometry(1,1,1,9),
  leaf: new THREE.SphereGeometry(1,14,10),
};
const sharedGeometries = new Set(Object.values(geo));
// Sculpt lobes into a single crown rather than stacking cone primitives.
{
  const p = geo.leaf.attributes.position;
  for (let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const r=1 + .09*Math.sin(x*8+y*3)*Math.cos(z*6-y*4) + .045*Math.cos(x*15+z*9);
    p.setXYZ(i,x*r,y*r,z*r);
  }
  geo.leaf.computeVertexNormals();
}

function mesh(parent, geometry, mat, x=0,y=0,z=0, sx=1,sy=1,sz=1) {
  const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function box(parent,x,y,z,w,h,d,color,options) { return mesh(parent,geo.box,material(color,options),x,y,z,w,h,d); }
function ellipsoid(parent,x,y,z,rx,ry,rz,color) { return mesh(parent,geo.leaf,material(color),x,y,z,rx,ry,rz); }
function branch(parent,a,b,r1,r2,color) {
  const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=vb.clone().sub(va);
  const m=mesh(parent,new THREE.CylinderGeometry(r2,r1,v.length(),7),material(color));
  m.position.copy(va.add(vb).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;
}
function shapeMesh(parent, points, depth, mat, x=0,y=0,z=0) {
  const s=new THREE.Shape();points.forEach(([px,py],i)=>i?s.lineTo(px,py):s.moveTo(px,py));s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.025,bevelThickness:.025});
  return mesh(parent,g,mat,x,y,z);
}

function texture(color, accent, seed, road=false) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),random=rng(seed);
  ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
  for(let i=0;i<(road?1500:650);i++) {
    ctx.globalAlpha=road?.04+random()*.10:.035+random()*.07;
    ctx.fillStyle=i%3===0?'#ffffff':accent;
    const r=road?random()*1.8+.3:random()*13+1;
    ctx.beginPath();ctx.ellipse(random()*256,random()*256,r,r*(.4+random()*.6),random()*TAU,0,TAU);ctx.fill();
  }
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(road?2:3,road?6:3);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

function topOutline(scale=1) {
  return Array.from({length:80},(_,i)=>{
    const a=i/80*TAU,c=Math.cos(a),s=Math.sin(a),wobble=1+.017*Math.sin(a*7)+.012*Math.cos(a*11);
    return [Math.sign(c)*Math.abs(c)**.65*12.1*scale*wobble,Math.sign(s)*Math.abs(s)**.72*7.05*scale*wobble];
  });
}
function ground(parent,p,index) {
  const outline=topOutline();
  const s=new THREE.Shape();outline.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
  const top=new THREE.Mesh(new THREE.ShapeGeometry(s),new THREE.MeshStandardMaterial({map:texture(p.turf,p.turf2,index+5),roughness:.97}));
  top.rotation.x=-Math.PI/2;top.receiveShadow=true;parent.add(top);
  const positions=[],colors=[];const shade=new THREE.Color();
  const rings=[{y:-.035,s:1,c:0x73924e},{y:-.23,s:1.005,c:0x779152},{y:-.58,s:1,c:0x9b865c},{y:-1.38,s:.985,c:0x9b7954},{y:-1.85,s:.94,c:0x76634d},{y:-2,s:.87,c:0x645d4d}];
  const random=rng(321);
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<outline.length;i++){
    const n=(i+1)%outline.length,a=outline[i],b=outline[n],ra=rings[j],rb=rings[j+1];
    const vs=[[a[0]*ra.s,ra.y,a[1]*ra.s],[b[0]*ra.s,ra.y,b[1]*ra.s],[a[0]*rb.s,rb.y,a[1]*rb.s],[b[0]*rb.s,rb.y,b[1]*rb.s]];
    for(const v of [0,2,1,1,2,3]) {positions.push(...vs[v]);shade.setHex((v===0||v===1)?ra.c:rb.c).multiplyScalar(.9+random()*.18);colors.push(shade.r,shade.g,shade.b);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  mesh(parent,g,material(0xffffff,{vertexColors:true}));
  // A few exposed pieces of limestone tell the story of the island's geology.
  for(let i=0;i<23;i++) {const a=i/23*TAU,[x,z]=outline[Math.floor(i/23*outline.length)];const m=mesh(parent,geo.pebble,material(i%2?0xa79b7c:0x8d8b70),x*.99,-.9-(i%3)*.19,z*.99,.3+(i%4)*.13,.19,.23);m.rotation.set(a*.3,a,0);}
}

function road(parent, route, p, index) {
  function ribbon(width,y,mat) {
    const pos=[],uv=[];
    route.forEach(([x,z],i)=>{
      const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)];
      const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),nx=-dz/l,nz=dx/l;
      pos.push(x+nx*width,y,z+nz*width,x-nx*width,y,z-nz*width);uv.push(0,i/10,1,i/10);
    });
    const idx=[];for(let i=0;i<route.length-1;i++){let n=i*2;idx.push(n,n+2,n+1,n+1,n+2,n+3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=mesh(parent,g,mat);m.receiveShadow=true;m.castShadow=false;
  }
  ribbon(.86,.009,material(p.bank));
  ribbon(.71,.035,new THREE.MeshStandardMaterial({map:texture(p.road,'#958775',90+index,true),roughness:1}));
  const random=rng(99+index);
  // Irregular pale cobbles are embedded along the verge, not a raised toy track.
  for(let i=1;i<route.length-1;i+=3){
    const a=route[i-1],b=route[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
    for(const side of [-1,1]) {
      if(random()<.21)continue;const [x,z]=route[i],w=.77+random()*.025;
      const peb=mesh(parent,geo.pebble,material(i%4?0xd2cfaf:0xaaa78c),x-dz/l*w*side,.075,z+dx/l*w*side,.12+random()*.09,.065,.1+random()*.1);peb.rotation.y=random()*TAU;
    }
  }
  for(let i=9;i<route.length-8;i+=19){
    const [x,z]=route[i];const m=mesh(parent,geo.pebble,material(0xc4b795),x,.043,z,.14,.014,.11);m.rotation.y=i;
  }
}
function routeDistance(x,z,route) {
  let best=1e5;
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }return best;
}

function tree(parent,x,z,s,p,seed) {
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);parent.add(g);const random=rng(seed);
  const bark=p.bark;
  branch(g,[0,0,0],[.08,1.9,0],.24,.13,bark);
  for(const [a,b,r] of [[[.03,.88,0],[-.62,2.13,.12],.12],[[.07,1.3,0],[.69,2.5,-.08],.11],[[.06,1.5,0],[-.1,2.64,.47],.1],[[.04,.6,.01],[.24,1.17,-.6],.07]])branch(g,a,b,r,.025,bark);
  for(let i=0;i<5;i++){
    const a=i/5*TAU;branch(g,[0,.16,0],[Math.cos(a)*.55,.015,Math.sin(a)*.55],.095,.045,bark);
  }
  const crowns=[[-.75,2.38,.08,.95,.72,.78],[.65,2.64,-.05,1.08,.79,.92],[-.05,3.04,-.25,1.2,.85,1.05],[-.15,2.54,.65,1.07,.66,.9],[.18,3.48,.13,.91,.61,.81]];
  crowns.forEach(([a,b,c,rx,ry,rz],i)=>{
    const m=ellipsoid(g,a,b,c,rx,ry,rz,p.leaf[Math.min(3,i%3+Math.floor(random()*2))]);m.rotation.y=random()*TAU;
  });
  // Small leaf fans give each crown a leafy silhouette at the sunny edge.
  for(let i=0;i<8;i++){
    const a=random()*TAU,r=.8+random()*.5,y=2.5+random()*.8;
    const leaf=ellipsoid(g,Math.cos(a)*r,y,Math.sin(a)*r,.28,.09,.16,p.leaf[3]);leaf.rotation.set(.1,a,.2);
  }
  g.rotation.y=random()*TAU;
}
function rock(parent,x,z,s,p,seed=1) {
  const m=mesh(parent,geo.pebble,material(p.stone),x,s*.32,z,s,s*.55,s*.7);m.rotation.set(.1,seed,seed*.1);
  if(s>.5)ellipsoid(parent,x+.08,s*.64,z+.02,s*.66,.09,s*.46,p.leaf[1]);
}
function mushroom(parent,x,z,s,color) {
  mesh(parent,geo.cylinder,material(0xe5d7b9),x,.14*s,z,.055*s,.25*s,.055*s);
  const cap=mesh(parent,geo.sphere,material(color),x,.29*s,z,.22*s,.13*s,.2*s);
  for(let i=0;i<3;i++)mesh(parent,geo.sphere,material(0xfff1d4),x+Math.cos(i*2.1)*.1*s,.38*s,z+Math.sin(i*2.1)*.08*s,.03*s,.012*s,.03*s);
  return cap;
}

function vegetation(parent,route,p,index,quality,obstacles,water) {
  const random=rng(738+index*153),spots=[];
  const inWater=(x,z)=>water&&((x-water.x)/water.rx)**2+((z-water.z)/water.rz)**2<1.25;
  const free=(x,z,r=.5)=>routeDistance(x,z,route)>r+1 && !inWater(x,z) && !obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+r);
  // Keep the centre open for meaningful tower placement; tall trees frame the edges.
  const treeSpots=[[-10.8,-5.6,1],[-8.8,-5.9,1.1],[-4.2,-5.8,.92],[-1.2,-5.9,.76],[2.5,-5.8,.88],[-10.5,.8,.95],[-11.1,4.7,.85],[-9.1,5.65,.82],[-5.7,5.8,.7],[-.2,5.8,.7],[3.8,5.75,.72],[10.5,5.6,.66],[10.9,-.7,.72]];
  if(index===0)treeSpots.push([6.2,-5.8,.7],[11,-5.8,.85]);
  if(index===2)treeSpots.push([7.2,-5.6,.9],[10.7,-5.8,.7]);
  treeSpots.forEach(([x,z,s],i)=>{
    if(free(x,z,.7*s)){tree(parent,x,z,s,p,i*51+index+1);obstacles.push({x,z,r:.56*s});}
  });
  for(let i=0;i<38;i++){
    const x=(random()-.5)*22,z=(random()-.5)*12.3;
    if(!free(x,z,.15))continue;
    if(i%5===0){rock(parent,x,z,.23+random()*.42,p,i);obstacles.push({x,z,r:.25});}
    else if(i%3===0){
      const s=.3+random()*.23;
      ellipsoid(parent,x,s*.48,z,s,.26,s*.66,p.leaf[i%3]);
      ellipsoid(parent,x+s*.4,s*.5,z+.08,s*.6,.19,s*.6,p.leaf[(i+1)%3]);
    }else if(index===0&&i%4===0)mushroom(parent,x,z,.65+random()*.45,i%2?0xcf9d70:0xb96754);
    else spots.push([x,z]);
  }
  // One instanced draw for hundreds of fine, tapered blades.
  const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute([-.032,0,0,.032,0,0,.012,.3,.025],3));blade.computeVertexNormals();
  const grassMat=material(index===2?0x829d83:0x78a75d,{side:THREE.DoubleSide});
  const count=quality==='low'?250:650,grass=new THREE.InstancedMesh(blade,grassMat,count),dummy=new THREE.Object3D(),color=new THREE.Color();
  let n=0;
  for(let i=0;i<count*3&&n<count;i++){
    const x=(random()-.5)*23.5,z=(random()-.5)*13;
    if(!free(x,z,-.1))continue;
    dummy.position.set(x,.03,z);dummy.rotation.set(0,random()*TAU,(random()-.5)*.3);dummy.scale.setScalar(.55+random()*.65);dummy.updateMatrix();grass.setMatrixAt(n,dummy.matrix);
    color.setHex(index===2?0xa7b79d:0x9dbb70).multiplyScalar(.75+random()*.4);grass.setColorAt(n,color);n++;
  }
  grass.count=n;grass.castShadow=false;grass.receiveShadow=true;parent.add(grass);
  // Tiny five-petal flowers are geometry, not sprites; grouped into material batches.
  for(let i=0;i<(quality==='low'?35:75);i++){
    const x=(random()-.5)*22.8,z=(random()-.5)*12.7;if(!free(x,z,-.05))continue;
    const stem=.13+random()*.12;
    mesh(parent,geo.cylinder,material(0x4f7951),x,stem/2,z,.012,stem,.012);
    for(let k=0;k<5;k++){const a=k/5*TAU;mesh(parent,geo.sphere,material(p.flowers[i%3]),x+Math.cos(a)*.052,stem,z+Math.sin(a)*.052,.047,.017,.04);}
    mesh(parent,geo.sphere,material(0xf3d68b),x,stem+.013,z,.025,.018,.025);
  }
}

function pond(parent,p,animated) {
  const water={x:8.9,z:-3.95,rx:2.35,rz:1.7};
  const shape=new THREE.Shape();
  for(let i=0;i<=44;i++){
    const a=i/44*TAU,r=1+.07*Math.sin(a*3)+.025*Math.cos(a*7),x=Math.cos(a)*water.rx*r,z=Math.sin(a)*water.rz*r;
    i?shape.lineTo(x,-z):shape.moveTo(x,-z);
  }
  const bank=new THREE.Mesh(new THREE.ShapeGeometry(shape),material(0xbcc795));bank.rotation.x=-Math.PI/2;bank.position.set(water.x,.016,water.z);bank.scale.setScalar(1.07);bank.receiveShadow=true;parent.add(bank);
  const waves=document.createElement('canvas');waves.width=waves.height=128;const ctx=waves.getContext('2d');ctx.fillStyle='#7fbfbe';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#b4ded4';ctx.lineWidth=1;
  for(let i=0;i<16;i++){ctx.beginPath();for(let x=0;x<128;x++){const y=i*9+Math.sin(x*.09+i)*2;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  const t=new THREE.CanvasTexture(waves);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);t.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshPhysicalMaterial({color:0x64c2bf,map:t,roughness:.2,metalness:.05,clearcoat:1,clearcoatRoughness:.1,transparent:true,opacity:.94});
  const lake=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);lake.rotation.x=-Math.PI/2;lake.position.set(water.x,.033,water.z);lake.userData.dynamic=true;parent.add(lake);animated.push({type:'water',mesh:lake});
  for(let i=0;i<24;i++){
    const a=i/24*TAU,x=water.x+Math.cos(a)*water.rx*1.03,z=water.z+Math.sin(a)*water.rz*1.03;
    rock(parent,x,z,.16+(i%3)*.055,p,i);
    if(i%4===0){for(let k=0;k<3;k++)branch(parent,[x,.05,z],[x+(k-1)*.06,.35+k*.1,z+.03],.013,.006,0x5d8e64);}
  }
  for(let i=0;i<4;i++){
    const x=water.x+(i-1.5)*.4,z=water.z+.65+Math.sin(i)*.15;
    const pad=mesh(parent,new THREE.CircleGeometry(.2,15,.2,TAU-.4),material(0x669b70,{side:THREE.DoubleSide}),x,.055,z);pad.rotation.x=-Math.PI/2;pad.rotation.z=i*2;
    if(i===1)for(let k=0;k<6;k++){const a=k/6*TAU;const m=mesh(parent,geo.sphere,material(0xf4d5d7),x+Math.cos(a)*.05,.105,z+Math.sin(a)*.05,.06,.045,.03);m.rotation.y=-a;}
  }
  // A little arched garden bridge gives scale and craftsmanship to the grove.
  const bridge=new THREE.Group();bridge.position.set(water.x,.07,water.z-.25);bridge.rotation.y=.14;parent.add(bridge);
  for(let i=0;i<15;i++){
    const x=(i-7)*.19,y=.15+Math.cos((i-7)/7*Math.PI/2)*.22;
    const plank=box(bridge,x,y,0,.18,.09,.9,i%2?0xa4865c:0xb49468);plank.rotation.z=-(i-7)*.027;
  }
  for(const z of [-.51,.51]){
    for(const x of [-1.26,0,1.26])box(bridge,x,.54+(.12-Math.abs(x)*.05),z,.065,.72,.065,0x735b43);
    const c=new THREE.CatmullRomCurve3([new THREE.Vector3(-1.3,.84,z),new THREE.Vector3(0,1.02,z),new THREE.Vector3(1.3,.84,z)]);
    mesh(bridge,new THREE.TubeGeometry(c,16,.035,5,false),material(0x8f7250));
  }
  for(let i=0;i<3;i++){
    const ripple=new THREE.Mesh(new THREE.RingGeometry(.34+i*.21,.353+i*.21,36),new THREE.MeshBasicMaterial({color:0xcdf8ed,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));
    ripple.rotation.x=-Math.PI/2;ripple.position.set(water.x-.8,.046,water.z+.5);ripple.userData.dynamic=true;parent.add(ripple);animated.push({type:'ripple',mesh:ripple,phase:i*2.1});
  }
  return water;
}

function lantern(parent,x,z,p,obstacles) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  mesh(g,geo.cylinder,material(0x706c59),0,.06,0,.21,.12,.21);
  box(g,0,.62,0,.055,1.18,.055,0x645f50);
  box(g,0,1.23,0,.36,.065,.32,0x77755e);
  box(g,0,1.4,0,.22,.3,.2,p.glow,{emissive:p.glow,emissiveIntensity:.28,roughness:.35});
  for(const a of [-.13,.13])for(const b of [-.12,.12])box(g,a,1.4,b,.035,.35,.035,0x77755e);
  const top=shapeMesh(g,[[-.24,0],[0,.21],[.24,0]],.37,material(0x74765b),0,1.59,-.185);top.castShadow=true;
  obstacles.push({x,z,r:.26});
}
function gates(parent,route,p,animated) {
  for(let i=0;i<2;i++){
    const [x,z]=route[i?route.length-1:0],g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=Math.PI/2;parent.add(g);
    const a=route[i?route.length-3:2];g.rotation.y=-Math.atan2(a[1]-z,a[0]-x)+Math.PI/2;
    for(const sign of [-1,1]){
      box(g,sign*.64,.11,0,.46,.22,.5,0xb0b399);
      box(g,sign*.64,.8,0,.28,1.28,.28,0xa0a78d);
      box(g,sign*.64,1.49,0,.4,.14,.38,0xc1c4a9);
      box(g,sign*.64,.89,.158,.07,.59,.02,i?0xffdca0:0x9ee8d3,{emissive:i?0xf7cf8f:0x8bcdb9,emissiveIntensity:.25});
      ellipsoid(g,sign*.74,.2,-.14,.28,.17,.26,p.leaf[1]);
    }
    const arch=new THREE.TorusGeometry(.64,.12,7,20,Math.PI);mesh(g,arch,material(0xc0c2a8),0,1.4,0);
    const emblem=mesh(g,new THREE.OctahedronGeometry(.15,0),material(i?0xffdfa4:0xa4e8df,{emissive:i?0xf9ca7b:0x80d1cd,emissiveIntensity:.4}),0,1.98,0);emblem.userData.dynamic=true;animated.push({type:'sigil',mesh:emblem,phase:i*2});
  }
}

function manor(parent,p,obstacles) {
  const g=new THREE.Group();g.position.set(7.8,0,-5.05);g.rotation.y=-.08;g.scale.setScalar(.92);parent.add(g);obstacles.push({x:7.8,z:-5.05,r:2.5});
  const ivory=0xe6ddc9,wood=0x695c67,roof=0x70677b;
  box(g,0,.14,0,5.4,.28,3.3,0xb4b4a5);box(g,0,1.35,0,4.7,2.4,2.55,ivory);
  box(g,0,.4,1.36,4.85,.2,.12,0xc6bfae);box(g,0,1.56,1.3,4.74,.09,.07,wood);
  for(const x of [-2.25,0,2.25])box(g,x,1.45,1.3,.11,2.18,.08,wood);
  const roofShape=[[-2.65,0],[0,1.2],[2.65,0]];
  shapeMesh(g,roofShape,3.05,material(roof),0,2.56,-1.52);
  for(let r=0;r<4;r++)for(let n=0;n<9;n++){
    const y=2.63+r*.245,x=(n-4)*.5*(1-r*.12),z=1.56-r*.015;
    const shingle=box(g,x,y,z,.42,.055,.07,r%2?0x80778c:0x625d72);shingle.rotation.z=x>0?-.42:.42;
  }
  for(const x of [-1.48,1.48]){
    box(g,x,1.8,1.34,.68,.9,.09,0x746e7e);
    box(g,x,1.8,1.4,.53,.72,.035,0x9ccbd3,{roughness:.3});
    box(g,x,1.8,1.43,.045,.76,.025,ivory);box(g,x,1.8,1.43,.55,.045,.025,ivory);
    box(g,x,1.27,1.53,.83,.16,.34,0xa78d78);for(let k=0;k<5;k++)ellipsoid(g,x+(k-2)*.13,1.42,1.54,.11,.13,.1,p.leaf[1]);
    for(let k=0;k<3;k++)mesh(g,geo.sphere,material(0xddb8cd),x+(k-1)*.19,1.51,1.56,.06,.06,.06);
  }
  box(g,0,.86,1.35,.78,1.22,.08,0x736574);box(g,0,.86,1.41,.55,1.06,.04,0xa68b9a);
  mesh(g,geo.sphere,material(0xe2c491,{metalness:.45,roughness:.4}),.18,.86,1.46,.04,.04,.04);
  for(let i=0;i<3;i++)box(g,0,.07+i*.075,1.69-i*.14,1.35-i*.08,.08,.4,0xc4c1b1);
  // Side turret with a faceted, custom pyramidal slate roof.
  box(g,-2.15,1.85,-.55,1.15,3.6,1.25,ivory);
  const turret=new THREE.ConeGeometry(1.02,1.22,4);turret.rotateY(Math.PI/4);mesh(g,turret,material(0x766c85),-2.15,4.23,-.55,1,1,.95);
  box(g,-2.15,2.95,.1,.43,.72,.045,0xa9cdda,{roughness:.3});box(g,-2.15,2.95,.14,.04,.76,.025,wood);
  box(g,1.2,3.25,-.4,.42,.9,.5,0xc7b7a8);box(g,1.2,3.75,-.4,.51,.11,.59,0x9d9790);
  // Formal garden hedges and low iron fence.
  for(const x of [-3.15,3.2])for(let i=0;i<5;i++)ellipsoid(g,x,.4,-1.2+i*.57,.4,.44,.44,p.leaf[0]);
  for(let i=0;i<13;i++){const x=(i-6)*.48;box(g,x,.39,-1.9,.035,.74,.035,0x656d67);}
  box(g,0,.54,-1.9,6,.035,.035,0x656d67);
}

function fountain(parent,x,z,p,obstacles,animated) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);obstacles.push({x,z,r:1.15});
  mesh(g,new THREE.CylinderGeometry(1.05,1.13,.2,20),material(0xb5b8ab),0,.1,0);
  mesh(g,new THREE.TorusGeometry(.9,.12,7,28),material(0xd0d2be),0,.24,0).rotation.x=Math.PI/2;
  mesh(g,new THREE.CircleGeometry(.85,28),material(0x91c9cd,{roughness:.2}),0,.2,0).rotation.x=-Math.PI/2;
  mesh(g,new THREE.CylinderGeometry(.12,.27,1.02,9),material(0xc1c6b8),0,.72,0);
  mesh(g,new THREE.CylinderGeometry(.58,.14,.22,18),material(0xd0d2be),0,1.18,0);
  const stream=mesh(g,new THREE.CylinderGeometry(.025,.045,.5,7),material(0xafe3e2,{transparent:true,opacity:.6,roughness:.1}),0,1.54,0);stream.userData.dynamic=true;animated.push({type:'fountain',mesh:stream});
}

function sanctuary(parent,p,obstacles,animated) {
  const g=new THREE.Group();g.position.set(8.2,0,-4.5);g.rotation.y=-.22;parent.add(g);obstacles.push({x:8.2,z:-4.5,r:2.05});
  box(g,0,.12,0,3.8,.24,2.6,0xa4aca5);box(g,0,.29,0,3.2,.16,2.16,0xc2c9b7);
  for(const x of [-1.2,1.2]){
    box(g,x,.48,0,.7,.24,.7,0x9aa69b);
    mesh(g,new THREE.CylinderGeometry(.22,.26,1.8,10),material(0xbcc4b4),x,1.45,0);
    box(g,x,2.42,0,.64,.22,.64,0xc9cdbd);
    for(let j=0;j<6;j++){const a=j/6*TAU;branch(g,[x+Math.cos(a)*.22,.62,Math.sin(a)*.22],[x+Math.cos(a)*.19,2.27,Math.sin(a)*.19],.019,.018,0x9da99e);}
  }
  shapeMesh(g,[[-1.65,0],[0,.78],[1.65,0]],.68,material(0xbac0af),0,2.55,-.34);
  shapeMesh(g,[[-1.22,0],[0,.47],[1.22,0]],.035,material(0x889787),0,2.69,.352);
  const ring=mesh(g,new THREE.TorusGeometry(.64,.055,6,32),material(0xb9a1df,{emissive:0xb098e1,emissiveIntensity:.52}),0,1.55,.14);ring.userData.dynamic=true;animated.push({type:'portal',mesh:ring});
  const sigil=mesh(g,new THREE.OctahedronGeometry(.32,0),material(0xbca0e8,{emissive:0xa58acd,emissiveIntensity:.3,metalness:.12,roughness:.3}),0,1.55,.14);sigil.userData.dynamic=true;animated.push({type:'sigil',mesh:sigil,phase:2});
  for(let i=0;i<5;i++){
    const x=-2.15+i*.22,z=1.1+(i%2)*.3;box(g,x,.2,z,.44,.4,.6,0x9eaaa0).rotation.y=i*.5;
  }
  const crystalMat=material(0xafb6e2,{roughness:.28,metalness:.12,emissive:0x5c6a8a,emissiveIntensity:.12});
  for(const [x,z,s] of [[-9.6,4.8,.8],[1.4,-5.4,1],[10.7,-.2,.75],[-3.8,-5.4,.6]]) {
    rock(parent,x,z,.42,p,x);obstacles.push({x,z,r:.45});
    for(let j=0;j<3;j++){
      const gem=mesh(parent,new THREE.OctahedronGeometry(1,0),crystalMat,x+(j-1)*.25,.4+(j===1?.2:0),z+(j%2)*.13,.18+j*.025,(j===1?.9:.6)*s,.18);gem.rotation.z=(j-1)*.2;
    }
  }
  // Fallen memorial stones, ivy, and a half-buried arch make the ruins readable.
  for(const [x,z,a] of [[-8.8,-5.5,.2],[3.2,5.5,1.4]]){
    const stone=box(parent,x,.5,z,.58,1,.22,0xb6bca9);stone.rotation.y=a;obstacles.push({x,z,r:.4});
    box(parent,x,.96,z,.75,.16,.28,0xc9ccba).rotation.y=a;
    ellipsoid(parent,x,.12,z+.16,.44,.13,.34,p.leaf[0]);
  }
}

// BufferGeometryUtils-style merging kept local so the entire game is offline-ready.
function batchStatics(root) {
  root.updateMatrixWorld(true);const groups=new Map(),remove=[];
  root.traverse(obj=>{
    if(!obj.isMesh||obj.isInstancedMesh||obj.userData.dynamic||obj.material.transparent||Array.isArray(obj.material))return;
    const key=obj.material.uuid;
    if(!groups.has(key))groups.set(key,{material:obj.material,meshes:[]});groups.get(key).meshes.push(obj);remove.push(obj);
  });
  for(const entry of groups.values()){
    if(entry.meshes.length<2)continue;
    const positions=[],normals=[],uvs=[],colors=[],normalMatrix=new THREE.Matrix3(),v=new THREE.Vector3(),n=new THREE.Vector3();
    for(const m of entry.meshes){
      const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry,p=g.attributes.position,no=g.attributes.normal,uv=g.attributes.uv,col=g.attributes.color;
      normalMatrix.getNormalMatrix(m.matrixWorld);
      for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);positions.push(v.x,v.y,v.z);
        if(no)n.fromBufferAttribute(no,i).applyMatrix3(normalMatrix).normalize();else n.set(0,1,0);normals.push(n.x,n.y,n.z);
        uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
        if(entry.material.vertexColors)colors.push(col?col.getX(i):1,col?col.getY(i):1,col?col.getZ(i):1);
      }
      if(g!==m.geometry)g.dispose();
      if(!sharedGeometries.has(m.geometry))m.geometry.dispose();
      m.parent.remove(m);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(colors.length)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const m=new THREE.Mesh(g,entry.material);m.castShadow=true;m.receiveShadow=true;root.add(m);
  }
}

function atmosphere(parent,p,animated,quality) {
  const count=quality==='low'?10:24,positions=new Float32Array(count*3),random=rng(707),origins=[];
  for(let i=0;i<count;i++){const x=(random()-.5)*22,y=.5+random()*2.6,z=(random()-.5)*12;positions.set([x,y,z],i*3);origins.push([x,y,z,random()*TAU]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const motes=new THREE.Points(g,new THREE.PointsMaterial({color:p.glow,size:.09,transparent:true,opacity:.58,depthWrite:false,sizeAttenuation:true}));parent.add(motes);animated.push({type:'motes',mesh:motes,origins});
}

export function createWorld(index=0,quality='high') {
  index=Math.max(0,Math.min(MAPS.length-1,index));
  const root=new THREE.Group(),p=palettes[index],obstacles=[],animated=[];
  root.name=`world-${MAPS[index].id}`;
  ground(root,p,index);road(root,MAPS[index].route,p,index);
  let water=null;
  if(index===0)water=pond(root,p,animated);
  if(index===1){manor(root,p,obstacles);fountain(root,-8.8,-.9,p,obstacles,animated);}
  if(index===2)sanctuary(root,p,obstacles,animated);
  vegetation(root,MAPS[index].route,p,index,quality,obstacles,water);
  for(const [x,z] of index===0?[[-8.3,-1.9],[2.1,4.7],[4,-4.7]]:index===1?[[-7.6,4.7],[-3.8,-4.9],[5,4.8]]:[[-8.3,-1.4],[1.7,4.6],[5.7,-4.5]])lantern(root,x,z,p,obstacles);
  gates(root,MAPS[index].route,p,animated);batchStatics(root);atmosphere(root,p,animated,quality);
  root.userData={groundY:0,obstacles,water,animated,index,dispose:()=>disposeWorld(root)};return root;
}

export function animateWorld(group,time) {
  for(const a of group.userData.animated||[]){
    if(a.type==='water'){a.mesh.material.map.offset.set(time*.008,time*.005);}
    else if(a.type==='ripple'){const t=(time*.45+a.phase)%3;a.mesh.scale.setScalar(.65+t*.25);a.mesh.material.opacity=(1-t/3)*.26;}
    else if(a.type==='sigil'){a.mesh.rotation.y=time*.7;a.mesh.position.y+=(Math.sin(time*1.8+a.phase)*.06-(a.last||0));a.last=Math.sin(time*1.8+a.phase)*.06;}
    else if(a.type==='portal'){a.mesh.rotation.z=time*.17;}
    else if(a.type==='fountain'){a.mesh.scale.x=.9+Math.sin(time*7)*.1;a.mesh.material.opacity=.5+Math.sin(time*4)*.08;}
    else if(a.type==='motes'){
      const p=a.mesh.geometry.attributes.position;
      a.origins.forEach(([x,y,z,phase],i)=>p.setXYZ(i,x+Math.sin(time*.18+phase)*.36,y+Math.sin(time*.5+phase)*.23,z+Math.cos(time*.15+phase)*.3));p.needsUpdate=true;
    }
  }
}

export function disposeWorld(group) {
  const persistentMaterials=new Set(materialCache.values()),geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{
    if(object.geometry&&!sharedGeometries.has(object.geometry))geometries.add(object.geometry);
    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const mat of list){
      if(!mat||persistentMaterials.has(mat))continue;
      materials.add(mat);
      for(const key of ['map','normalMap','roughnessMap','bumpMap','alphaMap'])if(mat[key])textures.add(mat[key]);
    }
  });
  for(const g of geometries)g.dispose();
  for(const t of textures)t.dispose();
  for(const m of materials)m.dispose();
  group.clear();
}
