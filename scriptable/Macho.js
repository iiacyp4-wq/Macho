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
// 잠금화면 직사각형 (+ 홈 화면용 컬러 버전)
function rectWidget(v, colored) {
  const w = new ListWidget();
  if (colored) w.backgroundColor = new Color('#111827');
  const title = w.addText(leftText(v));
  title.font = Font.boldSystemFont(colored ? 18 : 14);
  if (colored) title.textColor = Color.white();
  title.lineLimit = 1; title.minimumScaleFactor = 0.7;
  w.addSpacer(colored ? 10 : 4);

  const row = w.addStack();
  if (colored) row.layoutVertically();
  MACROS.forEach(([label, key, hex], i) => {
    const col = row.addStack();
    col.layoutVertically();
    const t = col.addText(`${label} ${Math.round(v[key])}/${Math.round(v.goals[key])}`);
    t.font = Font.semiboldSystemFont(colored ? 12 : 10);
    if (colored) t.textColor = Color.white();
    t.lineLimit = 1; t.minimumScaleFactor = 0.6;
    col.addSpacer(2);
    const bw = colored ? 120 : 44;
    const img = col.addImage(bar(v[key] / (v.goals[key] || 1), bw, 4,
      colored ? new Color(hex) : Color.white(), new Color('#ffffff', colored ? 0.15 : 0.3)));
    img.imageSize = new Size(bw, 4);
    if (i < 2) row.addSpacer(colored ? 6 : 6);
  });
  return w;
}

// 잠금화면 원형
function circleWidget(v) {
  const w = new ListWidget();
  w.backgroundImage = ring(v.k / (v.gk || 1), 64, 6, Color.white(), new Color('#ffffff', 0.3));
  const left = Math.round(v.gk - v.k);
  const n = w.addText(String(Math.abs(left)));
  n.font = Font.boldSystemFont(14); n.centerAlignText(); n.minimumScaleFactor = 0.6; n.lineLimit = 1;
  const s = w.addText(left >= 0 ? '남음' : '초과');
  s.font = Font.systemFont(9); s.centerAlignText();
  return w;
}

// 잠금화면 시계 위 한 줄
function inlineWidget(v) {
  const w = new ListWidget();
  w.addText(`🔥${leftText(v)} · 단 ${Math.round(v.p)}/${Math.round(v.goals.p)}g`);
  return w;
}

// ---------- 실행 ----------
const v = read();
const fam = config.widgetFamily || '';
let widget;
if (fam === 'accessoryCircular') widget = circleWidget(v);
else if (fam === 'accessoryInline') widget = inlineWidget(v);
else widget = rectWidget(v, !fam.startsWith('accessory') && config.runsInWidget);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (!q.d) {
  // Scriptable 안에서 직접 실행하면 미리보기
  if (widget.presentAccessoryRectangular) await widget.presentAccessoryRectangular();
  else await widget.presentSmall();
}
Script.complete();
