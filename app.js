'use strict';

// 고칠 때마다 올리는 버전 (탭바 오른쪽 아래, 설정 맨 아래에 표시)
const APP_VERSION = 'v1.23';

const STORE_KEY = 'macho:v1';
const MEALS = [
  { id: 'breakfast', name: '아침' },
  { id: 'lunch', name: '점심' },
  { id: 'dinner', name: '저녁' },
  { id: 'snack', name: '간식' },
];
const MACROS = [
  { id: 'c', name: '탄수화물', short: '탄' },
  { id: 'p', name: '단백질', short: '단' },
  { id: 'f', name: '지방', short: '지' },
];

// ---------- 저장소 ----------
function defaultState() {
  return {
    goals: { c: 250, p: 120, f: 60 },
    customFoods: [],
    log: {},        // { 'YYYY-MM-DD': [entry] }
    recent: [],     // food 객체 스냅샷 (최근 사용 순)
    barcodes: {},   // { 바코드: food } 한 번 찾거나 입력한 제품
    notify: false,
    widget: false,   // 아이폰 Scriptable 잠금화면 위젯 사용
    widgetSent: '', // 마지막으로 위젯에 보낸 값
    autoSync: true, // 기록이 바뀌면 바로 Scriptable을 열어 반영
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    return s ? { ...defaultState(), ...s } : defaultState();
  } catch { return defaultState(); }
}
let state = load();
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  updateNotification();
}

// ---------- 유틸 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const kcalOf = (m) => m.c * 4 + m.p * 4 + m.f * 9;
const goalKcal = () => r0(kcalOf(state.goals));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function dateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = keyToDate(k); d.setDate(d.getDate() + n); return dateKey(d); }
const todayKey = () => dateKey(new Date());
function labelFor(k) {
  const t = todayKey();
  if (k === t) return '오늘';
  if (k === addDays(t, -1)) return '어제';
  if (k === addDays(t, 1)) return '내일';
  const d = keyToDate(k);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
}

// 음식(1회 제공량 기준) × 그램 → 영양소
function scale(food, grams) {
  const r = grams / food.g;
  return { k: food.k * r, c: food.c * r, p: food.p * r, f: food.f * r };
}
function totalsFor(k) {
  const t = { k: 0, c: 0, p: 0, f: 0 };
  for (const e of state.log[k] || []) {
    const v = scale(e.food, e.grams);
    t.k += v.k; t.c += v.c; t.p += v.p; t.f += v.f;
  }
  return t;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 1800);
}

// ---------- 오늘 화면 ----------
let currentDay = todayKey();
const RING_LEN = 2 * Math.PI * 52;

function renderToday() {
  $('#date-label').textContent = labelFor(currentDay);
  const t = totalsFor(currentDay);
  const goal = goalKcal();
  const left = goal - t.k;

  $('#kcal-left').textContent = Math.abs(r0(left)).toLocaleString();
  $('#kcal-left-label').textContent = left >= 0 ? '남음' : '초과';
  $('#kcal-left').classList.toggle('over-text', left < 0);
  $('#kcal-eaten').textContent = r0(t.k).toLocaleString();
  $('#kcal-goal').textContent = goal.toLocaleString();
  const ring = $('#ring-fg');
  ring.style.strokeDasharray = RING_LEN;
  ring.style.strokeDashoffset = RING_LEN * (1 - Math.min(t.k / (goal || 1), 1));
  ring.classList.toggle('over', left < 0);
  $('.ring').classList.toggle('over', left < 0);
  // 링 끝 점 + 펄스 위치 (svg가 -90° 돌아가 있어서 3시 방향이 시작점)
  const a = Math.min(t.k / (goal || 1), 1) * 2 * Math.PI;
  for (const id of ['#ring-end', '#ring-pulse']) {
    const c = $(id);
    c.setAttribute('cx', 60 + 52 * Math.cos(a));
    c.setAttribute('cy', 60 + 52 * Math.sin(a));
    c.style.display = t.k > 0 ? '' : 'none';
  }

  for (const m of MACROS) {
    const el = $(`.macro[data-m="${m.id}"]`);
    const g = state.goals[m.id] || 0;
    el.querySelector('.mv').textContent = `${r0(t[m.id])} / ${r0(g)}g`;
    el.querySelector('.bar i').style.width = `${Math.min((t[m.id] / (g || 1)) * 100, 100)}%`;
    el.querySelector('.bar i').classList.toggle('zero', !(t[m.id] > 0));
    el.classList.toggle('over', t[m.id] > g * 1.05);
  }

  renderWidgetButton();

  const entries = state.log[currentDay] || [];
  $('#meals').innerHTML = MEALS.map((meal) => {
    const items = entries.filter((e) => e.meal === meal.id);
    const kcal = items.reduce((s, e) => s + scale(e.food, e.grams).k, 0);
    return `<section class="card meal">
      <div class="meal-head">
        <div class="meal-title"><h2>${meal.name}</h2>${items.length ? `<span class="meal-count">${items.length}개</span>` : ''}</div>
        <div class="meal-right"><span class="meal-kcal"><b>${r0(kcal).toLocaleString()}</b> kcal</span>
        <button class="add-btn" data-add="${meal.id}" aria-label="${meal.name} 추가">＋</button></div>
      </div>
      ${items.length ? '<div class="meal-items">' : ''}${items.map((e) => {
        const v = scale(e.food, e.grams);
        return `<div class="entry" data-entry="${e.id}">
          <div><div class="entry-name">${esc(e.food.n)}</div>
          <div class="entry-sub">${r0(e.grams)}g · 탄 ${r1(v.c)} · 단 ${r1(v.p)} · 지 ${r1(v.f)}${e.food.miss?.length ? ' · <span class="miss">일부 정보 없음</span>' : ''}</div></div>
          <div class="entry-kcal">${r0(v.k)} kcal</div></div>`;
      }).join('')}${items.length ? '</div>' : ''}
    </section>`;
  }).join('');
}

