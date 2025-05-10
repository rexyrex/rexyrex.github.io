    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    function ri(max) {
      return Math.floor(Math.random() * Math.floor(max));
    }
    
    function getNoun(){
      return nouns[ri(nouns.length)];
    }
    
    function getVerb(){
      return verbs[ri(verbs.length)];
    }
    
    function getAdjective(){
      return adjectives[ri(adjectives.length)];
    }
    
    function getSimpleWord(){
      return simpleWords[ri(simpleWords.length)];
    }
    
    function getWord(){
      var rand = getRandomInt(0,27);
      var word = "error";
      switch(rand){
        case 0: word = getNoun(); break;
        case 1: word = getVerb(); break;
        case 2: word = getAdjective(); break;
        default: word = getSimpleWord(); break;
      }
      return word;
    }