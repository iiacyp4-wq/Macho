// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: chart-bar;

// Macho 탄단지 위젯 (막대)
// 버전: v1.18
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
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  return {
    c: fresh ? s.c : 0, p: fresh ? s.p : 0, f: fresh ? s.f : 0,
    // 연속 기록: 오늘이나 어제 반영한 값만 유효 (그보다 오래되면 끊긴 것)
    st: s && (fresh || s.d === yKey) ? (s.st || 0) : 0,
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

// 잠금화면 직사각형: 세 칸 (이름 / 막대 / 먹은 g / 목표 g) + 오른쪽 아래 연속 기록
function rectWidget(v) {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  const row = w.addStack();
  MACROS.forEach(([label, key], i) => {
    const col = row.addStack();
    col.size = new Size(40, 0); // 칸 폭 고정 → 숫자가 길어져도 막대 위치 그대로
    col.layoutVertically();
    // 순서: 이름 → 막대 → 먹은 양 → 목표
    text(col, label, 12, false);
    col.addSpacer(2);
    const img = col.addImage(bar(v[key] / (v.goals[key] || 1), 38, 6));
    img.imageSize = new Size(38, 6);
    col.addSpacer(2);
    text(col, String(Math.round(v[key])), 22, true);
    text(col, `/${Math.round(v.goals[key])}g`, 11, false);
    row.addSpacer(4);
  });

  // 오른쪽 아래: 불꽃 + 연속 기록 일수
  const streak = row.addStack();
  streak.size = new Size(24, 0);
  streak.layoutVertically();
  streak.addSpacer();
  const flameLine = streak.addStack();
  flameLine.addSpacer();
  const flame = flameLine.addImage(SFSymbol.named('flame.fill').image);
  flame.imageSize = new Size(13, 13);
  flame.tintColor = Color.white();
  flameLine.addSpacer();
  const numLine = streak.addStack();
  numLine.addSpacer();
  text(numLine, String(v.st), 13, true);
  numLine.addSpacer();
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