$('#prev-day').onclick = () => { currentDay = addDays(currentDay, -1); renderToday(); };
$('#next-day').onclick = () => { currentDay = addDays(currentDay, 1); renderToday(); };
$('#date-label').onclick = () => { currentDay = todayKey(); renderToday(); };
$('#meals').onclick = (ev) => {
  const add = ev.target.closest('[data-add]');
  if (add) return openSearch(add.dataset.add);
  const ent = ev.target.closest('[data-entry]');
  if (ent) {
    const e = (state.log[currentDay] || []).find((x) => x.id === ent.dataset.entry);
    if (e) openAmount(e.food, e.meal, e);
  }
};

// ---------- 시트 공통 ----------
function openSheet(id) { $$('.sheet').forEach((s) => (s.hidden = s.id !== id)); }
function closeSheets() { stopScan(); $$('.sheet').forEach((s) => (s.hidden = true)); }
$$('[data-close]').forEach((b) => (b.onclick = closeSheets));

// ---------- 검색 ----------
let pendingMeal = 'breakfast';
let searchTab = 'recent';

function openSearch(meal) {
  pendingMeal = meal;
  $('#search-title').textContent = `${MEALS.find((m) => m.id === meal).name}에 추가`;
  $('#search-input').value = '';
  setSearchTab(state.recent.length ? 'recent' : 'all');
  openSheet('search-sheet');
  loadDB();
}
function setSearchTab(tab) {
  searchTab = tab;
  $$('#search-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderFoodList();
}
// ---------- 음식 DB (식약처 음식 + 농진청 원재료, 약 2만 개) ----------
let DB = null, dbLoading = null;
const norm = (s) => String(s).toLowerCase().replace(/[\s,()·_\-/[\]]/g, '');
function loadDB() {
  dbLoading ||= fetch('fooddb.json').then((r) => r.json()).then((d) => {
    DB = d.items.map((r) => ({ key: norm(r[0]), r }));
    if (!$('#search-sheet').hidden) renderFoodList();
  }).catch(() => { dbLoading = null; });
  return dbLoading;
}
// DB 한 줄(100g 기준) → 앱 음식(1회 제공량 기준)
function dbFood(r) {
  const [n, kind, g, k, c, p, f] = r;
  const x = g / 100;
  const miss = [['c', c], ['p', p], ['f', f]].filter(([, v]) => v == null).map(([m]) => m);
  return { n, u: kind === '원재료' ? '100g' : '1회 제공량', g, k: k * x, c: (c || 0) * x, p: (p || 0) * x, f: (f || 0) * x, src: kind, miss };
}
// "닭가슴살" → "닭고기, 가슴살"처럼 글자가 순서대로 들어 있으면 찾음
function isSubseq(q, s) {
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
}
function searchFoods(raw) {
  const words = raw.split(/\s+/).map(norm).filter(Boolean);
  const q = words.join('');
  const local = [...state.customFoods, ...BASE_FOODS].filter((f) => words.every((w) => norm(f.n).includes(w)));
  if (!DB) return local;
  const hits = [];
  for (const it of DB) {
    let score;
    if (words.every((w) => it.key.includes(w))) score = it.key.startsWith(words[0]) ? 0 : 1;
    else if (q.length >= 2 && isSubseq(q, it.key)) score = 3;
    else continue;
    if (it.r[1] !== '음식' && it.r[1] !== '원재료') score += 2; // 프랜차이즈는 뒤로
    if (it.r[4] == null || it.r[6] == null) score += 1;        // 탄·지 없는 건 뒤로
    hits.push([score + it.key.length / 1000, it.r]);
  }
  hits.sort((x, y) => x[0] - y[0]);
  return [...local, ...hits.slice(0, 80).map(([, r]) => dbFood(r))];
}

function foodPool() {
  const q = $('#search-input').value.trim();
  if (q) return searchFoods(q);
  if (searchTab === 'recent') return state.recent;
  if (searchTab === 'mine') return state.customFoods;
  return BASE_FOODS;
}
let listedFoods = [];
const macroText = (f, m, label) => (f.miss?.includes(m) ? `${label} <span class="miss">?</span>` : `${label} ${r1(f[m])}`);
function renderFoodList() {
  listedFoods = foodPool();
  const q = $('#search-input').value.trim();
  const emptyMsg = { recent: '아직 기록한 음식이 없어요', mine: '직접 입력한 음식이 여기에 저장돼요', all: '검색 결과가 없어요' }[searchTab];
  const dbNote = !q && searchTab === 'all' ? '<div class="empty">위에서 검색하면 음식·원재료 약 2만 개에서 찾아요</div>' : '';
  $('#food-list').innerHTML = listedFoods.length
    ? listedFoods.map((f, i) => `<button class="food-item" data-i="${i}">
        <div><div class="entry-name">${esc(f.n)}</div>
        <div class="entry-sub">${f.src ? `<span class="src">${esc(f.src)}</span>` : ''}${esc(f.u || '')} (${r0(f.g)}g) · ${macroText(f, 'c', '탄')} · ${macroText(f, 'p', '단')} · ${macroText(f, 'f', '지')}</div></div>
        <div class="entry-kcal">${r0(f.k)} kcal</div></button>`).join('') + dbNote
    : `<div class="empty">${q ? (DB ? '검색 결과가 없어요. 아래에서 직접 입력해 보세요.' : '음식 목록을 불러오는 중이에요…') : emptyMsg}</div>`;
}
let searchTimer;
$('#search-input').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderFoodList, 150); };
$('#search-tabs').onclick = (ev) => { const b = ev.target.closest('button'); if (b) setSearchTab(b.dataset.tab); };
$('#food-list').onclick = (ev) => {
  const b = ev.target.closest('[data-i]');
  if (b) openAmount(listedFoods[+b.dataset.i], pendingMeal);
};

