// 玄圃号舰桥 —— 3D 场景
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const D2R = Math.PI / 180;
const SUN_AZ = 35 * D2R, SUN_EL = 13 * D2R;
const SUN = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)).normalize();

const NOISE = /* glsl */`
float hash31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x), mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x), mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
float terrain(vec3 p){ return fbm(p*2.3+vec3(3.1,0.,1.7)) + .32*(fbm(p*7.)-.5); }
`;

const VIEWS = [
  { pos: [0, 2.7, 7.3], tgt: [0, 2.2, -8], fov: 48 },
  { pos: [3.0, 2.3, 3.7], tgt: [-0.1, 1.95, 0], fov: 38 },
  { pos: [-1.2, 2.25, -3.6], tgt: [-7, 1.5, -30], fov: 56 },
  { pos: [3.9, 1.9, 4.2], tgt: [9, 2.15, -2.4], fov: 46 },
];

export async function createWorld(canvas, progress) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 5000);
  const uTime = { value: 0 };
  const noAO = [];          // 不参与环境光遮蔽的透明/加色物体
  const tickers = [];       // 每帧更新

  // ───────────────────────── 贴图与材质
  await progress(0.06, '生成舰体材质 / HULL MATERIALS');
  const hullD = TX.makeHullSet(3, [50, 54, 60], 138);
  const hullW = TX.makeHullSet(8, [212, 209, 201], 150);
  const M = {};
  M.dark = new THREE.MeshStandardMaterial({ map: hullD.map, normalMap: hullD.normalMap, roughnessMap: hullD.roughnessMap, roughness: 1, metalness: .6, normalScale: new THREE.Vector2(.9, .9) });
  M.white = new THREE.MeshStandardMaterial({ map: hullW.map, normalMap: hullW.normalMap, roughnessMap: hullW.roughnessMap, roughness: 1, metalness: .05, normalScale: new THREE.Vector2(.6, .6) });
  M.black = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: .32, metalness: .55 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: .85, metalness: 0 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: .2, metalness: 1 });
  M.orange = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: .48, metalness: .1 });
  M.eCool = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd4e8ff, emissiveIntensity: 3 });
  M.eCoolDim = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd4e8ff, emissiveIntensity: 1.3 });
  M.eWarm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a1f, emissiveIntensity: 3 });
  M.eCyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x5fe4ff, emissiveIntensity: 2 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0xa8cbe0, roughness: .04, metalness: 0, transparent: true, opacity: .06, depthWrite: false, envMapIntensity: .15 });
  M.glassPanel = new THREE.MeshPhysicalMaterial({ color: 0x9fd8e6, roughness: .08, metalness: 0, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide });

  const screenMat = (t, gain = 1.5) => new THREE.MeshStandardMaterial({ color: 0x050607, roughness: .18, metalness: .2, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: gain });

  await progress(0.14, '绘制甲板标线 / DECK MARKINGS');
  const floorSet = TX.makeFloorSet();

  // ───────────────────────── 几何辅助
  function tileUV(g, w, h, d, ts) {
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / ts, uv.getY(k) * dims[f][1] / ts);
    }
  }
  function box(parent, w, h, d, mat, x, y, z, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (mat === M.dark || mat === M.white || o.tile) tileUV(g, w, h, d, o.tile || 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
    parent.add(m);
    return m;
  }
  function cyl(parent, rt, rb, h, mat, x, y, z, seg = 48, o = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), mat);
    m.position.set(x, y, z);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function plane(parent, w, h, mat, x, y, z, rot) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ───────────────────────── 太空：星空、行星、恒星
  await progress(0.22, '载入星图 / STAR CATALOGUE');
  const space = new THREE.Group(); scene.add(space);

  // 把昂贵的程序化噪声一次性烘焙成经纬贴图，运行时只做采样
  const BAKE_HEAD = NOISE + `varying vec2 vUv;
    vec3 dirFromUv(vec2 uv){ float ph = uv.x*6.2831853, th = (1.-uv.y)*3.14159265; return vec3(-cos(ph)*sin(th), cos(th), sin(ph)*sin(th)); }`;
  function bake(w, h, frag, { mips = true, aniso = 1 } = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, { generateMipmaps: mips, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, depthBuffer: false });
    const s = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`, fragmentShader: BAKE_HEAD + frag, depthTest: false, depthWrite: false,
    }));
    m.frustumCulled = false; s.add(m);
    renderer.setRenderTarget(rt); renderer.render(s, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(null);
    m.geometry.dispose(); m.material.dispose();
    rt.texture.anisotropy = aniso;
    return rt.texture;
  }
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const bigTex = Math.min(4096, renderer.capabilities.maxTextureSize);

  {
    const skyTex = bake(2048, 1024, `void main(){ vec3 d = dirFromUv(vUv);
        float band = exp(-pow(dot(d, normalize(vec3(.35,.86,.36)))*3.2, 2.));
        float n = fbm(d*3.2) * fbm(d*7.5+4.);
        vec3 c = mix(vec3(.05,.10,.22), vec3(.22,.10,.20), fbm(d*2.+9.)) * n * band * .5;
        c += vec3(.012,.016,.028) * fbm(d*5.);
        gl_FragColor = vec4(sqrt(max(c, 0.)), 1.); }`, { mips: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 32), new THREE.ShaderMaterial({
      uniforms: { tMap: { value: skyTex } }, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tMap; varying vec2 vUv; void main(){ vec3 c = texture2D(tMap, vUv).rgb; gl_FragColor = vec4(c*c, 1.); }`,
    }));
    space.add(sky);

    const N = 5200, rand = TX.rng(20);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(th) * 3800, u * 3800, s * Math.sin(th) * 3800], i * 3);
      const m = Math.pow(rand(), 5), tint = rand();
      const b = .25 + m * 3.5;
      col.set([b * (tint > .7 ? 1 : .8), b * .9, b * (tint < .3 ? 1 : .82)], i * 3);
      size[i] = 1.1 + m * 2.6;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { uPR: { value: 1 } }, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize; uniform float uPR; varying vec3 vC;
        void main(){ vC = color; gl_PointSize = aSize*uPR; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-.5); gl_FragColor = vec4(vC*smoothstep(.5,.05,d), 1.); }`,
    }));
    stars.frustumCulled = false;
    space.add(stars);
    tickers.push(() => { stars.material.uniforms.uPR.value = renderer.getPixelRatio() * Math.max(1, innerHeight / 1000); });
  }

  const planetGroup = new THREE.Group(); space.add(planetGroup);
  const PLANET_R = 411, PLANET_C = new THREE.Vector3(-123.5, -371, -580.6);
  // RGB = sqrt(地表颜色)，A = 云量
  const planetTex = bake(bigTex, bigTex / 2, `void main(){ vec3 p = dirFromUv(vUv);
      float h = terrain(p);
      float land = smoothstep(.555,.59,h);
      vec3 ocean = mix(vec3(.010,.055,.15), vec3(.03,.22,.34), smoothstep(.30,.55,h));
      vec3 landC = mix(vec3(.20,.165,.12), vec3(.36,.32,.25), fbm(p*11.));
      landC = mix(landC, vec3(.08,.14,.09), smoothstep(.48,.72,fbm(p*4.+7.))*.7);
      float ice = smoothstep(.86,.96,abs(p.y)+(h-.5)*.3);
      vec3 surf = mix(mix(ocean, landC, land), vec3(.82,.87,.92), ice);
      float c = fbm(p*3.6 + fbm(p*2.1+2.)*1.6) + (fbm(p*15.)-.5)*.14;
      gl_FragColor = vec4(sqrt(surf), smoothstep(.56,.78,c)); }`, { aniso: maxAniso });
  // R = 地形高度（全息星图用）
  const heightTex = bake(1024, 512, `void main(){ gl_FragColor = vec4(clamp((terrain(dirFromUv(vUv))-.2)/.6, 0., 1.), 0., 0., 1.); }`, { mips: false });
  {
    const pm = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN }, uTime, tMap: { value: planetTex } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; uniform float uTime; uniform sampler2D tMap; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
          vec4 s = texture2D(tMap, vUv);
          vec3 surf = s.rgb*s.rgb;
          float ocean = smoothstep(1.3, 2.2, s.b/(s.r+.002));
          vec2 cuv = vUv + vec2(uTime*.00022, 0.);
          float cloud = texture2D(tMap, cuv).a;
          float cs = texture2D(tMap, cuv + vec2(.0016,.0012)).a;
          surf *= 1. - cs*.4*(1.-cloud);
          surf = mix(surf, vec3(.94), cloud*.92);
          float ndl = dot(N, uSun);
          float day = smoothstep(-.10,.30,ndl);
          vec3 col = surf * day * 1.55 * vec3(1.,.96,.9);
          col += vec3(.05,.13,.30) * day * (.10 + .5*pow(clamp(1.-dot(N,V),0.,1.), 2.));
          vec3 H = normalize(uSun+V);
          col += pow(max(dot(N,H),0.),70.) * ocean*(1.-cloud) * 2.2 * day;
          float term = smoothstep(-.16,.04,ndl) * (1.-smoothstep(.04,.30,ndl));
          col += surf * vec3(1.,.42,.18) * term * .45;
          float fr = pow(clamp(1.-dot(N,V), 0., 1.), 5.);
          vec3 atm = mix(vec3(1.,.46,.2), vec3(.20,.50,1.), smoothstep(-.08,.38,ndl));
          col += atm * fr * smoothstep(-.32,.18,ndl) * .7;
          col += vec3(.004,.008,.016) * (.6+cloud) + vec3(.01,.03,.06)*fr*.3;
          gl_FragColor = vec4(col, 1.);
        }`,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 192, 128), pm);
    planet.position.copy(PLANET_C); planet.rotation.set(-.26, 1.9, 0);
    planetGroup.add(planet);

    const RS = 1.028, lim = Math.sqrt(1 - 1 / (RS * RS));
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * RS, 128, 96), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN }, uLim: { value: lim } },
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vW;
        void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; uniform float uLim; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
          float t = clamp(-dot(N,V)/uLim, 0., 1.);
          float g = t*t*t;
          float ndl = dot(N, uSun);
          vec3 c = mix(vec3(1.,.42,.16), vec3(.22,.52,1.), smoothstep(-.12,.36,ndl));
          float s = smoothstep(-.42,.22,ndl);
          gl_FragColor = vec4(c*g*s*1.5 + vec3(.02,.05,.1)*g*.4, 1.); }`,
    }));
    atmo.position.copy(PLANET_C);
    planetGroup.add(atmo); noAO.push(atmo);

    const glow = TX.makeGlow();
    const s1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(34, 30, 24), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s1.position.copy(SUN).multiplyScalar(3500); s1.scale.setScalar(520);
    const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.makeGlow(256, [[0, .5], [.2, .14], [.6, .03], [1, 0]]), color: new THREE.Color(3, 3.6, 5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s2.position.copy(s1.position); s2.scale.set(1500, 46, 1);
    space.add(s1, s2); noAO.push(s1, s2);
  }

  // ───────────────────────── 舱体结构
  await progress(0.34, '装配舱体结构 / HULL ASSEMBLY');
  const room = new THREE.Group(); scene.add(room);

  // 可反射甲板
  const mirrorRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const reflMatrix = new THREE.Matrix4();
  const uRefl = { value: 1.0 };
  const floorMat = new THREE.MeshStandardMaterial({ map: floorSet.map, normalMap: floorSet.normalMap, roughnessMap: floorSet.roughnessMap, roughness: 1, metalness: .3, envMapIntensity: .25, normalScale: new THREE.Vector2(.7, .7) });
  floorMat.onBeforeCompile = sh => {
    sh.uniforms.tRefl = { value: mirrorRT.texture };
    sh.uniforms.uReflMatrix = { value: reflMatrix };
    sh.uniforms.uReflStrength = uRefl;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflCoord = uReflMatrix * modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl;\nuniform float uReflStrength;\nvarying vec4 vReflCoord;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec2 ruv = vReflCoord.xy / vReflCoord.w;
          ruv += (normal - nonPerturbedNormal).xy * 0.05;
          float rl = roughnessFactor;
          float lod = rl * 6.0;
          vec2 px = exp2(lod) / vec2(textureSize(tRefl, 0));
          vec3 rc = (textureLod(tRefl, ruv + px*vec2(.6,.2), lod).rgb + textureLod(tRefl, ruv + px*vec2(-.2,.6), lod).rgb
                   + textureLod(tRefl, ruv + px*vec2(-.6,-.2), lod).rgb + textureLod(tRefl, ruv + px*vec2(.2,-.6), lod).rgb) * .25;
          float nv = saturate(dot(normal, geometryViewDir));
          float fr = 0.07 + 0.93 * pow(1.0 - nv, 4.0);
          reflectedLight.indirectSpecular += min(rc, vec3(24.0)) * fr * uReflStrength * (1.0 - rl * 0.7);
        }`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.keep = true;
  room.add(floor);

  // 外壳（同时负责遮挡阳光）
  box(room, 19, .4, 17, M.dark, 0, 5.8, 0);
  box(room, .5, 6.4, 17, M.dark, 9.25, 2.8, 0);
  box(room, .5, 6.4, 17, M.dark, -9.25, 2.8, 0);
  box(room, 19, 6.4, .5, M.dark, 0, 2.8, 8.25);
  box(room, 19, .9, .6, M.dark, 0, .25, -8.3);
  box(room, 19, 1.2, .6, M.dark, 0, 5.6, -8.3);
  box(room, 1.75, 4.3, .6, M.dark, -8.375, 2.85, -8.3);
  box(room, 1.75, 4.3, .6, M.dark, 8.375, 2.85, -8.3);
  // 舷窗竖梃
  for (const [x, tilt] of [[-5.2, .1], [-2.5, .045], [2.5, -.045], [5.2, -.1]]) {
    box(room, .26, 4.6, .5, M.black, x, 2.85, -8.25, { rot: [0, 0, tilt] });
    box(room, .05, 4.4, .04, M.eCoolDim, x + .0, 2.85, -7.99, { rot: [0, 0, tilt], cast: false });
  }
  box(room, 15, .09, .4, M.black, 0, 4.28, -8.25);
  const glass = plane(room, 15, 4.3, M.glass, 0, 2.85, -8.48);
  glass.receiveShadow = false; noAO.push(glass);

  // 窗台控制台
  box(room, 15.2, .86, 1.0, M.dark, 0, .43, -7.5, { tile: 1.5 });
  box(room, 15.2, .06, .95, M.black, 0, .93, -7.42, { rot: [.3, 0, 0] });
  box(room, 15.2, .03, .03, M.eWarm, 0, .8, -6.985, { cast: false });
  for (let i = 0; i < 6; i++) {
    const x = -6.25 + i * 2.5;
    plane(room, 2.2, .5, screenMat(TX.makeStripScreen(i + 1), 1.3), x, .975, -7.42, [-Math.PI / 2 + .3, 0, 0]);
  }

  // 侧壁
  const panelTex = [0, 1, 2, 3].map(v => TX.makeWallPanel(v));
  const wallScreens = [TX.makeScreen('nav', 1), TX.makeScreen('sys', 2), TX.makeScreen('wave', 3), TX.makeScreen('map', 4)];
  const ledGeo = new THREE.BoxGeometry(.035, .035, .035);
  for (const sx of [-1, 1]) {
    box(room, .3, .56, 16, M.dark, sx * 8.85, .28, 0, { tile: 1.5 });
    box(room, .03, .035, 15.7, M.eWarm, sx * 8.69, .6, 0, { cast: false });
    box(room, .4, .32, 16, M.dark, sx * 8.8, 3.86, 0, { tile: 1.5 });
    box(room, .03, .03, 15.7, M.eCool, sx * 8.6, 3.69, 0, { cast: false });
    // 斜顶
    box(room, 2.5, .12, 16, M.white, sx * 8.1, 4.75, 0, { rot: [0, 0, -sx * 43.4 * D2R], tile: 2.5 });
    for (const z of [-4, 0, 4]) box(room, 2.56, .26, .42, M.dark, sx * 8.06, 4.71, z, { rot: [0, 0, -sx * 43.4 * D2R] });
    // 管线
    for (let i = 0; i < 3; i++) cyl(room, .045, .045, 16, i === 1 ? M.orange : M.chrome, sx * (8.5 - i * .1), 4.12 + i * .13, 0, 12, { rot: [Math.PI / 2, 0, 0] });
    // 立柱
    for (const z of [-7.75, -4, 0, 4, 7.75]) {
      box(room, .46, 3.72, .52, M.dark, sx * 8.77, 1.86, z, { tile: 1.2 });
      box(room, .02, 2.5, .07, M.eCoolDim, sx * 8.535, 2.1, z, { cast: false });
      box(room, .5, .12, .56, M.orange, sx * 8.77, .62, z);
    }
    // 舱位
    const bays = [-5.875, -2, 2, 5.875];
    bays.forEach((z, bi) => {
      const len = bi === 0 || bi === 3 ? 3.2 : 3.44;
      const variant = sx > 0 ? [3, 1, 0, 2][bi] : [3, 0, 2, 1][bi];
      const pm = new THREE.MeshStandardMaterial({ map: panelTex[variant], roughness: .62, metalness: .04 });
      plane(room, len, 3.06, pm, sx * 8.86, 2.16, z, [0, -sx * Math.PI / 2, 0]).castShadow = false;
      box(room, .1, 3.06, len, M.white, sx * 8.92, 2.16, z, { cast: false });
      if (bi === 0) {
        // 设备机柜 + 指示灯阵列
        box(room, .34, 2.5, 2.7, M.black, sx * 8.7, 1.95, z);
        for (let k = 0; k < 6; k++) box(room, .03, .02, 2.5, M.chrome, sx * 8.52, .95 + k * .4, z, { cast: false });
        const rnd = TX.rng(sx > 0 ? 5 : 9), n = 15 * 6;
        const led = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial(), n);
        const mtx = new THREE.Matrix4(), cc = new THREE.Color();
        let q = 0;
        for (let r = 0; r < 6; r++) for (let c2 = 0; c2 < 15; c2++) {
          mtx.setPosition(sx * 8.52, 1.12 + r * .4, z - 1.12 + c2 * .16);
          led.setMatrixAt(q, mtx);
          const t = rnd();
          if (t < .12) cc.setRGB(6, 1.6, .4); else if (t < .55) cc.setRGB(.9, 3.2, 4); else if (t < .75) cc.setRGB(3, 3.2, 3.4); else cc.setRGB(.05, .06, .07);
          led.setColorAt(q++, cc);
        }
        led.instanceColor.needsUpdate = true;
        room.add(led);
      } else if (bi === 1) {
        // 大型壁挂显示屏 + 搁板
        box(room, .09, 1.78, 3.1, M.black, sx * 8.8, 2.3, z);
        plane(room, 2.94, 1.62, screenMat(wallScreens[sx > 0 ? 0 : 2], 1.6), sx * 8.75, 2.3, z, [0, -sx * Math.PI / 2, 0]).receiveShadow = false;
        box(room, .55, .07, 3.1, M.black, sx * 8.6, 1.05, z);
        box(room, .5, .03, 2.9, M.dark, sx * 8.56, 1.12, z, { rot: [0, 0, sx * .22] });
        plane(room, 2.6, .36, screenMat(TX.makeStripScreen(sx > 0 ? 11 : 12), 1.2), sx * 8.555, 1.142, z).rotation.set(-Math.PI / 2, sx * Math.PI / 2, sx * .22, 'ZYX');
        box(room, .08, .5, .08, M.dark, sx * 8.7, .8, z - 1.3); box(room, .08, .5, .08, M.dark, sx * 8.7, .8, z + 1.3);
      } else if (bi === 2) {
        box(room, .08, 1.0, 1.5, M.black, sx * 8.8, 1.6, z + .8);
        plane(room, 1.4, .9, screenMat(wallScreens[sx > 0 ? 1 : 3], 1.5), sx * 8.755, 1.6, z + .8, [0, -sx * Math.PI / 2, 0]).receiveShadow = false;
      }
    });
  }

  // 顶棚
  await progress(0.46, '布设照明 / LIGHTING GRID');
  for (const z of [-6, -3, 0, 3, 6]) box(room, 14.6, .32, .36, M.dark, 0, 5.44, z, { tile: 1.5 });
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    box(room, 6.2, .05, 2.4, M.white, 0, 5.57, z, { tile: 2.4, cast: false });
    for (const sx of [-1, 1]) box(room, 2.6, .05, 2.4, M.dark, sx * 5.6, 5.57, z, { cast: false, tile: 1.3 });
  }
  for (const x of [-3.6, 3.6]) {
    box(room, .34, .12, 15, M.black, x, 5.28, 0, { cast: false });
    box(room, .2, .02, 14.6, M.eCool, x, 5.212, 0, { cast: false });
    for (const z of [-6, -3, 0, 3, 6]) box(room, .06, .2, .06, M.chrome, x, 5.42, z, { cast: false });
  }
  // 中央环形灯
  {
    const g = new THREE.Group(); g.position.set(0, 4.7, 0); room.add(g);
    const t1 = new THREE.Mesh(new THREE.TorusGeometry(2.4, .11, 12, 128), M.black); t1.rotation.x = Math.PI / 2; g.add(t1);
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(2.4, .035, 8, 128), M.eCool); t2.rotation.x = Math.PI / 2; t2.position.y = -.095; g.add(t2);
    const t3 = new THREE.Mesh(new THREE.TorusGeometry(1.15, .08, 12, 96), M.black); t3.rotation.x = Math.PI / 2; t3.position.y = .25; g.add(t3);
    const t4 = new THREE.Mesh(new THREE.TorusGeometry(1.15, .025, 8, 96), M.eCyan); t4.rotation.x = Math.PI / 2; t4.position.y = .17; g.add(t4);
    cyl(g, .5, .62, .22, M.black, 0, .5, 0, 48, { cast: false });
    cyl(g, .3, .3, .03, M.eCyan, 0, .385, 0, 32, { cast: false });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      cyl(g, .022, .022, .95, M.chrome, Math.cos(a) * 2.4, .47, Math.sin(a) * 2.4, 8, { cast: false });
      const sp = box(g, 1.3, .05, .07, M.black, Math.cos(a) * 1.78, .25, Math.sin(a) * 1.78, { rot: [0, -a, 0], cast: false });
      sp.receiveShadow = false;
    }
  }

  // 后墙与舱门
  box(room, 3.3, 3.5, .22, M.black, 0, 1.75, 7.92);
  for (const sx of [-1, 1]) {
    box(room, 1.36, 3.1, .1, M.white, sx * .7, 1.6, 7.8, { tile: 1.6 });
    box(room, 1.36, .12, .11, M.orange, sx * .7, 1.1, 7.795);
    box(room, .03, 3.1, .03, M.eCool, sx * 1.52, 1.6, 7.79, { cast: false });
    box(room, 5.3, 3.06, .1, M.white, sx * 4.6, 2.16, 7.93, { tile: 2.6 });
    box(room, 5.3, .56, .3, M.dark, sx * 4.6, .28, 7.85);
  }
  const signTex = TX.makeDoorSign();
  plane(room, 2.6, .65, new THREE.MeshStandardMaterial({ map: signTex, roughness: .5, metalness: .2, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: .25 }), 0, 3.95, 7.9, [0, Math.PI, 0]);
  box(room, 16, .32, .4, M.dark, 0, 3.86, 7.8);

  // ───────────────────────── 中央平台与全息台
  await progress(0.56, '校准全息投影 / HOLO CALIBRATION');
  cyl(room, 2.92, 3.06, .16, M.dark, 0, .08, 0, 128);
  {
    const top = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.9, 128, 1), new THREE.MeshStandardMaterial({ color: 0x191b1f, roughness: .34, metalness: .55 }));
    top.rotation.x = -Math.PI / 2; top.position.y = .162; top.receiveShadow = true; room.add(top);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(2.86, .018, 8, 160), M.eCool); r1.rotation.x = Math.PI / 2; r1.position.y = .165; room.add(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(3.07, .014, 8, 160), M.eWarm); r2.rotation.x = Math.PI / 2; r2.position.y = .02; room.add(r2);
  }
  cyl(room, .95, 1.2, .5, M.dark, 0, .41, 0, 64);
  cyl(room, .7, .78, .28, M.black, 0, .8, 0, 64);
  cyl(room, 1.36, 1.1, .16, M.black, 0, 1.0, 0, 96);
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.36, .02, 8, 128), M.eWarm); rim.rotation.x = Math.PI / 2; rim.position.y = 1.08; room.add(rim);
    const discTex = TX.makeHoloDisc();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 96), new THREE.MeshStandardMaterial({ color: 0x030405, roughness: .12, metalness: .4, emissive: 0xffffff, emissiveMap: discTex, emissiveIntensity: 1.6 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 1.082; disc.userData.keep = true; room.add(disc);
    tickers.push((dt) => { disc.rotation.z += dt * .05; });
    // 台缘小屏
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + .2;
      box(room, .34, .02, .12, i % 3 === 0 ? M.eWarm : M.eCyan, Math.cos(a) * 1.14, .935, Math.sin(a) * 1.14, { rot: [0, -a + Math.PI / 2, 0], cast: false });
    }
  }
  // 弧形护栏
  for (const sx of [-1, 1]) {
    const a0 = sx > 0 ? -38 * D2R : 142 * D2R, arc = 76 * D2R;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(2.7, .028, 8, 48, arc), M.chrome);
    rail.rotation.set(Math.PI / 2, 0, a0); rail.position.y = 1.12; rail.castShadow = true; room.add(rail);
    const rail2 = rail.clone(); rail2.material = M.black; rail2.position.y = .3; room.add(rail2);
    for (let i = 0; i <= 4; i++) {
      const a = a0 + arc * i / 4;
      cyl(room, .025, .025, .98, M.black, Math.cos(a) * 2.7, .65, Math.sin(a) * 2.7, 8);
    }
    const gp = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, .68, 48, 1, true, Math.PI / 2 - a0 - arc, arc), M.glassPanel);
    gp.position.y = .7; room.add(gp); noAO.push(gp);
  }

  // 全息投影
  const holo = new THREE.Group(); holo.position.set(0, 2.2, 0); scene.add(holo); noAO.push(holo);
  const uHoloGain = { value: .75 };
  {
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.62, 96, 64), new THREE.ShaderMaterial({
      uniforms: { uTime, uGain: uHoloGain, tH: { value: heightTex } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vO; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main(){ vUv = uv; vO = normalize(position); vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform float uGain; uniform sampler2D tH; varying vec3 vO; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
          float h = texture2D(tH, vUv).r*.6+.2;
          float land = smoothstep(.555,.585,h);
          float coast = smoothstep(.018,.0,abs(h-.57));
          vec2 g = abs(fract(vUv*vec2(36.,18.))-.5);
          float grid = smoothstep(.465,.5,max(g.x,g.y));
          vec2 dd = fract(vUv*vec2(220.,110.))-.5;
          float dots = smoothstep(.36,.18,length(dd))*land;
          float fr = pow(clamp(1.-abs(dot(N,V)), 0., 1.), 2.4);
          float scan = smoothstep(.05,0.,abs(fract(vO.y*.5+.5-uTime*.06)-.5));
          float a = grid*.16 + dots*.6 + coast*.9 + fr*1.1 + scan*.55 + .025;
          if(!gl_FrontFacing) a *= .2;
          vec3 c = mix(vec3(.30,.88,1.), vec3(1.), coast*.6+scan*.4);
          gl_FragColor = vec4(c*a*uGain, 1.); }`,
    }));
    globe.rotation.set(.4, 1.9, .2);
    holo.add(globe);
    tickers.push((dt) => { globe.rotation.y += dt * .12; });

    const add = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cyan = new THREE.Color(.35, 1.2, 1.5), orange = new THREE.Color(2.4, .8, .2), white = new THREE.Color(1.4, 1.5, 1.6);
    const rings = new THREE.Group(); rings.rotation.set(.32, 0, .18); holo.add(rings);
    const rA = new THREE.Mesh(new THREE.RingGeometry(.80, .806, 160), add(cyan)); rA.rotation.x = Math.PI / 2; rings.add(rA);
    const rB = new THREE.Mesh(new THREE.RingGeometry(.93, .934, 160, 1, 0, Math.PI * 1.5), add(white, .8)); rB.rotation.x = Math.PI / 2; rings.add(rB);
    const rC = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.05, 160, 1, .4, .9), add(orange, .9)); rC.rotation.x = Math.PI / 2; rings.add(rC);
    // 刻度环
    const tickG = new THREE.Group(); rings.add(tickG);
    const tg = new THREE.PlaneGeometry(.004, .04);
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2, m = new THREE.Mesh(tg, add(cyan, i % 6 === 0 ? 1 : .5));
      m.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1); m.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2); m.scale.y = i % 6 === 0 ? 1.8 : 1;
      tickG.add(m);
    }
    // 轨道与舰船标记
    const orbit = new THREE.Group(); orbit.rotation.set(-.5, 0, -.35); holo.add(orbit);
    const oR = new THREE.Mesh(new THREE.RingGeometry(.74, .744, 128), add(orange, .8)); oR.rotation.x = Math.PI / 2; orbit.add(oR);
    const ship = new THREE.Mesh(new THREE.OctahedronGeometry(.028), add(new THREE.Color(5, 1.8, .5))); orbit.add(ship);
    const trail = new THREE.Mesh(new THREE.RingGeometry(.732, .752, 64, 1, 0, .7), add(orange, .9)); trail.rotation.x = Math.PI / 2; orbit.add(trail);
    tickers.push((dt, t) => {
      rB.rotation.z += dt * .25; rC.rotation.z -= dt * .4; tickG.rotation.y += dt * .04;
      const a = t * .35; ship.position.set(Math.cos(a) * .742, 0, -Math.sin(a) * .742); ship.rotation.y = t;
      trail.rotation.z = a - .7;
      uHoloGain.value = .75 + Math.sin(t * 37) * .015 + (Math.sin(t * 1.3) > .985 ? -.2 : 0);
    });
    // 投影光锥
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.22, 2.3, 96, 1, true), new THREE.ShaderMaterial({
      uniforms: { uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x*127.1)*43758.5453); }
        void main(){ float s = h(floor(vUv.x*240.)); float a = pow(clamp(1.-vUv.y, 0., 1.), 2.6) * (.25 + .75*step(.62,s)*(.6+.4*sin(uTime*2.+s*40.)));
          gl_FragColor = vec4(vec3(.25,.8,1.)*a*.2, 1.); }`,
    }));
    cone.position.y = -1.1 + 1.15; holo.add(cone);
    // 浮窗
    const cardGeo = new THREE.PlaneGeometry(.96, .54);
    const cards = [0, 1].map(k => {
      const m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: TX.makeHoloCard(k), color: new THREE.Color(1.05, 1.12, 1.2), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(k ? 1.42 : -1.48, k ? .5 : .12, k ? -.25 : .3);
      holo.add(m); return m;
    });
    tickers.push((dt, t) => {
      cards.forEach((m, k) => { m.lookAt(camera.position.x, m.getWorldPosition(_v).y, camera.position.z); m.position.y += Math.sin(t * .8 + k * 2) * .0004; });
    });
  }

  // 作业工位
  await progress(0.66, '安装作业终端 / WORKSTATIONS');
  function station(x, seed) {
    const g = new THREE.Group(); g.position.set(x, 0, -6.2); room.add(g);
    box(g, 2.7, .07, .8, M.black, 0, .86, -.1);
    box(g, .1, .84, .62, M.dark, -1.2, .42, -.1, { tile: 1 }); box(g, .1, .84, .62, M.dark, 1.2, .42, -.1, { tile: 1 });
    box(g, 2.7, .025, .025, M.eWarm, 0, .83, .3, { cast: false });
    for (const i of [-1, 0, 1]) {
      const mon = new THREE.Group(); mon.position.set(i * .84, 1.36, -.36 + Math.abs(i) * .13); mon.rotation.y = -i * .34; g.add(mon);
      box(mon, .8, .5, .035, M.black, 0, 0, 0);
      const s = plane(mon, .74, .44, screenMat(TX.makeMiniScreen(seed + i + 1), 1.5), 0, 0, .02); s.receiveShadow = false;
      box(mon, .05, .3, .05, M.chrome, 0, -.38, -.03);
    }
    plane(g, 1.1, .3, screenMat(TX.makeStripScreen(seed + 20), 1.1), 0, .9, .05, [-Math.PI / 2, 0, 0]).receiveShadow = false;
    // 座椅
    const c = new THREE.Group(); c.position.set(0, 0, .95); c.rotation.y = seed * .13 - .2; g.add(c);
    cyl(c, .34, .38, .04, M.black, 0, .02, 0, 32); cyl(c, .05, .06, .42, M.chrome, 0, .25, 0, 12);
    box(c, .56, .11, .54, M.rubber, 0, .5, 0);
    box(c, .54, .82, .1, M.rubber, 0, .98, .28, { rot: [.13, 0, 0] });
    box(c, .5, .5, .03, M.black, 0, .98, .345, { rot: [.13, 0, 0] });
    box(c, .5, .05, .032, M.orange, 0, 1.3, .39, { rot: [.13, 0, 0] });
    box(c, .32, .18, .09, M.rubber, 0, 1.5, .34, { rot: [.13, 0, 0] });
    for (const sx of [-1, 1]) { box(c, .06, .05, .42, M.black, sx * .31, .72, .02); box(c, .04, .2, .04, M.chrome, sx * .31, .61, .16); }
  }
  station(-3.5, 1); station(3.5, 4);

  // 合并静态网格：按材质分组，把几百个 draw call 压到几十个
  {
    room.updateMatrixWorld(true);
    const groups = new Map();
    room.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.keep || noAO.includes(o)) return;
      const k = o.material.uuid + (o.castShadow ? 'c' : '-') + (o.receiveShadow ? 'r' : '-');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    });
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map(o => {
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
        return g;
      });
      const mg = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!mg) continue;
      const m = new THREE.Mesh(mg, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
      for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
      room.add(m);
    }
  }

  // ───────────────────────── 光照
  const sun = new THREE.DirectionalLight(0xfff0dc, 7.5);
  sun.position.copy(SUN).multiplyScalar(40).add(new THREE.Vector3(0, 2, 0));
  sun.target.position.set(0, 2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 9, bottom: -9, near: 10, far: 70 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02; sun.shadow.radius = 2.2; sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);

  const shine = new THREE.DirectionalLight(0x5f9dff, .5);
  shine.position.set(-6, -10, -30); scene.add(shine);
  const hemi = new THREE.HemisphereLight(0x9fb4d4, 0x241c16, .3); scene.add(hemi);

  const rectLights = [];
  for (const x of [-3.6, 3.6]) {
    const ra = new THREE.RectAreaLight(0xd8e8ff, 13, .3, 14.6);
    ra.position.set(x, 5.2, 0); ra.rotation.x = -Math.PI / 2; scene.add(ra); rectLights.push(ra);
  }
  const spot = new THREE.SpotLight(0xcfe4ff, 150, 14, .95, .85, 1.6);
  spot.position.set(0, 4.55, 0); spot.target.position.set(0, 0, 0);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.radius = 5; spot.shadow.blurSamples = 12; spot.shadow.camera.near = .5; spot.shadow.camera.far = 8;
  scene.add(spot, spot.target);
  const holoLight = new THREE.PointLight(0x62e6ff, 7, 9, 2); holoLight.position.set(0, 2.2, 0); scene.add(holoLight);

  // ───────────────────────── 体积光与浮尘
  await progress(0.74, '注入大气 / ATMOSPHERICS');
  const fx = new THREE.Group(); scene.add(fx); noAO.push(fx);
  const uShaft = { value: 1 };
  {
    const L = SUN.clone().negate(), T = 13, yb = .72, yt = 4.95, zw = -8.0;
    const bays = [[-7.4, -5.4], [-5.0, -2.7], [-2.3, 2.3], [2.7, 5.0], [5.4, 7.4]];
    const P = [], U = [], S = [];
    let seed = 0;
    for (const [x0, x1] of bays) {
      const n = Math.max(2, Math.round((x1 - x0) / 1.15));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n; seed += 1.37;
        const A = [x, yb, zw], B = [x, yt, zw];
        const C = [x + L.x * T, yt + L.y * T, zw + L.z * T];
        const tb = yb / -L.y;
        const Dp = [x + L.x * tb, .01, zw + L.z * tb];
        const E = [C[0], .01, C[2]];
        const vE = (0 - (yb + L.y * T)) / (yt - yb);
        const tri = [[A, 0, 0], [B, 0, 1], [C, 1, 1], [A, 0, 0], [C, 1, 1], [E, 1, vE], [A, 0, 0], [E, 1, vE], [Dp, tb / T, 0]];
        for (const [p, u, v] of tri) { P.push(...p); U.push(u, v); S.push(seed); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(S, 1));
    const shafts = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uTime, uI: uShaft }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aSeed; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime; uniform float uI; varying vec2 vUv; varying float vS;
        void main(){
          float a = (1.-smoothstep(.0,1.,vUv.x)) * smoothstep(0.,.05,vUv.x);
          a *= smoothstep(0.,.12,vUv.y) * smoothstep(1.,.8,vUv.y);
          float n = .62 + .22*sin(vUv.y*31. + vS*5.) + .16*sin(vUv.y*77. - vS*3. + uTime*.12) + .12*sin(vUv.x*9. - uTime*.2 + vS);
          gl_FragColor = vec4(vec3(1.,.93,.82) * a * n * .017 * uI, 1.); }`,
    }));
    shafts.frustumCulled = false;
    fx.add(shafts);

    const N = 1100, rand = TX.rng(4), pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(rand() * 2 - 1) * 8.4, .2 + rand() * 5, -7.6 + rand() * 15], i * 3); ph[i] = rand() * 100; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: { uTime, uSun: { value: SUN }, uPR: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aPh; uniform float uTime; uniform vec3 uSun; uniform float uPR; varying float vB;
        void main(){ vec3 p = position;
          p.x += sin(uTime*.07+aPh)*.5; p.z += cos(uTime*.05+aPh*1.7)*.5; p.y = .15 + mod(p.y + uTime*.012*(1.+fract(aPh)), 5.2);
          float s = (p.z+8.)/(-uSun.z); vec3 hp = p + uSun*s;
          float lit = step(abs(hp.x),7.4)*step(.72,hp.y)*step(hp.y,4.95);
          vec4 mv = modelViewMatrix*vec4(p,1.);
          vB = (.05 + lit*.95) * smoothstep(.4,2.5,-mv.z) * (.5+.5*fract(aPh*7.3));
          gl_PointSize = uPR * (1.2+fract(aPh*3.1)*1.6) * 5. / max(-mv.z,.6);
          gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vB; void main(){ float d = length(gl_PointCoord-.5); gl_FragColor = vec4(vec3(1.,.95,.86)*smoothstep(.5,.1,d)*vB*.9, 1.); }`,
    }));
    dust.frustumCulled = false;
    fx.add(dust);
    tickers.push(() => { dust.material.uniforms.uPR.value = renderer.getPixelRatio() * (innerHeight / 900); });
  }

  // ───────────────────────── 环境反射（一次性捕获）
  await progress(0.82, '烘焙环境反射 / REFLECTION PROBE');
  renderer.shadowMap.needsUpdate = true;
  {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(.1, 5000, cubeRT);
    cubeCam.position.set(0, 2.6, 1.5);
    fx.visible = false; holo.visible = false;
    cubeCam.update(renderer, scene);
    fx.visible = true; holo.visible = true;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromCubemap(cubeRT.texture).texture;
    scene.environmentIntensity = .85;
    pm.dispose(); cubeRT.dispose();
  }

  // ───────────────────────── 后期
  await progress(0.9, '启动渲染管线 / POST PIPELINE');
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.blendIntensity = .9;
  gtao.updateGtaoMaterial({ radius: .55, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  let aoScale = .5, bloomScale = 1;
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSetSize(Math.max(2, Math.round(w * aoScale)), Math.max(2, Math.round(h * aoScale)));
  const ov = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () { ov(); for (const o of noAO) o.visible = false; };
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), .3, .6, 1.0);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w * bloomScale)), Math.max(2, Math.round(h * bloomScale)));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime, uAspect: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){ vec2 c = vUv-.5; float r2 = dot(c,c);
        vec2 o = c*r2*.0045;
        vec3 col = vec3(texture2D(tDiffuse, vUv+o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-o).b);
        col *= mix(1., .58, smoothstep(.12,.62,r2));
        float l = dot(col, vec3(.2126,.7152,.0722));
        col = mix(col, col*vec3(.94,1.,1.07), (1.-smoothstep(0.,.45,l))*.6);
        col = mix(col, col*vec3(1.04,1.,.95), smoothstep(.5,1.,l)*.5);
        col += (h(vUv*vec2(1387.,911.)+fract(uTime)*17.)-.5)*.022;
        gl_FragColor = vec4(col, 1.); }`,
  });
  composer.addPass(finish);

  // ───────────────────────── 镜头
  const vcam = new THREE.PerspectiveCamera();
  const rig = {
    cur: { pos: new THREE.Vector3(0, 4.3, 7.6), tgt: new THREE.Vector3(0, 3.4, -8), fov: 60 },
    from: null, to: null, k: 1, dur: 1.8, view: -1,
    mouse: new THREE.Vector2(), sm: new THREE.Vector2(),
  };
  const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function setView(i, dur = 1.9) {
    if (i === rig.view) return;
    rig.view = i;
    rig.from = { pos: rig.cur.pos.clone(), tgt: rig.cur.tgt.clone(), fov: rig.cur.fov };
    rig.to = { pos: new THREE.Vector3(...VIEWS[i].pos), tgt: new THREE.Vector3(...VIEWS[i].tgt), fov: VIEWS[i].fov };
    rig.k = 0; rig.dur = dur;
  }
  let W = 4, H = 4;
  function updateRig(dt, t) {
    if (rig.k < 1) {
      rig.k = Math.min(1, rig.k + dt / rig.dur);
      const e = ease(rig.k);
      rig.cur.pos.lerpVectors(rig.from.pos, rig.to.pos, e);
      rig.cur.pos.y += Math.sin(e * Math.PI) * .22;
      rig.cur.tgt.lerpVectors(rig.from.tgt, rig.to.tgt, e);
      rig.cur.fov = rig.from.fov + (rig.to.fov - rig.from.fov) * e;
    }
    rig.sm.lerp(rig.mouse, 1 - Math.exp(-dt * 2.6));
    _f.subVectors(rig.cur.tgt, rig.cur.pos);
    const dist = _f.length(); _f.normalize();
    _r.crossVectors(_f, _u.set(0, 1, 0)).normalize();
    _u.crossVectors(_r, _f);
    const dx = rig.sm.x + Math.sin(t * .17) * .06, dy = rig.sm.y + Math.sin(t * .23 + 1) * .05;
    _p.copy(rig.cur.pos).addScaledVector(_r, dx * .42).addScaledVector(_u, dy * .2);
    _t.copy(rig.cur.tgt).addScaledVector(_r, dx * dist * .1).addScaledVector(_u, dy * dist * .055);
    camera.position.copy(_p); camera.lookAt(_t);
    const aspect = W / H;
    let fov = rig.cur.fov;
    if (aspect < 16 / 9) {
      const hf = 2 * Math.atan(Math.tan(fov * D2R / 2) * 16 / 9);
      fov = Math.min(82, 2 * Math.atan(Math.tan(hf / 2) / aspect) / D2R);
    }
    if (camera.fov !== fov || camera.aspect !== aspect) { camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }
  function updateMirror() {
    camera.getWorldPosition(_p); camera.getWorldDirection(_f);
    _t.copy(_p).add(_f);
    vcam.position.set(_p.x, -_p.y, _p.z);
    vcam.up.set(0, 1, 0).applyQuaternion(camera.quaternion); vcam.up.y *= -1;
    vcam.lookAt(_t.x, -_t.y, _t.z);
    vcam.fov = camera.fov; vcam.aspect = camera.aspect; vcam.near = camera.near; vcam.far = camera.far;
    vcam.updateProjectionMatrix(); vcam.updateMatrixWorld();
    reflMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
  }

  // ───────────────────────── 画质
  const QUALITY = [
    { name: '高', pr: 1.5, msaa: 4, ao: .75, aoN: 12, rect: true, mirror: .5, bloom: 1, skip: 1 },
    { name: '中', pr: 1.0, msaa: 0, ao: .5, aoN: 8, rect: false, mirror: .4, bloom: .5, skip: 1 },
    { name: '低', pr: 1.0, msaa: 0, ao: 0, aoN: 8, rect: false, mirror: .3, bloom: .5, skip: 2 },
  ];
  let q = 0;
  function resize(w = W, h = H) {
    W = Math.max(4, w); H = Math.max(4, h);
    const Q = QUALITY[q], pr = Math.min(window.devicePixelRatio || 1, Q.pr);
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== Q.msaa) { rt.samples = Q.msaa; rt.dispose(); }
    aoScale = Q.ao || .5; bloomScale = Q.bloom;
    gtao.enabled = Q.ao > 0;
    gtao.updateGtaoMaterial({ samples: Q.aoN });
    gtao.updatePdMaterial({ samples: Q.aoN, rings: 2 });
    fxaa.enabled = Q.msaa === 0;
    fxaa.material.uniforms.resolution.value.set(1 / (W * pr), 1 / (H * pr));
    for (const l of rectLights) l.visible = Q.rect;
    hemi.intensity = Q.rect ? .3 : .62;
    scene.environmentIntensity = Q.rect ? .9 : 1.2;
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    composer.setPixelRatio(pr); composer.setSize(W, H);
    mirrorRT.setSize(Math.max(8, Math.round(W * pr * Q.mirror)), Math.max(8, Math.round(H * pr * Q.mirror)));
    finish.uniforms.uAspect.value = W / H;
    frame = 0;
  }
  function setQuality(i) { q = Math.max(0, Math.min(QUALITY.length - 1, i)); resize(); return QUALITY[q].name; }
  // 启动时实测帧耗时，选出能流畅运行的最高档
  function autoQuality(budget = 21) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    let t = 0;
    for (let i = 0; i < QUALITY.length; i++) {
      setQuality(i);
      for (let k = 0; k < 3; k++) render(.016, t += .016);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let k = 0; k < 5; k++) render(.016, t += .016);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ms = (performance.now() - t0) / 5;
      if (ms <= budget || i === QUALITY.length - 1) return { index: i, name: QUALITY[i].name, ms };
    }
  }

  // ───────────────────────── 世界锚点（供界面标注）
  const anchors = [
    { id: 'planet', pos: new THREE.Vector3(-150, -8, -600), views: [0, 2] },
    { id: 'holo', pos: new THREE.Vector3(0, 3.02, 0), views: [0, 1] },
    { id: 'helm', pos: new THREE.Vector3(3.5, 1.72, -6.5), views: [0, 2] },
    { id: 'wall', pos: new THREE.Vector3(8.7, 3.2, -2), views: [3] },
    { id: 'rack', pos: new THREE.Vector3(8.5, 2.6, -5.6), views: [3] },
  ];
  function project(out) {
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i]; _v.copy(a.pos).project(camera);
      const o = out[i] || (out[i] = {});
      o.id = a.id;
      o.x = (_v.x * .5 + .5) * W; o.y = (-_v.y * .5 + .5) * H;
      o.on = _v.z < 1 && Math.abs(_v.x) < .92 && Math.abs(_v.y) < .86 && a.views.includes(rig.view) && rig.k > .75;
    }
    return out;
  }

  let frame = 0;
  function render(dt, t) {
    uTime.value = t;
    updateRig(dt, t);
    // 贴近舷窗时减弱体积光，避免给星空蒙上一层灰
    uShaft.value = .22 + .78 * THREE.MathUtils.smoothstep(camera.position.z, -4, 3.5);
    for (const f of tickers) f(dt, t);
    if (frame < 4) renderer.shadowMap.needsUpdate = true;
    // 甲板镜面反射（低画质隔帧更新）
    if (frame % QUALITY[q].skip === 0) {
      updateMirror();
      floor.visible = false; planetGroup.visible = false;
      renderer.setRenderTarget(mirrorRT); renderer.clear();
      renderer.render(scene, vcam);
      renderer.setRenderTarget(null);
      floor.visible = true; planetGroup.visible = true;
    }
    frame++;
    composer.render(dt);
  }

  await progress(0.97, '编译着色器 / SHADER COMPILE');
  resize(innerWidth, innerHeight);
  updateRig(0, 0);
  render(0, 0);

  return {
    render, resize, setView, setQuality, autoQuality, project,
    pointer(x, y) { rig.mouse.set(x, y); },
    get view() { return rig.view; },
    get quality() { return QUALITY[q].name; },
    renderer,
    dbg: { scene, camera, composer, gtao, bloom, finish, fxaa, fx, holo, space, room, rig, M, QUALITY, sun, spot, holoLight, shine, hemi },
  };
}
