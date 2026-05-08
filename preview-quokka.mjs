// 쿼카 ASCII 아트 캐릭터 미리보기 — node preview-quokka.mjs 로 실행
const R = '\x1b[0m';
const B = '\x1b[1m';
const D = '\x1b[2m';

const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

function gradient(text, fromRGB, toRGB) {
  return text.split('').map((ch, i) => {
    const t = text.length === 1 ? 0 : i / (text.length - 1);
    const r = Math.round(fromRGB[0] + (toRGB[0] - fromRGB[0]) * t);
    const g = Math.round(fromRGB[1] + (toRGB[1] - fromRGB[1]) * t);
    const b = Math.round(fromRGB[2] + (toRGB[2] - fromRGB[2]) * t);
    return fg(r, g, b) + ch;
  }).join('') + R;
}

const PURPLE = [125, 86, 244];
const PINK   = [255, 100, 180];
const AQUA   = [100, 220, 200];
const YELLOW = [255, 210, 80];
const TAN    = [210, 170, 100];
const BROWN  = [160, 110,  60];

// ─────────────────────────────────────────────
// 쿼카 ASCII 아트 캐릭터 옵션
// ─────────────────────────────────────────────

console.log('\n  ══ 쿼카 ASCII 아트 캐릭터 ══\n');

// ── 디자인 A — 정면 (귀+얼굴+몸통)
console.log('  [A] 정면 쿼카\n');
const A = [
  '    /\\_/\\    ',
  '   /  o o \\  ',
  '  ( =( v )= )',
  '   \\  ~~~  / ',
  '    \\_____/  ',
  '    /|   |\\  ',
  '   (_|   |_) ',
];
A.forEach(l => console.log('  ' + fg(...TAN) + B + l + R));

// ── 디자인 B — 앉아있는 쿼카 (더 쿼카스럽게)
console.log('\n\n  [B] 앉은 쿼카\n');
const B2 = [
  '     _____   ',
  '    /  ^  \\  ',
  '   / (o o) \\ ',
  '  (   \\v/   )',
  '   \\  ~~~  / ',
  '    \\______/ ',
  '    ( )  ( ) ',
  '    |_|  |_| ',
];
B2.forEach(l => console.log('  ' + fg(...TAN) + B + l + R));

// ── 디자인 C — 측면 프로필 (쿼카 특유의 옆모습)
console.log('\n\n  [C] 측면 쿼카 ← 추천\n');
const Clines = [
  '      __     ',
  '   __/  \\    ',
  '  /  o  |   ',
  ' | ~ v ~|   ',
  ' | `---\'|   ',
  '  \\_____|   ',
  '   /    \\   ',
  '  (  __  )  ',
  '  |_|  |_|  ',
];
Clines.forEach(l => console.log('  ' + fg(...TAN) + B + l + R));

// ── 디자인 D — 미니 마스코트 (3줄 컴팩트, 박스 안에 넣기 좋음)
console.log('\n\n  [D] 미니 마스코트 (박스형)\n');
const D2 = [
  '  /\\ ___ /\\  ',
  ' (  o\\_/o  ) ',
  ' (___~~~___)  ',
];
D2.forEach(l => console.log('  ' + fg(...TAN) + B + l + R));

// ─────────────────────────────────────────────
// Style B — Charm 박스 + 디자인 D 통합
// ─────────────────────────────────────────────
console.log('\n\n  ══ Charm 박스 + 미니 마스코트 [D] 통합 ══\n');

const w = 42;
const borderC = fg(...PURPLE);

const top    = borderC + '  ╭' + '─'.repeat(w) + '╮' + R;
const bottom = borderC + '  ╰' + '─'.repeat(w) + '╯' + R;

function bar(content, width) {
  const visible = content.replace(/\x1b\[[^m]*m/g, '');
  const pad = width - visible.length;
  return borderC + '  │' + R + content + ' '.repeat(Math.max(0, pad)) + borderC + '│' + R;
}

const titleLine  = '  ' + B + gradient('OJ Refactor', PURPLE, PINK) + R;
const subLine    = '  ' + fg(...AQUA) + 'TypeScript 리팩토링 도구' + R;

const qLine1 = '  ' + fg(...TAN) + B + '/\\ ___ /\\ ' + R
             + '  ' + fg(...YELLOW) + B + '쿼카와 함께하는 클린코드' + R;
const qLine2 = '  ' + fg(...TAN) + B + '(  o\\_/o  )' + R;
const qLine3 = '  ' + fg(...BROWN)+ B + '(___~~~___)' + R;

console.log(top);
console.log(bar(titleLine, w));
console.log(bar(subLine,   w));
console.log(bar('', w));
console.log(bar(qLine1, w));
console.log(bar(qLine2, w));
console.log(bar(qLine3, w));
console.log(bar('', w));
console.log(bottom);

console.log('\n');
