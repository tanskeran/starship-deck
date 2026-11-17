// 程序化贴图：全部用 Canvas 2D 现场绘制，不依赖任何外部图片资源
import * as THREE from 'three';

const FD = '"Bahnschrift","DIN Alternate","Arial Narrow",sans-serif';
const FC = '"HarmonyOS Sans SC","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif';
const FM = '"Cascadia Mono","Consolas",monospace';

export function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// 高度图 → 法线图（OpenGL 约定，绿色朝上）
export function normalFromHeight(hc, strength = 2, wrap = true) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mk(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; }
    else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function grain(ctx, w, h, amt, rand) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ───────────────────────── 舰体金属板（可平铺）
export function makeHullSet(seed = 1, base = [52, 56, 62], roughBase = 135) {
  const S = 512, rand = rng(seed);
  const a = mk(S, S), hgt = mk(S, S), r = mk(S, S);
  const ca = a.getContext('2d'), ch = hgt.getContext('2d'), cr = r.getContext('2d');
  ca.fillStyle = `rgb(${base})`; ca.fillRect(0, 0, S, S);
  ch.fillStyle = '#808080'; ch.fillRect(0, 0, S, S);
  cr.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`; cr.fillRect(0, 0, S, S);
  const rects = [[0, 0, .5, .5], [.5, 0, .5, .25], [.5, .25, .25, .25], [.75, .25, .25, .25], [0, .5, .25, .5], [.25, .5, .75, .5]];
  for (const [x, y, w, h] of rects) {
    const v = (rand() - .5) * 12;
    ca.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
    ca.fillRect(x * S, y * S, w * S, h * S);
    const rv = roughBase + (rand() - .5) * 46;
    cr.fillStyle = `rgb(${rv},${rv},${rv})`;
    cr.fillRect(x * S, y * S, w * S, h * S);
  }
  // 拉丝
  for (let i = 0; i < 900; i++) {
    const y = rand() * S, x = rand() * S, l = 20 + rand() * 120;
    ca.fillStyle = `rgba(${rand() > .5 ? 255 : 0},${rand() > .5 ? 255 : 0},${rand() > .5 ? 255 : 0},${0.012 + rand() * 0.02})`;
    ca.fillRect(x, y, l, 1);
    cr.fillStyle = `rgba(255,255,255,${rand() * 0.05})`;
    cr.fillRect(x, y, l, 1);
  }
  for (const [x, y, w, h] of rects) {
    ca.strokeStyle = 'rgba(0,0,0,.6)'; ca.lineWidth = 2;
    ca.strokeRect(x * S, y * S, w * S, h * S);
    ca.strokeStyle = 'rgba(255,255,255,.05)'; ca.lineWidth = 1;
    ca.strokeRect(x * S + 2.5, y * S + 2.5, w * S - 5, h * S - 5);
    ch.strokeStyle = '#161616'; ch.lineWidth = 5;
    ch.strokeRect(x * S, y * S, w * S, h * S);
    cr.strokeStyle = '#d0d0d0'; cr.lineWidth = 3;
    cr.strokeRect(x * S, y * S, w * S, h * S);
    // 铆钉
    for (const [px, py] of [[x * S + 14, y * S + 14], [(x + w) * S - 14, y * S + 14], [x * S + 14, (y + h) * S - 14], [(x + w) * S - 14, (y + h) * S - 14]]) {
      ch.fillStyle = '#c8c8c8'; ch.beginPath(); ch.arc(px, py, 3.2, 0, 7); ch.fill();
      ca.fillStyle = 'rgba(0,0,0,.35)'; ca.beginPath(); ca.arc(px, py, 3.4, 0, 7); ca.fill();
    }
  }
  grain(ca, S, S, 7, rand);
  grain(cr, S, S, 26, rand);
  return {
    map: tex(a, { repeat: true }),
    normalMap: tex(normalFromHeight(hgt, 2.2), { srgb: false, repeat: true }),
    roughnessMap: tex(r, { srgb: false, repeat: true }),
  };
}

// ───────────────────────── 甲板（整张不平铺，带标线与喷涂）
export function makeFloorSet() {
  const W = 2048, H = 1820, P = W / 18; // 像素/米
  const rand = rng(77);
  const a = mk(W, H), hgt = mk(W, H), r = mk(1024, 910);
  const c = a.getContext('2d'), ch = hgt.getContext('2d'), cr = r.getContext('2d');
  const X = x => (x + 9) * P, Z = z => (z + 8) * P;

  c.fillStyle = '#34383d'; c.fillRect(0, 0, W, H);
  ch.fillStyle = '#909090'; ch.fillRect(0, 0, W, H);
  cr.fillStyle = 'rgb(84,84,84)'; cr.fillRect(0, 0, 1024, 910);

  // 甲板分块（错缝）
  const pw = 3.0, pd = 1.5;
  let row = 0;
  for (let z = -8; z < 8; z += pd, row++) {
    for (let x = -9 - (row % 2) * pw / 2; x < 9; x += pw) {
      const v = (rand() - .5) * 9;
      c.fillStyle = `rgb(${52 + v},${56 + v},${61 + v})`;
      c.fillRect(X(x), Z(z), pw * P, pd * P);
      const rv = 84 + (rand() - .5) * 44;
      cr.fillStyle = `rgb(${rv},${rv},${rv})`;
      cr.fillRect(X(x) / 2, Z(z) / 2, pw * P / 2, pd * P / 2);
      c.strokeStyle = 'rgba(0,0,0,.62)'; c.lineWidth = 2;
      c.strokeRect(X(x), Z(z), pw * P, pd * P);
      ch.strokeStyle = '#1c1c1c'; ch.lineWidth = 4;
      ch.strokeRect(X(x), Z(z), pw * P, pd * P);
      cr.strokeStyle = '#c0c0c0'; cr.lineWidth = 2;
      cr.strokeRect(X(x) / 2, Z(z) / 2, pw * P / 2, pd * P / 2);
      for (const [bx, bz] of [[x + .12, z + .12], [x + pw - .12, z + .12], [x + .12, z + pd - .12], [x + pw - .12, z + pd - .12]]) {
        ch.fillStyle = '#d0d0d0'; ch.beginPath(); ch.arc(X(bx), Z(bz), 3.5, 0, 7); ch.fill();
        c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(X(bx), Z(bz), 3.8, 0, 7); c.fill();
      }
    }
  }

  // 中央环形刻度带
  const cx = X(0), cz = Z(0);
  c.save();
  c.beginPath(); c.arc(cx, cz, 3.75 * P, 0, 7); c.arc(cx, cz, 3.2 * P, 0, 7, true);
  c.fillStyle = '#42474d'; c.fill();
  c.restore();
  for (const rr of [3.2, 3.75]) {
    c.strokeStyle = 'rgba(232,230,224,.55)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cz, rr * P, 0, 7); c.stroke();
    ch.strokeStyle = '#303030'; ch.lineWidth = 4;
    ch.beginPath(); ch.arc(cx, cz, rr * P, 0, 7); ch.stroke();
  }
  for (let d = 0; d < 360; d += 2.5) {
    const ang = d * Math.PI / 180, major = d % 30 === 0, mid = d % 10 === 0;
    const r0 = 3.2, r1 = major ? 3.52 : mid ? 3.38 : 3.29;
    c.strokeStyle = major ? '#ff6a2b' : 'rgba(232,230,224,.6)';
    c.lineWidth = major ? 4 : 1.6;
    c.beginPath();
    c.moveTo(cx + Math.sin(ang) * r0 * P, cz - Math.cos(ang) * r0 * P);
    c.lineTo(cx + Math.sin(ang) * r1 * P, cz - Math.cos(ang) * r1 * P);
    c.stroke();
    if (major) {
      c.save();
      c.translate(cx + Math.sin(ang) * 3.63 * P, cz - Math.cos(ang) * 3.63 * P);
      c.rotate(ang);
      c.fillStyle = 'rgba(232,230,224,.8)';
      c.font = `600 15px ${FD}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(d).padStart(3, '0'), 0, 0);
      c.restore();
    }
  }

  // 通道（舱门 → 中央）
  c.fillStyle = 'rgba(255,255,255,.035)';
  c.fillRect(X(-1.25), Z(3.9), 2.5 * P, 4.1 * P);
  c.strokeStyle = 'rgba(232,230,224,.7)'; c.lineWidth = 3;
  for (const x of [-1.25, 1.25]) { c.beginPath(); c.moveTo(X(x), Z(3.95)); c.lineTo(X(x), Z(8)); c.stroke(); }
  c.strokeStyle = 'rgba(232,230,224,.34)'; c.lineWidth = 5;
  for (let z = 7.0; z > 4.3; z -= 0.55) {
    c.beginPath(); c.moveTo(X(-.42), Z(z)); c.lineTo(X(0), Z(z - .28)); c.lineTo(X(.42), Z(z)); c.stroke();
  }
  // 舱门警示带
  c.save();
  c.beginPath(); c.rect(X(-1.9), Z(7.42), 3.8 * P, .34 * P); c.clip();
  c.fillStyle = '#ff6a2b'; c.fillRect(X(-1.9), Z(7.42), 3.8 * P, .34 * P);
  c.fillStyle = '#14161a';
  for (let x = -2.4; x < 2.4; x += .34) {
    c.beginPath();
    c.moveTo(X(x), Z(7.76)); c.lineTo(X(x + .17), Z(7.76)); c.lineTo(X(x + .51), Z(7.42)); c.lineTo(X(x + .34), Z(7.42));
    c.fill();
  }
  c.restore();

  // 前方作业区橙线
  c.fillStyle = '#ff6a2b';
  c.fillRect(X(-8.4), Z(-4.72), 16.8 * P, 5);
  for (let x = -8.4; x < 8.4; x += .6) c.fillRect(X(x), Z(-4.72) + 9, .3 * P, 3);
  c.fillStyle = 'rgba(232,230,224,.82)';
  c.font = `600 22px ${FD}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText('OPERATIONS ZONE  //  HELM · NAV · SENSOR', X(-8.4), Z(-4.72) - 12);
  c.font = `500 20px ${FC}`;
  c.textAlign = 'right';
  c.fillText('作业区  ·  非值班人员请勿越线', X(8.4), Z(-4.72) - 12);

  // 侧向导引线
  for (const sx of [-1, 1]) {
    c.strokeStyle = 'rgba(232,230,224,.5)'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(X(sx * 7.35), Z(-4.2)); c.lineTo(X(sx * 7.35), Z(7.5)); c.stroke();
    for (let z = -4; z <= 7.5; z += .5) {
      const major = Math.abs(z % 2) < 1e-6;
      c.lineWidth = major ? 2.5 : 1.2;
      c.beginPath(); c.moveTo(X(sx * 7.35), Z(z)); c.lineTo(X(sx * (7.35 - (major ? .28 : .14))), Z(z)); c.stroke();
      if (major) {
        c.fillStyle = 'rgba(232,230,224,.6)'; c.font = `500 14px ${FM}`;
        c.textAlign = sx > 0 ? 'right' : 'left';
        c.fillText(`${sx > 0 ? 'S' : 'P'}-${String(Math.round((z + 4) / 2) + 1).padStart(2, '0')}`, X(sx * 6.98), Z(z) + 5);
      }
    }
  }

  // 大号喷涂
  c.save();
  c.translate(X(-6.4), Z(6.9));
  c.font = `700 250px ${FD}`; c.textAlign = 'left';
  c.strokeStyle = 'rgba(232,230,224,.42)'; c.lineWidth = 3;
  c.strokeText('03', 0, 0);
  c.fillStyle = 'rgba(232,230,224,.72)'; c.font = `600 26px ${FD}`;
  c.fillText('BRIDGE DECK', 300, -150);
  c.font = `500 15px ${FM}`; c.fillStyle = 'rgba(232,230,224,.5)';
  c.fillText('XUANPU-07 / SEC-B / FRAME 112–128', 300, -122);
  c.fillText('MAX LOAD 4.5 kN·m⁻²', 300, -102);
  c.fillStyle = '#ff6a2b'; c.fillRect(300, -84, 110, 9);
  c.restore();

  c.save();
  c.translate(X(3.6), Z(6.6));
  c.fillStyle = 'rgba(232,230,224,.7)'; c.font = `600 44px ${FD}`;
  c.fillText('FARSHORE', 0, 0);
  c.font = `500 22px ${FC}`; c.fillStyle = 'rgba(232,230,224,.5)';
  c.fillText('远岸勘测局 · 深空测绘舰', 0, 34);
  c.strokeStyle = 'rgba(232,230,224,.5)'; c.lineWidth = 2;
  c.strokeRect(-18, -50, 330, 100);
  for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(232,230,224,${.25 + rand() * .45})`; c.fillRect(330 + i * 6, -50, 1 + rand() * 3, 100); }
  c.restore();

  // 十字定位标
  c.strokeStyle = 'rgba(232,230,224,.45)'; c.lineWidth = 1.5;
  for (let x = -6; x <= 6; x += 3) for (let z = -3; z <= 6; z += 3) {
    if (Math.hypot(x, z) < 4.2) continue;
    c.beginPath(); c.moveTo(X(x) - 9, Z(z)); c.lineTo(X(x) + 9, Z(z)); c.moveTo(X(x), Z(z) - 9); c.lineTo(X(x), Z(z) + 9); c.stroke();
  }

  // 磨损
  for (let i = 0; i < 260; i++) {
    const x = rand() * W, y = rand() * H, l = 30 + rand() * 180, ang = (rand() - .5) * .6 + (rand() > .5 ? Math.PI / 2 : 0);
    c.strokeStyle = `rgba(255,255,255,${.012 + rand() * .03})`; c.lineWidth = .6 + rand() * 1.4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); c.stroke();
    cr.strokeStyle = `rgba(255,255,255,${.05 + rand() * .12})`; cr.lineWidth = 1 + rand() * 2;
    cr.beginPath(); cr.moveTo(x / 2, y / 2); cr.lineTo((x + Math.cos(ang) * l) / 2, (y + Math.sin(ang) * l) / 2); cr.stroke();
  }
  for (let i = 0; i < 46; i++) {
    const x = rand() * 1024, y = rand() * 910, rad = 30 + rand() * 120;
    const g = cr.createRadialGradient(x, y, 0, x, y, rad);
    const up = rand() > .45;
    g.addColorStop(0, up ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.2)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    cr.fillStyle = g; cr.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  grain(c, W, H, 6, rand);
  grain(cr, 1024, 910, 14, rand);

  return {
    map: tex(a, { aniso: 16 }),
    normalMap: tex(normalFromHeight(hgt, 1.6, false), { srgb: false, aniso: 16 }),
    roughnessMap: tex(r, { srgb: false, aniso: 8 }),
  };
}

