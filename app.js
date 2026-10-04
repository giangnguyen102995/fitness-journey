'use strict';

const METRICS = [
  { key: 'eo', label: 'Eo' },
  { key: 'bungduoi', label: 'Bụng dưới' },
  { key: 'nguc', label: 'Ngực' },
  { key: 'baptay', label: 'Bắp tay' },
  { key: 'cangtay', label: 'Cẳng tay' },
  { key: 'mong', label: 'Mông' },
  { key: 'dui', label: 'Đùi' },
];
const LS_KEY = 'fitness-journey-v1';
const DEMO = new URLSearchParams(location.search).has('demo');
const POWS = ['POW!', 'BAM!', 'WOW!', 'ĐỈNH!', 'QUÁ ĐÃ!', 'BOOM!'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const mondayOf = (iso) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
const fmtShort = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const fmtFull = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const weekLabel = (iso) => `Tuần ${fmtShort(iso)} – ${fmtFull(addDays(iso, 6))}`;
const today = () => toISO(new Date());

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtNum = (v, digits = 1) => v.toLocaleString('vi-VN', { maximumFractionDigits: digits });
const fmtDelta = (d, digits = 1) => (d > 0 ? '+' : '') + fmtNum(d, digits);
function deltaHTML(d, inline, digits = 1) {
  if (d == null) return '';
  const k = 10 ** digits;
  const r = Math.round(d * k) / k;
  const cls = r > 0 ? 'up' : r < 0 ? 'down' : '';
  return `<span class="delta ${cls}${inline ? ' inline' : ''}">${r === 0 ? '=' : fmtDelta(r, digits)}</span>`;
}

/* ---------- state ---------- */
function defaultState() {
  return {
    profiles: [{ id: 'p1', name: 'Anh', emoji: '💪' }, { id: 'p2', name: 'Vợ', emoji: '🌸' }],
    active: 'p1',
    measurements: { p1: {}, p2: {} },
    weights: { p1: {}, p2: {} },
  };
}
function loadState() {
  if (DEMO) return demoState();
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && Array.isArray(s.profiles)) return s;
  } catch (e) { /* dữ liệu hỏng thì bắt đầu lại */ }
  return defaultState();
}
let onSaved = null; // sync.js gắn vào đây để đẩy thay đổi lên máy chủ
function save() {
  if (DEMO) return;
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  if (onSaved) onSaved();
}
function demoState() {
  const s = defaultState();
  const base = { p1: [88, 92, 100, 34, 28, 98, 58, 78], p2: [70, 78, 86, 26, 22, 94, 54, 58] };
  const wk0 = mondayOf(today());
  for (const p of ['p1', 'p2']) {
    for (let i = 11; i >= 0; i--) {
      const row = {};
      METRICS.forEach((m, j) => {
        const trend = j === 3 || j === 4 ? 0.1 : -0.35;
        row[m.key] = Math.round((base[p][j] + trend * (11 - i) + Math.sin(i * 1.7 + j) * 0.5) * 10) / 10;
      });
      s.measurements[p][addDays(wk0, -7 * i)] = row;
    }
    for (let i = 80; i >= 0; i--) {
      if (i % 9 === 4) continue;
      s.weights[p][addDays(today(), -i)] = Math.round((base[p][7] - (80 - i) * 0.045 + Math.sin(i * 0.9) * 0.4) * 10) / 10;
    }
  }
  const mkDay = (name, exs) => ({ id: uid(), name, exercises: exs.map(([n, kg]) => ({ id: uid(), name: n, kg })) });
  const prog = {
    id: uid(), name: 'Push Pull Legs',
    days: [
      mkDay('Push', [['Bench Press', 60], ['Overhead Press', 37.5], ['Triceps Pushdown', 22.5]]),
      mkDay('Pull', [['Deadlift', 100], ['Barbell Row', 55], ['Biceps Curl', 12.5]]),
      mkDay('Legs', [['Squat', 80], ['Leg Press', 140], ['Calf Raise', 60]]),
    ],
  };
  const logs = {};
  prog.days.forEach((d, di) => {
    for (let k = 0; k < 8; k++) {
      const entries = {};
      d.exercises.forEach((x, j) => {
        const w = x.kg + (k - (k % 3 === 2 ? 1 : 0)) * (j ? 1.25 : 2.5);
        entries[x.id] = [{ w, reps: 8 - (k % 3), rpe: 7 + (k % 3) * 0.5 }, { w, reps: 7 - (k % 3), rpe: 8 + (k % 3) * 0.5 }];
      });
      logs[`${prog.id}|${d.id}|${addDays(wk0, -7 * (7 - k) + di * 2)}`] = entries;
    }
  });
  s.workouts = { p1: { programs: [prog], logs, active: prog.id } };
  const mkMeal = (name, items, note) => ({ id: uid(), name, items: items.map(([n, qty, unit = 'g']) => ({ name: n, qty, unit })), ...(note && { note }) });
  s.diet = {
    p1: {
      [addDays(today(), -1)]: [mkMeal('Phở bò', [['Bánh phở', 200], ['Thịt bò', 100]], 'Ăn ngoài, số gram ước lượng')],
      [today()]: [
        mkMeal('Yến mạch chuối trứng', [['Yến mạch', 60], ['Chuối', 1, 'quả'], ['Trứng luộc', 2, 'quả'], ['Sữa tươi không đường', 200]]),
        mkMeal('Cơm gà áp chảo', [['Ức gà', 150], ['Cơm trắng', 1, 'khẩu phần'], ['Bông cải xanh', 100]], 'Ăn sau buổi tập'),
      ],
    },
  };
  return s;
}

let state = loadState();
let weightRange = 90;
const pid = () => state.active;
const curMeasure = () => (state.measurements[pid()] ||= {});
const curWeights = () => (state.weights[pid()] ||= {});

/* ---------- photo storage (IndexedDB) ---------- */
let dbPromise;
function db() {
  return (dbPromise ||= new Promise((res, rej) => {
    const r = indexedDB.open('fitness-journey', 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
      s.createIndex('profile', 'profile');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function photoTx(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction('photos', mode);
    const req = fn(t.objectStore('photos'));
    t.oncomplete = () => res(req && req.result);
    t.onerror = t.onabort = () => rej(t.error);
  }));
}
async function shrinkImage(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}

/* ---------- POW! ---------- */
function pow(text) {
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 62 + (i % 3) * 5 : 98;
    const a = (i / 28) * Math.PI * 2;
    pts.push(`${(100 + Math.cos(a) * r * 1.25).toFixed(1)},${(80 + Math.sin(a) * r * 0.8).toFixed(1)}`);
  }
  const el = document.createElement('div');
  el.className = 'pow';
  el.innerHTML = `<svg viewBox="-30 -5 260 170"><polygon points="${pts.join(' ')}" fill="#ffd60a" stroke="#16130f" stroke-width="4" stroke-linejoin="round"/></svg><span>${esc(text || POWS[Math.floor(Math.random() * POWS.length)])}</span>`;
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove());
}

