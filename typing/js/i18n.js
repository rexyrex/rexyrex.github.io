/* Interface strings in Korean and English. The typing content itself is
   chosen separately (한글 / English / code); this is only the UI. */

let ui = 'ko';

const KO = {
  'nav.test': '타자 테스트', 'nav.meteor': '운석 방어', 'nav.race': '공룡 레이스', 'nav.daily': '오늘의 도전',
  'nav.drills': '자리 연습', 'nav.ranks': '순위', 'nav.stats': '내 기록',
  'tools.sound': '소리 켜기/끄기', 'tools.lang': '화면 언어 (한국어 / English)', 'tools.settings': '설정',
  'lang.code': '코드',

  'home.title': '빠르게, 정확하게, 재미있게.',
  'home.lede': '한글·영문·코드 타자 속도를 정확하게 재고, 운석을 막고, 공룡과 경주하세요. 매일 새 도전과 순위표가 기다립니다.',
  'home.start': '60초 테스트 시작', 'home.daily': '오늘의 도전', 'home.modes': '모드',
  'home.today': '오늘의 순위', 'home.allRanks': '전체 순위 보기', 'home.how': '이렇게 잽니다',
  'home.bestKo': '최고 한타 (타/분)', 'home.bestEn': '최고 영타 (WPM)', 'home.streak': '연속 플레이 (일)',
  'how.k1': '타수', 'how.v1': '한글은 맞게 친 자모 키 수를 분당으로 셉니다 (한 = ㅎ+ㅏ+ㄴ = 3타).',
  'how.k2': 'WPM', 'how.v2': '영문과 코드는 맞게 친 글자 ÷ 5를 분당으로 셉니다.',
  'how.k3': '정확도', 'how.v3': '고쳐 쓴 실수까지 포함해, 입력한 모든 글자 중 맞은 비율입니다.',
  'how.k4': '시간', 'how.v4': '첫 키를 누르는 순간부터 잽니다. 조합 중인 글자는 틀린 것으로 보지 않아요.',

  'mc.test.kicker': '한글 · English · 코드', 'mc.test.desc': '15초부터 2분까지. 문장, 속담, 명언, 낱말, 코드 10가지 언어.',
  'mc.meteor.kicker': '아케이드', 'mc.meteor.desc': '섬으로 떨어지는 운석의 단어를 쳐서 부수세요. 콤보, 특수 운석, 레벨업.',
  'mc.race.kicker': '대결', 'mc.race.desc': '공룡 세 마리와 한 문단을 두고 달리기. 상대 속도는 내 실력에 맞춰집니다.',
  'mc.daily.kicker': '매일 새 글', 'mc.daily.desc': '모두가 같은 글로 겨루는 하루 한 문단. 결과를 공유해 보세요.',
  'mc.drills.kicker': '기초', 'mc.drills.desc': '기본 자리부터 쌍자음, 숫자, 기호까지. 손가락 안내와 약점 연습.',

  'daily.title': '오늘의 도전', 'daily.note': '오늘은 모두가 같은 글을 칩니다. 몇 번이든 다시 할 수 있고, 가장 좋은 기록이 남아요.',
  'daily.done': '오늘 최고 기록 {v} {u} · 정확도 {a}%. 더 올려 볼까요?',
  'daily.best': '오늘 최고 {v} {u} · 정확도 {a}%', 'daily.tomorrow': '내일 자정에 새 글이 나옵니다.',

  'cfg.time': '시간 제한', 'cfg.count': '분량 제한', 'cfg.punct': '문장부호', 'cfg.punctTip': '대문자와 문장부호 넣기',
  'cfg.nums': '숫자', 'cfg.numsTip': '숫자 섞기', 'cfg.easy': '쉬움', 'cfg.normal': '보통', 'cfg.hard': '어려움',
  'cfg.sudden': '서든데스', 'cfg.suddenTip': '한 번만 틀려도 끝', 'cfg.pace': '페이스', 'cfg.paceTip': '내 최고 기록 속도로 움직이는 유령 커서',
  'cfg.sec': '{n}초', 'cfg.n.words': '{n}단어', 'cfg.n.sentence': '{n}문장', 'cfg.n.proverb': '{n}개', 'cfg.n.office': '{n}문장',
  'cfg.n.quote': '{n}개', 'cfg.n.passage': '{n}문단', 'cfg.n.code': '{n}조각',
  'src.sentence': '문장', 'src.proverb': '속담', 'src.quote': '명언', 'src.words': '낱말', 'src.passage': '글', 'src.office': '이포넷',
  'tag.practice': '연습', 'tag.daily': '오늘의 도전 #{n}',

  'hint.restart': '다시 시작', 'hint.next': '다음 줄', 'hint.menu': '설정',
  'stage.placeholder': '첫 키를 누르면 시작합니다', 'stage.placeholderKo': '첫 키를 누르면 시작합니다 — 한글 입력 상태인지 확인하세요',
  'stage.focus': '클릭해서 이어서 치기', 'stage.aria': '여기에 입력하세요', 'stage.secLeft': '초 남음', 'stage.notYet': '아직 줄이 남았어요. 끝까지 치고 Enter!',
  'stage.imeKo': '영문이 입력되고 있어요. 한/영 키를 눌러 주세요.', 'stage.imeEn': '한글이 입력되고 있어요. 한/영 키를 눌러 주세요.',

  'res.title': '결과', 'res.acc': '정확도', 'res.raw': '원시 속도', 'res.cons': '일관성', 'res.time': '시간', 'res.cpm': '글자/분',
  'res.chart': '시간별 속도', 'res.chartLabel': '초 단위 속도 그래프', 'res.errors': '실수', 'res.errorsN': '실수 {n}',
  'res.chars': '글자', 'res.entries': '입력 {n} · 실수 {e}', 'res.correct': '맞음', 'res.incorrect': '틀림', 'res.extra': '더 침', 'res.missed': '빠뜨림',
  'res.charAcc': '최종 글자 정확도 {v}% · 단어 {w}/{n}개 정확',
  'res.failed': '서든데스 실패', 'res.failedTitle': '앗, 틀렸어요!', 'res.failedSub': '서든데스는 실수 한 번이면 끝. 다시 도전!',
  'res.pb': '최고 기록!', 'res.pbPrev': '이전 {v}', 'res.levelUp': '레벨 {n}', 'res.bestIs': '이 설정 최고 기록 {v} {u}',
  'res.toNext': '다음 등급까지 {n} {u}', 'res.top': '최고 등급입니다.',
  'res.standing': '순위', 'res.daily': '오늘의 도전', 'res.today': '오늘', 'res.allTime': '역대 (이름별 최고)',
  'res.place': '{n}위', 'res.outside': '100위 밖',
  'res.anonNote': '이 기록은 오늘 순위표에 익명으로 올라갔어요. 이름을 남기려면 순위 등록을 누르세요.',
  'res.localNote': '개발 환경에서는 순위표에 기록하지 않습니다.',
  'res.practiceNote': '순위표에는 60초 테스트(한글 문장·이포넷 / English 낱말·보통 / 코드)만 올라갑니다. 이 기록은 내 기록에 저장돼요.',
  'res.drillWeak': '이번 연습에서 가장 많이 틀린 키예요.', 'res.drillClean': '실수 없이 끝냈어요. 다음 단계로!',
  'res.next': '다음 테스트', 'res.retry': '같은 글 다시', 'res.save': '순위 등록', 'res.share': '결과 공유', 'res.raceAgain': '다시 레이스',
  'res.mistakes': '틀린 단어', 'res.noMistakes': '틀린 단어가 없어요. 완벽!', 'res.heat': '틀린 키', 'res.heatNote': '진할수록 자주 틀림',

  'mt.score': '점수', 'mt.level': '레벨', 'mt.combo': '콤보', 'mt.pause': '일시정지', 'mt.placeholder': '단어를 치고 Enter',
  'mt.title': '운석 방어', 'mt.how': '섬으로 떨어지는 운석의 단어를 치고 Enter(또는 스페이스)를 눌러 부수세요. 운석이 땅에 닿으면 생명이 하나 줄어요. 8개를 부술 때마다 빨라집니다.',
  'mt.gold': '황금: 점수 3배', 'mt.ice': '얼음: 3초간 모두 멈춤', 'mt.bomb': '폭탄: 화면의 운석 전부 파괴', 'mt.heart': '하트: 생명 +1',
  'mt.start': '시작', 'mt.bestLine': '최고 점수 {s} · 최고 레벨 {l}', 'mt.paused': '일시정지', 'mt.pausedLine': '점수 {s} · 레벨 {l}',
  'mt.resume': '계속', 'mt.quit': '그만하기', 'mt.levelUp': '레벨 {n}!', 'mt.bombHit': '쾅! 전부 파괴', 'mt.iceHit': '얼음! 3초 정지', 'mt.heartHit': '생명 +1',
  'mt.over': '게임 오버', 'mt.words': '부순 단어', 'mt.bestCombo': '최고 콤보', 'mt.accuracy': '명중률', 'mt.again': '다시 하기', 'mt.menu': '메뉴',

  'rc.title': '공룡 레이스', 'rc.how': '신호가 초록불이 되면 출발! 공룡 세 마리보다 먼저 한 문단을 끝까지 치세요. 진행은 맞게 친 글자만큼 나아갑니다.',
  'rc.auto': '내 실력에 맞춤', 'rc.easy': '쉬움', 'rc.normal': '보통', 'rc.hard': '어려움', 'rc.insane': '괴물',
  'rc.autoNote': '상대 속도는 최근 기록의 평균에 맞춰집니다 (한 명은 조금 느리게, 한 명은 비슷하게, 한 명은 조금 빠르게).',
  'rc.fixedNote': '정해진 속도의 상대와 겨룹니다.',
  'rc.start': '출발 준비', 'rc.placeholder': '초록불이 켜지면 바로 치세요!', 'rc.record': '{n}번 중 {w}번 우승', 'rc.you': '나', 'rc.bot.raptor': '랩터', 'rc.bot.stego': '스테고', 'rc.bot.trike': '트리케라',
  'rc.place': '{n}등', 'rc.finished': '골인', 'rc.win': '우승!', 'rc.placed': '{n}등으로 들어왔어요', 'rc.again': '다시 레이스', 'rc.details': '자세한 결과',

  'ranks.title': '순위', 'ranks.today': '오늘', 'ranks.all': '역대', 'ranks.place': '순위', 'ranks.name': '이름', 'ranks.grade': '등급',
  'ranks.score': '점수', 'ranks.date': '날짜', 'ranks.loading': '불러오는 중…', 'ranks.anon': '익명',
  'ranks.empty': '아직 기록이 없어요.', 'ranks.emptyToday': '오늘은 아직 기록이 없어요. 첫 번째가 되어 보세요!',
  'ranks.error': '순위표를 불러오지 못했어요.',
  'ranks.noteToday': '{d} 하루 동안의 기록. 랭크 테스트는 끝날 때마다 익명으로 올라가고, 순위 등록을 하면 이름이 붙어요.',
  'ranks.noteAll': '이름별 최고 기록, 100위까지.',

  'stats.title': '내 기록', 'stats.level': '레벨', 'stats.total': '누적', 'stats.tests': '테스트', 'stats.time': '타자 시간',
  'stats.chars': '맞게 친 글자', 'stats.streak': '연속 / 최장 (일)', 'stats.meteor': '운석 최고 점수', 'stats.race': '레이스 우승 / 출전',
  'stats.history': '최근 기록', 'stats.bests': '최고 기록', 'stats.noBests': '아직 기록이 없어요. 테스트를 하나 끝내 보세요.',
  'stats.noHistory': '두 번 이상 치면 그래프가 나타나요.', 'stats.keys': '키별 실수', 'stats.keysNote': '지금까지 모든 테스트에서 각 키를 틀린 비율이에요. 자리 연습의 약점 연습이 이 데이터를 씁니다.',
  'stats.ach': '업적',
  'stats.lv1': '알 속의 공룡', 'stats.lv2': '아기 공룡', 'stats.lv3': '꼬마 랩터', 'stats.lv4': '날쌘 랩터', 'stats.lv5': '티라노 사냥꾼', 'stats.lv6': '정점의 포식자', 'stats.lv7': '전설의 공룡',

  'drill.ko-home': '기본 자리', 'drill.ko-home.d': 'ㅁㄴㅇㄹㅎ · ㅗㅓㅏㅣ',
  'drill.ko-top': '윗줄', 'drill.ko-top.d': 'ㅂㅈㄷㄱㅅ · ㅛㅕㅑㅐㅔ',
  'drill.ko-bottom': '아랫줄', 'drill.ko-bottom.d': 'ㅋㅌㅊㅍ · ㅠㅜㅡ',
  'drill.ko-shift': '쌍자음', 'drill.ko-shift.d': 'Shift + ㅃㅉㄸㄲㅆ · ㅒㅖ',
  'drill.ko-words': '낱말 연습', 'drill.ko-words.d': '자주 쓰는 낱말 30개',
  'drill.ko-weak': '약점 연습', 'drill.ko-weak.d': '내가 자주 틀리는 키 위주로',
  'drill.en-home': 'Home row', 'drill.en-home.d': 'asdf · jkl;',
  'drill.en-top': 'Top row', 'drill.en-top.d': 'qwert · yuiop',
  'drill.en-bottom': 'Bottom row', 'drill.en-bottom.d': 'zxcvb · nm,.',
  'drill.en-nums': '숫자', 'drill.en-nums.d': '1234567890',
  'drill.en-syms': '기호', 'drill.en-syms.d': '( ) { } [ ] ; = => &&',
  'drill.en-weak': '약점 연습', 'drill.en-weak.d': '내가 자주 틀리는 키 위주로',
  'drill.needData': '약점을 알려면 테스트 기록이 조금 더 필요해요. 우선 낱말 연습부터!',
  'drill.weakKeys': '집중할 키: {k}',

  'set.title': '설정', 'set.ui': '화면 언어', 'set.keySound': '키 소리', 'set.sfx': '효과음', 'set.volume': '음량',
  'set.caret': '커서 모양', 'set.smooth': '부드러운 커서', 'set.liveSpeed': '실시간 속도 표시', 'set.keyboard': '화면 키보드', 'set.size': '글자 크기',
  'set.on': '켜기', 'set.off': '끄기', 'set.soft': '톡톡', 'set.typewriter': '타자기', 'set.caretLine': '세로줄', 'set.caretBlock': '블록', 'set.caretUnder': '밑줄',
  'set.kbAlways': '항상', 'set.kbDrills': '자리 연습만', 'set.small': '작게', 'set.medium': '보통', 'set.large': '크게',
  'set.reset': '기록 초기화', 'set.resetConfirm': '이 기기에 저장된 모든 기록(최고 기록, 업적, 레벨)을 지울까요? 순위표 기록은 지워지지 않아요.',
  'set.resetDone': '기록을 지웠어요.',

  'save.title': '순위 등록', 'save.name': '이름 (2–8자)', 'save.placeholder': '닉네임', 'save.submit': '등록',
  'save.short': '이름이 너무 짧아요. (최소 2글자)', 'save.long': '이름이 너무 길어요. (최대 8글자)', 'save.saving': '저장하는 중…',
  'save.new': '새 기록이 등록됐어요!', 'save.improved': '기록 갱신! {p} → {s}', 'save.lower': '이 이름으로 더 높은 기록({p})이 이미 있어요.',
  'save.local': '개발 환경이라 저장하지 않았어요.', 'save.error': '저장하지 못했어요. 잠시 후 다시 시도해 주세요.',

  'ui.close': '닫기', 'ui.done': '완료',
  'toast.achievement': '업적 달성', 'toast.level': '레벨 {n} 달성!', 'toast.copied': '결과를 복사했어요', 'toast.copyFail': '복사하지 못했어요',
  'toast.update': '새 버전이 있어요. 새로고침해 주세요.',

  'ach.first': '첫 발자국', 'ach.first.d': '테스트 하나 완료',
  'ach.ten': '손풀기', 'ach.ten.d': '테스트 10번 완료',
  'ach.hundred': '타자 중독', 'ach.hundred.d': '테스트 100번 완료',
  'ach.ko300': '300타 클럽', 'ach.ko300.d': '30초 이상 한글 테스트에서 300타',
  'ach.ko500': '500타 클럽', 'ach.ko500.d': '30초 이상 한글 테스트에서 500타',
  'ach.ko700': '700타의 신', 'ach.ko700.d': '30초 이상 한글 테스트에서 700타',
  'ach.en50': '50 WPM', 'ach.en50.d': '30초 이상 영문 테스트에서 50 WPM',
  'ach.en80': '80 WPM', 'ach.en80.d': '30초 이상 영문 테스트에서 80 WPM',
  'ach.en100': '100 WPM', 'ach.en100.d': '30초 이상 영문 테스트에서 100 WPM',
  'ach.en120': '120 WPM', 'ach.en120.d': '30초 이상 영문 테스트에서 120 WPM',
  'ach.code60': '시니어 개발자', 'ach.code60.d': '30초 이상 코드 테스트에서 60 WPM',
  'ach.perfect': '완벽주의자', 'ach.perfect.d': '30초 이상 테스트를 정확도 100%로',
  'ach.marathon': '마라토너', 'ach.marathon.d': '2분 테스트 완주',
  'ach.sudden': '외줄 타기', 'ach.sudden.d': '서든데스로 60초 버티기',
  'ach.polyglot': '폴리글랏', 'ach.polyglot.d': '세 가지 언어로 코드 테스트',
  'ach.daily': '오늘도 출석', 'ach.daily.d': '오늘의 도전 완료',
  'ach.streak3': '3일 연속', 'ach.streak3.d': '3일 연속 플레이',
  'ach.streak7': '일주일 개근', 'ach.streak7.d': '7일 연속 플레이',
  'ach.meteor100': '운석 파괴자', 'ach.meteor100.d': '운석 100개 파괴',
  'ach.meteor10': '섬의 수호자', 'ach.meteor10.d': '운석 방어 레벨 10 도달',
  'ach.race1': '첫 우승', 'ach.race1.d': '공룡 레이스 1등',
  'ach.race10': '챔피언', 'ach.race10.d': '공룡 레이스 10번 우승',
  'ach.drill': '기본기', 'ach.drill.d': '자리 연습 하나 완료',
  'ach.night': '올빼미', 'ach.night.d': '새벽 5시 전에 플레이'
};