// ---------- 양 선택 ----------
let amountCtx = null; // { food, meal, entry }

function openAmount(food, meal, entry = null) {
  amountCtx = { food, meal, entry };
  $('#amount-title').textContent = food.n;
  const unitName = !food.u || food.u === '1회 제공량' ? '1회' : food.u;
  $('#amount-unit').innerHTML = `1회 제공량: ${food.u && food.u !== '1회 제공량' ? esc(food.u) + ' = ' : ''}${r0(food.g)}g · ${r0(food.k)} kcal`
    + (food.miss?.length ? `<br><span class="miss">${food.miss.map((m) => ({ c: '탄수화물', p: '단백질', f: '지방' })[m]).join('·')} 정보가 없어서 0으로 계산돼요</span>` : '')
    + (food.src === '바코드' ? '<br><span class="small">누구나 고칠 수 있는 공개 DB(Open Food Facts) 정보예요. 포장지와 다르면 아래 "영양 정보 고치기"를 눌러 주세요.</span>' : '');
  $('#amount-g').value = r1(entry ? entry.grams : food.g);
  $('#serving-chips').innerHTML = [0.5, 1, 1.5, 2, 3].map((x) => `<button data-x="${x}">${esc(unitName)}${x === 1 ? '' : ' ×' + x}</button>`).join('');
  $('#meal-select').innerHTML = MEALS.map((m) => `<button data-meal="${m.id}" class="${m.id === meal ? 'active' : ''}">${m.name}</button>`).join('');
  $('#amount-save').textContent = entry ? '수정' : '추가';
  $('#amount-delete').hidden = !entry;
  updateAmountPreview();
  openSheet('amount-sheet');
}
function updateAmountPreview() {
  const g = parseFloat($('#amount-g').value) || 0;
  const v = scale(amountCtx.food, g);
  $('#amount-preview').innerHTML = `
    <div><b>${r0(v.k)}</b><span>kcal</span></div>
    <div><b style="color:var(--c)">${r1(v.c)}</b><span>탄수화물</span></div>
    <div><b style="color:var(--p)">${r1(v.p)}</b><span>단백질</span></div>
    <div><b style="color:var(--f)">${r1(v.f)}</b><span>지방</span></div>`;
  const x = g / amountCtx.food.g;
  $$('#serving-chips button').forEach((b) => b.classList.toggle('active', Math.abs(+b.dataset.x - x) < 0.001));
}
$('#amount-g').oninput = updateAmountPreview;
$('#serving-chips').onclick = (ev) => {
  const b = ev.target.closest('[data-x]');
  if (!b) return;
  $('#amount-g').value = r1(amountCtx.food.g * +b.dataset.x);
  updateAmountPreview();
};
$('#meal-select').onclick = (ev) => {
  const b = ev.target.closest('[data-meal]');
  if (!b) return;
  amountCtx.meal = b.dataset.meal;
  $$('#meal-select button').forEach((x) => x.classList.toggle('active', x === b));
};
$('#amount-save').onclick = () => {
  const grams = parseFloat($('#amount-g').value);
  if (!(grams > 0)) return toast('양을 입력해 주세요');
  const { food, meal, entry } = amountCtx;
  if (entry) {
    entry.grams = grams; entry.meal = meal;
  } else {
    (state.log[currentDay] ||= []).push({ id: uid(), meal, grams, food: { ...food } });
    state.recent = [{ ...food }, ...state.recent.filter((f) => f.n !== food.n)].slice(0, 30);
  }
  save(); closeSheets(); renderToday();
  toast(entry ? '수정했어요' : `${food.n} 추가!`);
  autoSync();
};
$('#amount-delete').onclick = () => {
  const { entry } = amountCtx;
  state.log[currentDay] = (state.log[currentDay] || []).filter((e) => e.id !== entry.id);
  save(); closeSheets(); renderToday(); toast('삭제했어요');
  autoSync();
};

