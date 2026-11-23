/* Tiers and the titles that go with them. The Korean titles are the game's
   originals (the leaderboards store them in `rank`), kept word for word. */

const TIERS = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS', 'SSS', 'X', 'X+'];

const KO = [
  [200, '죄송한데... 손가락 2개세요?', 'Two-finger typist?'],
  [300, '분발하셔야겠어요', 'Keep at it'],
  [380, '이정도면 평타', 'Respectable'],
  [420, '평균 이상', 'Above average'],
  [470, '빠른편', 'Quick'],
  [520, '개발자', 'Developer'],
  [560, 'pc카톡 많이 한거 티나네 (임희주급)', 'Group-chat veteran'],
  [600, '타자 말고 잘하는게 없을 확률 높음', 'Typing is your whole personality'],
  [650, '대회 나가도 될듯', 'Tournament ready'],
  [700, '타자 신', 'Typing god'],
  [740, '해킹 유저', 'Suspiciously fast'],
  [780, '기계', 'Machine'],
  [820, '초월자', 'Transcendent'],
  [Infinity, '띠용', 'What.']
];

const EN = [
  [20, 'Slowpoke', 'Slowpoke'],
  [30, 'Practice makes perfect', 'Practice makes perfect'],
  [40, 'Not bad', 'Not bad'],
  [50, 'Above Average', 'Above average'],
  [60, 'Quite fast', 'Quite fast'],
  [70, 'Developer', 'Developer'],
  [80, 'Bunny Typer', 'Bunny typer'],
  [90, 'Professional Typer', 'Professional typer'],
  [100, 'Typing God', 'Typing god'],
  [110, 'Hacker', 'Hacker'],
  [120, 'Machine', 'Machine'],
  [130, 'Ridonculous', 'Ridonculous'],
  [Infinity, 'OMG', 'OMG']
];

const CODE = [
  [20, '백수', 'Between jobs'],
  [27, '신입', 'New hire'],
  [32, '주임', 'Junior'],
  [38, '대리', 'Associate'],
  [45, '과장', 'Manager'],
  [52, '차장', 'Senior manager'],
  [59, '부장', 'Director'],
  [65, '이사', 'Board member'],
  [70, '사장', 'CEO'],
  [75, '회장', 'Chairman'],
  [80, '대통령', 'President'],
  [85, 'Elon Musk', 'Rocket founder'],
  [90, '뇌로 프로그래밍하는 외계인', 'Alien who codes by thought'],
  [Infinity, 'OMG', 'OMG']
];

const TABLES = { ko: KO, en: EN, code: CODE };

// { tier, title, titleKo, index, next } for a speed in that language's unit.
export function grade(lang, speed, ui) {
  const table = TABLES[lang] || EN;
  let i = table.findIndex((row) => speed < row[0]);
  if (i < 0) i = table.length - 1;
  const row = table[i];
  return {
    index: i,
    of: table.length,
    tier: TIERS[Math.min(i, TIERS.length - 1)],
    title: ui === 'en' ? row[2] : row[1],
    titleKo: row[1],
    next: Number.isFinite(row[0]) ? row[0] : null
  };
}

export function unitLabel(lang, ui) {
  if (lang === 'ko') return ui === 'en' ? 'KPM' : '타/분';
  return 'WPM';
}
