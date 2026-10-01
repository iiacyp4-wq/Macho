// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: utensils;

// Macho 잠금화면 위젯
// 이 스크립트 이름을 반드시 "Macho" 로 저장하세요. (Macho 앱이 이 이름으로 부릅니다)

const fm = FileManager.local();
const PATH = fm.joinPath(fm.documentsDirectory(), 'macho-today.json');

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 1) Macho 앱의 "잠금화면에 반영" 버튼으로 열렸을 때: 받은 숫자를 저장
const q = args.queryParameters || {};
if (q.d) {
  const num = (x) => Number(x) || 0;
  fm.writeString(PATH, JSON.stringify({
    d: q.d, k: num(q.k), c: num(q.c), p: num(q.p), f: num(q.f),
    gc: num(q.gc), gp: num(q.gp), gf: num(q.gf), at: Date.now(),
  }));
}

// 2) 저장된 값 읽기 (날짜가 바뀌었으면 0부터 다시)
function read() {
  let s = null;
  try { if (fm.fileExists(PATH)) s = JSON.parse(fm.readString(PATH)); } catch (e) {}
  const goals = s ? { c: s.gc, p: s.gp, f: s.gf } : { c: 250, p: 120, f: 60 };
  const fresh = !!s && s.d === todayKey();
  return {
    k: fresh ? s.k : 0, c: fresh ? s.c : 0, p: fresh ? s.p : 0, f: fresh ? s.f : 0,
    goals, gk: goals.c * 4 + goals.p * 4 + goals.f * 9,
  };
}

// ---------- 그림 도구 ----------
function bar(frac, w, h, color, bg) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const back = new Path(); back.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
  ctx.addPath(back); ctx.setFillColor(bg); ctx.fillPath();
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) {
    const p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(fw, h), h), h / 2, h / 2);
    ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath();
  }
  return ctx.getImage();
}

function ring(frac, size, lw, color, bg) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const c = size / 2, r = size / 2 - lw / 2;
  const arc = (to) => {
    const pts = [], n = Math.max(2, Math.ceil(to * 90));
    for (let i = 0; i <= n; i++) {
      const a = (to * i / n) * 2 * Math.PI - Math.PI / 2;
      pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a)));
    }
    const p = new Path(); p.addLines(pts); return p;
  };
  ctx.setLineWidth(lw);
  ctx.setStrokeColor(bg); ctx.addPath(arc(1)); ctx.strokePath();
  if (frac > 0) { ctx.setStrokeColor(color); ctx.addPath(arc(Math.min(frac, 1))); ctx.strokePath(); }
  return ctx.getImage();
}

const MACROS = [['탄', 'c', '#f5a623'], ['단', 'p', '#3b82f6'], ['지', 'f', '#ec4899']];
const leftText = (v) => {
  const left = Math.round(v.gk - v.k);
  return left >= 0 ? `${left} kcal 남음` : `${-left} kcal 초과`;
};

// ---------- 위젯 모양 ----------
// 위젯 설정의 Parameter 칸에 적은 글자로 모양을 고름
//   직사각형: (비움) = 칼로리+탄단지 / 칼로리 = 남은 칼로리만 크게 / 탄단지 = 탄단지만 크게
//   원형:     (비움) = 칼로리 / 탄 / 단 / 지
const PARAM = String(args.widgetParameter || '').trim();
const WHITE = Color.white();
const DIM = new Color('#ffffff', 0.3);
const big = (stack, text, size) => {
  const t = stack.addText(text);
  t.font = Font.boldRoundedSystemFont ? Font.boldRoundedSystemFont(size) : Font.boldSystemFont(size);
  t.lineLimit = 1; t.minimumScaleFactor = 0.5;
  return t;
};
const small = (stack, text, size) => {
  const t = stack.addText(text);
  t.font = Font.semiboldSystemFont(size); t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  return t;
};
const leftNum = (v) => Math.round(v.gk - v.k);