// ---------- 직접 입력 ----------
let pendingBarcode = null;
let editCtx = null; // 고치기: { entry, meal }
function openCustom(name, barcode = null, prefill = null) {
  pendingBarcode = barcode;
  $('#cf-hint').textContent = prefill
    ? '포장지 영양성분표의 숫자로 고쳐 주세요. 고친 내용은 저장되고, 이미 기록한 것도 같이 고쳐져요.'
    : barcode
      ? `바코드 ${barcode} 제품을 처음 봤어요. 포장지 영양성분표를 보고 입력하면 다음부터 이 바코드로 바로 나와요.`
      : '식품 포장지 영양성분표를 보고 입력하세요.';
  $('#cf-name').value = name;
  ['#cf-unit', '#cf-c', '#cf-p', '#cf-f', '#cf-k'].forEach((s) => ($(s).value = ''));
  $('#cf-g').value = 100;
  if (prefill) {
    const v = (x) => String(Math.round(x * 10) / 10);
    $('#cf-unit').value = prefill.u && prefill.u !== '1회 제공량' ? prefill.u : '';
    $('#cf-g').value = v(prefill.g);
    $('#cf-c').value = prefill.miss?.includes('c') ? '' : v(prefill.c);
    $('#cf-p').value = prefill.miss?.includes('p') ? '' : v(prefill.p);
    $('#cf-f').value = prefill.miss?.includes('f') ? '' : v(prefill.f);
    $('#cf-k').value = v(prefill.k);
  }
  $('#cf-submit').textContent = prefill ? '고치기' : '다음';
  openSheet('custom-sheet');
}
$('#amount-edit').onclick = () => {
  const { food, entry, meal } = amountCtx;
  editCtx = { entry, meal };
  openCustom(food.n, food.bc || null, food);
};
// 같은 음식(바코드가 같거나, 바코드가 없으면 이름이 같은 것)의 저장본·기록을 새 정보로 바꿈
function replaceFood(old, food) {
  const same = (f) => (old.bc ? f.bc === old.bc : !f.bc && f.n === old.n);
  for (const day of Object.values(state.log)) for (const e of day) if (same(e.food)) e.food = { ...food };
  state.recent = state.recent.map((f) => (same(f) ? { ...food } : f));
}
$('#custom-btn').onclick = () => { editCtx = null; openCustom($('#search-input').value.trim()); };
$('#cf-submit').onclick = () => {
  const name = $('#cf-name').value.trim();
  if (!name) return toast('이름을 입력해 주세요');
  const num = (s) => parseFloat($(s).value) || 0;
  const food = { n: name, u: $('#cf-unit').value.trim() || '1회', g: num('#cf-g') || 100, c: num('#cf-c'), p: num('#cf-p'), f: num('#cf-f') };
  food.k = $('#cf-k').value ? num('#cf-k') : r0(kcalOf(food));
  if (pendingBarcode) { food.bc = pendingBarcode; state.barcodes[pendingBarcode] = food; }
  if ($('#cf-save').checked) {
    state.customFoods = [food, ...state.customFoods.filter((f) => f.n !== name && !(food.bc && f.bc === food.bc))];
  }
  if (editCtx) {
    const { entry, meal } = editCtx;
    replaceFood(amountCtx.food, food);
    editCtx = null;
    save();
    if (entry) { closeSheets(); renderToday(); toast('고쳤어요'); return autoSync(); }
    return openAmount(food, meal);
  }
  save();
  openAmount(food, pendingMeal);
};

// ---------- 바코드 ----------
let scanReader = null, zxingLoading = null;
function loadZXing() {
  zxingLoading ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'vendor/zxing.min.js';
    el.onload = resolve;
    el.onerror = () => { zxingLoading = null; reject(new Error('zxing')); };
    document.head.appendChild(el);
  });
  return zxingLoading;
}
function newReader() {
  const hints = new Map();
  const F = ZXing.BarcodeFormat;
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return new ZXing.BrowserMultiFormatReader(hints, 250);
}
const scanStatus = (msg) => ($('#scan-status').textContent = msg);
function stopScan() {
  if (scanReader) { try { scanReader.reset(); } catch {} scanReader = null; }
}
async function openScan() {
  $('#scan-code').value = '';
  scanStatus('카메라를 켜는 중…');
  openSheet('scan-sheet');
  try {
    await loadZXing();
    stopScan();
    scanReader = newReader();
    await scanReader.decodeFromConstraints({ video: { facingMode: 'environment' } }, $('#scan-video'), (result) => {
      if (!result) return;
      stopScan();
      lookupBarcode(result.getText());
    });
    scanStatus('바코드를 가운데 네모에 맞춰 주세요');
  } catch {
    stopScan();
    scanStatus('카메라를 열 수 없어요. 아래 "사진으로 찍어서 찾기"를 눌러 주세요.');
  }
}
$('#scan-btn').onclick = openScan;
$('#scan-photo').onchange = async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  scanStatus('사진에서 바코드를 찾는 중…');
  const url = URL.createObjectURL(file);
  try {
    await loadZXing();
    const result = await newReader().decodeFromImageUrl(url);
    stopScan();
    lookupBarcode(result.getText());
  } catch {
    scanStatus('사진에서 바코드를 못 찾았어요. 바코드가 크고 선명하게 나오게 다시 찍어 주세요.');
  } finally { URL.revokeObjectURL(url); }
};
$('#scan-go').onclick = () => lookupBarcode($('#scan-code').value);