// ───────────────────────── 白色舱壁板（带涂装）
export function makeWallPanel(variant = 0) {
  const W = 1024, H = 900, rand = rng(900 + variant * 13);
  const a = mk(W, H), c = a.getContext('2d');
  c.fillStyle = '#d6d3cb'; c.fillRect(0, 0, W, H);
  // 细分板缝
  const cols = [0, .34, .68, 1];
  for (let i = 0; i < 3; i++) {
    const v = (rand() - .5) * 8;
    c.fillStyle = `rgb(${214 + v},${211 + v},${203 + v})`;
    c.fillRect(cols[i] * W, 0, (cols[i + 1] - cols[i]) * W, H);
  }
  c.strokeStyle = 'rgba(30,32,36,.5)'; c.lineWidth = 3;
  for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(cols[i] * W, 0); c.lineTo(cols[i] * W, H); c.stroke(); }
  c.beginPath(); c.moveTo(0, H * .74); c.lineTo(W, H * .74); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, H * .74 + 3); c.lineTo(W, H * .74 + 3); c.stroke();
  // 螺栓
  c.fillStyle = 'rgba(40,42,46,.55)';
  for (let i = 0; i < 3; i++) for (const [fx, fy] of [[.04, .04], [.96, .04], [.04, .7], [.96, .7], [.04, .78], [.96, .78], [.04, .96], [.96, .96]]) {
    const x = (cols[i] + (cols[i + 1] - cols[i]) * fx) * W, y = fy * H;
    c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
  }
  const ink = '#16181c', org = '#ff6a2b';
  c.textBaseline = 'alphabetic';
  if (variant === 0) {
    c.fillStyle = ink; c.font = `700 330px ${FD}`; c.textAlign = 'left';
    c.fillText('03', 46, 400);
    c.fillStyle = org; c.fillRect(52, 432, 300, 20);
    c.fillStyle = ink; c.font = `600 40px ${FD}`; c.fillText('BRIDGE · SERVICE BAY', 52, 508);
    c.font = `500 30px ${FC}`; c.fillText('舰桥 第三设备舱位', 52, 552);
    c.font = `500 19px ${FM}`; c.fillStyle = 'rgba(22,24,28,.7)';
    ['FRAME 116–120', 'PRESSURE HULL / CLASS II', 'INSPECTED  ·  CYCLE 0411'].forEach((s, i) => c.fillText(s, 52, 600 + i * 26));
    for (let i = 0; i < 40; i++) { c.fillStyle = ink; c.fillRect(730 + i * 6, 70, 1 + Math.floor(rand() * 4), 90); }
    c.font = `500 16px ${FM}`; c.fillStyle = ink; c.fillText('XP07-B03-0116', 730, 184);
  } else if (variant === 1) {
    c.fillStyle = ink; c.font = `700 92px ${FD}`; c.textAlign = 'left';
    c.fillText('FARSHORE', 380, 180);
    c.font = `500 34px ${FC}`; c.fillText('远岸勘测局', 384, 232);
    // 徽记
    c.save(); c.translate(200, 170); emblem(c, 110, ink, org); c.restore();
    c.fillStyle = 'rgba(22,24,28,.7)'; c.font = `500 19px ${FM}`;
    ['DEEP-RANGE SURVEY VESSEL', 'REG. FS-XP-07', 'HOME PORT · LAGRANGE DOCK 4'].forEach((s, i) => c.fillText(s, 384, 280 + i * 26));
    // 警示条
    c.save(); c.beginPath(); c.rect(0, H * .78, W, 70); c.clip();
    c.fillStyle = org; c.fillRect(0, H * .78, W, 70);
    c.fillStyle = ink;
    for (let x = -100; x < W + 100; x += 70) { c.beginPath(); c.moveTo(x, H * .78 + 70); c.lineTo(x + 35, H * .78 + 70); c.lineTo(x + 105, H * .78); c.lineTo(x + 70, H * .78); c.fill(); }
    c.restore();
  } else if (variant === 2) {
    c.fillStyle = ink; c.fillRect(60, 80, 420, 120);
    c.fillStyle = '#d6d3cb'; c.font = `600 62px ${FD}`; c.textAlign = 'left'; c.fillText('ESCAPE POD', 84, 164);
    c.fillStyle = org;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(520 + i * 70, 80); c.lineTo(580 + i * 70, 140); c.lineTo(520 + i * 70, 200); c.lineTo(545 + i * 70, 140); c.fill(); }
    c.fillStyle = ink; c.font = `500 44px ${FC}`; c.fillText('逃生舱  →  右舷 12 米', 60, 270);
    c.font = `500 19px ${FM}`; c.fillStyle = 'rgba(22,24,28,.7)';
    ['FOLLOW FLOOR STRIP · AMBER', 'POD 03-A / 03-B  ·  CAP. 6 EACH'].forEach((s, i) => c.fillText(s, 60, 312 + i * 26));
    for (let x = 0; x < 9; x++) for (let y = 0; y < 5; y++) {
      c.fillStyle = (x + y * 3) % 7 === 0 ? org : 'rgba(22,24,28,.8)';
      c.fillRect(730 + x * 28, 400 + y * 28, 16, 16);
    }
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(60, 400, 600, 190);
    c.font = `600 30px ${FD}`; c.fillStyle = ink; c.fillText('CAUTION — MAGNETIC LATCH', 82, 448);
    c.font = `500 24px ${FC}`; c.fillText('注意：磁力闩锁 · 失重状态下请先固定', 82, 492);
    c.font = `500 17px ${FM}`; c.fillStyle = 'rgba(22,24,28,.65)'; c.fillText('PROC. FS-EM-221 REV.C', 82, 560);
  } else {
    // 通风格栅 + 小标签
    c.fillStyle = 'rgba(18,20,24,.88)';
    for (let i = 0; i < 16; i++) c.fillRect(90, 90 + i * 26, 500, 12);
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(70, 70, 540, 440);
    c.fillStyle = ink; c.font = `600 34px ${FD}`; c.textAlign = 'left'; c.fillText('ECS RETURN  04', 70, 560);
    c.font = `500 24px ${FC}`; c.fillText('环控回风口', 70, 596);
    c.fillStyle = org; c.fillRect(720, 70, 220, 220);
    c.fillStyle = ink; c.font = `700 150px ${FD}`; c.textAlign = 'center'; c.fillText('B', 830, 236);
    c.textAlign = 'left'; c.font = `500 19px ${FM}`; c.fillStyle = 'rgba(22,24,28,.7)';
    ['SECTION B', 'FRAME 124–128', 'O₂ 20.9%  ·  101.2 kPa'].forEach((s, i) => c.fillText(s, 720, 330 + i * 26));
  }
  // 污渍与刮痕
  for (let i = 0; i < 120; i++) {
    const x = rand() * W, y = rand() * H;
    c.strokeStyle = `rgba(40,40,44,${.02 + rand() * .05})`; c.lineWidth = .6 + rand();
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - .5) * 20, y + 20 + rand() * 90); c.stroke();
  }
  const g = c.createLinearGradient(0, H * .6, 0, H);
  g.addColorStop(0, 'rgba(60,56,48,0)'); g.addColorStop(1, 'rgba(60,56,48,.16)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  grain(c, W, H, 7, rand);
  return tex(a);
}

