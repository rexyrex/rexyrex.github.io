// Rexyrex Typing Game - Original Logic Restored with Modern UI
// Complete restoration of original functionality

// Firebase Configuration (Original)
var firebaseConfig = {
  apiKey: "AIzaSyANe3HNZoH-3vYVA4tyZRLA_qmsPYmfvbE",
  authDomain: "rextypingspeed.firebaseapp.com",
  projectId: "rextypingspeed",
  storageBucket: "rextypingspeed.appspot.com",
  messagingSenderId: "329903137752",
  appId: "1:329903137752:web:749c515f41a710b265c8ad",
  measurementId: "G-77L95J37F1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
// Make analytics optional
if (typeof firebase.analytics === 'function') {
  firebase.analytics();
}

// Original Game Variables
var db;
var progress;
var secondsPassed;
var timeLimit;
var started;
var keyPressCount;
var keyPressCountTmp;
var correctWordCount;
var incorrectWordCount;
var incWordArr;
var attmpWordArr;
var timerStartedOnce;
var startSentenceTime;
var score;
var accuracy;
var scoreSaved;
var sentenceTriplet;
var prevInputSent;
var countingDown;
var mode;
var daily = false;
const cheatDetect = [];
var givenSentenceList;
var typedSentenceList;
const keyMap = new Map();
const version = 8;
var uuid = uuidv4();

// Original Level Arrays
var level = [
  {"s" : 200, "l" : '죄송한데... 손가락 2개세요?'}, 
  {"s" : 300, "l" : '분발하셔야겠어요'}, 
  {"s" : 380, "l" : '이정도면 평타'}, 
  {"s" : 420, "l" : '평균 이상'}, 
  {"s" : 470, "l" : '빠른편'}, 
  {"s" : 520, "l" : '개발자'}, 
  {"s" : 560, "l" : 'pc카톡 많이 한거 티나네 (임희주급)'}, 
  {"s" : 600, "l" : '타자 말고 잘하는게 없을 확률 높음'}, 
  {"s" : 650, "l" : '대회 나가도 될듯'}, 
  {"s" : 700, "l" : '타자 신'}, 
  {"s" : 740, "l" : '해킹 유저'},
  {"s" : 780, "l" : '기계'},
  {"s" : 820, "l" : '초월자'},
  {"s" : 999999, "l" : '띠용'}
];

var englevel = [
  {"s" : 20, "l" : 'Slowpoke'}, 
  {"s" : 30, "l" : 'Practice makes perfect'}, 
  {"s" : 40, "l" : 'Not bad'}, 
  {"s" : 50, "l" : 'Above Average'}, 
  {"s" : 60, "l" : 'Quite fast'}, 
  {"s" : 70, "l" : 'Developer'}, 
  {"s" : 80, "l" : 'Bunny Typer'}, 
  {"s" : 90, "l" : 'Professional Typer'}, 
  {"s" : 100, "l" : 'Typing God'}, 
  {"s" : 110, "l" : 'Hacker'},
  {"s" : 120, "l" : 'Machine'},
  {"s" : 130, "l" : 'Ridonculous'},
  {"s" : 999999, "l" : 'OMG'}
];

var prglevel = [
  {"s" : 20, "l" : '백수'}, 
  {"s" : 27, "l" : '신입'}, 
  {"s" : 32, "l" : '주임'}, 
  {"s" : 38, "l" : '대리'}, 
  {"s" : 45, "l" : '과장'}, 
  {"s" : 52, "l" : '차장'}, 
  {"s" : 59, "l" : '부장'}, 
  {"s" : 65, "l" : '이사'}, 
  {"s" : 70, "l" : '사장'}, 
  {"s" : 75, "l" : '회장'}, 
  {"s" : 80, "l" : '대통령'},
  {"s" : 85, "l" : 'Elon Musk'},
  {"s" : 90, "l" : '뇌로 프로그래밍하는 외계인'},
  {"s" : 999999, "l" : 'OMG'}
];

const scoreTabs = ['korScoreTab','engScoreTab', 'prgScoreTab'];

// Original jQuery initialization
$(function () {
  $('#korScoreTab').on('click', function (e) {
    setScoreTab('kor');
  })

  $('#engScoreTab').on('click', function (e) {
    setScoreTab('eng');
  })

  $('#prgScoreTab').on('click', function (e) {
    setScoreTab('prg');
  })

  $('#verTitle').text("Ver " + version);
  changeMode(1);
  
  // Initialize Firestore
  db = firebase.firestore();
  saveLogin();
  checkVersion();
  
  timerStartedOnce = false;
  reset();
});

// Original Helper Functions
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function ri(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Firebase Functions
function saveLogin(){
  var dateStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY HH:mm:ss') : new Date().toISOString();
  
  db.collection("login").add({
        uuid: uuid,
        navigator: navigator.userAgent,
        date: dateStr
      }).then((docRef) => {
        
      })
      .catch((error) => {

      });
}

function checkVersion(){
  db.collection("version").orderBy("ver", "desc").limit(1)
  .get()
  .then((querySnapshot) => {
      var serverVer = 100000;
      querySnapshot.forEach((doc) => {
          serverVer = parseInt(doc.data().ver);
      });

      if(version < serverVer){
        alert("캐시를 지워주세요. (Client ver: " + version + ", Server ver: " + serverVer + ")");
        $('#startBtn').text("캐시를 지워주세요.");
        $('#startBtn').attr('disabled', true);

        fadeOut("grp2");
        fadeOut("highScoreBtnDaily");
        fadeOut("highScoreBtnAll")
        fadeOut("modeGrp");
      }

  })
  .catch((error) => {
      console.log("Error getting documents: ", error);
  });
}

// Version Modal
function openVersionModal(){
  $('#versionModal').modal('show');

  db.collection("version").orderBy("ver", "desc").limit(100)
  .get()
  .then((querySnapshot) => {
     var versionList = [];
      querySnapshot.forEach((doc) => {
          versionList.push(doc.data());
      });

      $('#versionTable tbody').empty();
      for(var i=0; i<versionList.length; i++){
        $('#versionTable tbody').append("<tr><td>" + versionList[i].ver + "</td><td>"+ versionList[i].desc + "</td>");
      }
  })
  .catch((error) => {
      console.log("Error getting documents: ", error);
  });
}

// Mode Selection
function changeMode(m){
  mode = m;
  $('.mode-card').removeClass('active');
  $('#chMod'+m).addClass('active');
}

// Score Tab Functions
function setScoreTab(tabType){
  var dateStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY') : new Date().toISOString().split('T')[0];
  
  if(tabType=='kor'){
    for(var i=0; i<scoreTabs.length; i++){
      $('#' + scoreTabs[i]).removeClass('active');
    }
    $('#scoreTitle').text("한타 순위" + (daily ? ' (' + dateStr + ')' : ' (역대)'));
    $('#korScoreTab').addClass('active');
    loadHighscoreData('kor');
  } else if(tabType=='eng'){
    for(var i=0; i<scoreTabs.length; i++){
      $('#' + scoreTabs[i]).removeClass('active');
    }
    $('#scoreTitle').text("English Ranking"+ (daily ? ' (' + dateStr + ')' : ' (역대)'));
    $('#engScoreTab').addClass('active');
    loadHighscoreData('eng');
  } else if(tabType=='prg'){
    for(var i=0; i<scoreTabs.length; i++){
      $('#' + scoreTabs[i]).removeClass('active');
    }
    $('#scoreTitle').text("Programmer Ranking"+ (daily ? ' (' + dateStr + ')' : ' (역대)'));
    $('#prgScoreTab').addClass('active');
    loadHighscoreData('prg');
  }
}

// Original Save/Load Functions
function openSaveCollapseBtn(){
  $('#openSaveCollapseBtn').css("visibility", "hidden");
}

function saveHighscore(){
  if($('#highscoreId').val().length < 2){
    alert("이름이 너무 짧아요.");
    return;
  } else if($('#highscoreId').val().length > 8){
    alert("이름이 너무 길어요.");
    return;
  }

  if(score<0 || isNaN(score)){
    alert("기록 저장 불가 - 한 단어도 안치셨네요 :(");
  }

  if(!scoreSaved){
    scoreSaved = true;
    addHighscore($('#highscoreId').val(), score, getGrade(), Math.round(accuracy*100)+'%');   
    updateAnonHighscore();     
  } else {
    alert("이미 기록 저장하셨네요~");
  }
}

function addAnonHighscore(score, rank, accuracy){
  var keyArr = Array.from(keyMap, ([name, value]) => ({ name, value }));
  var collectionName = '';
  switch(mode){
    case 1: collectionName = 'recordsAnon'; break;
    case 2: collectionName = 'recordsAnon'; break;
    case 3: collectionName = 'engRecordsAnon'; break;
    case 4: collectionName = 'prgRecordsAnon'; break;
  }
  
  var dateStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY HH:mm') : new Date().toISOString();
  var dayStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY') : new Date().toISOString().split('T')[0];
  
  db.collection(collectionName).add({
        uuid: uuid,
        id: "",
        score: score,
        accuracy: accuracy,
        correctWordCount : correctWordCount,
        incorrectWordCount : incorrectWordCount,
        givenSentenceList : givenSentenceList,
        typedSentenceList : typedSentenceList,
        keyMap : keyArr,
        rank: rank,
        clientVersion: version,
        mode: mode,
        cheatDetect: cheatDetect,
        keyPressCount: keyPressCount,
        keyPressCountTmp: keyPressCountTmp,
        date: dateStr,
        day: dayStr
      }).then((docRef) => {
        
      })
      .catch((error) => {
        console.log("error:");
        console.log(error);
      });
}

function updateAnonHighscore(){
  var collectionName = '';
  switch(mode){
    case 1: collectionName = 'recordsAnon'; break;
    case 2: collectionName = 'recordsAnon'; break;
    case 3: collectionName = 'engRecordsAnon'; break;
    case 4: collectionName = 'prgRecordsAnon'; break;
  }
  var tmpId = $('#highscoreId').val();
  db.collection(collectionName).where("uuid", "==", uuid).get()
  .then((querySnapshot) => {
    querySnapshot.forEach((doc) => {
      db.collection(collectionName).doc(doc.id).update({
          id: tmpId,
      })
      .then(() => {
        
      })
    })
  })
}

function addHighscore(username, score, rank, accuracy){
  var keyArr = Array.from(keyMap, ([name, value]) => ({ name, value }));
  var userExists = false;
  var collectionName = '';
  switch(mode){
    case 1: collectionName = 'records2'; break;
    case 2: collectionName = 'records2'; break;
    case 3: collectionName = 'engRecords'; break;
    case 4: collectionName = 'prgRecords'; break;
  }
  
  var dateStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY HH:mm') : new Date().toISOString();
  var dayStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY') : new Date().toISOString().split('T')[0];
  
  //Check if username exists
  db.collection(collectionName).where("id", "==", username).get()
  .then((querySnapshot) => {
    querySnapshot.forEach((doc) => {
        userExists = true;
        //username exists and new highscore reached
        if(doc.data().score < score){
          db.collection(collectionName).doc(doc.id).update({
              score: score,
              accuracy: accuracy,
              correctWordCount : correctWordCount,
              incorrectWordCount : incorrectWordCount,
              givenSentenceList : givenSentenceList,
              typedSentenceList : typedSentenceList,
              keyMap : keyArr,
              rank: rank,
              clientVersion: version,
              mode: mode,
              cheatDetect: cheatDetect,
              keyPressCount: keyPressCount,
              keyPressCountTmp: keyPressCountTmp,
              date: dateStr,
              day: dayStr
          })
          .then(() => {
            alert("기록 갱신하셨습니다! (" + doc.data().score + " => " + score + ")");
          })
        } else {
          alert("더 높은 기록이 있으세요. 기록 갱신 실패. (" + doc.data().score + ")");
        }
    });
    //Add new user
    if(!userExists){
      db.collection(collectionName).add({
        id: username,
        score: score,
        accuracy: accuracy,
        correctWordCount : correctWordCount,
        incorrectWordCount : incorrectWordCount,
        givenSentenceList : givenSentenceList,
        typedSentenceList : typedSentenceList,
        keyMap : keyArr,
        rank: rank,
        clientVersion: version,
        mode: mode,
        cheatDetect: cheatDetect,
        keyPressCount: keyPressCount,
        keyPressCountTmp: keyPressCountTmp,
        date: dateStr,
        day: dayStr
      }).then((docRef) => {
        alert("저장 완료");
      })
      .catch((error) => {
        alert("에러 발생");
      });
    }
  })
  .catch((error) => {
      console.log("Error getting documents: ", error);
  });
}

// Leaderboard Functions
function openHighscoresModal(dly){
  daily = dly;
  $('#highLoading').css("visibility", "visible");
  setScoreTab('kor');
  $('#highscoreModal').modal('show');
}

function loadHighscoreData(scoreType){
  var collectionName = '';
  if(!daily){
    if(scoreType=='kor'){
      collectionName = "records2";
    } else if(scoreType == 'eng'){
      collectionName = "engRecords";
    } else if(scoreType == 'prg'){
      collectionName = "prgRecords";
    }
  } else {
    //daily
    if(scoreType=='kor'){
      collectionName = "recordsAnon";
    } else if(scoreType == 'eng'){
      collectionName = "engRecordsAnon";
    } else if(scoreType == 'prg'){
      collectionName = "prgRecordsAnon";
    }
  }

  var dayStr = typeof moment !== 'undefined' ? moment().format('MM-DD-YYYY') : new Date().toISOString().split('T')[0];

  if(!daily){
    db.collection(collectionName).orderBy("score", "desc").limit(100)
    .get()
    .then((querySnapshot) => {
      var highList = [];
        querySnapshot.forEach((doc) => {
            highList.push(doc.data());
        });
        $('#highLoading').css("visibility", "hidden");
        $('#highScoreTable tbody').empty();
        for(var i=0; i<highList.length; i++){
          $('#highScoreTable tbody').append("<tr><th scope='row'>" + (i+1) + "</th><td>" + highList[i].id + "</td><td>"+ highList[i].rank + "</td><td>"+ highList[i].score + "</td>");
        }
    })
    .catch((error) => {
        console.log("Error getting documents: ", error);
    });
  } else {
    //daily
    db.collection(collectionName).where("day", "==", dayStr).orderBy("score", "desc").limit(100)
    .get()
    .then((querySnapshot) => {
      var highList = [];
        querySnapshot.forEach((doc) => {
            highList.push(doc.data());
        });
        $('#highLoading').css("visibility", "hidden");
        $('#highScoreTable tbody').empty();
        for(var i=0; i<highList.length; i++){
          $('#highScoreTable tbody').append("<tr><th scope='row'>" + (i+1) + "</th><td>" + (highList[i].id == '' ?  '익명 유저' : highList[i].id)+ "</td><td>"+ highList[i].rank + "</td><td>"+ highList[i].score + "</td>");
        }
    })
    .catch((error) => {
        console.log("Error getting documents: ", error);
    });
  }
}

function checkRank(){
  var collectionName = '';
  switch(mode){
    case 1: collectionName = 'records2'; break;
    case 2: collectionName = 'records2'; break;
    case 3: collectionName = 'engRecords'; break;
    case 4: collectionName = 'prgRecords'; break;
  }
  db.collection(collectionName).orderBy("score", "desc").limit(100)
  .get()
  .then((querySnapshot) => {
     var highList = [];
     var i = 0;
     var place = 101;
     var tmpSaved = false;
      querySnapshot.forEach((doc) => {
          highList.push(doc.data());
          i+=1;
          if(score>doc.data().score && !tmpSaved){
            tmpSaved = true;
            place = i;
          }
      });

      if(place < 101){
        $('#resComp').text("상대 평가 : 상위" + Math.round(place/i*100) + "% (" + i + "명 중 " + place + "등)" );
        alert("총 " + i + "명 중 " + place + "등 하셨어요!\n[기록 저장]버튼을 눌러서 순위권에 올라가세요!");
      } else if(i < 101){
        $('#resComp').text("상대 평가 : " + i + "명 중 꼴등");
        alert("총 " + i + "명 중 꼴등 하셨어요!\n[기록 저장]버튼을 눌러서 순위권에 올라가세요!");
      } else {
        $('#resComp').text("상대 평가 : 100등 안에 못들었어요");
      }
  })
  .catch((error) => {
      console.log("Error getting documents: ", error);
  });
}

// Original Game Logic
function reset(){
  console.log('Reset called - before reset: secondsPassed:', secondsPassed, 'started:', started);
  
  uuid = uuidv4();

  started = false;
  countingDown = false;
  progress = 0;
  secondsPassed = 0;
  keyPressCount = 0;
  keyPressCountTmp = 0;
  timeLimit = 60;
  scoreSaved = false;
  
  // Reset smooth animation timer
  window.gameStartTime = null;
  
  correctWordCount = 0;
  incorrectWordCount = 0;
  score = 0;
  accuracy = 0;
  incWordArr = [];
  attmpWordArr = [];

  sentenceTriplet = [];
  prevInputSent = "";

  typedSentenceList = [];
  givenSentenceList = [];

  keyMap.clear();
  
  console.log('Reset completed - after reset: secondsPassed:', secondsPassed, 'started:', started);
  
  // Clear content and animations
  $('#testSentInput').html('');
  $('#testSentInputBefore').html('');
  $('#testSentInputAfter').html('');
  $('#chatInput').val('');
  
  // Reset progress bar
      $(".progress-bar-modern").css("width", "100%").text("60").css('background', 'var(--success)');
  
  // Reset save form state if the function exists
  if (typeof resetSaveForm === 'function') {
    resetSaveForm();
  }
  
  // Reset all animation classes and structure
  $('#menuContent').removeClass('menu-fade-out').show();
  $('#modeSelectionSection').removeClass('menu-fade-out');
  $('.rankings-section').removeClass('menu-fade-out');
  $('#grp2').removeClass('game-start-transition').hide();
  $('#testSentInputBefore').removeClass('text-reveal text-reveal-delay-1');
  $('#testSentInput').removeClass('text-reveal');
  $('#testSentInputAfter').removeClass('text-reveal text-reveal-delay-2');
  $('#chatInput').removeClass('input-focus-ready');
  $('#startBtn').removeClass('countdown-pulse').text("시작");
  
  // Clear any comment visibility
  $('#comment').css("visibility", "hidden");
}

function retry(){
  reset();
  // Don't call start() directly, let startCountDown() handle the flow
}

// Animation Functions
function fadeIn(elemId){
  $('#' + elemId).css("visibility", "visible").css("opacity", 0);
  $('#' + elemId).transition({opacity:1},4000, "snap"); 
}

function fadeIn2(elemId){
  $('#' + elemId).css("visibility", "visible").css("opacity", 0);
  $('#' + elemId).transition({opacity:0.27},4000, "snap");
}

function fadeOut(elemId){
  $('#' + elemId).css("opacity", 1);
  $('#' + elemId).transition({opacity:0}, 4000, "snap", function(){$('#' + elemId).css("visibility", "hidden").css("opacity", 0);});
}

function animate(elemId, anim, fn){
  $('#' + elemId).addClass(anim);
  $('#' + elemId).on("animationend", function(){
    fn();
    $(this).removeClass(anim);
  });
}

// Original Countdown and Start Logic
function startCountDown(){
  $('#chatInput').html('');
  
  console.log('startCountDown called - started:', started, 'countingDown:', countingDown);
  
  // If this is a retry (button says "재도전"), reset the game state first
  if($('#startBtn').text() === "재도전") {
    console.log('This is a retry - calling reset first');
    reset();
  }

  if(!started && !countingDown){
    console.log('Starting countdown...');
    
    // Hide other menu elements but keep the start button for countdown
    $('#modeSelectionSection').addClass('menu-fade-out');
    $('.rankings-section').addClass('menu-fade-out');
    
    countingDown = true;

    var counter = 5;
    $('#startBtn').text(counter).addClass('countdown-pulse');
    
    var counterItv = setInterval(function(){ 
      counter-=1;
      $('#startBtn').text(counter);
      
      if(counter==0){
        clearInterval(counterItv);
        countingDown = false;
        
        // Now hide the entire menu content and show game
        $('#menuContent').addClass('menu-fade-out');
        
        // Start the game after menu fades out
        setTimeout(() => {
          $('#menuContent').hide();
          
          // Prepare game content BEFORE showing the game area
          updateSentenceTriplet();
          $('#testSentInputBefore').html(sentenceTriplet[0]);
          $('#testSentInput').html(sentenceTriplet[1]);
          $('#testSentInputAfter').html(sentenceTriplet[2]);
          
          // Show game area with transition
          $('#grp2').show().addClass('game-start-transition');
          
          // Always call start() for both first time and retry
          start();
        }, 500);
      }
    }, 1000);
  } else {
    console.log('startCountDown blocked - started:', started, 'countingDown:', countingDown);
  }
}

function start(){
  if(!started){
    started = true;
    
    console.log('Game starting - secondsPassed:', secondsPassed, 'timeLimit:', timeLimit);
    
    // Add reveal animations to content that's already visible
    setTimeout(() => {
      $('#testSentInputBefore').addClass('text-reveal-delay-1');
      $('#testSentInput').addClass('text-reveal');
      $('#testSentInputAfter').addClass('text-reveal-delay-2');
      $('#chatInput').addClass('input-focus-ready');
    }, 200);
    
    // Focus on input after animations
    setTimeout(() => {
      $('#chatInput').focus();
    }, 1000);
    
    // Set up the game timer (only once)
    if(!timerStartedOnce){
      timerStartedOnce = true;
      
      // Initialize game start time for smooth animation
      window.gameStartTime = Date.now();

      // Main timer that updates every second
      setInterval(function(){ 
          if(started){
              $('#chatInput').focus();
              progress = secondsPassed/timeLimit * 100;  
              var timeLeftVal = 100 - progress;
              var color = progress < 60 ? 'var(--success)' : (progress < 80 ? 'var(--warning)' : 'var(--error)');
              
              console.log('Timer update - secondsPassed:', secondsPassed, 'timeLimit:', timeLimit, 'progress:', progress, 'timeLeftVal:', timeLeftVal);
              
              $(".progress-bar-modern").css("width", timeLeftVal + "%").text(timeLimit - secondsPassed).css('background', color);
              
              secondsPassed+=1;
              if(secondsPassed > timeLimit){
                console.log('Timer ended - calling endLogic()');
                endLogic();
              }
          }
        }, 1000);
        
      // Smooth progress bar animation - updates every 100ms for smooth effect
      setInterval(function(){
          if(started){
              // Calculate fractional progress for smooth animation
              var currentTime = Date.now();
              var elapsedMs = currentTime - window.gameStartTime;
              var elapsedSeconds = elapsedMs / 1000;
              var smoothProgress = elapsedSeconds / timeLimit * 100;
              var smoothTimeLeftVal = 100 - smoothProgress;
              
              // Only update width for smooth animation, keep text from main timer
              $(".progress-bar-modern").css("width", Math.max(0, smoothTimeLeftVal) + "%");
          }
      }, 100);
      }
    }
}

function endLogic(){
    if(started){
        started = false;

        // Hide game area
        $('#grp2').removeClass('game-start-transition').hide();
        
        // Clear all animation classes
        $('#testSentInputBefore').removeClass('text-reveal text-reveal-delay-1');
        $('#testSentInput').removeClass('text-reveal');
        $('#testSentInputAfter').removeClass('text-reveal text-reveal-delay-2');
        $('#chatInput').removeClass('input-focus-ready');
        
        // Clear content
        $('#testSentInput').html('');
        $('#testSentInputBefore').html('');
        $('#testSentInputAfter').html('');
        $('#chatInput').val('');

        // Show menu content again
        setTimeout(() => {
            $('#menuContent').removeClass('menu-fade-out').show();
            $('#modeSelectionSection').removeClass('menu-fade-out');
            $('.rankings-section').removeClass('menu-fade-out');
            $('#startBtn').removeClass('countdown-pulse').text("재도전");
        }, 500);

        accuracy = correctWordCount / (correctWordCount + incorrectWordCount);
        score = Math.round((keyPressCount + getEffectiveKeyPressCountTmp()) * accuracy);
        if(mode==3||mode==4){
          score = Math.round(score/5);
        }

        checkRank();

        $('#resScore').text("점수 : " + score);
        $('#resGrade').text("등급 : " + "[" + getGrade() + "]");
        $('#resAccuracy').text("정확도 : " + Math.round(accuracy * 100) + "% (" + correctWordCount + "/" + (correctWordCount + incorrectWordCount) + ")");

        $('#incList').empty();
        for(var i=0; i<incWordArr.length; i++){
            $('#incList').append('<li>' + (i+1) + ". " + incWordArr[i] + " ('" + attmpWordArr[i] + "')" + '</li>')
        }

        if(!isNaN(score)){
          addAnonHighscore(score, getGrade(), accuracy);
        }            

        $('#testModal').modal('show');
    }
}

// Original Sentence Generation Functions
function updateSentenceTriplet(){
  if(sentenceTriplet.length == 0){
    sentenceTriplet.push(generateSentence());
    sentenceTriplet.push(generateSentence());
    sentenceTriplet[2] = '.';
  } else {
    //triplet is of length 2 or 3
    sentenceTriplet[2] = sentenceTriplet[1];
    sentenceTriplet[1] = sentenceTriplet[0];
    sentenceTriplet[0] = generateSentence();
  }
}

function checkBatchimEnding(word) {
  if (typeof word !== 'string') return null;

  var lastLetter = word[word.length - 1];
  var uni = lastLetter.charCodeAt(0);

  if (uni < 44032 || uni > 55203) return null;

  return (uni - 44032) % 28 != 0;
}

function generateName(){
  const f = ["김", "박", "이", "장", "임", "양", "한", "서", "안"];
  const s = ["형", "민", "희", "주", "성", "호", "광", "천", "세", "훈", "석", "영", "은", "연", "경", "고", "운", "소", "희", "정"];

  return f[ri(f.length)] + s[ri(s.length)] + s[ri(s.length)];
}

// Fallback functions for missing dependencies
function getWordFallback() {
  // Fallback English words
  var words = ["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say", "she", "too", "use"];
  return words[ri(words.length)];
}

function getPrgSentFallback() {
  // Fallback programming sentences
  var prgSentences = [
    "function calculateSum(a, b) { return a + b; }",
    "const array = [1, 2, 3, 4, 5];",
    "if (condition === true) { console.log('Hello World'); }",
    "for (let i = 0; i < array.length; i++) { process(array[i]); }",
    "class Component extends React.Component { render() { return <div>Hello</div>; } }"
  ];
  return prgSentences[ri(prgSentences.length)];
}

function generateSentence(){
  startSentenceTime = new Date();

  var pnouns;
  var nouns;
  var verbs;
  var adjectives;

  if(mode == 1 || mode == 2){
    pnouns = [];
    pnouns.push(generateName());
  
    nouns = ["감자","과자","사탕","낙타","컴퓨터","키보드","다람쥐","공룡","슬랙","핸드폰", "사진기","물컵", "모니터", "창고", "강아지", "고양이", "냉장고", "다리미", "컵", "포크", "숟가락", "명함", "곰", "거북이", "토끼", "빗자루", "쇳덩어리", "구슬", "스트레칭 도구", "마사지 의자", "블루투스 이어폰", "유선 핸드폰", "명품 가방", "하이힐", "뚜레쥬르", "글루", "체리", "서버", "경지실", "경전실", "체리 개발팀", "야구 빠따", "원숭이", "생쥐", "친구", "사람", "모닥불", "아이스크림", "스테이크", "미국산 고기", "살아있는 한우", "소", "강아지", "고양이", "책상", "의자", "연필", "지우개", "볼펜", "마우스", "노트북", "태블릿", "스마트폰", "시계", "안경", "모자", "신발", "가방", "우산", "자전거", "버스", "기차", "비행기", "배", "자동차", "오토바이", "스케이트보드", "헬리콥터", "책", "신문", "잡지", "편지", "카메라", "텔레비전", "라디오", "전화기", "냉장고", "세탁기", "청소기", "에어컨", "선풍기", "전자레인지"]
    
    verbs = ["먹었다", "때렸다","째려봤다","걷어 찼다", "싫어한다", "좋아한다", "혐오한다", "공격했다", "돌려버렸다", "시도했다", "박살냈다", "싸대기 때렸다", "반토막냈다", "쳐다봤다", "패버렸다", "상상해봤다", "갈궜다", "뿌리쳤다", "깨물어버렸다", "개발했다", "해킹했다", "망하게 해버렸다", "망가트렸다", "위조했다", "기부했다", "밀어 냈다", "잡아 당겼다", "욕했다", "던졌다", "부셨다", "찾았다", "잃어버렸다", "숨겼다", "발견했다", "구매했다", "판매했다", "교환했다", "수리했다", "청소했다", "정리했다", "설치했다", "제거했다", "분석했다", "연구했다", "실험했다", "관찰했다", "기록했다", "저장했다", "삭제했다", "복사했다", "붙여넣기 했다", "공유했다", "차단했다", "신고했다", "추천했다", "평가했다"]

    adjectives = ["맛있게", "힘차게", "겨우", "천천히", "멋있게", "예쁘게", "빠르게", "뜨겁게", "이상하게", "귀엽게", "따끈하게","얄밉게", "차갑게", "어중간하게", "어색하게", "똑똑하게", "천재 처럼", "할듯 말듯", "뚜잉스럽게", "찰지게", "무섭게", "조용히", "시끄럽게", "부드럽게", "거칠게", "신중하게", "대충", "열심히", "게으르게", "진지하게", "재미있게", "지루하게", "신나게", "우울하게", "행복하게", "슬프게", "화나게", "즐겁게", "답답하게", "시원하게", "따뜻하게", "친절하게", "불친절하게", "정직하게", "부정직하게", "현명하게", "어리석게", "용감하게", "겁쟁이처럼", "당당하게", "소심하게"];
    if(mode == 2){
      pnouns = ["이소희 사원님", "전하영 사원님", "장주환 주임님", "김석주 주임님", "김민형", "양세훈","임희주 주임님","서영은 과장님","안상준 대리님", "박성호 소장님", "김광천 이사님", "한세훈 이사님", "박연경 차장님", "이미주"];
      adjectives.push("임희주 답게");
    }
    
    var sent = ""
    var pnoun = pnouns[ri(pnouns.length)];
    var noun =  nouns[ri(nouns.length)];
    var adjective = adjectives[ri(adjectives.length)];
    var verb = verbs[ri(verbs.length)];

    sent += pnoun + (checkBatchimEnding(pnoun)? "은 " : "는 ") + noun + (checkBatchimEnding(noun)? "을 " : "를 ") + adjective + " " + verb;
    sent += ".";
    return sent;
    
  } else if(mode == 3){
    var engSent = "";
    for(var l=0; l<7; l++){
      var engWord;
      // Try to use external getWord function, fallback to internal
      try {
        if (typeof window.getWord === 'function') {
          engWord = window.getWord();
        } else {
          engWord = getWordFallback();
        }
      } catch(e) {
        engWord = getWordFallback();
      }
      
      while(engSent.includes(engWord)){
        try {
          if (typeof window.getWord === 'function') {
            engWord = window.getWord();
          } else {
            engWord = getWordFallback();
          }
        } catch(e) {
          engWord = getWordFallback();
        }
      }
      engSent += engWord + (l==6 ? '' : ' ');
    }
    return engSent;
  } else if(mode==4){
    try {
      if (typeof window.getPrgSent === 'function') {
        return window.getPrgSent();
      } else {
        return getPrgSentFallback();
      }
    } catch(e) {
      return getPrgSentFallback();
    }
  }

  // Fallback
  return "타자 연습을 시작해보세요.";
}

// Scoring Functions
function getEffectiveKeyPressCountTmp(){
  if(typedSentenceList.length == 0){
    return 0;
  } else {
    var avg = Math.round(keyPressCount / typedSentenceList.length);
    if(keyPressCountTmp > avg) {
      return avg;
    } else {
      return keyPressCountTmp;
    }
  }
}

function updateScore(){
    var splitProb = $('#testSentInput').text().split(' ');
    var splitAns = $('#chatInput').val().split(' ');
    
    for(var i=0; i<splitProb.length; i++){
        var eq = false;
        for(var j=0; j<splitAns.length; j++){
            if(splitProb[i] == splitAns[j]){
                eq = true;
                correctWordCount+=1;
                break;
            }
        }
        if(!eq){
            var atmp = i >= splitAns.length ? '?' : splitAns[i];
            attmpWordArr.push(atmp);
            incWordArr.push(splitProb[i]);
            incorrectWordCount+=1;
        }
    }

    var sentenceEndDate = new Date();
    var setenceSecondsElapsed = Math.round((sentenceEndDate - startSentenceTime)/1000);

    $('#comment').text(getComment());
    $('#comment').css("visibility", "visible");
    $('#comment').addClass('comment-fade-in')
    $('#comment').on("animationend", function(){
      $(this).css("visibility", "hidden");
      $(this).removeClass('comment-fade-in');
    });
}

function getComment(){
  var arr = [];
  switch(mode){
    case 1: arr = level; break;
    case 2: arr = level; break;
    case 3: arr = englevel; break;
    case 4: arr = prglevel; break;
    default: break;
  }

  var tmpAccuracy = correctWordCount / (correctWordCount + incorrectWordCount);
  var tmpScore = Math.round(keyPressCount * timeLimit/secondsPassed * tmpAccuracy);
  if(mode==3||mode==4){
    tmpScore = Math.round(tmpScore/5);
  }
    
  var grade = '';
  for(var z=0; z<arr.length; z++){
      if(tmpScore < arr[z].s){
          grade = arr[z].l;
          break;
      }
  }

  return grade;
}

function getGrade(){
  var arr = [];
  switch(mode){
    case 1: arr = level; break;
    case 2: arr = level; break;
    case 3: arr = englevel; break;
    case 4: arr = prglevel; break;
    default: break;
  }
  var grade = '';
  for(var z=0; z<arr.length; z++){
      if(score < arr[z].s){
          grade = arr[z].l;
          break;
      }
  }

  return grade;
}



// Original Keydown Event Listener
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    document.addEventListener('keydown', event => {
      if(started){
        keyPressCountTmp+=1;
        const keyCode = event.code;

        if(keyCode != "Backspace"){
          cheatDetect.push(keyCode);
        
          //cheat detection
          if(cheatDetect.length >= 10){
            cheatDetect.shift();

            var cheating = true;
            for(var z = 1; z < cheatDetect.length; z++){
              if(cheatDetect[z-1] != cheatDetect[z]){
                cheating = false;
                break;
              }
            }
            if(cheating){
              alert("[점수 조작 방지 알림]");
            }
          }
        }

        if(keyMap.has(keyCode)){
          keyMap.set(keyCode, keyMap.get(keyCode) + 1);
        } else {
          keyMap.set(keyCode, 1);
        }
        
        if(keyCode=="Enter"){
          keyPressCount += keyPressCountTmp;
          keyPressCountTmp = 0;
          updateScore();
          updateSentenceTriplet();
          givenSentenceList.push(sentenceTriplet[2]);
          typedSentenceList.push($('#chatInput').val());

          // Simple content update without dramatic animations
          $('#testSentInputBefore').html(sentenceTriplet[0]);
          $('#testSentInput').html(sentenceTriplet[1]);
          $('#testSentInputAfter').html(sentenceTriplet[2]);
          
          // Mark the previous input in the after section
          $("#testSentInputAfter").unmark();
          $('#testSentInputAfter').mark(prevInputSent);
          
          prevInputSent = $('#chatInput').val();
          $('#chatInput').val("");
        }

        $("#testSentInput").unmark();
        var totalInput = $('#chatInput').val();
        $('#testSentInput').mark(totalInput);
      }
    });
}); 