'use strict';

/* Đồng bộ dữ liệu giữa các máy.
   Mỗi máy vẫn giữ bản đầy đủ (localStorage + IndexedDB) nên app chạy được khi mất mạng.
   Trên máy chủ, mỗi mục dữ liệu là một dòng key → value. Máy nhớ "snapshot" (chữ ký của từng mục
   ở lần đồng bộ gần nhất); mục nào khác snapshot là thay đổi của máy này và sẽ được đẩy lên. */

const SYNC = { snap: 'fj-sync-snapshot', cursor: 'fj-sync-cursor', user: 'fj-sync-user', pending: 'fj-sync-photos-pending' };
const SYNC_TYPES = ['profiles', 'm', 'w', 'diet', 'prog', 'log', 'photo'];
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const lsGet = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch (e) { return fallback; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/* ---------- chữ ký của một mục ---------- */
// JSON với khoá đã sắp xếp, vì máy chủ (jsonb) không giữ thứ tự khoá
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));
function hashStr(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const sig = (v) => hashStr(canon(v));

/* ---------- state ↔ các dòng key/value ---------- */
// state.active và program đang chọn là lựa chọn riêng của từng máy nên không đồng bộ
function flattenState(s) {
  const out = { profiles: s.profiles };
  const each = (prefix, byProfile) => {
    for (const p in byProfile || {}) for (const k in byProfile[p]) out[`${prefix}|${p}|${k}`] = byProfile[p][k];
  };
  each('m', s.measurements);
  each('w', s.weights);
  each('diet', s.diet);
  for (const p in s.workouts || {}) {
    for (const prog of s.workouts[p].programs) out[`prog|${p}|${prog.id}`] = prog;
    for (const k in s.workouts[p].logs) out[`log|${p}|${k}`] = s.workouts[p].logs[k];
  }
  return out;
}
function applyRemote(key, value, deleted) {
  const [type, p, ...rest] = key.split('|');
  const id = rest.join('|');
  const put = (table) => { if (deleted) delete table[id]; else table[id] = value; };
  if (type === 'profiles') {
    if (!deleted && Array.isArray(value)) state.profiles = value;
  } else if (type === 'm') put((state.measurements[p] ||= {}));
  else if (type === 'w') put((state.weights[p] ||= {}));
  else if (type === 'diet') put(((state.diet ||= {})[p] ||= {}));
  else {
    const w = ((state.workouts ||= {})[p] ||= { programs: [], logs: {}, active: null });
    if (type === 'log') { put(w.logs); return; }
    const i = w.programs.findIndex((x) => x.id === id);
    if (deleted) { if (i >= 0) w.programs.splice(i, 1); }
    else if (i >= 0) w.programs[i] = value;
    else w.programs.push(value);
  }
}
const photoMeta = (ph) => ({ profile: ph.profile, week: ph.week, createdAt: ph.createdAt });
// photos = null khi không đọc được IndexedDB: lúc đó không được suy ra là ảnh đã bị xoá
async function currentRecords() {
  const records = flattenState(state);
  let photos = null;
  try { photos = (await photoTx('readonly', (s) => s.getAll())) || []; } catch (e) { /* bỏ qua phần ảnh */ }
  for (const ph of photos || []) if (ph.uid && ph.uploaded) records[`photo|${ph.uid}`] = photoMeta(ph);
  return { records, photos };
}

/* ---------- máy chủ (Supabase) ---------- */
const loadScript = (src) => new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = res;
  s.onerror = () => rej(new Error('Không tải được thư viện đồng bộ'));
  document.head.append(s);
  setTimeout(() => rej(new Error('Không tải được thư viện đồng bộ')), 15000);
});
async function supabaseBackend(cfg) {
  if (!window.supabase) await loadScript(SUPABASE_JS);
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  let userId = null;
  const check = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };
  const path = (id) => `${userId}/${id}.jpg`;
  const asUser = (u) => { userId = u.id; return { id: u.id, email: u.email }; };
  return {
    async getUser() {
      const { session } = check(await sb.auth.getSession());
      return session ? asUser(session.user) : null;
    },
    async signIn(email, password) {
      return asUser(check(await sb.auth.signInWithPassword({ email, password })).user);
    },
    async signOut() { await sb.auth.signOut(); userId = null; },
    async pull(since) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        let q = sb.from('entries').select('key,value,deleted,updated_at').order('updated_at').order('key').range(from, from + 999);
        if (since) q = q.gte('updated_at', since);
        const page = check(await q);
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    },
    async push(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        check(await sb.from('entries').upsert(rows.slice(i, i + 500).map((r) => ({ user_id: userId, ...r })), { onConflict: 'user_id,key' }));
      }
    },
    async uploadPhoto(id, blob) { check(await sb.storage.from('photos').upload(path(id), blob, { contentType: 'image/jpeg', upsert: true })); },
    async downloadPhoto(id) { return check(await sb.storage.from('photos').download(path(id))); },
    async removePhotos(ids) { check(await sb.storage.from('photos').remove(ids.map(path))); },
  };
}

