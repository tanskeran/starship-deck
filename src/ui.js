// 舰桥终端界面
const $ = id => document.getElementById(id);
// 后台标签页会暂停 rAF，用定时器兜底，避免启动流程卡住
const raf = () => new Promise(r => { const id = setTimeout(r, 80); requestAnimationFrame(() => { clearTimeout(id); r(); }); });

const VIEWS = [
  { cn: '舰桥总览', en: 'BRIDGE OVERVIEW', crumb: '总览', desc: '主舰桥全景。当前处于苍垣-b 低轨测绘航段，全舰状态正常。' },
  { cn: '星图投影', en: 'HOLO-CHART', crumb: '星图台', desc: '中央全息星图台。实时投影目标天体、轨道与测绘覆盖范围。' },
  { cn: '舷窗观测', en: 'OBSERVATION', crumb: '舷窗', desc: '前向观测舷窗。晨昏线正自右舷方向掠过，滤光等级已自动调节。' },
  { cn: '作业终端', en: 'OPERATIONS', crumb: '右舷终端', desc: '右舷作业终端与数据机柜。查看本班次工单与值班人员。' },
];

const TAGS = [
  { id: 'planet', cn: '苍垣-b', en: 'CANGYUAN-b', sub: 'ALT 412.6 KM · 晨昏线', left: false },
  { id: 'holo', cn: '全息星图台', en: 'HOLO-CHART', sub: 'PROJ · 实时同步', left: true },
  { id: 'helm', cn: '操舵工位', en: 'HELM-02', sub: 'AUTO · 自动巡航', left: false },
  { id: 'wall', cn: '轨道航迹', en: 'NAV-01', sub: 'LIVE · 94 MIN / REV', left: true },
  { id: 'rack', cn: '数据机柜', en: 'CORE RACK', sub: 'LOAD 62% · 31°C', left: true },
];

const sec = (cn, en) => `<div class="sec"><b>${cn}</b><em>${en}</em><i></i></div>`;
const stat = (cn, en, v, unit, pct, cls = '') => `<div class="stat"><div class="stat-l"><b>${cn}</b><em>${en}</em></div><div class="stat-v">${v}<small>${unit}</small></div><div class="bar ${cls}"><i data-v="${pct}"></i></div></div>`;
const kv = rows => `<div class="kv">${rows.map(([l, v, u = '']) => `<div><label>${l}</label><b>${v}<small>${u}</small></b></div>`).join('')}</div>`;

const SCHEM = `<svg class="schem" viewBox="0 0 400 112">
  <line class="d" x1="6" y1="96" x2="394" y2="96"/><line class="l" x1="6" y1="92" x2="6" y2="100"/><line class="l" x1="394" y1="92" x2="394" y2="100"/>
  <text x="200" y="107" text-anchor="middle">LOA 486 M</text>
  <polygon class="h" points="22,60 62,47 150,43 172,32 214,32 228,43 300,43 330,51 372,51 380,59 372,69 330,69 300,77 150,77 62,73"/>
  <polygon class="hot" points="172,32 214,32 228,43 162,43"/>
  <rect class="h" x="372" y="53" width="20" height="14"/><line class="l" x1="392" y1="56" x2="398" y2="56"/><line class="l" x1="392" y1="60" x2="398" y2="60"/><line class="l" x1="392" y1="64" x2="398" y2="64"/>
  <ellipse class="l" cx="264" cy="60" rx="8" ry="33" style="stroke:var(--bone)"/>
  <line class="l" x1="22" y1="60" x2="4" y2="60" style="stroke:var(--bone)"/><circle class="h" cx="4" cy="60" r="2.4"/>
  <line class="d" x1="110" y1="45" x2="110" y2="75"/><line class="d" x1="150" y1="43" x2="150" y2="77"/><line class="d" x1="228" y1="43" x2="228" y2="77"/><line class="d" x1="300" y1="43" x2="300" y2="77"/>
  <text x="80" y="63" text-anchor="middle">A</text><text x="130" y="63" text-anchor="middle">B</text><text x="190" y="63" text-anchor="middle">C</text><text x="246" y="63" text-anchor="middle">D</text><text x="284" y="63" text-anchor="middle">E</text><text x="336" y="63" text-anchor="middle">F</text>
  <circle class="pulse" cx="192" cy="39" r="3"/>
  <polyline class="l" points="192,32 192,14 236,14" style="stroke:var(--acc)"/>
  <text class="hl" x="240" y="12">当前位置 · 舰桥</text><text x="240" y="21">DECK 03 / SEC-B</text>
</svg>`;

