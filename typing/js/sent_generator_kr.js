// var nouns = ["감자","과자","사탕","낙타","컴퓨터","키보드","다람쥐","공룡","슬랙","핸드폰", "사진기","물컵", "모니터", "창고", "강아지", "고양이", "냉장고", "다리미", "컵", "포크", "숟가락", "명함", "곰", "거북이", "토끼", "빗자루", "쇳덩어리", "구슬", "스트레칭 도구", "마사지 의자", "블루투스 이어폰", "유선 핸드폰", "명품 가방", "하이힐", "뚜레쥬르", "글루", "체리", "서버", "경지실", "경전실", "체리 개발팀", "야구 빠따", "원숭이", "생쥐", "친구", "사람", "모닥불", "아이스크림", "스테이크", "미국산 고기", "살아있는 한우", "소", "강아지", "고양이"]
        
// var verbs = ["먹었다", "때렸다","째려봤다","걷어 찼다", "싫어한다", "좋아한다", "혐오한다", "공격했다", "돌려버렸다", "시도했다", "박살냈다", "싸대기 때렸다", "반토막냈다", "쳐다봤다", "패버렸다", "상상해봤다", "갈궜다", "뿌리쳤다", "깨물어버렸다", "개발했다", "해킹했다", "망하게 해버렸다", "망가트렸다", "위조했다", "기부했다", "밀어 냈다", "잡아 당겼다", "욕했다"]

// var adjectives = ["맛있게", "힘차게", "겨우", "천천히", "멋있게", "예쁘게", "빠르게", "뜨겁게", "이상하게", "귀엽게", "따끈하게","얄밉게", "차갑게", "어중간하게", "어색하게", "똑똑하게", "천재 처럼", "할듯 말듯", "뚜잉스럽게", "찰지게", "무섭게"];


// function generateName(){
//   const f = ["김", "박", "이", "장", "임", "양", "한", "서", "안"];
//   const s = ["형", "민", "희", "주", "성", "호", "광", "천", "세", "훈", "석", "영", "은", "연", "경", "고", "운", "소", "희", "정"];

//   return f[ri(f.length)] + s[ri(s.length)] + s[ri(s.length)];
// }

// function getKrSent(){
//   pnouns = [];
//   pnouns.push(generateName());

//   var sent = ""

//   var pnoun = pnouns[ri(pnouns.length)];
//   var noun =  nouns[ri(nouns.length)];
//   var adjective = adjectives[ri(adjectives.length)];
//   var verb = verbs[ri(verbs.length)];

//   sent += pnoun + (checkBatchimEnding(pnoun)? "은 " : "는 ") + noun + (checkBatchimEnding(noun)? "을 " : "를 ") + adjective + " " + verb;
//   sent += ".";

//   return sent;
// }

// function getE4netSent(){

// }

// function checkBatchimEnding(word) {
//   if (typeof word !== 'string') return null;

//   var lastLetter = word[word.length - 1];
//   var uni = lastLetter.charCodeAt(0);

//   if (uni < 44032 || uni > 55203) return null;

//   return (uni - 44032) % 28 != 0;
// }