/* ---------- các bước đồng bộ ---------- */
let backend = null;
let syncUser = null;
let syncing = false, syncQueued = false, syncTimer = null, syncError = null;

async function pullRemote() {
  const snap = lsGet(SYNC.snap, {}), pending = lsGet(SYNC.pending, {}), cursor = lsGet(SYNC.cursor, null);
  const { records: cur, photos } = await currentRecords();
  // lùi 10 giây để không sót dòng máy khác ghi gần như cùng lúc
  const rows = await backend.pull(cursor ? new Date(Date.parse(cursor) - 10000).toISOString() : null);
  let newest = cursor, stateChanged = false, photosChanged = false;
  for (const r of rows) {
    if (!newest || Date.parse(r.updated_at) > Date.parse(newest)) newest = r.updated_at;
    const type = r.key.split('|')[0];
    if (!SYNC_TYPES.includes(type)) continue;
    if (type === 'photo' && r.deleted) delete pending[r.key.slice(6)];
    const mine = r.key in cur ? sig(cur[r.key]) : undefined;
    if (mine !== snap[r.key]) continue; // máy này có thay đổi chưa đẩy lên: giữ bản của máy này
    const theirs = r.deleted ? undefined : sig(r.value);
    if (theirs === mine) continue;
    if (type === 'photo') {
      const id = r.key.slice(6);
      if (!r.deleted) { pending[id] = r.value; continue; } // tải ảnh về ở bước sau, xong mới ghi snapshot
      const ph = (photos || []).find((x) => x.uid === id);
      if (ph) { await photoTx('readwrite', (s) => s.delete(ph.id)); photosChanged = true; }
      delete snap[r.key];
      continue;
    }
    applyRemote(r.key, r.value, r.deleted);
    stateChanged = true;
    if (r.deleted) delete snap[r.key]; else snap[r.key] = theirs;
  }
  if (stateChanged) localStorage.setItem(LS_KEY, JSON.stringify(state));
  lsSet(SYNC.snap, snap);
  lsSet(SYNC.pending, pending);
  if (newest) lsSet(SYNC.cursor, newest);
  if (stateChanged || photosChanged) softRender();
}

async function uploadNewPhotos() {
  let list;
  try { list = (await photoTx('readonly', (s) => s.getAll())) || []; } catch (e) { return; }
  for (const ph of list) {
    if (ph.uploaded) continue;
    ph.uid ||= uid();
    await backend.uploadPhoto(ph.uid, ph.blob);
    ph.uploaded = true;
    // chỉ ghi lại nếu ảnh chưa bị xoá trong lúc đang tải lên
    await photoTx('readwrite', (s) => { const g = s.get(ph.id); g.onsuccess = () => { if (g.result) s.put(ph); }; return g; });
  }
}

async function pushLocal() {
  const snap = lsGet(SYNC.snap, {});
  const { records: cur, photos } = await currentRecords();
  const rows = [], sigs = {};
  for (const k in cur) {
    sigs[k] = sig(cur[k]);
    if (snap[k] !== sigs[k]) rows.push({ key: k, value: cur[k], deleted: false });
  }
  for (const k in snap) {
    if (k in cur || (k.startsWith('photo|') && !photos)) continue;
    rows.push({ key: k, value: null, deleted: true });
  }
  if (!rows.length) return;
  await backend.push(rows);
  const gone = rows.filter((r) => r.deleted && r.key.startsWith('photo|')).map((r) => r.key.slice(6));
  if (gone.length) await backend.removePhotos(gone).catch(() => {});
  const after = lsGet(SYNC.snap, {});
  for (const r of rows) { if (r.deleted) delete after[r.key]; else after[r.key] = sigs[r.key]; }
  lsSet(SYNC.snap, after);
}

async function downloadPendingPhotos() {
  const ids = Object.keys(lsGet(SYNC.pending, {}));
  if (!ids.length) return;
  const have = new Set(((await photoTx('readonly', (s) => s.getAll())) || []).map((ph) => ph.uid));
  let got = 0;
  for (const id of ids) {
    const meta = lsGet(SYNC.pending, {})[id];
    if (!meta) continue;
    if (!have.has(id)) {
      let blob;
      try { blob = await backend.downloadPhoto(id); } catch (e) { continue; } // thử lại ở lần đồng bộ sau
      await photoTx('readwrite', (s) => s.add({ uid: id, uploaded: true, ...photoMeta(meta), blob }));
      got++;
    }
    const snap = lsGet(SYNC.snap, {}), left = lsGet(SYNC.pending, {});
    snap[`photo|${id}`] = sig(photoMeta(meta));
    delete left[id];
    lsSet(SYNC.snap, snap);
    lsSet(SYNC.pending, left);
  }
  if (got) softRender();
}

async function syncNow() {
  if (!backend || !syncUser) return;
  if (syncing) { syncQueued = true; return; }
  syncing = true;
  setSyncStatus('busy');
  try {
    do {
      syncQueued = false;
      await pullRemote();
      await uploadNewPhotos();
      await pushLocal();
      await downloadPendingPhotos();
    } while (syncQueued);
    syncError = null;
    setSyncStatus('ok');
  } catch (e) {
    syncError = e && e.message ? e.message : String(e);
    setSyncStatus('error');
  } finally {
    syncing = false;
  }
}
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 800);
}