// 原创徽记：三段断环 + 斜切 + 定位点
export function emblem(c, R, ink, acc) {
  c.lineCap = 'butt';
  c.strokeStyle = ink; c.lineWidth = R * .17;
  for (let i = 0; i < 3; i++) {
    const a0 = -Math.PI / 2 + i * (Math.PI * 2 / 3) + .16;
    c.beginPath(); c.arc(0, 0, R * .82, a0, a0 + Math.PI * 2 / 3 - .32); c.stroke();
  }
  c.fillStyle = ink;
  c.save(); c.rotate(-Math.PI / 4); c.fillRect(-R * .09, -R * .5, R * .18, R); c.restore();
  c.fillStyle = acc;
  c.beginPath(); c.arc(R * .36, -R * .36, R * .13, 0, 7); c.fill();
}

// ───────────────────────── 屏幕内容
const CY = '#8fe9f5', WH = '#eef2f2', OR = '#ff7a3c';
function screenBase(w, h, title, code, rand) {
  const cv = mk(w, h), c = cv.getContext('2d');
  c.fillStyle = '#02060a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(143,233,245,.07)'; c.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, h); c.stroke(); }
  for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(w, y + .5); c.stroke(); }
  c.fillStyle = WH; c.fillRect(24, 22, 150, 34);
  c.fillStyle = '#02060a'; c.font = `700 22px ${FD}`; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(code, 34, 40);
  c.fillStyle = WH; c.font = `600 24px ${FD}`; c.fillText(title, 190, 40);
  c.fillStyle = OR; c.fillRect(w - 110, 28, 86, 6);
  c.fillStyle = 'rgba(238,242,242,.5)'; c.fillRect(w - 110, 40, 86, 2); c.fillRect(w - 110, 48, 50, 2);
  c.fillStyle = 'rgba(238,242,242,.35)'; c.fillRect(24, 66, w - 48, 1.5);
  c.textBaseline = 'alphabetic';
  return [cv, c];
}