async function lookupBarcode(raw) {
  const code = String(raw).replace(/\D/g, '');
  if (code.length < 8) return scanStatus('바코드 숫자를 8자리 이상 입력해 주세요');
  if (state.barcodes[code]) return openAmount(state.barcodes[code], pendingMeal);
  scanStatus(`${code} 찾는 중…`);
  let name = '';
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ko,brands,nutriments,serving_quantity,product_quantity`);
    const d = await res.json();
    const p = d.status === 1 ? d.product : null;
    const n = p?.nutriments || {};
    name = [p?.brands?.split(',')[0]?.trim(), p?.product_name_ko || p?.product_name].filter(Boolean).join(' ');
    let k100 = n['energy-kcal_100g'];
    if (k100 == null && n.energy_100g != null) k100 = n.energy_100g / 4.184;
    if (p && k100 != null) {
      const sq = Number(p.serving_quantity), pq = Number(p.product_quantity);
      const g = sq > 0 ? sq : pq > 0 && pq <= 500 ? pq : 100;
      const x = g / 100;
      const keys = { c: 'carbohydrates_100g', p: 'proteins_100g', f: 'fat_100g' };
      const food = {
        n: name || `바코드 ${code}`, u: sq > 0 ? '1회 제공량' : pq > 0 && pq <= 500 ? '1개' : '100g', g,
        k: k100 * x, c: (n[keys.c] || 0) * x, p: (n[keys.p] || 0) * x, f: (n[keys.f] || 0) * x,
        src: '바코드', bc: code, miss: Object.keys(keys).filter((m) => n[keys[m]] == null),
      };
      state.barcodes[code] = food;
      save();
      return openAmount(food, pendingMeal);
    }
  } catch {
    toast('인터넷 연결을 확인해 주세요');
  }
  openCustom(name, code);
}

// ---------- 기록 ----------
const METRIC = {
  k: { name: '칼로리', unit: 'kcal', color: 'var(--accent)', goal: () => goalKcal(), better: 'under' },
  c: { name: '탄수화물', unit: 'g', color: 'var(--c)', goal: () => state.goals.c, better: 'under' },
  p: { name: '단백질', unit: 'g', color: 'var(--p)', goal: () => state.goals.p, better: 'over' },
  f: { name: '지방', unit: 'g', color: 'var(--f)', goal: () => state.goals.f, better: 'under' },
};
let weekOffset = 0, trendRange = '30', trendMetric = 'k';
const hasLog = (k) => (state.log[k] || []).length > 0;
const md = (k) => { const d = keyToDate(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const DOW = '일월화수목금토';

function renderHistory() {
  renderWeek();
  renderTrend();
}

// 주 단위 (월~일)
function renderWeek() {
  const t = todayKey();
  const back = (keyToDate(t).getDay() + 6) % 7; // 월요일까지 며칠 전
  const monday = addDays(t, -back + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const goal = goalKcal();
  const totals = days.map(totalsFor);
  const max = Math.max(goal * 1.2, ...totals.map((x) => x.k)) || 1;
  const logged = days.map((k, i) => (hasLog(k) ? totals[i] : null)).filter(Boolean);
  const avg = (key) => (logged.length ? logged.reduce((s, x) => s + x[key], 0) / logged.length : 0);

  $('#week-label').textContent = `${md(days[0])}(월) – ${md(days[6])}(일)`;
  $('#week-sub').textContent = weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난주' : `${-weekOffset}주 전`;
  $('#week-next').disabled = weekOffset >= 0;
  $('#week-bars').innerHTML = days.map((k, i) => {
    const x = totals[i];
    const seg = (key, mult) => `<i style="width:${((x[key] * mult) / max) * 100}%;background:var(--${key})"></i>`;
    const cls = k > t ? ' future' : k === t ? ' today' : '';
    return `<button class="hist-row${cls}" data-day="${k}">
      <span>${md(k)} ${DOW[keyToDate(k).getDay()]}</span>
      <div class="hist-bar">${seg('c', 4)}${seg('p', 4)}${seg('f', 9)}<span class="hist-goal" style="left:${(goal / max) * 100}%"></span></div>
      <span class="hist-kcal">${hasLog(k) ? r0(x.k) : '–'}</span></button>`;
  }).join('') + `
    <div class="legend"><span style="--dot:var(--c)">탄수화물</span><span style="--dot:var(--p)">단백질</span><span style="--dot:var(--f)">지방</span><span>│ 세로선 = 목표</span></div>
    <div class="avg">이번 주 기록한 날 평균 (${logged.length}일)<br>
      <b>${r0(avg('k'))} kcal</b> · 탄 ${r0(avg('c'))}g · 단 ${r0(avg('p'))}g · 지 ${r0(avg('f'))}g</div>`;
}
$('#week-prev').onclick = () => { weekOffset--; renderWeek(); };
$('#week-next').onclick = () => { if (weekOffset < 0) { weekOffset++; renderWeek(); } };
$('#week-bars').onclick = (ev) => {
  const row = ev.target.closest('[data-day]');
  if (!row || row.dataset.day > todayKey()) return;
  currentDay = row.dataset.day;
  showView('today');
};

// 추세 그래프
function trendPoints() {
  const t = todayKey();
  const keys = Object.keys(state.log).filter(hasLog).sort();
  const start = trendRange === 'all' ? (keys[0] || t) : addDays(t, -(+trendRange - 1));
  const span = Math.round((keyToDate(t) - keyToDate(start)) / 864e5) + 1;
  const daily = keys.filter((k) => k >= start && k <= t).map((k) => ({ k, v: totalsFor(k)[trendMetric] }));
  if (span <= 120) return { start, span, weekly: false, pts: daily.map((d) => ({ ...d, x: (keyToDate(d.k) - keyToDate(start)) / 864e5 })) };
  // 기간이 길면 주 평균으로 묶음
  const byWeek = new Map();
  for (const d of daily) {
    const w = Math.floor((keyToDate(d.k) - keyToDate(start)) / 864e5 / 7);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(d);
  }
  const pts = [...byWeek].map(([w, ds]) => ({ k: ds[0].k, x: w * 7 + 3, v: ds.reduce((s, d) => s + d.v, 0) / ds.length, n: ds.length }));
  return { start, span, weekly: true, pts };
}
const niceStep = (max) => { const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw); };

function renderTrend() {
  $$('#trend-range button').forEach((b) => b.classList.toggle('active', b.dataset.range === trendRange));
  $$('#trend-metric button').forEach((b) => b.classList.toggle('active', b.dataset.metric === trendMetric));
  const m = METRIC[trendMetric];
  const goal = m.goal();
  const { start, span, weekly, pts } = trendPoints();
  const box = $('#trend-chart');

  // 요약 숫자 (하루 단위로 계산)
  const t = todayKey();
  const days = Object.keys(state.log).filter((k) => hasLog(k) && k >= start && k <= t);
  const vals = days.map((k) => totalsFor(k)[trendMetric]);
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const hit = vals.filter((v) => (m.better === 'over' ? v >= goal : v <= goal)).length;
  $('#trend-stats').innerHTML = `
    <div><b>${vals.length ? r0(avg).toLocaleString() : '–'}</b><span>평균 ${m.unit}</span></div>
    <div><b>${vals.length}일</b><span>기록한 날</span></div>
    <div><b>${vals.length ? hit + '일' : '–'}</b><span>목표 ${m.better === 'over' ? '이상' : '이하'}</span></div>`;
  $('#trend-note').textContent = (weekly ? '점 하나 = 그 주에 기록한 날의 평균. ' : '점 하나 = 하루. ')
    + '기록하지 않은 날은 비워 둬요. 가로선 = 목표.';

  if (!pts.length) {
    box.innerHTML = '<div class="empty">이 기간에 기록이 없어요. 음식을 기록하면 여기에 그래프가 그려져요.</div>';
    return;
  }

  const W = Math.max(box.clientWidth, 260), H = 170, L = 38, R = 10, T = 12, B = 22;
  const vmax = Math.max(goal * 1.15, ...pts.map((p) => p.v)) || 1;
  const step = niceStep(vmax), top = Math.ceil(vmax / step) * step;
  const sx = (x) => L + (span <= 1 ? (W - L - R) / 2 : (x / (span - 1)) * (W - L - R));
  const sy = (v) => T + (1 - v / top) * (H - T - B);

  let grid = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 6}" y="${sy(v) + 3}" text-anchor="end">${r0(v).toLocaleString()}</text>`;
  }
  const xl = [0, Math.floor((span - 1) / 2), span - 1].filter((v, i, a) => a.indexOf(v) === i);
  const ym = (k) => { const d = keyToDate(k); return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}`; };
  const xlab = xl.map((d, i) => `<text x="${sx(d)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle'}">${(span > 200 ? ym : md)(addDays(start, d))}</text>`).join('');

  // 하루(또는 한 주)가 비면 선을 끊음
  const gapLimit = weekly ? 7 : 1;
  const runs = [];
  pts.forEach((p, i) => {
    if (i === 0 || p.x - pts[i - 1].x > gapLimit) runs.push([]);
    runs[runs.length - 1].push(p);
  });
  const lines = runs.map((run) => {
    if (run.length === 1) return `<circle cx="${sx(run[0].x)}" cy="${sy(run[0].v)}" r="3" fill="${m.color}"/>`;
    const d = run.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.v).toFixed(1)}`).join('');
    const area = `${d}L${sx(run[run.length - 1].x).toFixed(1)},${sy(0)}L${sx(run[0].x).toFixed(1)},${sy(0)}Z`;
    return `<path d="${area}" fill="${m.color}" opacity=".1"/><path d="${d}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const last = pts[pts.length - 1];
  const goalY = sy(goal);

  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${m.name} 추세">
    ${grid}
    <line x1="${L}" x2="${W - R}" y1="${goalY}" y2="${goalY}" stroke="var(--text)" stroke-width="1" opacity=".55"/>
    <text x="${W - R}" y="${goalY - 4}" text-anchor="end">목표 ${r0(goal).toLocaleString()}</text>
    ${lines}
    <circle cx="${sx(last.x)}" cy="${sy(last.v)}" r="4.5" fill="${m.color}" stroke="var(--card)" stroke-width="2"/>
    ${xlab}
    <line id="trend-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>
    <circle id="trend-dot" r="4.5" fill="${m.color}" stroke="var(--card)" stroke-width="2" visibility="hidden"/>
  </svg><div class="trend-tip" id="trend-tip" hidden></div>`;

  // 손가락/마우스 위치에서 가장 가까운 점 보여 주기
  const svg = box.querySelector('svg');
  const show = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(sx(p.x) - px) < Math.abs(sx(best.x) - px)) best = p;
    const cx = sx(best.x), cy = sy(best.v);
    const cross = $('#trend-cross'), dot = $('#trend-dot'), tip = $('#trend-tip');
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
    const when = weekly ? `${md(best.k)} 주 (${best.n}일 평균)` : `${md(best.k)} ${DOW[keyToDate(best.k).getDay()]}`;
    tip.textContent = `${when} · ${r0(best.v).toLocaleString()} ${m.unit}`;
    tip.hidden = false;
    const left = (cx / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 70), rect.width - 70)}px`;
    tip.style.top = `${Math.max(0, (cy / H) * rect.height - 34)}px`;
  };
  svg.onpointerdown = svg.onpointermove = show;
  svg.onpointerleave = () => {
    $('#trend-cross')?.setAttribute('visibility', 'hidden');
    $('#trend-dot')?.setAttribute('visibility', 'hidden');
    $('#trend-tip').hidden = true;
  };
}
$('#trend-range').onclick = (ev) => { const b = ev.target.closest('[data-range]'); if (b) { trendRange = b.dataset.range; renderTrend(); } };
$('#trend-metric').onclick = (ev) => { const b = ev.target.closest('[data-metric]'); if (b) { trendMetric = b.dataset.metric; renderTrend(); } };

// ---------- 설정 ----------
function renderSettings() {
  for (const m of MACROS) $(`#goal-${m.id}`).value = state.goals[m.id];
  updateGoalCalc();
  $('#widget-toggle').checked = state.widget;
  $('#autosync-toggle').checked = state.autoSync;
  prefetchScript();
  renderVersionInfo();
  $('#notify-toggle').checked = state.notify && notifPermission() === 'granted';
  renderNotifyStatus();
  $('#custom-list').innerHTML = state.customFoods.length
    ? state.customFoods.map((f, i) => `<div class="entry"><div><div class="entry-name">${esc(f.n)}</div>
        <div class="entry-sub">${esc(f.u)} (${r0(f.g)}g) · ${r0(f.k)} kcal</div></div>
        <button class="del-x" data-del="${i}">삭제</button></div>`).join('')
    : '<p class="muted small">아직 없어요. 음식 추가 → "직접 입력하기"로 만들 수 있어요.</p>';
}
function updateGoalCalc() {
  const g = Object.fromEntries(MACROS.map((m) => [m.id, parseFloat($(`#goal-${m.id}`).value) || 0]));
  $('#goal-kcal-calc').textContent = r0(kcalOf(g)).toLocaleString();
}
MACROS.forEach((m) => ($(`#goal-${m.id}`).oninput = updateGoalCalc));
$('#save-goals').onclick = () => {
  for (const m of MACROS) state.goals[m.id] = parseFloat($(`#goal-${m.id}`).value) || 0;
  save(); toast('목표를 저장했어요');
  autoSync();
};
$('#custom-list').onclick = (ev) => {
  const b = ev.target.closest('[data-del]');
  if (!b) return;
  const f = state.customFoods[+b.dataset.del];
  if (!confirm(`"${f.n}"을(를) 내 음식에서 지울까요? (이미 기록한 건 그대로 남아요)`)) return;
  state.customFoods.splice(+b.dataset.del, 1);
  save(); renderSettings();
};