/* ---------- giao diện ---------- */
let renderRetry = null;
// dữ liệu đổi do máy khác: vẽ lại, nhưng chờ nếu đang gõ dở để không giật mất con trỏ
function softRender() {
  clearTimeout(renderRetry);
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { renderRetry = setTimeout(softRender, 2000); return; }
  renderAll(true);
}
function setSyncStatus(kind) {
  const pill = $('#syncPill');
  pill.dataset.kind = kind;
  const [icon, text] = kind === 'busy' ? ['⏳', 'Đang đồng bộ…']
    : kind === 'ok' ? ['☁️', `Đã đồng bộ ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`]
      : ['⚠️', 'Chưa đồng bộ được'];
  pill.innerHTML = `<span>${icon}</span> <span class="st">${text}</span>`;
  $('#syncText').textContent = `${icon} ${text}`;
}
function showAuth(message) {
  $('#auth').hidden = false;
  $('#authError').hidden = !message;
  $('#authError').textContent = message || '';
}
const AUTH_ERRORS = {
  'Invalid login credentials': 'Sai email hoặc mật khẩu.',
  'Email not confirmed': 'Email này chưa được xác nhận.',
};

async function startSync(user) {
  const known = lsGet(SYNC.user, null);
  if (known && known !== user.id) {
    if (!confirm('Máy này đang giữ dữ liệu của một tài khoản khác. Xoá dữ liệu trên máy và tải dữ liệu của tài khoản này về?')) {
      await backend.signOut();
      showAuth();
      return;
    }
    state = defaultState();
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    await photoTx('readwrite', (s) => s.clear()).catch(() => {});
    for (const k of [SYNC.snap, SYNC.cursor, SYNC.pending]) localStorage.removeItem(k);
    draft = null; logCtx = null; wkDayId = null;
    resetDietForm();
    renderAll();
  }
  if (!localStorage.getItem(SYNC.snap)) {
    // lần đầu đồng bộ: tên hồ sơ mặc định không tính là thay đổi của máy này, để không đè lên tên đã đặt ở máy khác
    const mine = sig(state.profiles);
    lsSet(SYNC.snap, mine === sig(defaultState().profiles) ? { profiles: mine } : {});
  }
  lsSet(SYNC.user, user.id);
  syncUser = user;
  $('#auth').hidden = true;
  $('#syncBar').hidden = false;
  $('#syncEmail').textContent = user.email || '';
  await syncNow();
}

// kết nối máy chủ và dùng lại phiên đăng nhập cũ nếu có
async function connect() {
  const known = lsGet(SYNC.user, null);
  try {
    backend ||= window.FJ_BACKEND || await supabaseBackend(window.FJ_CONFIG);
    const user = await backend.getUser();
    if (user) await startSync(user); else showAuth();
  } catch (e) {
    syncError = e && e.message ? e.message : String(e);
    if (known) { $('#syncBar').hidden = false; setSyncStatus('error'); } // đã từng đăng nhập: cho dùng tạm khi mất mạng
    else showAuth('Không kết nối được máy chủ đồng bộ. Kiểm tra mạng rồi thử lại nhé.');
  }
}
const syncTick = () => {
  if (document.hidden) return;
  if (syncUser) syncNow();
  else if ($('#auth').hidden) connect();
};

function initSync() {
  if (DEMO || !(window.FJ_BACKEND || (window.FJ_CONFIG && window.FJ_CONFIG.supabaseUrl))) return;
  if (!lsGet(SYNC.user, null)) showAuth();
  $('#footNote').textContent = 'Dữ liệu lưu trên máy này và tự đồng bộ giữa các máy khi có mạng.';
  onSaved = scheduleSync;

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#authSubmit');
    btn.disabled = true;
    $('#authError').hidden = true;
    try {
      backend ||= window.FJ_BACKEND || await supabaseBackend(window.FJ_CONFIG);
      const user = await backend.signIn($('#authEmail').value.trim(), $('#authPass').value);
      $('#authPass').value = '';
      await startSync(user);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      showAuth(AUTH_ERRORS[msg] || `Không đăng nhập được: ${msg}`);
    } finally {
      btn.disabled = false;
    }
  });
  $('#syncPill').addEventListener('click', () => {
    if (syncError) alert(`Lần đồng bộ gần nhất bị lỗi:\n${syncError}\n\nDữ liệu vẫn được lưu trên máy này. App sẽ thử đồng bộ lại ngay bây giờ.`);
    syncTick();
  });
  $('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('Đăng xuất khỏi máy này?')) return;
    await syncNow();
    if (backend) await backend.signOut().catch(() => {});
    syncUser = null;
    $('#syncBar').hidden = true;
    showAuth();
  });

  document.addEventListener('visibilitychange', syncTick);
  window.addEventListener('online', syncTick);
  setInterval(syncTick, 60000);
  connect();
}
initSync();