const PANELS = [
  () => ({
    code: 'P-01', cn: '舰体状态', en: 'VESSEL STATUS', state: 'NOMINAL',
    body: `${sec('舰体概况', 'PROFILE')}${SCHEM}
      ${sec('核心系统', 'CORE SYSTEMS')}
      ${stat('舰体完整度', 'HULL', '98.2', '%', 98.2)}
      ${stat('主反应堆', 'REACTOR', '71', '%', 71, 'acc')}
      ${stat('生命维持', 'LIFE-SUP', '100', '%', 100)}
      ${stat('护盾电容', 'SHIELD CAP', '64', '%', 64, 'cy')}
      <div class="card"><div class="card-k"><span>CURRENT MISSION</span><span>FS-0412</span></div>
        <h4>苍垣-b 地表测绘 · 第 3 阶段</h4><p>低轨多光谱扫描，覆盖北半球中纬度带。</p>
        <div class="card-p"><i style="--v:37%"></i><b>37%</b></div></div>`,
  }),
  () => ({
    code: 'P-02', cn: '目标天体', en: 'TARGET BODY', state: 'TRACKING',
    body: `<div class="body-h"><h3>苍垣-b<small>CANGYUAN-b / M-OCEANIC</small></h3>
        <div class="ring"><svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="42"/><circle class="v" cx="50" cy="50" r="42" data-d="${(2 * Math.PI * 42 * .62).toFixed(1)}"/></svg><b>62<small>%</small></b></div></div>
      ${sec('物理参数', 'PHYSICAL')}
      ${kv([['平均半径', '6,912', 'km'], ['表面重力', '1.08', 'g'], ['自转周期', '31.4', 'h'], ['平均温度', '281', 'K'], ['表面气压', '1.12', 'bar'], ['海洋覆盖', '68', '%']])}
      ${sec('大气成分', 'ATMOSPHERE')}
      <div class="gas"><b>N₂</b><div class="bar"><i data-v="71"></i></div><span>71.0%</span></div>
      <div class="gas"><b>O₂</b><div class="bar cy"><i data-v="19.4"></i></div><span>19.4%</span></div>
      <div class="gas"><b>Ar</b><div class="bar"><i data-v="6.1"></i></div><span>6.1%</span></div>
      <div class="gas"><b>CO₂</b><div class="bar acc"><i data-v="3.2"></i></div><span>3.2%</span></div>
      <p class="note">全息模型与实测地形同步，环形进度为本轨扫描覆盖率。橙色轨迹为本舰当前轨道。</p>`,
  }),
  () => ({
    code: 'P-03', cn: '外部环境', en: 'EXTERNAL', state: 'MONITOR',
    body: `${sec('恒星风通量', 'STELLAR WIND')}
      <canvas class="scope" id="scope" width="640" height="180"></canvas>
      ${sec('观测读数', 'READOUT')}
      ${kv([['外部辐射', '<span id="rad">0.42</span>', 'mSv/h'], ['舷窗滤光', 'LV-3', '自动'], ['外壁温度', '−118', '°C'], ['晨昏线距离', '1,240', 'km']])}
      ${sec('观测日志', 'LOG')}
      <div class="log">
        <p class="hi"><time>07:42:10</time><span>晨昏线进入视场，右舷光照增强。</span></p>
        <p><time>07:31:55</time><span>北纬 44° 云系旋转结构已标记，待下一轨复核。</span></p>
        <p><time>07:18:02</time><span>大气边缘散射正常，无异常辉光。</span></p>
      </div>`,
  }),
  () => ({
    code: 'P-04', cn: '作业队列', en: 'OPERATIONS', state: 'ON SHIFT',
    body: `${sec('本班工单', 'WORK ORDERS')}
      <div class="task"><span class="task-id">W-117</span><div><b>多光谱扫描 · 北半球</b><em>SURVEY PASS 0412</em></div><span class="chip run">进行中</span></div>
      <div class="task"><span class="task-id">W-118</span><div><b>探测器 PRB-7 回收校准</b><em>PROBE RECOVERY</em></div><span class="chip">排队</span></div>
      <div class="task"><span class="task-id">W-116</span><div><b>右舷传感阵列自检</b><em>SENSOR SELF-TEST</em></div><span class="chip ok">完成</span></div>
      <div class="task"><span class="task-id">W-115</span><div><b>轨道维持点火 · 0.8 m/s</b><em>STATION-KEEPING</em></div><span class="chip ok">完成</span></div>
      ${sec('值班人员', 'ON DUTY')}
      <div class="crew">
        <div class="me"><i>CO</i><b>沈砚</b><em>舰务官 · COMMAND</em></div>
        <div><i>NV</i><b>黎昼</b><em>领航 · NAVIGATION</em></div>
        <div><i>EN</i><b>莫罗</b><em>工程 · ENGINEERING</em></div>
        <div><i>OB</i><b>伊岚</b><em>观测 · SURVEY</em></div>
      </div>
      ${sec('数据链路', 'DATA LINK')}
      ${stat('机柜负载', 'CORE LOAD', '62', '%', 62, 'cy')}
      ${stat('下行缓存', 'DOWNLINK BUF', '18.4', 'TB', 46)}`,
  }),
];