/* ---------- chart ---------- */
function niceTicks(lo, hi, n = 4) {
  const step0 = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const f = step0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
let chartSeq = 0;
// pts: [{ d: 'YYYY-MM-DD', v: number, note?: string }] đã sắp theo ngày tăng dần
function drawChart(host, pts, unit, digits = 1) {
  host._chart = { pts, unit, digits };
  host.innerHTML = '';
  if (!pts.length) {
    host.innerHTML = '<div class="empty">Chưa có dữ liệu — log đi nào!</div>';
    return;
  }
  const W = host.clientWidth || 300;
  const H = +host.dataset.h || 170;
  const lastText = fmtNum(pts[pts.length - 1].v, digits);
  const m = { t: 14, r: Math.max(46, 14 + lastText.length * 7.5), b: 24, l: 36 };
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const ticks = niceTicks(lo, hi, H > 200 ? 5 : 3);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const ts = pts.map((p) => parseISO(p.d).getTime());
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const X = (t) => (t1 === t0 ? (m.l + W - m.r) / 2 : m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r));
  const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const xy = pts.map((p, i) => [X(ts[i]), Y(p.v)]);
  const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const base = H - m.b;
  const id = `ht${++chartSeq}`;
  const showDots = pts.length <= 40;
  const last = xy[xy.length - 1];

  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">
    <defs><pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <circle cx="3.5" cy="3.5" r="1.5" fill="var(--accent)" opacity=".45"/></pattern></defs>`;
  for (const t of ticks) {
    svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>
      <text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmtNum(t, digits)}</text>`;
  }
  svg += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${base}" y2="${base}"/>`;
  svg += `<text x="${m.l}" y="${H - 6}">${fmtShort(pts[0].d)}</text>`;
  if (pts.length > 1) {
    svg += `<text x="${W - m.r}" y="${H - 6}" text-anchor="end">${fmtShort(pts[pts.length - 1].d)}</text>`;
    svg += `<path class="area" fill="url(#${id})" d="${path}L${last[0].toFixed(1)},${base}L${xy[0][0].toFixed(1)},${base}Z"/>`;
    svg += `<path class="line-bg" pathLength="1" d="${path}"/><path class="line" pathLength="1" d="${path}"/>`;
  }
  svg += `<line class="cross" y1="${m.t}" y2="${base}" visibility="hidden"/>`;
  xy.forEach(([x, y], i) => {
    if (showDots || i === xy.length - 1) {
      svg += `<circle class="dot" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${showDots ? 4.5 : 5}" style="animation-delay:${(0.2 + (i / xy.length) * 0.9).toFixed(2)}s"/>`;
    }
  });
  svg += `<circle class="dot on hover-dot" r="6" visibility="hidden" style="animation:none"/>`;
  svg += `<text class="last-label" x="${last[0] + 9}" y="${last[1] + 4}">${lastText}</text>`;
  svg += `<rect class="hit" x="0" y="0" width="${W}" height="${H}"/></svg>`;
  host.innerHTML = svg + '<div class="tip" hidden></div>';

  const tip = $('.tip', host), cross = $('.cross', host), hov = $('.hover-dot', host), hit = $('.hit', host);
  const showTip = (e) => {
    const px = ((e.clientX - host.getBoundingClientRect().left) / host.clientWidth) * W;
    let i = 0;
    xy.forEach(([x], j) => { if (Math.abs(x - px) < Math.abs(xy[i][0] - px)) i = j; });
    const [x, y] = xy[i];
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    hov.setAttribute('cx', x); hov.setAttribute('cy', y); hov.setAttribute('visibility', 'visible');
    const d = i ? pts[i].v - pts[i - 1].v : null;
    tip.innerHTML = `<small>${fmtFull(pts[i].d)}</small><b>${fmtNum(pts[i].v, digits)}</b> ${unit}${deltaHTML(d, true, digits)}${pts[i].note ? `<small>${pts[i].note}</small>` : ''}`;
    tip.hidden = false;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.max(half, Math.min(host.clientWidth - half, x))}px`;
    tip.style.top = `${Math.max(y, tip.offsetHeight + 4)}px`;
  };
  hit.addEventListener('pointermove', showTip);
  hit.addEventListener('pointerdown', showTip);
  hit.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return; // trên điện thoại giữ lại để kịp đọc
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    hov.setAttribute('visibility', 'hidden');
  });
}

/* ---------- header ---------- */
function renderHeader() {
  document.body.dataset.profile = pid();
  $('#profiles').innerHTML = state.profiles.map((p) => `
    <div class="profile ${p.id === pid() ? 'active' : ''}" data-id="${p.id}" role="tab" tabindex="0">
      <span>${p.emoji}</span><span>${esc(p.name)}</span>
      <button class="edit" data-rename="${p.id}" title="Đổi tên" aria-label="Đổi tên">✏️</button>
    </div>`).join('');

  const wDates = Object.keys(curWeights()).sort();
  const weeks = Object.keys(curMeasure()).sort();
  const wNow = wDates.length ? curWeights()[wDates[wDates.length - 1]] : null;
  const wDiff = wDates.length > 1 ? wNow - curWeights()[wDates[0]] : null;
  const eo = weeks.map((w) => curMeasure()[w].eo).filter((v) => v != null);
  const eoDiff = eo.length > 1 ? eo[eo.length - 1] - eo[0] : null;
  const stats = [
    [wNow != null ? `${fmtNum(wNow)} kg` : '—', 'Cân hiện tại'],
    [wDiff != null ? `${fmtDelta(Math.round(wDiff * 10) / 10)} kg` : '—', 'Cân so với ban đầu'],
    [eoDiff != null ? `${fmtDelta(Math.round(eoDiff * 10) / 10)} cm` : '—', 'Eo so với ban đầu'],
    [weeks.length, 'Tuần đã log'],
  ];
  $('#stats').innerHTML = stats.map(([v, l], i) => `<div class="stat" style="--i:${i}"><b>${v}</b><span>${l}</span></div>`).join('');
}

/* ---------- measurements ---------- */
function fillMeasureForm() {
  const wk = mondayOf($('#mWeek').value || today());
  $('#mWeekHint').textContent = weekLabel(wk);
  const row = curMeasure()[wk] || {};
  for (const m of METRICS) $(`#m_${m.key}`).value = row[m.key] ?? '';
}
function renderMeasure(keepForm) {
  if (!keepForm) fillMeasureForm();
  const data = curMeasure();
  const weeks = Object.keys(data).sort();

  $('#mCharts').innerHTML = METRICS.map((m) => `
    <div class="chart-card">
      <header><h3>${m.label}</h3><span class="now" id="now_${m.key}"></span></header>
      <div class="chart" id="chart_${m.key}"></div>
    </div>`).join('');
  for (const m of METRICS) {
    const pts = weeks.filter((w) => data[w][m.key] != null).map((w) => ({ d: w, v: data[w][m.key] }));
    drawChart($(`#chart_${m.key}`), pts, 'cm');
    if (pts.length) {
      const d = pts.length > 1 ? pts[pts.length - 1].v - pts[0].v : null;
      $(`#now_${m.key}`).innerHTML = `${fmtNum(pts[pts.length - 1].v)} cm${deltaHTML(d, true)}`;
    }
  }

  if (!weeks.length) {
    $('#mTable').innerHTML = '<div class="empty">Chưa có tuần nào. Nhập số đo đầu tiên ở trên nhé!</div>';
    return;
  }
  const prev = {};
  const rows = weeks.map((w) => {
    const cells = METRICS.map((m) => {
      const v = data[w][m.key];
      if (v == null) return '<td>—</td>';
      const d = prev[m.key] != null ? v - prev[m.key] : null;
      prev[m.key] = v;
      return `<td><span class="v">${fmtNum(v)}</span>${deltaHTML(d)}</td>`;
    }).join('');
    return `<tr><td>${fmtShort(w)} – ${fmtFull(addDays(w, 6))}</td>${cells}
      <td><button class="icon-btn" data-edit="${w}" title="Sửa">✏️</button>
      <button class="icon-btn" data-del="${w}" title="Xoá">🗑️</button></td></tr>`;
  });
  $('#mTable').innerHTML = `<table><thead><tr><th>Tuần</th>${METRICS.map((m) => `<th>${m.label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.reverse().join('')}</tbody></table>`;
}

/* ---------- weight ---------- */
function renderWeight() {
  const data = curWeights();
  const dates = Object.keys(data).sort();
  const from = weightRange ? addDays(today(), -weightRange) : '';
  drawChart($('#wChart'), dates.filter((d) => d >= from).map((d) => ({ d, v: data[d] })), 'kg');

  if (!dates.length) {
    $('#wTable').innerHTML = '<div class="empty">Chưa có ngày nào. Bước lên cân thôi!</div>';
    return;
  }
  const rows = dates.map((d, i) => `<tr><td>${fmtFull(d)}</td>
    <td><span class="v">${fmtNum(data[d])} kg</span></td>
    <td>${i ? deltaHTML(data[d] - data[dates[i - 1]], true) : '—'}</td>
    <td><button class="icon-btn" data-del="${d}" title="Xoá">🗑️</button></td></tr>`);
  $('#wTable').innerHTML = `<table><thead><tr><th>Ngày</th><th>Cân nặng</th><th>So với lần trước</th><th></th></tr></thead>
    <tbody>${rows.reverse().join('')}</tbody></table>`;
}

/* ---------- workout ---------- */
let wkDayId = null;   // ngày tập đang chọn
let draft = null;     // program đang tạo/sửa
let logDraft = null;  // { exerciseId: [{ w, reps, rpe }] } đang nhập
let logCtx = null;
function wk() {
  const all = (state.workouts ||= {});
  return (all[pid()] ||= { programs: [], logs: {}, active: null });
}
const curProgram = () => wk().programs.find((p) => p.id === wk().active) || wk().programs[0] || null;
const curDay = (prog) => (prog && (prog.days.find((d) => d.id === wkDayId) || prog.days[0])) || null;
const logKey = (prog, day, date) => `${prog.id}|${day.id}|${date}`;
const blankDay = () => ({ id: uid(), name: '', exercises: [{ id: uid(), name: '' }] });
function dayLogs(prog, day) {
  const pre = `${prog.id}|${day.id}|`;
  return Object.keys(wk().logs).filter((k) => k.startsWith(pre))
    .map((k) => ({ date: k.slice(pre.length), entries: wk().logs[k] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
const topSet = (sets) => (sets || []).filter((s) => s.w != null).reduce((a, b) => (!a || b.w > a.w ? b : a), null);
const setText = (s) => `${s.w != null ? `${fmtNum(s.w, 3)} kg` : '—'}${s.reps != null ? ` × ${s.reps}` : ''}${s.rpe != null ? ` @${fmtNum(s.rpe)}` : ''}`;

/* gợi ý buổi tới (progressive overload) */
const DEFAULT_REPS = [8, 12];
// tóm tắt một buổi của một bài: mức tạ nặng nhất, và trong các set ở mức đó thì số reps thấp nhất, RPE cao nhất
function sessionSummary(sets) {
  const done = (sets || []).filter((s) => s.w != null && s.reps != null);
  if (!done.length) return null;
  const w = Math.max(...done.map((s) => s.w));
  const top = done.filter((s) => s.w === w);
  const rpes = top.map((s) => s.rpe).filter((v) => v != null);
  return { w, reps: Math.min(...top.map((s) => s.reps)), rpe: rpes.length ? Math.max(...rpes) : null, sets: top.length };
}
// "Double progression": giữ tạ và thêm rep cho tới trần của khoảng reps, đủ trần ở mọi set thì tăng tạ và quay về sàn.
// RPE quyết định nhanh hay chậm. logs: các buổi trước ngày đang nhập, cũ → mới.
function suggestNext(x, logs) {
  const hist = logs.map((l) => sessionSummary(l.entries[x.id])).filter(Boolean);
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  const { w, reps, rpe } = last;
  const lo = x.lo || DEFAULT_REPS[0], hi = Math.max(x.hi || DEFAULT_REPS[1], lo);
  // bước tăng tạ: theo cài đặt của bài; không có thì lấy lần đổi tạ nhỏ nhất từng ghi
  const gaps = [...new Set(hist.map((s) => s.w))].sort((a, b) => a - b).map((v, i, all) => v - all[i - 1]).filter((g) => g >= 0.25);
  const inc = x.inc || (gaps.length ? Math.min(...gaps) : w >= 20 ? 2.5 : 1);
  const out = (nw, nr, why) => ({ w: Math.round(nw * 1000) / 1000, reps: nr, sets: last.sets, why });
  const atRpe = rpe != null ? ` ở RPE ${fmtNum(rpe)}` : '';

  const recent = hist.slice(-3);
  if (recent.length === 3 && recent.every((s) => s.w === w) && reps <= recent[0].reps && reps < hi && rpe != null && rpe >= 9) {
    return out(Math.max(inc, Math.round((w * 0.9) / inc) * inc), Math.max(lo, reps),
      `3 buổi liền chưa thêm được rep ở ${fmtNum(w, 3)} kg: lùi khoảng 10% rồi lên lại`);
  }
  if (rpe != null && rpe >= 9.5) {
    if (reps < lo && w > inc) return out(w - inc, lo, `chưa tới ${lo} reps mà đã RPE ${fmtNum(rpe)}: giảm tạ để về lại khoảng ${lo}–${hi} reps`);
    return out(w, reps, `RPE ${fmtNum(rpe)} là sát giới hạn: giữ nguyên, làm lại cho chắc`);
  }
  if (reps >= hi) {
    return out(w + inc * (rpe != null && rpe <= 6 ? 2 : 1), lo, `mọi set đã đủ ${hi} reps${atRpe}: tăng tạ, quay về ${lo} reps`);
  }
  const was = last.sets > 1 ? `set thấp nhất buổi trước được ${reps} reps` : `buổi trước được ${reps} reps`;
  return out(w, Math.min(hi, reps + (rpe != null && rpe <= 7 ? 2 : 1)), `${was}${atRpe}: giữ tạ, thêm rep cho tới ${hi} rồi mới tăng`);
}
function nextHTML(x, logs) {
  const s = suggestNext(x, logs);
  if (!s) return '';
  return `<div class="next">🎯 <b>${fmtNum(s.w, 3)} kg × ${s.reps}</b>${s.sets > 1 ? ` × ${s.sets} set` : ''}
    <button type="button" class="chip" data-fill="${x.id}">Điền</button><small>${esc(s.why)}</small></div>`;
}

function renderEditor() {
  const el = $('#wkEditor');
  el.hidden = !draft;
  if (!draft) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <h3>${draft.id ? 'Sửa program' : 'Program mới'}</h3>
    <div class="editor-top">
      <label class="field"><span>Tên program</span>
        <input type="text" id="pgName" maxlength="40" placeholder="vd: Push Pull Legs" value="${esc(draft.name)}"></label>
      <label class="field narrow"><span>Số ngày tập</span>
        <input type="number" id="pgDays" min="1" max="7" step="1" value="${draft.days.length}"></label>
    </div>
    <div class="day-grid">${draft.days.map((d, i) => `
      <div class="day-card" data-dayidx="${i}">
        <input type="text" class="day-name" maxlength="30" placeholder="Tên ngày ${i + 1} (vd: Push)" value="${esc(d.name)}">
        <ol>${d.exercises.map((x, j) => `<li><div>
          <input type="text" class="ex-name" data-ex="${j}" maxlength="40" placeholder="Tên bài tập" value="${esc(x.name)}">
          <button type="button" class="icon-btn" data-rmex="${j}" title="Bỏ bài này">✕</button></div>
          <div class="ex-goal"><span class="grp">Reps
            <input type="number" data-ex="${j}" data-g="lo" min="1" max="100" step="1" inputmode="numeric" placeholder="${DEFAULT_REPS[0]}" value="${x.lo ?? ''}" aria-label="Reps tối thiểu">
            –
            <input type="number" data-ex="${j}" data-g="hi" min="1" max="100" step="1" inputmode="numeric" placeholder="${DEFAULT_REPS[1]}" value="${x.hi ?? ''}" aria-label="Reps tối đa"></span>
            <span class="grp">Mỗi lần tăng
            <input type="number" data-ex="${j}" data-g="inc" min="0" max="100" step="0.001" inputmode="decimal" placeholder="tự tính" value="${x.inc ?? ''}" aria-label="Bước tăng tạ">
            kg</span></div></li>`).join('')}</ol>
        <button type="button" class="chip" data-addex>＋ Thêm bài</button>
      </div>`).join('')}</div>
    <div class="btn-row">
      <button class="btn primary" type="submit">Lưu program!</button>
      <button class="btn" type="button" id="pgCancel">Huỷ</button>
    </div>`;
}
function saveProgram() {
  const name = draft.name.trim();
  if (!name) { alert('Đặt tên cho program đã nhé!'); $('#pgName').focus(); return; }
  const prog = {
    id: draft.id || uid(),
    name,
    days: draft.days.map((d, i) => ({
      id: d.id,
      name: d.name.trim() || `Ngày ${i + 1}`,
      exercises: d.exercises.filter((x) => x.name.trim()).map((x) => {
        const goal = {};
        if (x.lo) goal.lo = x.lo;
        if (x.hi) goal.hi = Math.max(x.hi, x.lo || 1);
        if (x.inc) goal.inc = x.inc;
        return { id: x.id, name: x.name.trim(), ...goal };
      }),
    })),
  };
  if (!prog.days.some((d) => d.exercises.length)) { alert('Thêm ít nhất một bài tập nhé!'); return; }
  const w = wk();
  const i = w.programs.findIndex((p) => p.id === prog.id);
  if (i >= 0) w.programs[i] = prog; else w.programs.push(prog);
  w.active = prog.id;
  draft = null; logCtx = null;
  save(); renderWorkout(); pow("LET'S GO!");
}