$('#export-btn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `macho-backup-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import-file').onchange = async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.log !== 'object') throw new Error();
    if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
    state = { ...defaultState(), ...data };
    save(); renderSettings(); toast('불러왔어요');
  } catch { toast('백업 파일을 읽을 수 없어요'); }
  ev.target.value = '';
};

// ---------- 잠금화면 알림 ----------
const notifPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

function renderNotifyStatus() {
  const p = notifPermission();
  const msg = {
    unsupported: '이 브라우저는 알림을 지원하지 않아요. (아이폰은 공유 → "홈 화면에 추가" 후 그 아이콘으로 열어야 해요)',
    denied: '알림이 차단돼 있어요. 휴대폰 설정 → 앱/사이트 알림에서 허용해 주세요.',
    default: '',
    granted: state.notify ? '켜짐 · 기록할 때마다 알림이 갱신돼요.' : '',
  }[p];
  $('#notify-status').textContent = msg;
}
$('#notify-toggle').onchange = async (ev) => {
  if (ev.target.checked) {
    if (notifPermission() === 'unsupported') { ev.target.checked = false; return renderNotifyStatus(); }
    const p = await Notification.requestPermission();
    state.notify = p === 'granted';
    ev.target.checked = state.notify;
  } else {
    state.notify = false;
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications({ tag: 'macho-today' }))?.forEach((n) => n.close());
  }
  save(); renderNotifyStatus();
};

