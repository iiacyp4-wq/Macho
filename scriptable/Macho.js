// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: utensils;

// Macho 칼로리 위젯 (원형)
// 버전: v1.21
// 이 스크립트 이름을 반드시 "Macho" 로 저장하세요. (Macho 앱의 반영 버튼이 이 이름을 부르고,
// 받은 숫자를 저장해서 MachoBar 위젯도 같이 씁니다)

const fm = FileManager.local();
const PATH = fm.joinPath(fm.documentsDirectory(), 'macho-today.json');
const MEALS = [['아침', 'kb', 1], ['점심', 'kl', 0.75], ['저녁', 'kd', 0.55], ['간식', 'ks', 0.38]]; // 이름, 키, 진하기

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 1) Macho 앱의 "잠금화면에 반영" 버튼으로 열렸을 때: 받은 숫자를 저장
const q = args.queryParameters || {};
if (q.d) {
  const data = { d: q.d, at: Date.now() };
  for (const key of ['k', 'c', 'p', 'f', 'gc', 'gp', 'gf', 'kb', 'kl', 'kd', 'ks', 'st']) data[key] = Number(q[key]) || 0;
  fm.writeString(PATH, JSON.stringify(data));
}

// 2) 저장된 값 읽기 (날짜가 바뀌었으면 0부터 다시)
function read() {
  let s = null;
  try { if (fm.fileExists(PATH)) s = JSON.parse(fm.readString(PATH)); } catch (e) {}
  const fresh = !!s && s.d === todayKey();
  const g = s ? { c: s.gc, p: s.gp, f: s.gf } : { c: 250, p: 120, f: 60 };
  const v = { gk: g.c * 4 + g.p * 4 + g.f * 9 };
  for (const [, key] of MEALS) v[key] = fresh ? (s[key] || 0) : 0;
  v.k = fresh ? s.k : 0;
  // 연속 기록: 오늘이나 어제 반영한 값만 유효 (그보다 오래되면 끊긴 것)
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  v.st = s && (fresh || s.d === yKey) ? (s.st || 0) : 0;
  return v;
}

// ---------- 그림 ----------
// 끼니별로 나눠진 링: 각 조각 길이 = 그 끼니 칼로리 / 목표 칼로리
function mealRing(v, size, lw, center = false) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const c = size / 2, r = size / 2 - lw / 2;
  const arc = (from, to) => {
    const pts = [], n = Math.max(2, Math.ceil((to - from) * 120));
    for (let i = 0; i <= n; i++) {
      const a = (from + (to - from) * i / n) * 2 * Math.PI - Math.PI / 2;
      pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a)));
    }
    const p = new Path(); p.addLines(pts); return p;
  };
  ctx.setLineWidth(lw);
  ctx.setStrokeColor(new Color('#ffffff', 0.2)); ctx.addPath(arc(0, 1)); ctx.strokePath();
  // 목표를 넘으면 링 전체를 끼니 비율대로 채움
  const scale = 1 / Math.max(v.gk || 1, v.k || 0);
  const gap = 0.012;
  let at = 0;
  for (const [, key, alpha] of MEALS) {
    const len = v[key] * scale;
    if (len <= 0) continue;
    const to = Math.min(1, at + len);
    if (to - at > gap * 1.5) {
      ctx.setStrokeColor(new Color('#ffffff', alpha));
      ctx.addPath(arc(at, to - gap)); ctx.strokePath();
    }
    at = to;
  }
  if (center) drawCenter(ctx, v, size);
  return ctx.getImage();
}

// 불꽃 모양 (흰색으로 직접 그림)
function drawFlame(ctx, x, y, s) {
  const P = (px, py) => new Point(x + px * s, y + py * s);
  const p = new Path();
  p.move(P(0.5, 0));
  p.addCurve(P(0.85, 0.55), P(0.55, 0.2), P(0.8, 0.3));
  p.addCurve(P(0.5, 1), P(0.9, 0.8), P(0.72, 1));
  p.addCurve(P(0.12, 0.6), P(0.28, 1), P(0.1, 0.82));
  p.addCurve(P(0.3, 0.3), P(0.13, 0.45), P(0.22, 0.38));
  p.addCurve(P(0.42, 0.52), P(0.3, 0.42), P(0.36, 0.5));
  p.addCurve(P(0.5, 0), P(0.38, 0.35), P(0.42, 0.15));
  p.closeSubpath();
  ctx.addPath(p);
  ctx.setFillColor(Color.white());
  ctx.fillPath();
}