function loadLogDraft(prog, day) {
  const date = $('#wkDate').value || today();
  const ctx = [pid(), prog.id, day.id, date].join('|');
  if (ctx === logCtx && logDraft) return;
  logCtx = ctx;
  const saved = wk().logs[logKey(prog, day, date)] || {};
  logDraft = {};
  for (const x of day.exercises) logDraft[x.id] = saved[x.id] ? saved[x.id].map((s) => ({ ...s })) : [{}];
}
function renderLogRows(prog, day) {
  loadLogDraft(prog, day);
  if (!day.exercises.length) {
    $('#wkRows').innerHTML = '<div class="empty">Ngày này chưa có bài nào. Bấm ✏️ ở trên để thêm bài nhé!</div>';
    return;
  }
  const date = $('#wkDate').value || today();
  const before = dayLogs(prog, day).filter((l) => l.date < date);
  const prev = before[before.length - 1];
  const LABELS = { w: 'kg', reps: 'reps', rpe: 'RPE' };
  const cell = (x, i, f, s, p, attrs) => `<td data-label="${LABELS[f]}"><input type="number" data-ex="${x.id}" data-set="${i}" data-f="${f}" ${attrs}
    value="${s[f] ?? ''}" placeholder="${p[f] ?? '—'}"></td>`;
  // trên điện thoại mỗi bài thành một thẻ: dòng .addset-row thay cho nút "＋ set" ở cột cuối
  const rows = day.exercises.map((x) => logDraft[x.id].map((s, i) => {
    const p = (prev && prev.entries[x.id] && prev.entries[x.id][i]) || {};
    return `<tr${i ? '' : ' class="ex-first"'}><td class="ex-name">${i ? `<span class="setno">↳ set ${i + 1}</span>` : esc(x.name) + nextHTML(x, before)}</td>
      ${cell(x, i, 'w', s, p, 'step="0.001" min="0" max="1000" inputmode="decimal"')}
      ${cell(x, i, 'reps', s, p, 'step="1" min="0" max="999" inputmode="numeric"')}
      ${cell(x, i, 'rpe', s, p, 'step="0.5" min="1" max="10" inputmode="decimal"')}
      <td class="set-act">${i ? `<button type="button" class="icon-btn" data-rmset="${x.id}|${i}" title="Bỏ set này">✕</button>`
    : `<button type="button" class="chip" data-addset="${x.id}">＋ set</button>`}</td></tr>`;
  }).join('') + `<tr class="addset-row"><td colspan="5"><button type="button" class="chip" data-addset="${x.id}">＋ Thêm set</button></td></tr>`).join('');
  $('#wkRows').innerHTML = `<table class="wk-table"><thead><tr><th>Tên bài</th><th>Số tạ (kg)</th><th>Reps</th><th>RPE</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}
function renderWorkoutCharts(prog, day) {
  const logs = dayLogs(prog, day);
  $('#wkChartSub').textContent = `${prog.name} · ${day.name} — mức tạ nặng nhất của mỗi buổi`;
  $('#wkCharts').innerHTML = day.exercises.map((x) => `
    <div class="chart-card">
      <header><h3>${esc(x.name)}</h3><span class="now" id="wknow_${x.id}"></span></header>
      <div class="chart" id="wkc_${x.id}"></div>
    </div>`).join('');
  for (const x of day.exercises) {
    const pts = [];
    for (const l of logs) {
      const top = topSet(l.entries[x.id]);
      if (!top) continue;
      const n = l.entries[x.id].length;
      const note = [top.reps != null ? `${top.reps} reps` : '', top.rpe != null ? `RPE ${fmtNum(top.rpe)}` : '', n > 1 ? `${n} set` : ''].filter(Boolean).join(' · ');
      pts.push({ d: l.date, v: top.w, note });
    }
    drawChart($(`#wkc_${x.id}`), pts, 'kg', 3);
    if (pts.length) {
      const d = pts.length > 1 ? pts[pts.length - 1].v - pts[0].v : null;
      $(`#wknow_${x.id}`).innerHTML = `${fmtNum(pts[pts.length - 1].v, 3)} kg${deltaHTML(d, true, 3)}`;
    }
  }

  if (!logs.length) {
    $('#wkHistory').innerHTML = '<div class="empty">Chưa có buổi nào. Tập xong nhớ log nhé!</div>';
    return;
  }
  const prevTop = {};
  const rows = logs.map((l) => {
    const cells = day.exercises.map((x) => {
      const sets = l.entries[x.id];
      if (!sets) return '<td>—</td>';
      const top = topSet(sets);
      const d = top && prevTop[x.id] != null ? top.w - prevTop[x.id] : null;
      if (top) prevTop[x.id] = top.w;
      return `<td><span class="v sets">${sets.map(setText).join('<br>')}</span>${deltaHTML(d, false, 3)}</td>`;
    }).join('');
    return `<tr><td>${fmtFull(l.date)}</td>${cells}
      <td><button class="icon-btn" data-edit="${l.date}" title="Sửa">✏️</button>
      <button class="icon-btn" data-del="${l.date}" title="Xoá">🗑️</button></td></tr>`;
  });
  $('#wkHistory').innerHTML = `<table><thead><tr><th>Ngày</th>${day.exercises.map((x) => `<th>${esc(x.name)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.reverse().join('')}</tbody></table>`;
}
function renderWorkout() {
  const w = wk(), prog = curProgram(), day = curDay(prog);
  $('#wkPrograms').innerHTML = w.programs.map((p) => `<button class="chip big ${prog && p.id === prog.id ? 'active' : ''}" data-prog="${p.id}">${esc(p.name)}</button>`).join('')
    + '<button class="chip big add" data-newprog>＋ Program mới</button>';
  $('#wkProgActions').hidden = !prog || !!draft;
  $('#pgMove').textContent = `⇄ Chuyển sang ${state.profiles.find((p) => p.id !== pid()).name}`;
  $('#wkEmpty').hidden = !!prog || !!draft;
  renderEditor();
  for (const id of ['#wkLogPanel', '#wkChartPanel', '#wkHistPanel']) $(id).hidden = !day;
  if (!day) return;
  $('#wkDays').innerHTML = prog.days.map((d) => `<button type="button" class="chip big ${d.id === day.id ? 'active' : ''}" data-wkday="${d.id}">${esc(d.name)}</button>`).join('');
  renderLogRows(prog, day);
  renderWorkoutCharts(prog, day);
}
function initWorkoutEvents() {
  const pane = $('#tab-workout'), editor = $('#wkEditor');
  $('#wkDate').value = today();

  pane.addEventListener('click', (e) => {
    const t = e.target;
    const prog = curProgram(), day = curDay(prog);
    let el;
    if ((el = t.closest('[data-prog]'))) {
      wk().active = el.dataset.prog; wkDayId = null; draft = null;
      save(); renderWorkout();
    } else if (t.closest('[data-newprog]')) {
      draft = { name: '', days: [blankDay(), blankDay(), blankDay()] };
      renderWorkout(); $('#pgName').focus();
    } else if (t.closest('#pgEdit')) {
      draft = JSON.parse(JSON.stringify(prog));
      renderWorkout(); editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (t.closest('#pgDelete')) {
      if (!confirm(`Xoá program “${prog.name}” cùng toàn bộ lịch sử tập của nó?`)) return;
      const w = wk();
      w.programs = w.programs.filter((p) => p.id !== prog.id);
      for (const k of Object.keys(w.logs)) if (k.startsWith(`${prog.id}|`)) delete w.logs[k];
      w.active = null; wkDayId = null;
      save(); renderWorkout();
    } else if (t.closest('#pgMove')) {
      const other = state.profiles.find((p) => p.id !== pid());
      if (!confirm(`Chuyển program “${prog.name}” cùng toàn bộ lịch sử tập sang hồ sơ ${other.name}?`)) return;
      const from = wk();
      const to = (state.workouts[other.id] ||= { programs: [], logs: {}, active: null });
      from.programs = from.programs.filter((p) => p.id !== prog.id);
      to.programs.push(prog);
      for (const k of Object.keys(from.logs)) {
        if (k.startsWith(`${prog.id}|`)) { to.logs[k] = from.logs[k]; delete from.logs[k]; }
      }
      from.active = null; to.active = prog.id;
      state.active = other.id;
      wkDayId = null; logCtx = null;
      save(); renderAll(); pow('ĐÃ CHUYỂN!');
    } else if ((el = t.closest('[data-wkday]'))) {
      wkDayId = el.dataset.wkday; renderWorkout();
    } else if ((el = t.closest('[data-addset]'))) {
      const sets = logDraft[el.dataset.addset];
      sets.push({ ...sets[sets.length - 1] });
      renderLogRows(prog, day);
    } else if ((el = t.closest('[data-fill]'))) {
      const x = day.exercises.find((e2) => e2.id === el.dataset.fill);
      const s = suggestNext(x, dayLogs(prog, day).filter((l) => l.date < ($('#wkDate').value || today())));
      if (!s) return;
      logDraft[x.id] = Array.from({ length: s.sets }, () => ({ w: s.w, reps: s.reps }));
      renderLogRows(prog, day);
    } else if ((el = t.closest('[data-rmset]'))) {
      const [ex, i] = el.dataset.rmset.split('|');
      logDraft[ex].splice(+i, 1);
      renderLogRows(prog, day);
    }
  });

  /* trình soạn program */
  const dayOf = (node) => draft.days[+node.closest('.day-card').dataset.dayidx];
  editor.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'pgName') draft.name = t.value;
    else if (t.classList.contains('day-name')) dayOf(t).name = t.value;
    else if (t.classList.contains('ex-name')) dayOf(t).exercises[+t.dataset.ex].name = t.value;
    else if (t.dataset.g) {
      const v = parseFloat(t.value);
      dayOf(t).exercises[+t.dataset.ex][t.dataset.g] = v > 0 ? v : undefined;
    }
  });
  editor.addEventListener('change', (e) => {
    if (e.target.id !== 'pgDays') return;
    const n = Math.max(1, Math.min(7, Math.round(+e.target.value) || 1));
    const cut = draft.days.slice(n);
    if (cut.some((d) => d.exercises.some((x) => x.name.trim())) && !confirm('Giảm số ngày sẽ bỏ các ngày cuối đã nhập. Tiếp tục?')) {
      e.target.value = draft.days.length;
      return;
    }
    draft.days.length = Math.min(draft.days.length, n);
    while (draft.days.length < n) draft.days.push(blankDay());
    renderEditor();
  });
  const addExercise = (card, after) => {
    const list = draft.days[+card.dataset.dayidx].exercises;
    const at = after == null ? list.length : after + 1;
    list.splice(at, 0, { id: uid(), name: '' });
    renderEditor();
    $(`.day-card[data-dayidx="${card.dataset.dayidx}"] .ex-name[data-ex="${at}"]`).focus();
  };
  editor.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('[data-addex]'))) addExercise(el.closest('.day-card'));
    else if ((el = t.closest('[data-rmex]'))) { dayOf(el).exercises.splice(+el.dataset.rmex, 1); renderEditor(); }
    else if (t.closest('#pgCancel')) { draft = null; renderWorkout(); }
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (e.target.classList.contains('ex-name')) addExercise(e.target.closest('.day-card'), +e.target.dataset.ex);
  });
  editor.addEventListener('submit', (e) => { e.preventDefault(); saveProgram(); });

  /* log buổi tập */
  $('#wkDate').addEventListener('change', renderWorkout);
  $('#wkRows').addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    const v = parseFloat(t.value);
    logDraft[t.dataset.ex][+t.dataset.set][t.dataset.f] = isNaN(v) ? undefined : Math.round(v * 1000) / 1000;
  });
  $('#wkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const prog = curProgram(), day = curDay(prog);
    const entries = {};
    for (const x of day.exercises) {
      const sets = (logDraft[x.id] || []).filter((s) => s.w != null || s.reps != null);
      if (sets.length) entries[x.id] = sets;
    }
    if (!Object.keys(entries).length) { alert('Nhập số tạ hoặc reps cho ít nhất một bài nhé!'); return; }
    wk().logs[logKey(prog, day, $('#wkDate').value)] = entries;
    logCtx = null;
    save(); renderWorkout(); pow();
  });
  $('#wkHistory').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    const prog = curProgram(), day = curDay(prog);
    if (ed) {
      $('#wkDate').value = ed.dataset.edit;
      renderWorkout();
      $('#wkLogPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (del && confirm(`Xoá buổi tập ngày ${fmtFull(del.dataset.del)}?`)) {
      delete wk().logs[logKey(prog, day, del.dataset.del)];
      logCtx = null;
      save(); renderWorkout();
    }
  });
}

/* ---------- diet ---------- */
const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const DIET_UNITS = ['g', 'quả', 'cái', 'khẩu phần'];
let dietItems = [{}];  // thành phần đang nhập: [{ name, qty, unit }]
let dietEdit = null;   // { date, id } của bữa đang sửa
let dietRange = 30;
const curDiet = () => ((state.diet ||= {})[pid()] ||= {});
// bữa lưu trước khi có đơn vị chỉ có số gram ở trường g
const itemQty = (it) => it.qty ?? it.g;
const itemUnit = (it) => it.unit || 'g';
const otherProfile = () => state.profiles.find((p) => p.id !== pid());
let copySrc = null;    // { date, meal } đang copy sang hồ sơ kia
// copy một bữa sang hồ sơ kia: mở hộp chỉnh lượng trước khi lưu, vì hai người thường ăn cùng món nhưng khác lượng
function openCopyDialog(date, meal) {
  const other = otherProfile();
  copySrc = { date, meal };
  $('#copyForm').innerHTML = `
    <h2>Copy sang ${esc(other.name)}</h2>
    <p class="sub"><b>${esc(meal.name)}</b> · ${fmtFull(date)}<br>Chỉnh lại lượng ${esc(other.name)} ăn. Món nào không ăn thì để 0.</p>
    <div class="copy-list">${meal.items.map((it, i) => `
      <label class="copy-row"><span>${esc(it.name)}</span>
        <input type="number" data-i="${i}" step="0.1" min="0" max="10000" inputmode="decimal" value="${itemQty(it)}">
        <b>${esc(itemUnit(it))}</b></label>`).join('')}</div>
    <div class="btn-row">
      <button class="btn primary" type="submit">Lưu cho ${esc(other.name)}!</button>
      <button class="btn" type="button" id="copyCancel">Huỷ</button>
    </div>`;
  $('#copyDlg').showModal();
}
function saveCopy() {
  const { date, meal } = copySrc;
  const other = otherProfile();
  const items = meal.items
    .map((it, i) => ({ name: it.name, qty: parseFloat($(`#copyForm [data-i="${i}"]`).value), unit: itemUnit(it) }))
    .filter((it) => it.qty > 0);
  if (!items.length) { alert('Cần ít nhất một món có số lượng lớn hơn 0 nhé!'); return; }
  const theirs = (((state.diet ||= {})[other.id] ||= {})[date]) || [];
  if (theirs.some((m) => m.name === meal.name) && !confirm(`${other.name} đã có món “${meal.name}” ngày ${fmtFull(date)}. Vẫn thêm một bản nữa?`)) return;
  const copy = { id: uid(), name: meal.name, items };
  if (meal.note) copy.note = meal.note;
  state.diet[other.id][date] = [...theirs, copy];
  copySrc = null;
  $('#copyDlg').close();
  save(); pow('ĐÃ COPY!');
}
function removeMeal(date, id) {
  const data = curDiet();
  data[date] = (data[date] || []).filter((m) => m.id !== id);
  if (!data[date].length) delete data[date];
}
function resetDietForm() {
  dietEdit = null;
  dietItems = [{}];
  $('#dtName').value = $('#dtNote').value = '';
}
function renderDietItems() {
  $('#dtItems').innerHTML = dietItems.map((it, i) => `
    <div class="item-row">
      <input type="text" data-item="${i}" data-f="name" maxlength="40" placeholder="Đồ gì (vd: Ức gà)" value="${esc(it.name ?? '')}">
      <input type="number" data-item="${i}" data-f="qty" step="0.1" min="0" max="10000" inputmode="decimal" placeholder="Số lượng" value="${it.qty ?? ''}">
      <select data-item="${i}" data-f="unit" aria-label="Đơn vị">${DIET_UNITS.map((u) => `<option${u === itemUnit(it) ? ' selected' : ''}>${u}</option>`).join('')}</select>
      <button type="button" class="icon-btn" data-rmitem="${i}" title="Bỏ dòng này">✕</button>
    </div>`).join('');
}
function renderDiet() {
  renderDietItems();
  $('#dtSubmit').textContent = dietEdit ? 'Cập nhật bữa ăn!' : 'Lưu bữa ăn!';
  $('#dtCancel').hidden = !dietEdit;
  $$('#dtRange .chip').forEach((c) => c.classList.toggle('active', +c.dataset.range === dietRange));

  const data = curDiet();
  const from = dietRange ? addDays(today(), -dietRange) : '';
  const dates = Object.keys(data).filter((d) => d >= from).sort().reverse();
  if (!dates.length) {
    $('#dtLog').innerHTML = `<div class="empty">${Object.keys(data).length ? 'Không có bữa nào trong khoảng này.' : 'Chưa có bữa nào. Ăn gì log nấy nhé!'}</div>`;
    return;
  }
  const copyLabel = `⇄ Copy sang ${esc(otherProfile().name)}`;
  const card = (d, m) => `<article class="meal-card" data-date="${d}" data-id="${m.id}">
    <header><h4>${esc(m.name)}</h4><span>
      <button class="icon-btn" data-edit title="Sửa">✏️</button>
      <button class="icon-btn" data-del title="Xoá">🗑️</button></span></header>
    <ul>${m.items.map((it) => `<li><span>${esc(it.name)}</span><b>${fmtNum(itemQty(it))} ${esc(itemUnit(it))}</b></li>`).join('')}</ul>
    ${m.note ? `<p class="meal-note">📝 ${esc(m.note)}</p>` : ''}
    <button class="chip meal-copy" data-copy>${copyLabel}</button></article>`;
  $('#dtLog').innerHTML = dates.map((d) => `<div class="week-block"><h3>${WEEKDAYS[parseISO(d).getDay()]} · ${fmtFull(d)}</h3>
    <div class="meal-grid">${data[d].map((m) => card(d, m)).join('')}</div></div>`).join('');
}
function initDietEvents() {
  const form = $('#dietForm');
  $('#copyForm').addEventListener('submit', (e) => { e.preventDefault(); saveCopy(); });
  $('#copyForm').addEventListener('click', (e) => { if (e.target.closest('#copyCancel')) $('#copyDlg').close(); });
  $('#dtDate').value = today();

  const addItem = (after) => {
    const at = after == null ? dietItems.length : after + 1;
    dietItems.splice(at, 0, {});
    renderDietItems();
    $(`#dtItems [data-item="${at}"][data-f="name"]`).focus();
  };
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.item == null) return;
    const it = dietItems[+t.dataset.item];
    if (t.dataset.f === 'name') it.name = t.value;
    else if (t.dataset.f === 'unit') it.unit = t.value;
    else { const v = parseFloat(t.value); it.qty = isNaN(v) ? undefined : v; }
  });
  form.addEventListener('click', (e) => {
    let el;
    if (e.target.closest('#dtAddItem')) addItem();
    else if ((el = e.target.closest('[data-rmitem]'))) {
      dietItems.splice(+el.dataset.rmitem, 1);
      if (!dietItems.length) dietItems.push({});
      renderDietItems();
    } else if (e.target.closest('#dtCancel')) { resetDietForm(); renderDiet(); }
  });
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (e.target.dataset.item != null) addItem(+e.target.dataset.item);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#dtDate').value;
    const name = $('#dtName').value.trim();
    if (!name) { alert('Nhập tên món ăn đã nhé!'); $('#dtName').focus(); return; }
    const rows = dietItems.filter((it) => (it.name || '').trim() || it.qty != null);
    if (!rows.length) { alert('Thêm ít nhất một thành phần (đồ gì + số lượng) nhé!'); return; }
    if (rows.some((it) => !(it.name || '').trim() || !(it.qty > 0))) { alert('Mỗi thành phần cần đủ tên và số lượng nhé!'); return; }
    const meal = { id: dietEdit ? dietEdit.id : uid(), name, items: rows.map((it) => ({ name: it.name.trim(), qty: it.qty, unit: itemUnit(it) })) };
    const note = $('#dtNote').value.trim();
    if (note) meal.note = note;

    const data = curDiet();
    let at = -1;
    if (dietEdit) {
      if (dietEdit.date === date) at = (data[date] || []).findIndex((m) => m.id === dietEdit.id);
      if (at < 0) removeMeal(dietEdit.date, dietEdit.id);
    }
    const list = (data[date] ||= []);
    if (at >= 0) list[at] = meal; else list.push(meal);
    // bữa nằm ngoài khoảng đang xem thì mở rộng ra để thấy ngay bữa vừa lưu
    if (dietRange && date < addDays(today(), -dietRange)) dietRange = 0;
    resetDietForm();
    save(); renderDiet(); pow();
  });

  $('#dtRange').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    dietRange = +c.dataset.range;
    renderDiet();
  });
  $('#dtLog').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), cp = e.target.closest('[data-copy]');
    if (!ed && !del && !cp) return;
    const { date, id } = e.target.closest('.meal-card').dataset;
    const meal = (curDiet()[date] || []).find((m) => m.id === id);
    if (!meal) return;
    if (cp) openCopyDialog(date, meal);
    else if (ed) {
      dietEdit = { date, id };
      dietItems = meal.items.map((it) => ({ name: it.name, qty: itemQty(it), unit: itemUnit(it) }));
      $('#dtDate').value = date;
      $('#dtName').value = meal.name;
      $('#dtNote').value = meal.note || '';
      renderDiet();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (confirm(`Xoá món “${meal.name}” ngày ${fmtFull(date)}?`)) {
      removeMeal(date, id);
      if (dietEdit && dietEdit.id === id) resetDietForm();
      save(); renderDiet();
    }
  });
}