async function updateNotification() {
  if (!state.notify || notifPermission() !== 'granted' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const t = totalsFor(todayKey());
    const g = state.goals;
    const left = goalKcal() - t.k;
    await reg.showNotification(`🔥 ${r0(t.k)} / ${goalKcal()} kcal  (${left >= 0 ? r0(left) + ' 남음' : r0(-left) + ' 초과'})`, {
      body: `탄 ${r0(t.c)}/${r0(g.c)}g · 단 ${r0(t.p)}/${r0(g.p)}g · 지 ${r0(t.f)}/${r0(g.f)}g`,
      tag: 'macho-today',
      renotify: false,
      silent: true,
      requireInteraction: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    });
  } catch (e) { console.warn('알림 실패', e); }
}

// ---------- 아이폰 잠금화면 위젯 (Scriptable) ----------
// 연속 기록 일수: 오늘 기록이 있으면 오늘부터, 아직 없으면 어제부터 거꾸로 셈
function streakDays() {
  const has = (k) => (state.log[k] || []).length > 0;
  let k = todayKey();
  if (!has(k)) k = addDays(k, -1);
  let n = 0;
  while (has(k)) { n++; k = addDays(k, -1); }
  return n;
}
function widgetQuery() {
  const day = todayKey(), t = totalsFor(day), g = state.goals;
  const mealKcal = (meal) => r0((state.log[day] || []).filter((e) => e.meal === meal).reduce((s, e) => s + scale(e.food, e.grams).k, 0));
  return new URLSearchParams({
    d: day, k: r0(t.k), c: r0(t.c), p: r0(t.p), f: r0(t.f),
    gc: r0(g.c), gp: r0(g.p), gf: r0(g.f),
    kb: mealKcal('breakfast'), kl: mealKcal('lunch'), kd: mealKcal('dinner'), ks: mealKcal('snack'),
    st: streakDays(),
  }).toString();
}
function renderWidgetButton() {
  const btn = $('#widget-sync');
  btn.hidden = !state.widget;
  if (!state.widget) return;
  const q = widgetQuery();
  const done = q === state.widgetSent;
  btn.href = `scriptable:///run/Macho?${q}`;
  btn.textContent = done ? '✓ 잠금화면에 반영됨' : '🔒 잠금화면에 반영';
  btn.classList.toggle('pending', !done);
  btn.classList.toggle('done', done);
}
// 기록이 바뀌어 위젯에 보낼 값이 달라졌으면 Scriptable을 바로 엶
// (iOS는 버튼을 누른 그 순간에만 다른 앱을 열 수 있어서, 저장 버튼 처리 안에서 부름)
function autoSync() {
  if (!state.widget || !state.autoSync) return;
  const q = widgetQuery();
  if (q === state.widgetSent) return;
  state.widgetSent = q;
  save();
  renderWidgetButton();
  location.href = `scriptable:///run/Macho?${q}`;
}
$('#widget-sync').onclick = () => {
  state.widgetSent = widgetQuery();
  save();
  setTimeout(renderWidgetButton, 300);
};
$('#widget-toggle').onchange = (ev) => { state.widget = ev.target.checked; save(); };
$('#autosync-toggle').onchange = (ev) => { state.autoSync = ev.target.checked; save(); };