const EN = {
  'nav.test': 'Speed test', 'nav.meteor': 'Meteor defense', 'nav.race': 'Dino race', 'nav.daily': 'Daily',
  'nav.drills': 'Key drills', 'nav.ranks': 'Ranks', 'nav.stats': 'My stats',
  'tools.sound': 'Sound on/off', 'tools.lang': 'Interface language (한국어 / English)', 'tools.settings': 'Settings',
  'lang.code': 'Code',

  'home.title': 'Type fast. Type right. Have fun.',
  'home.lede': 'Precise speed tests in Korean, English and code, a meteor shower to stop and dinosaurs to race. A new challenge every day, and leaderboards.',
  'home.start': 'Start a 60s test', 'home.daily': 'Daily challenge', 'home.modes': 'Modes',
  'home.today': "Today's top", 'home.allRanks': 'All leaderboards', 'home.how': 'How it is measured',
  'home.bestKo': 'Best Korean (KPM)', 'home.bestEn': 'Best English (WPM)', 'home.streak': 'Day streak',
  'how.k1': 'KPM', 'how.v1': 'Korean counts correct jamo keystrokes per minute (한 = ㅎ+ㅏ+ㄴ = 3), the 타수 Korean typists know.',
  'how.k2': 'WPM', 'how.v2': 'English and code count correct characters ÷ 5 per minute.',
  'how.k3': 'Accuracy', 'how.v3': 'Every character you typed, mistakes you fixed included.',
  'how.k4': 'Time', 'how.v4': 'Starts at your first key. A syllable still being composed is never marked wrong.',

  'mc.test.kicker': 'Korean · English · code', 'mc.test.desc': '15 seconds to 2 minutes. Sentences, proverbs, quotes, words, code in 10 languages.',
  'mc.meteor.kicker': 'Arcade', 'mc.meteor.desc': 'Words fall on the island. Type them to blow them up. Combos, power-ups, levels.',
  'mc.race.kicker': 'Versus', 'mc.race.desc': 'Race three dinosaurs through a paragraph. They pace themselves to your speed.',
  'mc.daily.kicker': 'New every day', 'mc.daily.desc': 'One paragraph a day, the same for everyone. Share your result.',
  'mc.drills.kicker': 'Basics', 'mc.drills.desc': 'Home row to shifted keys, numbers and symbols, with finger guides and a weak-key drill.',

  'daily.title': 'Daily challenge', 'daily.note': 'Everyone types the same text today. Retry as often as you like; your best run counts.',
  'daily.done': "Today's best: {v} {u} · {a}% accuracy. Beat it?",
  'daily.best': "Today's best: {v} {u} · {a}% accuracy", 'daily.tomorrow': 'A new text arrives at midnight.',

  'cfg.time': 'Time', 'cfg.count': 'Length', 'cfg.punct': 'punctuation', 'cfg.punctTip': 'Add capitals and punctuation',
  'cfg.nums': 'numbers', 'cfg.numsTip': 'Mix in numbers', 'cfg.easy': 'easy', 'cfg.normal': 'normal', 'cfg.hard': 'hard',
  'cfg.sudden': 'sudden death', 'cfg.suddenTip': 'One mistake ends the test', 'cfg.pace': 'pace', 'cfg.paceTip': 'A ghost caret moving at your personal best',
  'cfg.sec': '{n}s', 'cfg.n.words': '{n} words', 'cfg.n.sentence': '{n} sentences', 'cfg.n.proverb': '{n} proverbs', 'cfg.n.office': '{n} sentences',
  'cfg.n.quote': '{n} quotes', 'cfg.n.passage': '{n} paragraphs', 'cfg.n.code': '{n} snippets',
  'src.sentence': 'sentences', 'src.proverb': 'proverbs', 'src.quote': 'quotes', 'src.words': 'words', 'src.passage': 'paragraphs', 'src.office': 'office',
  'tag.practice': 'practice', 'tag.daily': 'Daily #{n}',

  'hint.restart': 'restart', 'hint.next': 'next line', 'hint.menu': 'settings',
  'stage.placeholder': 'The clock starts at your first key', 'stage.placeholderKo': 'The clock starts at your first key — switch your keyboard to Korean',
  'stage.focus': 'Click to keep typing', 'stage.aria': 'Type here', 'stage.secLeft': 's left', 'stage.notYet': 'Most of the line is left. Finish it, then Enter.',
  'stage.imeKo': 'Latin letters are coming in. Switch to Korean input (한/영).', 'stage.imeEn': 'Hangul is coming in. Switch to English input (한/영).',

  'res.title': 'Result', 'res.acc': 'accuracy', 'res.raw': 'raw', 'res.cons': 'consistency', 'res.time': 'time', 'res.cpm': 'chars/min',
  'res.chart': 'Speed over time', 'res.chartLabel': 'Speed per second', 'res.errors': 'errors', 'res.errorsN': '{n} errors',
  'res.chars': 'Characters', 'res.entries': '{n} typed · {e} errors', 'res.correct': 'correct', 'res.incorrect': 'incorrect', 'res.extra': 'extra', 'res.missed': 'missed',
  'res.charAcc': 'Final character accuracy {v}% · {w}/{n} words right',
  'res.failed': 'Sudden death', 'res.failedTitle': 'Oops, a mistake!', 'res.failedSub': 'One slip ends a sudden-death run. Go again!',
  'res.pb': 'Personal best!', 'res.pbPrev': 'was {v}', 'res.levelUp': 'Level {n}', 'res.bestIs': 'Best at this setting: {v} {u}',
  'res.toNext': '{n} {u} to the next tier', 'res.top': 'The top tier.',
  'res.standing': 'Standing', 'res.daily': 'Daily challenge', 'res.today': 'Today', 'res.allTime': 'All time (best per name)',
  'res.place': '#{n}', 'res.outside': 'outside the top 100',
  'res.anonNote': "This run is on today's board as anonymous. Save it to put your name on it.",
  'res.localNote': 'Nothing is written to the leaderboards from a development host.',
  'res.practiceNote': 'Leaderboards take the 60-second tests: Korean sentences or office, English words on normal, or code. This run is in your stats.',
  'res.drillWeak': 'The keys you missed most in this drill.', 'res.drillClean': 'No mistakes. On to the next drill!',
  'res.next': 'Next test', 'res.retry': 'Same text again', 'res.save': 'Save to leaderboard', 'res.share': 'Share', 'res.raceAgain': 'Race again',
  'res.mistakes': 'Missed words', 'res.noMistakes': 'No missed words. Flawless!', 'res.heat': 'Missed keys', 'res.heatNote': 'darker = missed more',

  'mt.score': 'score', 'mt.level': 'level', 'mt.combo': 'combo', 'mt.pause': 'Pause', 'mt.placeholder': 'type a word, press Enter',
  'mt.title': 'Meteor defense', 'mt.how': 'Type the word on a falling meteor and press Enter (or Space) to blow it up. Each one that lands costs a life. Every 8 meteors it gets faster.',
  'mt.gold': 'Gold: triple points', 'mt.ice': 'Ice: everything stops for 3s', 'mt.bomb': 'Bomb: clears the sky', 'mt.heart': 'Heart: one more life',
  'mt.start': 'Start', 'mt.bestLine': 'Best score {s} · best level {l}', 'mt.paused': 'Paused', 'mt.pausedLine': 'Score {s} · level {l}',
  'mt.resume': 'Resume', 'mt.quit': 'Quit', 'mt.levelUp': 'Level {n}!', 'mt.bombHit': 'Boom! Sky cleared', 'mt.iceHit': 'Freeze!', 'mt.heartHit': '+1 life',
  'mt.over': 'Game over', 'mt.words': 'meteors', 'mt.bestCombo': 'best combo', 'mt.accuracy': 'hit rate', 'mt.again': 'Play again', 'mt.menu': 'Menu',

  'rc.title': 'Dino race', 'rc.how': 'Go on green! Finish the paragraph before three dinosaurs do. You move forward by the characters you get right.',
  'rc.auto': 'Matched to me', 'rc.easy': 'easy', 'rc.normal': 'normal', 'rc.hard': 'hard', 'rc.insane': 'monster',
  'rc.autoNote': 'Opponents pace themselves to your recent average: one a bit slower, one about even, one a bit faster.',
  'rc.fixedNote': 'Opponents run at fixed speeds.',
  'rc.start': 'To the start line', 'rc.placeholder': 'Type as soon as the light turns green!', 'rc.record': '{w} wins in {n} races', 'rc.you': 'You', 'rc.bot.raptor': 'Raptor', 'rc.bot.stego': 'Stego', 'rc.bot.trike': 'Trike',
  'rc.place': '#{n}', 'rc.finished': 'Finish', 'rc.win': 'You win!', 'rc.placed': 'You came in #{n}', 'rc.again': 'Race again', 'rc.details': 'Full result',

  'ranks.title': 'Leaderboards', 'ranks.today': 'Today', 'ranks.all': 'All time', 'ranks.place': '#', 'ranks.name': 'Name', 'ranks.grade': 'Grade',
  'ranks.score': 'Score', 'ranks.date': 'Date', 'ranks.loading': 'Loading…', 'ranks.anon': 'anonymous',
  'ranks.empty': 'No records yet.', 'ranks.emptyToday': 'Nobody has played today yet. Be the first!',
  'ranks.error': "Couldn't load the leaderboard.",
  'ranks.noteToday': 'Runs from {d}. Every ranked test lands here anonymously; saving one puts your name on it.',
  'ranks.noteAll': 'Best run per name, top 100.',

  'stats.title': 'My stats', 'stats.level': 'Level', 'stats.total': 'total', 'stats.tests': 'tests', 'stats.time': 'time typing',
  'stats.chars': 'correct characters', 'stats.streak': 'streak / longest (days)', 'stats.meteor': 'meteor best', 'stats.race': 'race wins / races',
  'stats.history': 'Recent results', 'stats.bests': 'Personal bests', 'stats.noBests': 'Nothing yet. Finish a test.',
  'stats.noHistory': 'The chart appears after two results.', 'stats.keys': 'Missed keys', 'stats.keysNote': 'How often each key was missed across every test. The weak-key drill uses this.',
  'stats.ach': 'Achievements',
  'stats.lv1': 'Egg', 'stats.lv2': 'Hatchling', 'stats.lv3': 'Little raptor', 'stats.lv4': 'Swift raptor', 'stats.lv5': 'Rex hunter', 'stats.lv6': 'Apex predator', 'stats.lv7': 'Legendary dino',

  'drill.ko-home': 'Korean home row', 'drill.ko-home.d': 'ㅁㄴㅇㄹㅎ · ㅗㅓㅏㅣ',
  'drill.ko-top': 'Korean top row', 'drill.ko-top.d': 'ㅂㅈㄷㄱㅅ · ㅛㅕㅑㅐㅔ',
  'drill.ko-bottom': 'Korean bottom row', 'drill.ko-bottom.d': 'ㅋㅌㅊㅍ · ㅠㅜㅡ',
  'drill.ko-shift': 'Double consonants', 'drill.ko-shift.d': 'Shift + ㅃㅉㄸㄲㅆ · ㅒㅖ',
  'drill.ko-words': 'Korean words', 'drill.ko-words.d': '30 common words',
  'drill.ko-weak': 'Weak keys', 'drill.ko-weak.d': 'Built from the keys you miss',
  'drill.en-home': 'Home row', 'drill.en-home.d': 'asdf · jkl;',
  'drill.en-top': 'Top row', 'drill.en-top.d': 'qwert · yuiop',
  'drill.en-bottom': 'Bottom row', 'drill.en-bottom.d': 'zxcvb · nm,.',
  'drill.en-nums': 'Numbers', 'drill.en-nums.d': '1234567890',
  'drill.en-syms': 'Symbols', 'drill.en-syms.d': '( ) { } [ ] ; = => &&',
  'drill.en-weak': 'Weak keys', 'drill.en-weak.d': 'Built from the keys you miss',
  'drill.needData': 'A few more tests are needed to find your weak keys. Starting with words.',
  'drill.weakKeys': 'Focus keys: {k}',

  'set.title': 'Settings', 'set.ui': 'Interface language', 'set.keySound': 'Key sound', 'set.sfx': 'Game sounds', 'set.volume': 'Volume',
  'set.caret': 'Caret', 'set.smooth': 'Smooth caret', 'set.liveSpeed': 'Live speed', 'set.keyboard': 'On-screen keyboard', 'set.size': 'Text size',
  'set.on': 'on', 'set.off': 'off', 'set.soft': 'soft', 'set.typewriter': 'typewriter', 'set.caretLine': 'line', 'set.caretBlock': 'block', 'set.caretUnder': 'underline',
  'set.kbAlways': 'always', 'set.kbDrills': 'drills only', 'set.small': 'small', 'set.medium': 'medium', 'set.large': 'large',
  'set.reset': 'Reset my data', 'set.resetConfirm': 'Delete everything saved on this device (bests, achievements, level)? Leaderboard entries stay.',
  'set.resetDone': 'Your data was reset.',

  'save.title': 'Save to leaderboard', 'save.name': 'Name (2–8 characters)', 'save.placeholder': 'nickname', 'save.submit': 'Save',
  'save.short': 'Too short (at least 2 characters).', 'save.long': 'Too long (at most 8 characters).', 'save.saving': 'Saving…',
  'save.new': 'Saved. You are on the board!', 'save.improved': 'New best! {p} → {s}', 'save.lower': 'This name already has a higher score ({p}).',
  'save.local': 'Not saved: this is a development host.', 'save.error': "Couldn't save. Try again in a moment.",

  'ui.close': 'Close', 'ui.done': 'Done',
  'toast.achievement': 'Achievement unlocked', 'toast.level': 'Level {n}!', 'toast.copied': 'Result copied', 'toast.copyFail': "Couldn't copy",
  'toast.update': 'A new version is out. Refresh the page.',

  'ach.first': 'First steps', 'ach.first.d': 'Finish a test',
  'ach.ten': 'Warmed up', 'ach.ten.d': 'Finish 10 tests',
  'ach.hundred': 'Hooked', 'ach.hundred.d': 'Finish 100 tests',
  'ach.ko300': '300 KPM club', 'ach.ko300.d': '300 KPM in a Korean test of 30s+',
  'ach.ko500': '500 KPM club', 'ach.ko500.d': '500 KPM in a Korean test of 30s+',
  'ach.ko700': '700 KPM', 'ach.ko700.d': '700 KPM in a Korean test of 30s+',
  'ach.en50': '50 WPM', 'ach.en50.d': '50 WPM in an English test of 30s+',
  'ach.en80': '80 WPM', 'ach.en80.d': '80 WPM in an English test of 30s+',
  'ach.en100': '100 WPM', 'ach.en100.d': '100 WPM in an English test of 30s+',
  'ach.en120': '120 WPM', 'ach.en120.d': '120 WPM in an English test of 30s+',
  'ach.code60': 'Senior engineer', 'ach.code60.d': '60 WPM in a code test of 30s+',
  'ach.perfect': 'Perfectionist', 'ach.perfect.d': '100% accuracy over 30s+',
  'ach.marathon': 'Marathoner', 'ach.marathon.d': 'Finish a 2-minute test',
  'ach.sudden': 'Tightrope', 'ach.sudden.d': 'Survive 60s of sudden death',
  'ach.polyglot': 'Polyglot', 'ach.polyglot.d': 'Code tests in three languages',
  'ach.daily': 'Showed up', 'ach.daily.d': 'Finish a daily challenge',
  'ach.streak3': 'Three in a row', 'ach.streak3.d': 'Play 3 days in a row',
  'ach.streak7': 'Full week', 'ach.streak7.d': 'Play 7 days in a row',
  'ach.meteor100': 'Meteor breaker', 'ach.meteor100.d': 'Destroy 100 meteors',
  'ach.meteor10': 'Island guardian', 'ach.meteor10.d': 'Reach level 10 in meteor defense',
  'ach.race1': 'First win', 'ach.race1.d': 'Win a dino race',
  'ach.race10': 'Champion', 'ach.race10.d': 'Win 10 dino races',
  'ach.drill': 'Fundamentals', 'ach.drill.d': 'Finish a key drill',
  'ach.night': 'Night owl', 'ach.night.d': 'Play before 5 a.m.'
};

const DICTS = { ko: KO, en: EN };

export function setUi(l) { ui = l === 'en' ? 'en' : 'ko'; document.documentElement.setAttribute('data-ui', ui); }
export function getUi() { return ui; }

export function t(key) {
  const d = DICTS[ui];
  if (key in d) return d[key];
  if (key in KO) return KO[key];
  if (typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname)) console.warn('i18n: missing', key);
  return key;
}

export function fmt(key, vars) {
  return t(key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
}

export function unit(lang) {
  if (lang === 'ko') return ui === 'en' ? 'KPM' : '타/분';
  return 'WPM';
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    const v = t(el.dataset.i18nLabel);
    el.setAttribute('aria-label', v);
    el.setAttribute('title', v);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)));
  document.documentElement.lang = ui;
}