/* ---------- photos ---------- */
let photoUrls = [];
let photosByWeek = {};
function photoFig(p) {
  const url = URL.createObjectURL(p.blob);
  photoUrls.push(url);
  return `<figure class="photo" data-src="${url}"><img src="${url}" alt="Ảnh ${weekLabel(p.week)}" loading="lazy">
    <button class="icon-btn" data-delphoto="${p.id}" title="Xoá ảnh">🗑️</button></figure>`;
}
async function renderPhotos() {
  $('#pWeekHint').textContent = weekLabel(mondayOf($('#pWeek').value || today()));
  let list = [];
  try {
    list = (await photoTx('readonly', (s) => s.index('profile').getAll(pid()))) || [];
  } catch (e) {
    $('#gallery').innerHTML = '<div class="empty">Trình duyệt không cho lưu ảnh ở chế độ này.</div>';
    return;
  }
  photoUrls.forEach((u) => URL.revokeObjectURL(u));
  photoUrls = [];
  photosByWeek = {};
  for (const p of list) (photosByWeek[p.week] ||= []).push(p);
  const weeks = Object.keys(photosByWeek).sort();

  $('#gallery').innerHTML = weeks.length
    ? weeks.slice().reverse().map((w) => `<div class="week-block"><h3>${weekLabel(w)}</h3>
        <div class="strip">${photosByWeek[w].map(photoFig).join('')}</div></div>`).join('')
    : '<div class="empty">Chưa có ảnh nào. Chụp tấm đầu tiên để sau này nhìn lại nào!</div>';

  $('#comparePanel').hidden = weeks.length < 2;
  if (weeks.length >= 2) {
    const a = $('#cmpA'), b = $('#cmpB');
    const keepA = weeks.includes(a.value) ? a.value : weeks[0];
    const keepB = weeks.includes(b.value) ? b.value : weeks[weeks.length - 1];
    const opts = weeks.map((w) => `<option value="${w}">${weekLabel(w)}</option>`).join('');
    a.innerHTML = opts; b.innerHTML = opts;
    a.value = keepA; b.value = keepB;
    renderCompare();
  }
}
function renderCompare() {
  const side = (w, title) => `<div class="side"><h4>${title} · ${fmtShort(w)}</h4>${(photosByWeek[w] || []).map(photoFig).join('')}</div>`;
  $('#compare').innerHTML = side($('#cmpA').value, 'Trước') + side($('#cmpB').value, 'Sau');
}