const scriptTexts = {};
function prefetchScript() {
  for (const name of ['Macho', 'MachoBar']) {
    if (!scriptTexts[name]) fetch(`scriptable/${name}.js`).then((r) => r.text()).then((t) => (scriptTexts[name] = t)).catch(() => {});
  }
}
$$('[data-copy]').forEach((btn) => (btn.onclick = async () => {
  const name = btn.dataset.copy;
  try {
    if (!scriptTexts[name]) scriptTexts[name] = await (await fetch(`scriptable/${name}.js`)).text();
    await navigator.clipboard.writeText(scriptTexts[name]);
    toast(`복사했어요! Scriptable에서 이름을 ${name}(으)로`);
  } catch { toast('복사 실패. 한 번 더 눌러 주세요'); }
}));

// ---------- 탭 ----------
function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'today') renderToday();
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
$('.tabbar').onclick = (ev) => { const b = ev.target.closest('[data-view]'); if (b) showView(b.dataset.view); };

// 앱으로 돌아올 때 날짜가 바뀌었으면 오늘로 이동 + 알림 갱신
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (todayKey() !== lastToday) { lastToday = todayKey(); currentDay = lastToday; }
  renderToday(); updateNotification();
});

// ---------- 햅틱 ----------
// 아이폰: 버튼마다 투명한 스위치 덮개를 씌움. 손가락이 실제로 스위치를 누른 것이 되어 iOS가 햅틱을 줌
// (iOS 26.5부터 스크립트로 대신 누르는 방식은 막힘. 방식 출처: github.com/tijnjh/ios-haptics, MIT)
// 안드로이드: 진동 API
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HAPTIC_TARGETS = 'button, [data-entry]';
function addHaptic(el) {
  if (el.querySelector(':scope > [data-haptic-trigger]')) return;
  const label = document.createElement('label');
  label.setAttribute('data-haptic-trigger', '');
  label.setAttribute('aria-hidden', 'true');
  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', '');
  sw.tabIndex = -1;
  sw.addEventListener('click', (e) => e.stopPropagation()); // 버튼 동작이 두 번 실행되지 않게
  label.append(sw);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.append(label);
}
if (IS_IOS) {
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches(HAPTIC_TARGETS)) addHaptic(root);
    root.querySelectorAll(HAPTIC_TARGETS).forEach(addHaptic);
  };
  scan(document.body);
  new MutationObserver((list) => list.forEach((m) => {
    m.addedNodes.forEach(scan);
    // 버튼 글자를 바꾸면(textContent) 덮개가 지워지므로 다시 씌움
    const host = m.target.nodeType === 1 && m.target.closest(HAPTIC_TARGETS);
    if (host) addHaptic(host);
  })).observe(document.body, { childList: true, subtree: true });
} else if (navigator.vibrate) {
  document.addEventListener('click', (ev) => {
    if (ev.target.closest(`${HAPTIC_TARGETS}, .btn, .switch-row`)) navigator.vibrate(10);
  }, true);
}

// ---------- 버전 표시 ----------
$('#app-version').textContent = APP_VERSION;
async function renderVersionInfo() {
  const scriptVer = async (name) => {
    try {
      const t = scriptTexts[name] || (scriptTexts[name] = await (await fetch(`scriptable/${name}.js`)).text());
      return (t.match(/버전: (\S+)/) || [])[1] || '?';
    } catch { return '?'; }
  };
  const [a, b] = await Promise.all([scriptVer('Macho'), scriptVer('MachoBar')]);
  $('#version-info').innerHTML = `앱 <b>${APP_VERSION}</b> · 위젯 스크립트 Macho <b>${a}</b> / MachoBar <b>${b}</b><br>Scriptable에 넣은 스크립트 맨 위 "버전"이 이 숫자와 같으면 최신이에요.`;
}

// ---------- 시작 ----------
if ('serviceWorker' in navigator) {
  // 새 버전이 설치되면 한 번 새로고침해서 바로 적용
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
  });
}
renderToday();
updateNotification();