// 잠금화면 직사각형 — 기본: 남은 칼로리 크게 + 탄단지
function rectDefault(v) {
  const w = new ListWidget();
  const top = w.addStack();
  top.bottomAlignContent();
  big(top, String(Math.abs(leftNum(v))), 26);
  top.addSpacer(4);
  small(top, leftNum(v) >= 0 ? 'kcal 남음' : 'kcal 초과', 12);
  w.addSpacer(3);
  const row = w.addStack();
  MACROS.forEach(([label, key], i) => {
    const col = row.addStack();
    col.layoutVertically();
    small(col, `${label} ${Math.round(v[key])}`, 15);
    col.addSpacer(3);
    const img = col.addImage(bar(v[key] / (v.goals[key] || 1), 46, 5, WHITE, DIM));
    img.imageSize = new Size(46, 5);
    if (i < 2) row.addSpacer(6);
  });
  return w;
}

// 잠금화면 직사각형 — "칼로리": 숫자 하나만 아주 크게
function rectKcal(v) {
  const w = new ListWidget();
  big(w, String(Math.abs(leftNum(v))), 38);
  small(w, `kcal ${leftNum(v) >= 0 ? '남음' : '초과'} · 먹음 ${Math.round(v.k)}`, 13);
  return w;
}

// 잠금화면 직사각형 — "탄단지": 세 줄로 크게
function rectMacros(v) {
  const w = new ListWidget();
  MACROS.forEach(([label, key], i) => {
    const row = w.addStack();
    row.centerAlignContent();
    small(row, label, 15);
    row.addSpacer(6);
    const img = row.addImage(bar(v[key] / (v.goals[key] || 1), 56, 7, WHITE, DIM));
    img.imageSize = new Size(56, 7);
    row.addSpacer(6);
    big(row, `${Math.round(v[key])}`, 16);
    small(row, `/${Math.round(v.goals[key])}g`, 12);
    if (i < 2) w.addSpacer(1);
  });
  return w;
}

// 잠금화면 원형 — 링 하나에 숫자 하나
function circleWidget(v) {
  const w = new ListWidget();
  const m = MACROS.find(([label]) => label === PARAM);
  const frac = m ? v[m[1]] / (v.goals[m[1]] || 1) : v.k / (v.gk || 1);
  w.backgroundImage = ring(frac, 64, 7, WHITE, DIM);
  const n = big(w, m ? String(Math.round(v[m[1]])) : String(Math.abs(leftNum(v))), m ? 20 : 17);
  n.centerAlignText();
  const s = small(w, m ? `${m[0]}/${Math.round(v.goals[m[1]])}` : (leftNum(v) >= 0 ? '남음' : '초과'), 10);
  s.centerAlignText();
  return w;
}

// 잠금화면 시계 위 한 줄
function inlineWidget(v) {
  const w = new ListWidget();
  w.addText(`🔥${leftText(v)} · 단 ${Math.round(v.p)}/${Math.round(v.goals.p)}g`);
  return w;
}

// 홈 화면용 컬러 위젯
function homeWidget(v) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#111827');
  const title = big(w, leftText(v), 20);
  title.textColor = WHITE;
  w.addSpacer(10);
  MACROS.forEach(([label, key, hex], i) => {
    const t = small(w, `${label} ${Math.round(v[key])}/${Math.round(v.goals[key])}g`, 13);
    t.textColor = WHITE;
    w.addSpacer(3);
    const img = w.addImage(bar(v[key] / (v.goals[key] || 1), 120, 6, new Color(hex), new Color('#ffffff', 0.15)));
    img.imageSize = new Size(120, 6);
    if (i < 2) w.addSpacer(6);
  });
  return w;
}

// ---------- 실행 ----------
const v = read();
const fam = config.widgetFamily || '';
let widget;
if (fam === 'accessoryCircular') widget = circleWidget(v);
else if (fam === 'accessoryInline') widget = inlineWidget(v);
else if (config.runsInWidget && !fam.startsWith('accessory')) widget = homeWidget(v);
else if (PARAM === '칼로리') widget = rectKcal(v);
else if (PARAM === '탄단지') widget = rectMacros(v);
else widget = rectDefault(v);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (!q.d) {
  // Scriptable 안에서 직접 실행하면 미리보기
  if (widget.presentAccessoryRectangular) await widget.presentAccessoryRectangular();
  else await widget.presentSmall();
}
Script.complete();