/* ---------- tabs & render ---------- */
const RENDER = { measure: renderMeasure, weight: renderWeight, workout: renderWorkout, diet: renderDiet, photos: renderPhotos };
let activeTab = 'measure';
function showTab(name) {
  activeTab = name;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tabpane').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  RENDER[name]();
}
// keepForms: vẽ lại phần hiển thị nhưng không đụng tới số đang nhập dở (dùng khi dữ liệu đổi do đồng bộ)
function renderAll(keepForms) {
  renderHeader();
  RENDER[activeTab](keepForms);
}

/* ---------- backup ---------- */
const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
async function exportData() {
  const photos = (await photoTx('readonly', (s) => s.getAll())) || [];
  const out = { version: 1, state, photos: [] };
  for (const p of photos) out.photos.push({ profile: p.profile, week: p.week, createdAt: p.createdAt, data: await blobToDataURL(p.blob) });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = `fitness-journey-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importData(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  if (!data || !data.state || !Array.isArray(data.state.profiles)) { alert('File sao lưu không hợp lệ.'); return; }
  if (!confirm(`Khôi phục sẽ THAY THẾ toàn bộ dữ liệu hiện tại${onSaved ? ', kể cả trên các máy khác đang đồng bộ' : ''}. Tiếp tục?`)) return;
  const photos = [];
  for (const p of data.photos || []) {
    photos.push({ uid: uid(), profile: p.profile, week: p.week, createdAt: p.createdAt, blob: await (await fetch(p.data)).blob() });
  }
  await photoTx('readwrite', (s) => { s.clear(); photos.forEach((p) => s.add(p)); });
  state = data.state;
  draft = null; logCtx = null; wkDayId = null;
  resetDietForm();
  save();
  renderAll();
  pow('XONG!');
}

/* ---------- events ---------- */
function init() {
  $('#mFields').innerHTML = METRICS.map((m) => `
    <label class="field"><span>${m.label} (cm)</span>
      <input type="number" id="m_${m.key}" step="0.1" min="1" max="300" inputmode="decimal" placeholder="—"></label>`).join('');
  $('#mWeek').value = $('#wDate').value = $('#pWeek').value = today();

  $('#profiles').addEventListener('click', (e) => {
    const rn = e.target.closest('[data-rename]');
    if (rn) {
      const p = state.profiles.find((x) => x.id === rn.dataset.rename);
      const name = prompt('Tên hiển thị:', p.name);
      if (name && name.trim()) { p.name = name.trim().slice(0, 20); save(); renderHeader(); }
      return;
    }
    const el = e.target.closest('.profile');
    if (el && el.dataset.id !== pid()) { state.active = el.dataset.id; draft = null; wkDayId = null; resetDietForm(); save(); renderAll(); }
  });
  $('#profiles').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('profile')) { e.preventDefault(); e.target.click(); }
  });

  $('.tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) showTab(t.dataset.tab); });

  $('#mWeek').addEventListener('change', fillMeasureForm);
  $('#measureForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const row = {};
    for (const m of METRICS) {
      const v = parseFloat($(`#m_${m.key}`).value);
      if (!isNaN(v)) row[m.key] = v;
    }
    if (!Object.keys(row).length) { alert('Nhập ít nhất một số đo nhé!'); return; }
    curMeasure()[mondayOf($('#mWeek').value)] = row;
    save(); renderAll(); pow();
  });
  $('#mTable').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      $('#mWeek').value = ed.dataset.edit;
      fillMeasureForm();
      $('#measureForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (del && confirm(`Xoá số đo ${weekLabel(del.dataset.del)}?`)) {
      delete curMeasure()[del.dataset.del];
      save(); renderAll();
    }
  });

  $('#weightForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = parseFloat($('#wValue').value);
    if (isNaN(v)) return;
    curWeights()[$('#wDate').value] = v;
    $('#wValue').value = '';
    save(); renderAll(); pow();
  });
  $('#wRange').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    weightRange = +c.dataset.range;
    $$('#wRange .chip').forEach((x) => x.classList.toggle('active', x === c));
    renderWeight();
  });
  $('#wTable').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del && confirm(`Xoá cân nặng ngày ${fmtFull(del.dataset.del)}?`)) {
      delete curWeights()[del.dataset.del];
      save(); renderAll();
    }
  });

  $('#pWeek').addEventListener('change', () => { $('#pWeekHint').textContent = weekLabel(mondayOf($('#pWeek').value || today())); });
  $('#pFiles').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const week = mondayOf($('#pWeek').value || today());
    try {
      const items = [];
      for (const f of files) items.push({ uid: uid(), profile: pid(), week, createdAt: Date.now(), blob: await shrinkImage(f) });
      await photoTx('readwrite', (s) => { items.forEach((p) => s.add(p)); });
      if (onSaved) onSaved();
      await renderPhotos();
      pow('CHEESE!');
    } catch (err) {
      alert('Không lưu được ảnh: ' + (err && err.message ? err.message : err));
    }
  });
  $('#tab-photos').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delphoto]');
    if (del) {
      e.stopPropagation();
      if (confirm('Xoá ảnh này?')) { await photoTx('readwrite', (s) => s.delete(+del.dataset.delphoto)); if (onSaved) onSaved(); renderPhotos(); }
      return;
    }
    const fig = e.target.closest('.photo');
    if (fig) { $('#lightbox img').src = fig.dataset.src; $('#lightbox').hidden = false; }
  });
  $('#cmpA').addEventListener('change', renderCompare);
  $('#cmpB').addEventListener('change', renderCompare);
  $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#lightbox').hidden = true; });

  $('#exportBtn').addEventListener('click', exportData);
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); });

  initWorkoutEvents();
  initDietEvents();

  // chỉ vẽ lại biểu đồ khi đổi bề rộng, để không xoá số đang nhập dở (vd: bàn phím điện thoại bật lên)
  let rz, lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(rz);
    rz = setTimeout(() => $$('.tabpane.active .chart').forEach((h) => h._chart && drawChart(h, h._chart.pts, h._chart.unit, h._chart.digits)), 200);
  });

  renderHeader();
  const start = location.hash.slice(1);
  showTab(RENDER[start] ? start : activeTab);
}
init();