// 링 가운데: 섭취 kcal / 목표 / 불꽃 + 연속 일수 — 위치를 직접 정해서 줄 사이를 좁게
function drawCenter(ctx, v, size) {
  const font = (sz, bold) => bold
    ? (Font.boldRoundedSystemFont ? Font.boldRoundedSystemFont(sz) : Font.boldSystemFont(sz))
    : Font.semiboldSystemFont(sz);
  const line = (str, y, h, sz, bold) => {
    ctx.setFont(font(sz, bold));
    ctx.setTextColor(Color.white());
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(str, new Rect(0, y, size, h));
  };
  line(String(Math.round(v.k)), 11, 20, 16, true);
  line(`/${Math.round(v.gk)}`, 29, 12, 9, false);
  // 불꽃 + 숫자를 한 덩어리로 가운데 정렬 (숫자 폭은 글자 수로 어림)
  const num = String(v.st);
  const numW = num.length * 8;
  const flameW = 11, gap = 1.5;
  const left = (size - (flameW + gap + numW)) / 2;
  drawFlame(ctx, left, 41, flameW);
  ctx.setFont(font(13, true));
  ctx.setTextColor(Color.white());
  ctx.setTextAlignedLeft();
  ctx.drawTextInRect(num, new Rect(left + flameW + gap, 37.5, numW + 6, 17));
}

function dot(alpha) {
  const ctx = new DrawContext();
  ctx.size = new Size(8, 8); ctx.opaque = false; ctx.respectScreenScale = true;
  const p = new Path(); p.addEllipse(new Rect(0, 0, 8, 8));
  ctx.addPath(p); ctx.setFillColor(new Color('#ffffff', alpha)); ctx.fillPath();
  return ctx.getImage();
}

const font = (size, bold) => bold
  ? (Font.boldRoundedSystemFont ? Font.boldRoundedSystemFont(size) : Font.boldSystemFont(size))
  : Font.semiboldSystemFont(size);
function text(stack, str, size, bold) {
  const t = stack.addText(str);
  t.font = font(size, bold); t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  return t;
}
// 가로 가운데 정렬: 양옆에 빈 공간을 넣은 줄 안에 글자를 둠
function centered(stack, str, size, bold) {
  const line = stack.addStack();
  line.addSpacer();
  text(line, str, size, bold);
  line.addSpacer();
  return line;
}

// ---------- 위젯 ----------
// 잠금화면 직사각형: 왼쪽 링(가운데 총 섭취) + 오른쪽 끼니별 칼로리
function rectWidget(v) {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  const row = w.addStack();
  row.centerAlignContent();

  const ringBox = row.addStack();
  ringBox.size = new Size(66, 66);
  ringBox.backgroundImage = mealRing(v, 66, 7, true); // 가운데 글자까지 그림

  row.addSpacer(8);
  const list = row.addStack();
  list.size = new Size(82, 0); // 폭 고정 (높이는 내용에 맞춤)
  list.layoutVertically();
  MEALS.forEach(([name, key, alpha], i) => {
    const line = list.addStack();
    line.centerAlignContent();
    const d = line.addImage(dot(alpha)); d.imageSize = new Size(7, 7);
    line.addSpacer(4);
    text(line, name, 12, false);
    line.addSpacer();
    text(line, String(Math.round(v[key])), 13, true);
    if (i < MEALS.length - 1) list.addSpacer(1);
  });
  return w;
}

// 잠금화면 원형: 링 + 총 섭취
function circleWidget(v) {
  const w = new ListWidget();
  w.backgroundImage = mealRing(v, 64, 7);
  centered(w, String(Math.round(v.k)), 16, true);
  centered(w, 'kcal', 9, false);
  return w;
}

// 잠금화면 시계 위 한 줄
function inlineWidget(v) {
  const w = new ListWidget();
  w.addText(`🔥${Math.round(v.k)} / ${Math.round(v.gk)} kcal`);
  return w;
}

// ---------- 실행 ----------
const v = read();
const fam = config.widgetFamily || '';
let widget;
if (fam === 'accessoryCircular') widget = circleWidget(v);
else if (fam === 'accessoryInline') widget = inlineWidget(v);
else widget = rectWidget(v);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (!q.d) {
  // Scriptable 안에서 직접 실행하면 미리보기
  if (widget.presentAccessoryRectangular) await widget.presentAccessoryRectangular();
  else await widget.presentSmall();
}
Script.complete();