export function createHUD() {
  const hud = $('hud'), panel = $('panel'), menuList = $('menuList'), tagsEl = $('tags'), flash = $('flash');
  const api = { onView: null, onQuality: null, view: 0 };

  // 导航
  menuList.innerHTML = VIEWS.map((v, i) => `<button class="mi" type="button" data-v="${i}">
    <span class="mi-idx">${String(i + 1).padStart(2, '0')}</span>
    <span class="mi-t"><b>${v.cn}</b><em>${v.en}</em></span>
    <span class="mi-k">${i + 1}</span></button>`).join('');
  const items = [...menuList.children];
  items.forEach(b => b.addEventListener('click', () => api.setView(+b.dataset.v)));

  // 标注
  tagsEl.innerHTML = TAGS.map(t => `<div class="tag${t.left ? ' left' : ''}" data-id="${t.id}"><i class="tag-m"></i><i class="tag-l"></i><div class="tag-c"><b>${t.cn}</b><em>${t.en}</em><span>${t.sub}</span></div></div>`).join('');
  const tagEls = Object.fromEntries([...tagsEl.children].map(e => [e.dataset.id, e]));

  // 底栏
  $('tele').innerHTML = `<div>ALT<b id="tAlt">412.6<small>KM</small></b></div><div>VEL<b id="tVel">7.61<small>KM/S</small></b></div><div>PHASE<b id="tPh">118.4<small>DEG</small></b></div>`;
  const msgs = ['第 412 轨测绘进行中，预计 14 分 52 秒后进入下一观测窗口', '右舷传感阵列自检完成，全部通道正常', '舰内重力 0.98 g · 气压 101.2 kPa · 氧分压正常', '晨昏线正在通过本舰下方，舷窗滤光已自动调节', '探测器 PRB-7 回收校准排入本班队列'];
  const tk = msgs.map(m => `${m}<b>///</b>`).join('');
  $('ticker').innerHTML = tk + tk;

  let swapT = 0, scopeCtx = null;
  function fillPanel(i) {
    const p = PANELS[i]();
    panel.innerHTML = `<div class="p-head"><div class="p-code">${p.code}</div><div class="p-title"><b>${p.cn}</b><em>${p.en}</em></div><div class="p-state">${p.state}</div></div>
      <div class="p-body">${p.body}</div>
      <div class="p-foot"><span>REF ${p.code}-0412</span><span>SYNC ${new Date().toTimeString().slice(0, 8)}</span></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panel.querySelectorAll('[data-v]').forEach(e => e.style.setProperty('--v', e.dataset.v + '%'));
      panel.querySelectorAll('[data-d]').forEach(e => e.style.setProperty('--d', e.dataset.d));
    }));
    const sc = $('scope');
    scopeCtx = sc ? sc.getContext('2d') : null;
  }

  api.setView = (i, silent = false) => {
    if (i === api.view && !silent) return;
    api.view = i;
    items.forEach((b, k) => b.classList.toggle('on', k === i));
    $('menuDesc').textContent = VIEWS[i].desc;
    $('crumbView').textContent = VIEWS[i].crumb;
    clearTimeout(swapT);
    if (silent) fillPanel(i);
    else {
      panel.classList.add('swap');
      swapT = setTimeout(() => { fillPanel(i); panel.classList.add('swap'); requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove('swap'))); }, 240);
      $('flashIdx').textContent = String(i + 1).padStart(2, '0');
      $('flashCn').textContent = VIEWS[i].cn; $('flashEn').textContent = VIEWS[i].en;
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    }
    api.onView && api.onView(i);
  };

  // 影像模式 / 画质
  let cine = false;
  const toggleCine = () => { cine = !cine; hud.classList.toggle('cine', cine); $('cineHint').classList.toggle('on', cine); };
  const cycleQ = () => { if (api.onQuality) $('qVal').textContent = api.onQuality(); };
  $('qBtn').addEventListener('click', cycleQ);
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.key >= '1' && e.key <= '4') api.setView(+e.key - 1);
    else if (e.key === 'h' || e.key === 'H') toggleCine();
    else if (e.key === 'q' || e.key === 'Q') cycleQ();
  });
  api.setQualityLabel = n => { $('qVal').textContent = n; };

  // 启动画面
  const logEl = $('bootLog');
  api.bootProgress = async (p, label) => {
    $('bootPct').textContent = String(Math.round(p * 100)).padStart(3, '0');
    $('bootBar').style.width = (p * 100) + '%';
    if (label) { const el = document.createElement('p'); el.textContent = label; logEl.appendChild(el); while (logEl.children.length > 4) logEl.firstChild.remove(); }
    await raf(); await raf();
  };
  api.bootError = msg => { const el = document.createElement('p'); el.className = 'boot-err'; el.textContent = msg; logEl.appendChild(el); };
  api.bootDone = async () => {
    await api.bootProgress(1, '舰桥终端就绪 / TERMINAL READY');
    await new Promise(r => setTimeout(r, 450));
    $('boot').classList.add('done');
    api.setView(0, true);
    setTimeout(() => {
      hud.classList.remove('pre');
      $('flashIdx').textContent = '01'; flash.classList.add('go');
    }, 500);
  };

  // 每帧
  let fpsAcc = 0, fpsN = 0, slow = 0, phase = 118.4;
  const clock = $('clock'), fpsEl = $('fps');
  api.tick = (dt, t, tags) => {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > .5) { fpsEl.textContent = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    slow += dt;
    if (slow > .25) {
      slow = 0;
      clock.textContent = new Date().toTimeString().slice(0, 8);
      phase = (phase + .016) % 360;
      $('tAlt').firstChild.nodeValue = (412.6 + Math.sin(t * .3) * .2).toFixed(1);
      $('tVel').firstChild.nodeValue = (7.61 + Math.sin(t * .21) * .004).toFixed(3).slice(0, 5);
      $('tPh').firstChild.nodeValue = phase.toFixed(1);
      const rad = $('rad'); if (rad) rad.textContent = (.42 + Math.sin(t * .7) * .03 + Math.sin(t * 2.3) * .01).toFixed(2);
    }
    if (tags) for (const g of tags) {
      const el = tagEls[g.id]; if (!el) continue;
      if (g.on) el.style.transform = `translate(${g.x.toFixed(1)}px,${g.y.toFixed(1)}px)`;
      if (g.on !== el._on) { el._on = g.on; el.classList.toggle('on', g.on); }
    }
    if (scopeCtx && !cine) drawScope(scopeCtx, t);
  };

  function drawScope(c, t) {
    const w = 640, h = 180;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(236,234,228,.1)'; c.lineWidth = 1;
    for (let x = 0; x <= w; x += 40) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, h); c.stroke(); }
    for (let y = 0; y <= h; y += 30) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(w, y + .5); c.stroke(); }
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = k === 0 ? '#eceae4' : k === 1 ? 'rgba(134,228,242,.8)' : 'rgba(255,106,43,.9)';
      c.lineWidth = k === 0 ? 2 : 1.4;
      c.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const u = x / w;
        const y = h / 2 + (k - 1) * 34
          + Math.sin(u * (7 + k * 3) + t * (1.2 + k * .5)) * 16 * Math.sin(u * 3.14)
          + Math.sin(u * 31 + t * 3.1 + k) * 4 + Math.sin(u * 73 - t * 5.3) * 2;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    const sx = (t * 90) % w;
    c.fillStyle = 'rgba(236,234,228,.5)'; c.fillRect(sx, 0, 1.5, h);
    c.fillStyle = '#ff6a2b'; c.fillRect(0, 0, 46, 5);
  }

  return api;
}
