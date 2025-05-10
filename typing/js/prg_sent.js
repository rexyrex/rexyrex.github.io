var serviceStrList = ["auth", "payment", "web", "blockchain", "connection", "coms"];
var mvcTypeStrList = ["Controller", "Service", "Mapper", "Utils"];
var crudStrList = ["update", "insert", "select", "put", "get", "delete"];
var dbColStrList = ["Phone", "Email", "Id", "Status", "Date", "Time", "Pass", "Code", "Data", "Gender", "Face", "Sign", "Address", "Amount", "Friends"];
var pubPrivStrList = ["public", "private", "protected"];
var returnTypeStrList = ["int", "Integer", "String", "CommonMap", "ModelMap", "Object"];
var shortVarStrList = ["i", "a", "z", "k", "key", "val", "rex", "j", "b", "c", "root"];
var longVarStrList = ["status", "person", "phone", "user", "value", "num", "obj", "address", "computer", "girl", "boy", "gender", "index", "house", "count", "type", "hash", "id"];
var listTypeStrList = ["List", "Arr", "Array", "Matrix", "Map"];
var restList = ["RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping"];

function getListVal(listType){
    return listType[ri(listType.length)];
}

function getFunctionName(){
    var crudStr = getListVal(crudStrList);
    var dbColStr = dbColStrList[ri(dbColStrList.length)];

    return `${crudStr}${dbColStr}`;
}

function getPrgSent1(){
    var serviceStr = serviceStrList[ri(serviceStrList.length)];
    var mvcTypeStr = mvcTypeStrList[ri(mvcTypeStrList.length)];
    var returnTypeStr = returnTypeStrList[ri(returnTypeStrList.length)];
    var longVarStr = longVarStrList[ri(longVarStrList.length)]; 
    var longVarStr2 = longVarStrList[ri(longVarStrList.length)]; 
    
    return `${returnTypeStr} ${longVarStr} = ${serviceStr}${mvcTypeStr}.` + getFunctionName() + `(${longVarStr2});`;
}

function getPrgSent2(){
    var pubPrivStr = pubPrivStrList[ri(pubPrivStrList.length)];
    var returnTypeStr = returnTypeStrList[ri(returnTypeStrList.length)];
    var returnTypeStr2 = returnTypeStrList[ri(returnTypeStrList.length)];
    
    return `${pubPrivStr} ` + (Math.random() > 0.5 ? 'static ' : '') + `${returnTypeStr} ` + getFunctionName() + `(${returnTypeStr2} ` + getWord() + `)`;
}

function getPrgSent3(){
    var shortVarStr = shortVarStrList[ri(shortVarStrList.length)];
    var longVarStr = longVarStrList[ri(longVarStrList.length)]; 
    var listTypeStr = listTypeStrList[ri(listTypeStrList.length)]; 

    return `for(int ${shortVarStr}=` + getRandomInt(0,100) + `; ${shortVarStr}&lt${longVarStr}${listTypeStr}.length(); ${shortVarStr}++)`
}

function getPrgSent3(){
    var shortVarStr = shortVarStrList[ri(shortVarStrList.length)];
    return `System.out.println("${shortVarStr}="+${shortVarStr});`;
}

function getPrgSent4(){
    var rest = restList[ri(restList.length)];
    var longVarStr = longVarStrList[ri(longVarStrList.length)]; 
    return `@${rest}("/${longVarStr}")`
}

function getPrgSent5(){
    var retList = [
        "null",
        "0",
        "1",
        getFunctionName(),
        "RestResponseUtil.putSuccess(res)",
        "RestResponseUtil.putFail(\"fail\", failData)",
        "map",
        "true",
        "false",
        "count",
        "\"jsonView\"",
        "status"
    ];
    var retStr = retList[ri(retList.length)];
    return `return ${retStr};`;
}

function getPrgSent6(){
    var logTypeList = ["debug", "error", "info", "warning"];
    var longVarStr = longVarStrList[ri(longVarStrList.length)]; 
    var logStr = logTypeList[ri(logTypeList.length)];
    return `log.${logStr}("${longVarStr}="+${longVarStr});`
}

function getPrgSent(){
    var randInt = getRandomInt(1,8);
    switch(randInt){
        case 1 : return getPrgSent1();
        case 2 : return getPrgSent1();
        case 3 : return getPrgSent2();
        case 4 : return getPrgSent2();
        case 5 : return getPrgSent3();
        case 6 : return getPrgSent4();
        case 7 : return getPrgSent5();
        case 8 : return getPrgSent6();
        default : return "System.out.println('error');";
    }
}