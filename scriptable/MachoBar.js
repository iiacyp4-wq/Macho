// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart-bar;

// Macho 탄단지 위젯 (막대)
// 이 스크립트 이름은 "MachoBar" 로 저장하세요.
// 숫자는 "Macho" 스크립트가 저장해 둔 것을 읽어요. (Macho 앱 → 잠금화면에 반영)

const fm = FileManager.local();
const PATH = fm.joinPath(fm.documentsDirectory(), 'macho-today.json');
const MACROS = [['탄', 'c'], ['단', 'p'], ['지', 'f']];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 저장된 값 읽기 (날짜가 바뀌었으면 0부터 다시)
function read() {
  let s = null;
  try { if (fm.fileExists(PATH)) s = JSON.parse(fm.readString(PATH)); } catch (e) {}
  const fresh = !!s && s.d === todayKey();
  return {
    c: fresh ? s.c : 0, p: fresh ? s.p : 0, f: fresh ? s.f : 0,
    goals: s ? { c: s.gc, p: s.gp, f: s.gf } : { c: 250, p: 120, f: 60 },
  };
}

function bar(frac, w, h) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const back = new Path(); back.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
  ctx.addPath(back); ctx.setFillColor(new Color('#ffffff', 0.3)); ctx.fillPath();
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) {
    const p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(fw, h), h), h / 2, h / 2);
    ctx.addPath(p); ctx.setFillColor(Color.white()); ctx.fillPath();
  }
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

// 잠금화면 직사각형: 세 칸 (이름 / 먹은 g / 막대 / 목표 g)
function rectWidget(v) {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  const row = w.addStack();
  MACROS.forEach(([label, key], i) => {
    const col = row.addStack();
    col.size = new Size(48, 0); // 칸 폭 고정 → 숫자가 길어져도 막대 위치 그대로
    col.layoutVertically();
    text(col, label, 12, false);
    text(col, String(Math.round(v[key])), 22, true);
    col.addSpacer(2);
    const img = col.addImage(bar(v[key] / (v.goals[key] || 1), 46, 6));
    img.imageSize = new Size(46, 6);
    col.addSpacer(1);
    text(col, `/${Math.round(v.goals[key])}g`, 11, false);
    if (i < 2) row.addSpacer(6);
  });
  return w;
}

// 시계 위 한 줄
function inlineWidget(v) {
  const w = new ListWidget();
  w.addText(MACROS.map(([l, k]) => `${l}${Math.round(v[k])}`).join(' · '));
  return w;
}

const v = read();
const widget = config.widgetFamily === 'accessoryInline' ? inlineWidget(v) : rectWidget(v);
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  if (widget.presentAccessoryRectangular) await widget.presentAccessoryRectangular();
  else await widget.presentSmall();
}
Script.complete();