export function makeScreen(kind, seed = 1) {
  const w = 1024, h = 576, rand = rng(seed * 31 + 5);
  let cv, c;
  if (kind === 'nav') {
    [cv, c] = screenBase(w, h, 'ORBITAL TRACK  ·  轨道航迹', 'NAV-01', rand);
    const ox = 360, oy = 330;
    c.strokeStyle = 'rgba(143,233,245,.5)'; c.lineWidth = 1.5;
    for (const [rx, ry, rot] of [[150, 60, -.25], [230, 96, -.25], [310, 130, -.25]]) {
      c.save(); c.translate(ox, oy); c.rotate(rot); c.setLineDash(rx === 230 ? [] : [6, 8]);
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.stroke(); c.restore();
    }
    c.setLineDash([]);
    const g = c.createRadialGradient(ox - 16, oy - 16, 4, ox, oy, 56);
    g.addColorStop(0, '#bff6ff'); g.addColorStop(1, '#12485a');
    c.fillStyle = g; c.beginPath(); c.arc(ox, oy, 54, 0, 7); c.fill();
    c.strokeStyle = CY; c.lineWidth = 2; c.beginPath(); c.arc(ox, oy, 62, 0, 7); c.stroke();
    c.fillStyle = OR; c.save(); c.translate(ox + 196, oy - 108); c.rotate(.78); c.fillRect(-9, -9, 18, 18); c.restore();
    c.strokeStyle = OR; c.lineWidth = 1.5; c.beginPath(); c.moveTo(ox + 196, oy - 108); c.lineTo(ox + 260, oy - 170); c.lineTo(ox + 340, oy - 170); c.stroke();
    c.fillStyle = WH; c.font = `600 20px ${FD}`; c.fillText('XUANPU-07', ox + 264, oy - 178);
    const rows = [['ALT', '412.6 km'], ['INC', '37.20°'], ['PERIOD', '94 m 12 s'], ['VEL', '7.61 km/s'], ['PHASE', '118.4°'], ['ECC', '0.0012']];
    rows.forEach(([k, v], i) => {
      const y = 130 + i * 62;
      c.fillStyle = 'rgba(238,242,242,.5)'; c.font = `500 17px ${FM}`; c.fillText(k, 730, y);
      c.fillStyle = WH; c.font = `600 34px ${FD}`; c.fillText(v, 730, y + 32);
      c.fillStyle = 'rgba(143,233,245,.3)'; c.fillRect(730, y + 42, 260, 1.5);
    });
  } else if (kind === 'sys') {
    [cv, c] = screenBase(w, h, 'POWER DISTRIBUTION  ·  能源分配', 'ENG-04', rand);
    for (let i = 0; i < 22; i++) {
      const v = .25 + rand() * .7, x = 40 + i * 30, bh = v * 300;
      c.fillStyle = i === 13 ? OR : (i % 5 === 0 ? WH : 'rgba(143,233,245,.75)');
      for (let y = 0; y < bh; y += 10) c.fillRect(x, 440 - y, 20, 7);
      c.fillStyle = 'rgba(238,242,242,.45)'; c.font = `500 12px ${FM}`; c.fillText(String(i + 1).padStart(2, '0'), x + 2, 466);
    }
    c.strokeStyle = 'rgba(238,242,242,.5)'; c.lineWidth = 1.5; c.strokeRect(30, 100, 670, 384);
    const rows = [['主反应堆 REACTOR', '71%'], ['辅助电池 AUX CELL', '94%'], ['推进母线 DRIVE BUS', '38%'], ['传感阵列 SENSOR', '62%']];
    rows.forEach(([k, v], i) => {
      const y = 126 + i * 92;
      c.fillStyle = 'rgba(238,242,242,.6)'; c.font = `500 18px ${FC}`; c.fillText(k, 740, y);
      c.fillStyle = WH; c.font = `600 46px ${FD}`; c.fillText(v, 740, y + 46);
      c.fillStyle = 'rgba(143,233,245,.25)'; c.fillRect(860, y + 22, 130, 10);
      c.fillStyle = i === 2 ? OR : CY; c.fillRect(860, y + 22, 130 * parseInt(v) / 100, 10);
    });
    c.fillStyle = 'rgba(238,242,242,.5)'; c.font = `500 15px ${FM}`; c.fillText('BUS A/B BALANCED  ·  NO FAULT  ·  T+ 0412:07:33', 30, 520);
  } else if (kind === 'wave') {
    [cv, c] = screenBase(w, h, 'SENSOR SPECTRUM  ·  传感频谱', 'SNS-02', rand);
    for (let k = 0; k < 4; k++) {
      c.strokeStyle = k === 1 ? OR : `rgba(143,233,245,${.9 - k * .18})`; c.lineWidth = k === 1 ? 2.5 : 1.6;
      c.beginPath();
      const f1 = 2 + rand() * 4, f2 = 9 + rand() * 12, ph = rand() * 6;
      for (let x = 30; x <= 994; x += 4) {
        const t = (x - 30) / 964;
        const y = 150 + k * 78 + Math.sin(t * f1 * 6.28 + ph) * 20 * Math.sin(t * 3.14) + Math.sin(t * f2 * 6.28) * 7 + (rand() - .5) * 5;
        x === 30 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = 'rgba(238,242,242,.5)'; c.font = `500 14px ${FM}`; c.fillText(`CH-${k + 1}  ${(40 + rand() * 900).toFixed(1)} MHz`, 34, 112 + k * 78);
    }
    for (let i = 0; i < 96; i++) {
      const v = Math.pow(rand(), 2) * 90 + 6;
      c.fillStyle = i > 60 && i < 66 ? OR : 'rgba(238,242,242,.75)';
      c.fillRect(30 + i * 10.05, 540 - v, 6, v);
    }
  } else {
    [cv, c] = screenBase(w, h, 'SURFACE SURVEY  ·  地表测绘', 'SRV-03', rand);
    // 等高线
    c.save(); c.beginPath(); c.rect(30, 90, 640, 456); c.clip();
    for (let k = 0; k < 9; k++) {
      const cx = 120 + rand() * 460, cy = 150 + rand() * 330;
      for (let j = 1; j < 6; j++) {
        c.strokeStyle = `rgba(143,233,245,${.18 + j * .09})`; c.lineWidth = 1.2;
        c.beginPath();
        const base = j * (22 + rand() * 10), ph = rand() * 6;
        for (let a = 0; a <= 6.3; a += .12) {
          const rr = base * (1 + .22 * Math.sin(a * 3 + ph) + .12 * Math.sin(a * 5 + ph * 2));
          const x = cx + Math.cos(a) * rr * 1.3, y = cy + Math.sin(a) * rr;
          a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.closePath(); c.stroke();
      }
    }
    c.restore();
    c.strokeStyle = 'rgba(238,242,242,.5)'; c.lineWidth = 1.5; c.strokeRect(30, 90, 640, 456);
    for (const [x, y, l] of [[210, 240, 'LZ-A'], [470, 380, 'LZ-B'], [560, 180, 'PRB-7']]) {
      c.strokeStyle = OR; c.lineWidth = 2; c.strokeRect(x - 10, y - 10, 20, 20);
      c.beginPath(); c.moveTo(x - 18, y); c.lineTo(x + 18, y); c.moveTo(x, y - 18); c.lineTo(x, y + 18); c.stroke();
      c.fillStyle = WH; c.font = `600 18px ${FD}`; c.fillText(l, x + 18, y - 14);
    }
    c.fillStyle = WH; c.font = `600 80px ${FD}`; c.fillText('37%', 710, 190);
    c.fillStyle = 'rgba(238,242,242,.55)'; c.font = `500 19px ${FC}`; c.fillText('测绘进度 · 第 3 阶段', 712, 224);
    for (let i = 0; i < 28; i++) { c.fillStyle = i < 10 ? CY : 'rgba(143,233,245,.2)'; c.fillRect(712 + i * 10, 244, 6, 20); }
    ['GRID 44-N / 118-E', 'RES 2.4 m/px', 'SWATH 186 km', 'PASS 0412 / 1100'].forEach((s, i) => {
      c.fillStyle = 'rgba(238,242,242,.6)'; c.font = `500 17px ${FM}`; c.fillText(s, 712, 320 + i * 34);
    });
  }
  return tex(cv);
}

// 小型工位屏
export function makeMiniScreen(seed = 1) {
  const w = 512, h = 300, rand = rng(seed * 97 + 3);
  const cv = mk(w, h), c = cv.getContext('2d');
  c.fillStyle = '#02060a'; c.fillRect(0, 0, w, h);
  c.fillStyle = WH; c.fillRect(14, 14, 86, 22);
  c.fillStyle = '#02060a'; c.font = `700 15px ${FD}`; c.textBaseline = 'middle'; c.fillText(['HELM', 'NAV', 'SNS', 'COM', 'ENG', 'ECS'][seed % 6], 22, 26);
  c.fillStyle = OR; c.fillRect(w - 60, 20, 46, 5);
  const mode = seed % 3;
  if (mode === 0) {
    for (let i = 0; i < 9; i++) {
      c.fillStyle = `rgba(238,242,242,${.4 + rand() * .5})`; c.fillRect(14, 56 + i * 25, 60 + rand() * 180, 6);
      c.fillStyle = i === 3 ? OR : CY; c.fillRect(300, 54 + i * 25, 30 + rand() * 170, 10);
    }
  } else if (mode === 1) {
    c.strokeStyle = CY; c.lineWidth = 2;
    for (const rr of [40, 76, 110]) { c.beginPath(); c.arc(170, 170, rr, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(50, 170); c.lineTo(290, 170); c.moveTo(170, 50); c.lineTo(170, 290); c.stroke();
    c.fillStyle = OR; c.fillRect(214, 110, 12, 12);
    c.fillStyle = WH; for (let i = 0; i < 7; i++) c.fillRect(330, 60 + i * 30, 60 + rand() * 100, 8);
  } else {
    c.strokeStyle = CY; c.lineWidth = 2; c.beginPath();
    for (let x = 14; x < w - 14; x += 3) { const y = 150 + Math.sin(x * .05) * 40 * Math.sin(x * .011) + (rand() - .5) * 14; x === 14 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(238,242,242,.7)'; c.fillRect(14 + i * 12.2, 280 - rand() * 50, 7, 50); }
  }
  return tex(cv);
}

// 条形控制面板（窗台）
export function makeStripScreen(seed = 1) {
  const w = 1024, h = 232, rand = rng(seed * 53 + 9);
  const cv = mk(w, h), c = cv.getContext('2d');
  c.fillStyle = '#02060a'; c.fillRect(0, 0, w, h);
  let x = 20;
  while (x < w - 120) {
    const bw = 70 + Math.floor(rand() * 4) * 40, t = rand();
    if (t < .3) { c.fillStyle = WH; c.fillRect(x, 24, bw, 40); c.fillStyle = 'rgba(143,233,245,.6)'; for (let i = 0; i < 5; i++) c.fillRect(x, 86 + i * 26, bw * (.3 + rand() * .7), 8); }
    else if (t < .6) { c.strokeStyle = CY; c.lineWidth = 2; c.strokeRect(x, 24, bw, 184); for (let i = 0; i < bw / 14 - 1; i++) { const v = rand() * 150; c.fillStyle = rand() > .88 ? OR : CY; c.fillRect(x + 8 + i * 14, 200 - v, 8, v); } }
    else { for (let r = 0; r < 4; r++) for (let q = 0; q < bw / 44; q++) { c.fillStyle = rand() > .85 ? OR : (rand() > .5 ? 'rgba(238,242,242,.85)' : 'rgba(143,233,245,.35)'); c.fillRect(x + q * 44, 24 + r * 48, 34, 36); } }
    x += bw + 26;
  }
  return tex(cv);
}

// 全息台面刻度盘
export function makeHoloDisc() {
  const S = 1024, cv = mk(S, S), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
  c.translate(S / 2, S / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(143,233,245,.5)'); g.addColorStop(.35, 'rgba(143,233,245,.12)'); g.addColorStop(1, 'rgba(143,233,245,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, S / 2, 0, 7); c.fill();
  c.strokeStyle = CY;
  for (const [r, lw, dash] of [[480, 3, []], [440, 1.5, [4, 10]], [350, 2, []], [250, 1.2, [18, 8]], [140, 2, []], [60, 1.5, []]]) {
    c.lineWidth = lw; c.setLineDash(dash); c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
  }
  c.setLineDash([]);
  for (let d = 0; d < 360; d += 2) {
    const a = d * Math.PI / 180, major = d % 30 === 0, mid = d % 10 === 0;
    c.lineWidth = major ? 4 : 1.5; c.strokeStyle = major ? '#fff' : CY;
    c.beginPath(); c.moveTo(Math.cos(a) * 480, Math.sin(a) * 480); c.lineTo(Math.cos(a) * (major ? 448 : mid ? 462 : 471), Math.sin(a) * (major ? 448 : mid ? 462 : 471)); c.stroke();
  }
  c.strokeStyle = 'rgba(143,233,245,.5)'; c.lineWidth = 1.2;
  for (let d = 0; d < 360; d += 45) { const a = d * Math.PI / 180; c.beginPath(); c.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); c.lineTo(Math.cos(a) * 440, Math.sin(a) * 440); c.stroke(); }
  c.fillStyle = OR;
  for (let d = 15; d < 360; d += 90) { const a = d * Math.PI / 180; c.save(); c.rotate(a); c.fillRect(352, -5, 60, 10); c.restore(); }
  return tex(cv);
}

// 全息浮窗（透明底，加色混合）
export function makeHoloCard(kind = 0) {
  const w = 640, h = 360, cv = mk(w, h), c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(40,120,140,.16)'; c.fillRect(0, 0, w, h);
  c.strokeStyle = CY; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
  c.fillStyle = CY; c.fillRect(0, 0, 14, 60); c.fillRect(w - 80, h - 8, 80, 8);
  c.textBaseline = 'alphabetic';
  if (kind === 0) {
    c.fillStyle = '#fff'; c.font = `600 30px ${FD}`; c.fillText('TARGET BODY', 34, 48);
    c.font = `600 84px ${FC}`; c.fillText('苍垣-b', 30, 150);
    c.font = `600 30px ${FD}`; c.fillStyle = CY; c.fillText('CANGYUAN-b  /  CLASS M-OCEANIC', 34, 196);
    c.fillStyle = 'rgba(255,255,255,.8)'; c.font = `500 22px ${FM}`;
    c.fillText('R 6,912 km    g 1.08    T 281 K', 34, 250);
    c.fillText('ROT 31.4 h    ATM N₂/O₂   P 1.12 bar', 34, 284);
    c.fillStyle = OR; c.fillRect(34, 310, 180, 8);
  } else {
    c.fillStyle = '#fff'; c.font = `600 30px ${FD}`; c.fillText('SURVEY PASS  0412', 34, 48);
    c.font = `600 110px ${FD}`; c.fillText('37', 30, 170);
    c.font = `600 44px ${FD}`; c.fillStyle = CY; c.fillText('%', 160, 170);
    c.fillStyle = 'rgba(255,255,255,.8)'; c.font = `500 26px ${FC}`; c.fillText('地表测绘 · 第 3 阶段', 230, 130);
    c.font = `500 22px ${FM}`; c.fillText('SWATH 186 km · RES 2.4 m', 230, 166);
    for (let i = 0; i < 40; i++) { c.fillStyle = i < 15 ? CY : 'rgba(143,233,245,.25)'; c.fillRect(34 + i * 14.4, 220, 9, 34); }
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `500 20px ${FM}`; c.fillText('NEXT WINDOW  T-00:14:52', 34, 304);
    c.fillStyle = OR; c.fillRect(34, 320, 120, 8);
  }
  const t = tex(cv);
  t.premultiplyAlpha = false;
  return t;
}

// 径向光斑（恒星、光晕）
export function makeGlow(S = 256, stops = [[0, 1], [.08, .85], [.22, .22], [.5, .05], [1, 0]]) {
  const cv = mk(S, S), c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [p, a] of stops) g.addColorStop(p, `rgba(255,255,255,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return tex(cv);
}

// 舱门铭牌
export function makeDoorSign() {
  const w = 1024, h = 256, cv = mk(w, h), c = cv.getContext('2d');
  c.fillStyle = '#0c0e11'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#eceae4'; c.fillRect(24, 24, 208, 208);
  c.fillStyle = '#0c0e11'; c.font = `700 170px ${FD}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('03', 128, 138);
  c.textAlign = 'left'; c.fillStyle = '#eceae4'; c.font = `600 76px ${FD}`; c.fillText('BRIDGE', 270, 96);
  c.font = `500 52px ${FC}`; c.fillText('舰桥 · 主通道', 272, 178);
  c.fillStyle = '#ff6a2b'; c.fillRect(760, 60, 230, 22);
  c.fillStyle = 'rgba(236,234,228,.6)'; c.font = `500 26px ${FM}`; c.fillText('AUTH · LV-3', 760, 130);
  return tex(cv);
}
