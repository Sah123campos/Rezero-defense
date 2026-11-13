
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';

const $=id=>document.getElementById(id);
const W=24,H=14,WAVES=15;
const maps=[
 {name:'Floresta de Lugunica',short:'Capítulo I',desc:'Bosques verdejantes, flores mágicas e o começo da profecia.',ground:0x44785b,grass:0x5b9973,path:0xdac39b,water:0x64bdba,
 route:[[-13,-3.1],[-7,-3.1],[-7,2.8],[-2,2.8],[-2,-1.5],[5,-1.5],[5,2.5],[13,2.5]]},
 {name:'Mansão Roswaal',short:'Capítulo II',desc:'Jardins nobres sob os mistérios da mansão.',ground:0x67708a,grass:0x8d879f,path:0xd4b5a7,water:0x92a6cc,
 route:[[-13,2.8],[-7,2.8],[-7,-2.8],[-2,-2.8],[-2,2],[4,2],[4,-2.5],[13,-2.5]]},
 {name:'Santuário',short:'Capítulo III',desc:'Ruínas, cristais antigos e uma magia inquietante.',ground:0x5e527d,grass:0x8a709b,path:0xbfa6ae,water:0xba80cc,
 route:[[-13,-3],[-5,-3],[-5,.5],[-9,.5],[-9,4.5],[2,4.5],[2,-2.2],[8,-2.2],[8,2],[13,2]]}
];
const heroes={
 emilia:{name:'Emilia',symbol:'❄',role:'Gelo • lentidão',cost:165,damage:19,range:3.55,rate:.87,color:0x8deaff,coat:0xf1eaff,hair:0xe2f0f8,desc:'Espíritos de gelo desaceleram e controlam o avanço inimigo.',paths:[['Cristal vivo','Estilhaço polar','Geada eterna','Lança glacial','Era do gelo'],['Alcance lunar','Conjuração','Horizonte frio','Círculo de gelo','Domínio espiritual'],['Afinidade','Ritmo arcano','Vento frio','Reflexo da lua','Magia contínua']]},
 rem:{name:'Rem',symbol:'✦',role:'Área • impacto',cost:220,damage:34,range:2.8,rate:1.15,color:0x7cc6ff,coat:0x2c3c6c,hair:0x4395e1,desc:'Manguelo com impacto em área, excelente contra grupos de sombras.',paths:[['Corrente reforçada','Impacto forte','Esfera oni','Fúria azul','Aniquilação'],['Corrente longa','Giro amplo','Arremesso','Órbita de ferro','Dança mortal'],['Reflexos','Força oni','Instinto','Velocidade brutal','Oni desperta']]},
 beatrice:{name:'Beatrice',symbol:'✧',role:'Suporte • magia',cost:245,damage:13,range:3.5,rate:1.15,color:0xe8b4ff,coat:0x704386,hair:0xf1d27c,desc:'Magia yin e aura de apoio: acelera os ataques dos guardiões.',paths:[['Mana densa','Códice oculto','Selo yin','Ruptura espiritual','Biblioteca infinita'],['Aura ampla','Proteção','Canal arcano','Campo espiritual','Santuário de mana'],['Leitura veloz','Páginas vivas','Ritual acelerado','Dobra arcana','Tempo suspenso']]},
 subaru:{name:'Subaru',symbol:'⚔',role:'Rápido • precisão',cost:115,damage:13,range:2.9,rate:.42,color:0xffaa85,coat:0x252f45,hair:0x242332,desc:'Guerreiro acessível e rápido, perfeito para as primeiras ondas.',paths:[['Golpe certeiro','Coragem','Estocada','Persistência','Vontade inabalável'],['Vigilância','Olhar atento','Longo alcance','Tática','Sentinela'],['Esquiva','Contra-ataque','Determinação','Ritmo intenso','Retorno do herói']]}
};
const branchLabels=['PODER','ALCANCE','VELOCIDADE'];
let save;
try{save=JSON.parse(localStorage.getItem('rezero-astral3d-save')||'null')}catch{}
if(!save||typeof save!=='object')save={unlocked:1,best:[0,0,0],wins:[false,false,false]};
function persist(){try{localStorage.setItem('rezero-astral3d-save',JSON.stringify(save))}catch{}}
let scene,camera,renderer,raycaster,field,ground,rangeRing,clock=new THREE.Clock(),active=false;
let decor=[],towers=[],enemies=[],projectiles=[],particles=[],mapsGroup,actorsGroup,projectileGroup,particleGroup;
let route=[],routeLengths=[],totalRoute=0,groundColor=0;
let state={map:0,wave:0,gold:500,lives:25,started:false,spawning:0,spawnTime:0,spawned:0,spawnTotal:0,speed:1,selected:null,placing:null,abilityCd:0,gameOver:false,mode:'menu'};
let musicCtx=null,musicTimer=null,musicStep=0,muted=true,lastSound=0;
const mat=(col,rough=.72)=>new THREE.MeshStandardMaterial({color:col,roughness:rough,metalness:.05,flatShading:false});
const plain=col=>new THREE.MeshBasicMaterial({color:col});
const glow=col=>new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.7});
const sphere=(r,col,segments=14)=>new THREE.Mesh(new THREE.SphereGeometry(r,segments,10),mat(col));
const box=(w,h,d,col)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(col));
const cyl=(top,bottom,h,col,n=9)=>new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,n),mat(col));
const cone=(r,h,col,n=9)=>new THREE.Mesh(new THREE.ConeGeometry(r,h,n),mat(col));
function add(p,o,x=0,y=0,z=0){o.position.set(x,y,z);p.add(o);return o}
function shade(hex,amount){return new THREE.Color(hex).multiplyScalar(amount)}
function pseudo(n){return ((Math.sin(n*127.1+state.map*91.9)*43758.5453)%1+1)%1}
function uiToast(s){let a=$('toast');a.textContent=s;a.classList.remove('hidden');clearTimeout(uiToast.timer);uiToast.timer=setTimeout(()=>a.classList.add('hidden'),2300)}
function sound(freq=440,duration=.16,type='sine',vol=.04){
 try{if(!musicCtx)musicCtx=new (window.AudioContext||window.webkitAudioContext)();if(musicCtx.state==='suspended')musicCtx.resume();let a=musicCtx,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,a.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(60,freq*.65),a.currentTime+duration);g.gain.setValueAtTime(vol,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration)}catch{}
}
function musicToggle(){
 muted=!muted;$('musicToggle').textContent=muted?'♫ Música: OFF':'♫ Música: ON';
 if(musicTimer){clearInterval(musicTimer);musicTimer=null}
 if(!muted){
  const notes=[220,261.63,329.63,392,329.63,261.63,196,246.94,293.66,392,293.66,246.94,174.61,220,261.63,349.23];
  musicStep=0;musicTimer=setInterval(()=>{if(muted)return;let n=notes[musicStep%notes.length];sound(n,.75,'triangle',.012);if(musicStep%4===0)sound(n/2,1.1,'sine',.009);musicStep++},430);
  sound(523,.25,'sine',.035)
 }
}
function initThree(){
 if(renderer)return;
 scene=new THREE.Scene();scene.background=new THREE.Color(0x90b1ab);scene.fog=new THREE.FogExp2(0x8fb5a8,.014);
 raycaster=new THREE.Raycaster();
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.48;
 field=$('viewport');field.prepend(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xd8eeff,0x2e483b,2.1));
 const sun=new THREE.DirectionalLight(0xfff4d8,3.4);sun.position.set(-8,19,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=19;sun.shadow.camera.bottom=-19;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
 const fill=new THREE.DirectionalLight(0xa89bff,1.1);fill.position.set(9,8,-7);scene.add(fill);
 camera=new THREE.OrthographicCamera(-14,14,10,-10,.1,120);camera.position.set(0,21,17);camera.lookAt(0,0,0);
 const board=box(26,.5,16,0x294339);board.receiveShadow=true;add(scene,board,0,-.38,0);ground=board;
 mapsGroup=new THREE.Group();actorsGroup=new THREE.Group();projectileGroup=new THREE.Group();particleGroup=new THREE.Group();
 scene.add(mapsGroup,actorsGroup,projectileGroup,particleGroup);
 rangeRing=new THREE.Mesh(new THREE.RingGeometry(.98,1,64),new THREE.MeshBasicMaterial({color:0xdac7ff,side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));
 rangeRing.rotation.x=-Math.PI/2;rangeRing.visible=false;add(scene,rangeRing,0,.15,0);
 renderer.domElement.addEventListener('pointerdown',handleBoard);
 window.addEventListener('resize',resize);resize();animate()
}
function resize(){
 if(!renderer)return;let r=field.getBoundingClientRect();if(r.width<10||r.height<10)return;
 renderer.setSize(r.width,r.height,false);let a=r.width/r.height;
 let halfH=Math.max(9.4,14.3/a);camera.left=-halfH*a;camera.right=halfH*a;camera.top=halfH;camera.bottom=-halfH;
 camera.updateProjectionMatrix()
}
function clearWorld(){
 for(const t of towers)actorsGroup.remove(t.group);
 for(const e of enemies)actorsGroup.remove(e.group);
 towers=[];enemies=[];projectiles=[];particles=[];selected(null);mapsGroup.clear();actorsGroup.clear();projectileGroup.clear();particleGroup.clear()
}
function nearRoute(x,z){
 let best=1e8;
 for(let i=0;i<route.length-1;i++){let a=route[i],b=route[i+1],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz))}
 return best
}
function buildPath(){
 let back=mat(0x63574b),edge=mat(0x9f8768),road=mat(maps[state.map].path);
 for(let i=1;i<route.length;i++){
  let [ax,az]=route[i-1],[bx,bz]=route[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);
  for(const [width,height,y,material] of [[1.92,.15,.08,back],[1.67,.15,.16,edge],[1.48,.12,.24,road]]){
   const piece=box(len+width*.35,height,width,0xffffff);piece.material=material;piece.rotation.y=angle;piece.receiveShadow=true;add(mapsGroup,piece,(ax+bx)/2,y,(az+bz)/2)
  }
 }
 for(const [x,z] of route){for(const [r,y,ma] of [[.92,.12,back],[.83,.21,edge],[.74,.28,road]]){let c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.15,18),ma);c.receiveShadow=true;add(mapsGroup,c,x,y,z)}}
 for(let i=0;i<totalRoute;i+=.68){let [x,z]=routePosition(i),tile=box(.16,.012,.036,0xf4dfb3);tile.rotation.y=routeAngle(i);add(mapsGroup,tile,x,.35,z)}
 const portal=(x,z,color)=>{
  let ring=new THREE.Mesh(new THREE.TorusGeometry(.66,.17,10,24),glow(color));ring.rotation.x=-Math.PI/2;add(mapsGroup,ring,x,.37,z);
  let crystal=cone(.36,1.2,color,6);crystal.rotation.z=Math.PI;add(mapsGroup,crystal,x,1,z);
 };
 portal(route[0][0],route[0][1],0x6ee7ff);portal(route.at(-1)[0],route.at(-1)[1],0xff829f)
}
function routeAngle(dist){
 let z=Math.max(0,dist);for(let i=0;i<routeLengths.length;i++){if(z<routeLengths[i]){let a=route[i],b=route[i+1];return -Math.atan2(b[1]-a[1],b[0]-a[0])}z-=routeLengths[i]}return 0
}
function routePosition(dist){
 let d=Math.max(0,dist);for(let i=0;i<routeLengths.length;i++){if(d<=routeLengths[i]){let a=route[i],b=route[i+1],t=d/routeLengths[i];return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}d-=routeLengths[i]}return route.at(-1)
}
function tree(x,z,s,i){
 const g=new THREE.Group();add(mapsGroup,g,x,0,z);
 add(g,cyl(.18*s,.26*s,.95*s,0x68523e),0,.45*s,0);
 const colors=state.map===0?[0x2d7054,0x4b9868,0x79bc85]:state.map===1?[0x365a78,0x4d7994,0x88adc1]:[0x55416e,0x876caa,0xb69ac7];
 for(let n=0;n<3;n++){let top=cone((1.04-n*.2)*s,(1.85-n*.17)*s,colors[n],7);add(g,top,0,(1.4+n*.58)*s,0);top.castShadow=true}
 g.rotation.y=pseudo(i*16)*6.3;
}
function rock(x,z,s){
 const c=new THREE.Mesh(new THREE.IcosahedronGeometry(s,.0),mat(state.map===2?0x937b9f:0x9aaca1));c.scale.y=.68;c.rotation.y=pseudo(x+z)*Math.PI;add(mapsGroup,c,x,s*.4,z);c.castShadow=true;
}
function decorScene(){
 const config=maps[state.map];
 ground.material.color.setHex(config.ground);
 scene.background.setHex(state.map===0?0x9ac7ba:state.map===1?0xb3b0cc:0xa694be);
 scene.fog.color.set(scene.background);
 const base=new THREE.Mesh(new THREE.PlaneGeometry(25.8,15.7),mat(config.ground));base.rotation.x=-Math.PI/2;add(mapsGroup,base,0,-.115,0);base.receiveShadow=true;
 for(let i=0;i<170;i++){
  let x=(pseudo(i*71+4)-.5)*25,z=(pseudo(i*41+9)-.5)*15;
  if(nearRoute(x,z)<1.65||Math.abs(x)>11.65||Math.abs(z)>6.65)continue;
  if(i%7===0){rock(x,z,.18+pseudo(i*12)*.28);continue}
  if(i%3===0){let flower=sphere(.08,i%2?0xffd7c7:0xe7c0ff,8);add(mapsGroup,flower,x,.12,z);continue}
  if(i%4===0){let bush=sphere(.28+pseudo(i)*.25,state.map===2?0x9478ab:0x3a8558,9);bush.scale.y=.55;add(mapsGroup,bush,x,.18,z);continue}
  tree(x,z,.4+pseudo(i*3)*.42,i)
 }
 if(state.map===0){
  const lake=new THREE.Mesh(new THREE.CircleGeometry(2.35,44),new THREE.MeshStandardMaterial({color:0x74cfbd,roughness:.27,metalness:.16,transparent:true,opacity:.83}));
  lake.rotation.x=-Math.PI/2;lake.scale.y=.58;add(mapsGroup,lake,-9,.014,5);
  for(let i=0;i<9;i++){let a=i*6.28/9;rock(-9+Math.cos(a)*2.1,5+Math.sin(a)*1.2,.25)}
 }
 if(state.map===1){
  let manor=new THREE.Group();add(mapsGroup,manor,9.25,0,-5.1);
  const wall=box(3.4,2.2,2.25,0xf4e7df);wall.castShadow=true;add(manor,wall,0,1.1,0);
  let roof=cone(2.65,2.2,0x5b426e,4);roof.rotation.y=Math.PI/4;roof.scale.z=.66;add(manor,roof,0,3.13,0);
  for(let i=-1;i<=1;i++){let win=box(.36,.55,.06,0x86cde9);add(manor,win,i*.91,1.35,1.17)}
  for(let x of [-5,6]){let lamp=cyl(.04,.08,1.2,0x34314e);add(mapsGroup,lamp,x,.6,5);let a=sphere(.24,0xffdaa2);add(mapsGroup,a,x,1.3,5)}
 }
 if(state.map===2){
  for(let i=0;i<20;i++){
   let x=(pseudo(i*33)-.5)*22,z=(pseudo(i*82)-.5)*12;
   if(nearRoute(x,z)<1.4)continue;
   let crystal=cone(.45+pseudo(i+6)*.3,1.6+pseudo(i*9),i%3?0xae86e7:0x7de1ed,5);crystal.castShadow=true;add(mapsGroup,crystal,x,.8,z)
  }
  const altar=new THREE.Group();add(mapsGroup,altar,-10,0,5);
  add(altar,cyl(1.15,1.42,.45,0x81758c,8),0,.22,0);
  add(altar,cyl(.68,.77,.3,0xb5a6bc,8),0,.6,0);
  add(altar,cone(.48,1.8,0xb28be8,6),0,1.5,0)
 }
 buildPath()
}
function makeHero(key){
 const u=heroes[key],g=new THREE.Group(),skin=mat(0xffe0d5),hair=mat(u.hair),cloth=mat(u.coat),trim=mat(u.color);
 // stone platform, small legs and boots
 const base=cyl(.56,.64,.21,0x383654,16);add(g,base,0,.11,0);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.53,.055,8,24),new THREE.MeshStandardMaterial({color:u.color,emissive:u.color,emissiveIntensity:.45}));rim.rotation.x=-Math.PI/2;add(g,rim,0,.235,0);
 for(let x of [-.19,.19]){add(g,cyl(.115,.13,.38,0x24243b,8),x,.48,.02);add(g,sphere(.15,0x29263c,10),x,.31,.16)}
 const body=cyl(key==='bea'?.43:.32,.42,.83,u.coat,12);add(g,body,0,.91,0);body.castShadow=true;
 if(key==='emilia'||key==='bea'){let skirt=cone(key==='bea'?.65:.59,.72,u.coat,14);skirt.rotation.z=Math.PI;add(g,skirt,0,.63,0)}
 for(let x of [-.43,.43]){add(g,sphere(.16,u.coat,10),x,1.17,0);let arm=cyl(.11,.1,.5,key==='subaru'?u.coat:0xffe0d5,8);arm.rotation.z=x<0?-.22:.22;add(g,arm,x*1.12,.93,.03)}
 const head=sphere(.46,0xffe0d5,22);add(g,head,0,1.75,.035);head.castShadow=true;
 // layered hair and fringe
 const cap=sphere(.485,u.hair,20);cap.scale.y=.68;add(g,cap,0,1.97,-.025);
 for(let i=0;i<5;i++){let bang=cone(.12,.46,u.hair,8);bang.rotation.z=(i-2)*.15;add(g,bang,(i-2)*.165,1.92,.34)}
 if(key==='emilia'){
  for(let a of [-1,1]){let lock=cyl(.15,.1,1.0,u.hair,9);add(g,lock,a*.44,1.36,-.08);let ear=cone(.15,.42,0xffe0d5,7);ear.rotation.z=a*Math.PI/2;add(g,ear,a*.55,1.73,0)}
  let jewel=sphere(.13,0x9beaff);add(g,jewel,0,2.17,.25);
 }else if(key==='rem'){
  for(let a of [-1,1]){add(g,sphere(.31,u.hair,12),a*.36,1.59,-.04)}
  const ribbon=box(.62,.11,.15,0xffffff);add(g,ribbon,0,2.11,.08);
  add(g,sphere(.11,0xfed1d4),-.23,2.19,.1)
 }else if(key==='bea'){
  for(let a of [-1,1]){for(let y of [1.89,1.56,1.27]){add(g,sphere(.21,u.hair),a*.56,y,-.05)}add(g,sphere(.18,0x9d6bc9),a*.65,2.11,.02)}
  add(g,sphere(.18,0xf6dc9f),0,2.17,.2)
 }else{
  for(let i=0;i<7;i++){let spike=cone(.22,.5,u.hair,8);spike.rotation.z=(i-3)*.24;add(g,spike,(i-3)*.13,2.17,-.1)}
  for(let a of [-1,1]){let stripe=box(.1,.7,.09,0xee8445);add(g,stripe,a*.21,.94,.37)}
 }
 // anime eyes toward camera, positive z
 for(let x of [-.18,.18]){
  const white=sphere(.135,0xffffff,12);white.scale.set(.89,1,.34);add(g,white,x,1.74,.416);
  const eye=sphere(.076,key==='rem'?0x56acdb:key==='subaru'?0x292338:0x7752a2,12);eye.scale.z=.42;add(g,eye,x,1.74,.52);
  add(g,sphere(.024,0xffffff),x-.024,1.77,.562)
 }
 const mouth=box(.12,.018,.012,0x9f6063);add(g,mouth,0,1.51,.47);
 if(key==='rem'){const weapon=cyl(.09,.08,.85,0xa6abbc);weapon.rotation.z=.5;add(g,weapon,-.72,.98,.06);add(g,sphere(.29,0x637a94),-.91,.58,.13)}
 if(key==='subaru'){const sword=box(.08,.88,.12,0xa0b5c0);sword.rotation.z=-.24;add(g,sword,.67,1.06,.04)}
 if(key==='bea'){const book=box(.35,.45,.12,0x754f9d);add(g,book,.56,.95,.23)}
 if(key==='emilia'){let snow=cone(.15,.4,0x98f4ff,6);add(g,snow,.73,1.15,.08)}
 return g
}
function showHeroTier(t){
 const lev=t.level;t.group.scale.setScalar(1+lev*.065);
 if(lev===0)return;
 const n=lev+1;
 for(let i=0;i<n;i++){
  const a=6.283*i/n;let c=new THREE.Mesh(new THREE.OctahedronGeometry(.1+lev*.025),new THREE.MeshBasicMaterial({color:t.u.color}));
  add(t.group,c,Math.cos(a)*(.7+lev*.05),1.45+Math.sin(a)*.2,Math.sin(a)*(.7+lev*.05));c.userData.orb=true
 }
 if(lev>=3){let halo=new THREE.Mesh(new THREE.TorusGeometry(.55,.04,8,24),new THREE.MeshBasicMaterial({color:t.u.color}));halo.rotation.x=Math.PI/2;add(t.group,halo,0,2.5,0)}
 if(lev===5){let crown=cone(.39,.56,t.u.color,7);add(t.group,crown,0,2.58,0)}
}
function makeEnemy(type,wave){
 const defs={shade:{hp:48,speed:1.3,color:0x9b81cf,reward:15,scale:.82},runner:{hp:40,speed:2.25,color:0x7ddce0,reward:17,scale:.68},armored:{hp:145,speed:.83,color:0xf5bf74,reward:27,scale:1.02},wraith:{hp:94,speed:1.5,color:0xde83ce,reward:22,scale:.85},boss:{hp:1050,speed:.55,color:0xff609c,reward:200,scale:2.2}};
 const d=defs[type],g=new THREE.Group(),body=sphere(.55,d.color,15);body.scale.y=1.16;add(g,body,0,.95,0);body.castShadow=true;
 const cloak=cone(.68,.93,type==='boss'?0x61204d:0x343054,11);cloak.rotation.z=Math.PI;add(g,cloak,0,.52,0);
 for(let a of [-1,1]){let horn=cone(.19,.63,type==='boss'?0xffc2dc:0x55446b,7);horn.rotation.z=a*.43;add(g,horn,a*.36,1.6,0)}
 for(let a of [-1,1]){let eye=sphere(.105,type==='runner'?0x153c45:0xffffff);eye.scale.z=.55;add(g,eye,a*.2,1.04,.53)}
 if(type==='armored'||type==='boss'){let armor=box(.85,.19,.45,type==='boss'?0xdb97c5:0xb7a6a0);add(g,armor,0,1.37,.06)}
 g.scale.setScalar(d.scale);
 const hp=d.hp*(1+wave*(type==='boss'?.34:.2));return{type,group:g,hp,maxHp:hp,speed:d.speed*(1+wave*.012),reward:d.reward,dist:0,slowUntil:0,slowRate:1,boss:type==='boss',bar:null}
}
function healthBar(e){
 let bg=box(1.02,.105,.05,0x2d2131);add(e.group,bg,0,2.13,.02);
 const front=box(.96,.11,.065,e.boss?0xff83b0:0x9fe1bb);add(e.group,front,0,2.13,.075);e.bar=front
}
function spawnEnemy(){
 const i=state.spawned,final=state.wave%5===0&&i===state.spawnTotal-1;
 let type=final?'boss':state.wave>5&&i%7===0?'wraith':i%6===0&&state.wave>=2?'armored':i%4===0?'runner':'shade';
 let e=makeEnemy(type,state.wave);healthBar(e);e.group.position.set(route[0][0],.3,route[0][1]);actorsGroup.add(e.group);enemies.push(e);state.spawned++;
 if(final){uiToast('⚠ CHEFE DAS SOMBRAS!');sound(115,.5,'sawtooth',.08)}
}
function putTower(key,x,z){
 const u=heroes[key];if(state.gold<u.cost){uiToast('Ouro insuficiente!');return}
 if(Math.abs(x)>11.35||Math.abs(z)>6.8||nearRoute(x,z)<1.58||towers.some(t=>Math.hypot(t.x-x,t.z-z)<1.27)){
  uiToast('Escolha um terreno livre, longe da estrada.');return
 }
 state.gold-=u.cost;
 const group=makeHero(key);group.position.set(x,.15,z);actorsGroup.add(group);
 const t={key,u,group,x,z,level:0,branch:-1,paid:u.cost,damage:u.damage,range:u.range,rate:u.rate,cooldown:0,slow:key==='emilia'?.52:0,splash:key==='rem'?.92:0,buff:key==='beatrice'?.12:0,critical:key==='subaru'?.13:0};
 towers.push(t);state.placing=null;selected(t);updateHUD();sound(620,.17,'triangle');uiToast(u.name+' convocada!');refreshShop()
}
function selected(t){
 state.selected=t;rangeRing.visible=!!t;
 if(t){rangeRing.position.set(t.x,.32,t.z);rangeRing.scale.set(t.range,t.range,1)}
 renderDetails()
}
function rayPoint(event){
 const r=renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
 raycaster.setFromCamera(mouse,camera);
 const hit=new THREE.Vector3();return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?hit:null
}
function handleBoard(event){
 if(state.mode!=='battle'||state.gameOver||!$('battleDialog').classList.contains('hidden'))return;
 const p=rayPoint(event);if(!p)return;
 if(state.placing){putTower(state.placing,p.x,p.z);return}
 const hit=towers.filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<.82).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];selected(hit||null)
}
function upgrade(t,branch){
 if(!t||t.level>=5)return;
 if(t.branch!==-1&&t.branch!==branch){uiToast('Este guardião já escolheu outro caminho.');return}
 const cost=Math.floor(t.u.cost*[.8,1.15,1.6,2.25,3.1][t.level]);
 if(state.gold<cost){uiToast('Ouro insuficiente para evoluir!');return}
 state.gold-=cost;t.paid+=cost;t.branch=branch;t.level++;
 if(branch===0){t.damage*=1.6;t.splash+=.08}
 if(branch===1){t.range*=1.19;t.damage*=1.12}
 if(branch===2){t.rate*=.78;t.damage*=1.05}
 if(t.key==='emilia'&&t.level>=3)t.slow=.62;
 if(t.key==='rem'&&t.level>=3)t.splash+=.42;
 if(t.key==='beatrice'&&t.level>=3)t.buff+=.05;
 t.group.clear();let newer=makeHero(t.key);while(newer.children.length)t.group.add(newer.children[0]);showHeroTier(t);
 if(t===state.selected){rangeRing.scale.set(t.range,t.range,1)}
 sound(720,.4,'triangle',.075);uiToast(t.u.name+' evoluiu para o nível '+t.level+'!');updateHUD();renderDetails()
}
function renderDetails(){
 const wrap=$('details'),up=$('upgradeRows');up.innerHTML='';
 let t=state.selected;
 if(!t){
  $('detailsTitle').textContent=state.placing?heroes[state.placing].name+' • posicionar':'Selecione um guardião';
  $('detailsText').textContent=state.placing?'Clique ou toque em um local livre do mapa.':'Selecione uma unidade na loja ou uma unidade já posicionada.';$('sellButton').classList.add('hidden');return
 }
 $('detailsTitle').textContent=t.u.name+' • Nv. '+t.level+' / 5';
 $('detailsText').textContent=t.u.desc+'  Dano: '+Math.round(t.damage)+' • Alcance: '+t.range.toFixed(1);
 branchLabels.forEach((name,i)=>{
  let button=document.createElement('button');button.className='upgradeRow'+(t.branch!==-1&&t.branch!==i?' locked':'')+(t.branch===i?' done':'');
  const next=t.level<5?t.u.paths[i][t.level]:'MAX';
  const price=t.level<5?Math.floor(t.u.cost*[.8,1.15,1.6,2.25,3.1][t.level]):0;
  button.innerHTML='<span><strong>'+['⚔ ','✧ ','➤ '][i]+name+'</strong><small>'+next+'</small></span><span class="price">'+(t.level>=5?'MAX':'◈ '+price)+'</span>';
  button.disabled=t.level>=5||(t.branch!==-1&&t.branch!==i)||price>state.gold;
  button.onclick=()=>upgrade(t,i);up.appendChild(button)
 });
 $('sellButton').classList.remove('hidden');$('sellButton').textContent='Vender guardião • +'+Math.round(t.paid*.7);
}
function refreshShop(){
 document.querySelectorAll('[data-hero]').forEach(b=>{const k=b.dataset.hero;b.classList.toggle('active',state.placing===k);b.disabled=state.gold<heroes[k].cost||state.gameOver})
}
function sellSelected(){
 const t=state.selected;if(!t)return;state.gold+=Math.round(t.paid*.7);actorsGroup.remove(t.group);towers=towers.filter(a=>a!==t);selected(null);updateHUD();refreshShop();sound(310,.15)
}
function updateHUD(){
 $('hp').textContent=Math.max(0,state.lives);$('coins').textContent=state.gold;$('waveNo').textContent=state.wave+'/'+WAVES;
 $('startWave').disabled=state.started||state.gameOver;
 $('startWave').textContent=state.started?'ONDA EM CURSO':state.wave>=WAVES?'CONCLUÍDO':'▶ INICIAR ONDA '+(state.wave+1);
 refreshShop();
 // update shop button affordability after kills
 if(state.selected)renderDetails()
}
function levelScreen(){
 $('menu').classList.add('hidden');$('campaign').classList.remove('hidden');$('battle').classList.add('hidden');
 $('campaignGrid').innerHTML='';
 maps.forEach((m,i)=>{
  let b=document.createElement('button');b.className='mapCard'+(i>=save.unlocked?' locked':'');
  b.disabled=i>=save.unlocked;
  const p=i>=save.unlocked?'🔒 Complete o capítulo anterior':'✦ Melhor onda: '+(save.best[i]||0)+' / '+WAVES+(save.wins[i]?' • VENCIDO':'');
  b.innerHTML='<div class="mapPreview"></div><div class="mapInfo"><div class="tiny">'+m.short+'</div><h3>'+m.name+'</h3><p>'+m.desc+'</p><small>'+p+'</small></div>';
  b.onclick=()=>startMap(i);$('campaignGrid').appendChild(b)
 })
}
function resetGame(){
 state.started=false;state.spawning=0;state.wave=0;state.gold=500;state.lives=25;state.speed=1;state.abilityCd=0;state.gameOver=false;state.placing=null;state.mode='battle';$('speed').textContent='⏩ 1×';$('magic').textContent='❄ NEVASCA';$('magic').disabled=true;clock.getDelta();clearWorld()
}
function startMap(index){
 if(index>=save.unlocked)return;
 initThree();resetGame();state.map=index;route=maps[index].route;
 routeLengths=[];totalRoute=0;for(let i=1;i<route.length;i++){let a=route[i-1],b=route[i],v=Math.hypot(b[0]-a[0],b[1]-a[1]);routeLengths.push(v);totalRoute+=v}
 decorScene();$('campaign').classList.add('hidden');$('menu').classList.add('hidden');$('battle').classList.remove('hidden');$('battleName').textContent=maps[index].name;
 resize();updateHUD();renderDetails();showDialog('O DESTINO COMEÇA','Posicione guardiões próximos da estrada. Evolua cada um por um dos três caminhos e sobreviva a 15 ondas.','PREPARAR DEFESA',()=>hideDialog(),'VOLTAR AOS MAPAS',()=>leaveBattle());
}
function startWave(){
 if(state.started||state.gameOver||state.wave>=WAVES)return;
 state.started=true;state.wave++;state.spawned=0;state.spawnTime=0;state.spawnTotal=8+state.wave*2+(state.wave%5===0?1:0);
 state.abilityCd=state.wave===1?0:state.abilityCd;
 $('magic').disabled=state.abilityCd>0;
 hideDialog();updateHUD();sound(320,.25,'triangle');uiToast('ONDA '+state.wave+' / '+WAVES+(state.wave%5===0?' • PREPARE-SE PARA O CHEFE!':''));
}
function killEnemy(e){
 if(e.dead)return;e.dead=true;state.gold+=e.reward;
 const pos=e.group.position.clone();for(let i=0;i<7;i++)makeParticle(pos,e.type==='boss'?0xff84a6:e.type==='runner'?0x77edff:0xd4b3ff);
 actorsGroup.remove(e.group);
 if(e.boss)sound(290,.44,'sine',.09)
}
function makeParticle(pos,color){
 if(particles.length>100)return;
 let mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.09+Math.random()*.1,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}));
 mesh.position.copy(pos);mesh.position.y+=.9;particleGroup.add(mesh);
 particles.push({mesh,life:.6,vel:new THREE.Vector3((Math.random()-.5)*3,Math.random()*3+1,(Math.random()-.5)*3)})
}
function shoot(t,e){
 const start=t.group.position.clone().add(new THREE.Vector3(0,1.45,0));
 const orb=new THREE.Mesh(new THREE.SphereGeometry(t.key==='rem'?.2:.135,9,7),new THREE.MeshBasicMaterial({color:t.u.color}));
 orb.position.copy(start);projectileGroup.add(orb);
 projectiles.push({mesh:orb,target:e,t,damage:t.damage*(Math.random()<t.critical?2:1),life:2.1});
 t.group.rotation.y+=.08;
 if(t.key==='rem'||t.level>=3)for(let i=0;i<2;i++)makeParticle(start,t.u.color);
}
function damage(e,value,t){
 e.hp-=value;
 if(t.slow){e.slowRate=Math.max(.22,1-t.slow);e.slowUntil=performance.now()/1000+1.6}
 if(t.splash>0)enemies.forEach(other=>{if(other!==e&&!other.dead&&other.group.position.distanceTo(e.group.position)<t.splash){other.hp-=value*.47}});
 if(e.hp<=0)killEnemy(e)
}
function finishWave(){
 state.started=false;$('magic').disabled=true;
 let bonus=85+state.wave*23;state.gold+=bonus;
 save.best[state.map]=Math.max(save.best[state.map]||0,state.wave);persist();
 if(state.wave>=WAVES){
  state.gameOver=true;save.wins[state.map]=true;save.unlocked=Math.min(3,Math.max(save.unlocked,state.map+2));persist();
  showDialog('CAPÍTULO CONCLUÍDO!','Você resistiu às 15 ondas e venceu o destino. '+(state.map<2?'Um novo mapa foi desbloqueado!':'Você venceu toda a campanha!'),'SELECIONAR MAPAS',()=>leaveBattle(),'JOGAR NOVAMENTE',()=>startMap(state.map));
  sound(740,.6,'triangle',.08)
 }else{
  showDialog('ONDA '+state.wave+' SUPERADA','Vitória! +'+bonus+' moedas de recompensa. Reforce seu esquadrão antes de continuar.','PRÓXIMA ONDA',()=>startWave(),'CONTINUAR MELHORANDO',()=>hideDialog());
 }
 updateHUD()
}
function fail(){
 state.started=false;state.gameOver=true;state.spawning=0;
 showDialog('O DESTINO FOI ROMPIDO','Os inimigos atravessaram o portal. Tente uma estratégia diferente e evolua seus guardiões.','TENTAR NOVAMENTE',()=>startMap(state.map),'SELECIONAR MAPAS',()=>leaveBattle());sound(110,.55,'sawtooth',.065);updateHUD()
}
function ability(){
 if(!state.started||state.abilityCd>0||state.gameOver)return;
 state.abilityCd=24;$('magic').disabled=true;
 sound(900,.65,'triangle',.07);
 enemies.forEach(e=>{if(e.dead)return;let p=e.group.position;e.hp-=e.boss?180:155;e.slowRate=.18;e.slowUntil=performance.now()/1000+4;for(let j=0;j<5;j++)makeParticle(p,0x8ff5ff);if(e.hp<=0)killEnemy(e)});
 uiToast('❄ MAGIA SUPREMA: NEVASCA GLACIAL!')
}
function showDialog(title,desc,main,fn,secondary,fn2){
 $('dialogTitle').textContent=title;$('dialogDesc').textContent=desc;
 $('dialogMain').textContent=main;$('dialogMain').onclick=fn;
 $('dialogSecond').textContent=secondary;$('dialogSecond').onclick=fn2;
 $('battleDialog').classList.remove('hidden')
}
function hideDialog(){$('battleDialog').classList.add('hidden')}
function leaveBattle(){
 state.started=false;state.mode='campaign';state.gameOver=true;state.placing=null;
 $('battle').classList.add('hidden');levelScreen()
}
function update(dt){
 if(state.mode!=='battle'||state.gameOver)return;
 if(state.started){
  state.spawnTime+=dt;
  if(state.spawned<state.spawnTotal&&state.spawnTime>=.72){
   state.spawnTime-=.72;spawnEnemy()
  }
  for(const e of enemies){
   if(e.dead)continue;
   let slowdown=performance.now()/1000<e.slowUntil?e.slowRate:1;
   e.dist+=e.speed*slowdown*dt;
   if(e.dist>=totalRoute){e.dead=true;state.lives-=e.boss?5:1;actorsGroup.remove(e.group);if(state.lives<=0){fail();break}continue}
   let [x,z]=routePosition(e.dist);e.group.position.set(x,.28+Math.sin(performance.now()/300+e.dist)*.085,z);
   e.group.rotation.y=-routeAngle(e.dist);e.bar.scale.x=Math.max(.001,e.hp/e.max);e.bar.position.x=-.48*(1-e.hp/e.max);
   if(e.hp<=0)killEnemy(e)
  }
  if(!state.gameOver){
   for(const t of towers){
    t.cooldown-=dt;
    if(t.cooldown<=0){
     let target=enemies.filter(e=>!e.dead&&Math.hypot(e.group.position.x-t.x,e.group.position.z-t.z)<t.range).sort((a,b)=>b.dist-a.dist)[0];
     if(target){
      let multiplier=1+towers.filter(a=>a!==t&&a.key==='beatrice'&&Math.hypot(a.x-t.x,a.z-t.z)<a.range).reduce((s,a)=>s+a.buff,0);
      t.cooldown=t.rate/multiplier;shoot(t,target)
     }
    }
   }
   for(let i=projectiles.length-1;i>=0;i--){
    const s=projectiles[i];s.life-=dt;
    if(s.target.dead||s.life<=0){projectileGroup.remove(s.mesh);projectiles.splice(i,1);continue}
    let goal=s.target.group.position.clone().add(new THREE.Vector3(0,.9,0));
    let diff=goal.sub(s.mesh.position),distance=diff.length(),move=dt*(11+s.t.level*.6);
    if(distance<=move+.13){
     damage(s.target,s.damage,s.t);if(performance.now()-lastSound>140){sound(420+Math.random()*110,.09,'sine',.02);lastSound=performance.now()}
     for(let j=0;j<3;j++)makeParticle(s.mesh.position,s.t.u.color);
     projectileGroup.remove(s.mesh);projectiles.splice(i,1)
    }else s.mesh.position.addScaledVector(diff,move/distance)
   }
   enemies=enemies.filter(e=>!e.dead);
   if(state.spawned>=state.spawnTotal&&enemies.length===0)finishWave();
  }
  if(state.abilityCd>0){state.abilityCd=Math.max(0,state.abilityCd-dt);$('magic').textContent=state.abilityCd>0?'❄ '+Math.ceil(state.abilityCd)+'s':'❄ NEVASCA';$('magic').disabled=state.abilityCd>0||!state.started}
  updateHUD()
 }
 for(const t of towers){
  t.group.position.y=.14+Math.sin(performance.now()/430+t.x*1.4)*.055;
  t.group.children.forEach(a=>{if(a.userData.orb)a.rotation.y+=dt*2})
 }
 for(const e of enemies){e.group.rotation.z=Math.sin(performance.now()/280+e.dist)*.025}
 for(let i=particles.length-1;i>=0;i--){
  let p=particles[i];p.life-=dt;
  if(p.life<=0){particleGroup.remove(p.mesh);particles.splice(i,1)}
  else{p.mesh.position.addScaledVector(p.vel,dt);p.vel.y-=dt*4;p.mesh.material.opacity=Math.min(1,p.life*2)}
 }
}
function animate(){
 requestAnimationFrame(animate);let dt=Math.min(clock.getDelta(),.045);
 if(state.mode==='battle')update(dt);
 if(renderer&&state.mode==='battle')renderer.render(scene,camera)
}
function bindUI(){
 $('play').onclick=()=>levelScreen();$('campaignBack').onclick=()=>{$('campaign').classList.add('hidden');$('menu').classList.remove('hidden')};
 $('exit').onclick=()=>showDialog('SAIR DA PARTIDA?','O progresso desta partida será perdido. Vitórias completas permanecem salvas.','VOLTAR AO MAPA',()=>leaveBattle(),'CONTINUAR JOGANDO',()=>hideDialog());
 $('startWave').onclick=startWave;$('magic').onclick=ability;
 $('speed').onclick=()=>{state.speed=state.speed===1?2:state.speed===2?3:1;$('speed').textContent='⏩ '+state.speed+'×'};
 $('sellButton').onclick=sellSelected;$('musicToggle').onclick=musicToggle;
 $('how').onclick=()=>alert('1. Escolha um capítulo. 2. Clique num guardião da loja e posicione fora da estrada. 3. Inicie a onda. 4. Selecione um guardião para evoluir por PODER, ALCANCE ou VELOCIDADE: são 5 níveis por caminho. 5. Use NEVASCA durante a onda. 6. Vença 15 ondas para desbloquear o próximo capítulo.');
 document.querySelectorAll('[data-hero]').forEach(b=>{b.onclick=()=>{if(state.gold<heroes[b.dataset.hero].cost)return;state.placing=state.placing===b.dataset.hero?null:b.dataset.hero;selected(null);refreshShop();if(state.placing)uiToast('Toque em um terreno livre para invocar '+heroes[state.placing].name)}});
}
bindUI();
