'use strict';

exports.is_firefox = false;
exports.current_browser = chrome;

exports.empty_func = function(){}

try{
    exports.current_browser = browser;
    browser.runtime.getBrowserInfo().then(function (info){
        if(info.name == "Firefox"){
            exports.is_firefox = true;
        }
    });
}catch(e){
    exports.current_browser = chrome;
}

exports.windows_create = exports.is_firefox ? function(options, callback=exports.empty_func){
    browser.windows.create(options).then(callback);
} : function(options, callback){
    chrome.windows.create(options, callback);
};

exports.getBackgroundPage = exports.is_firefox ? browser.runtime.getBackgroundPage :
    chrome.runtime.getBackgroundPage;

exports.storage_local_get = exports.is_firefox ? function(key_name, callback){
    browser.storage.local.get(key_name).then(callback);
} : function(key_name, callback){
    chrome.storage.local.get(key_name, callback);
};

exports.runtime_sendMessage = exports.is_firefox ? function(message, responseCallback=exports.empty_func){
    browser.runtime.sendMessage(message).then(responseCallback);
} : function(message, responseCallback){
    chrome.runtime.sendMessage(message, responseCallback);
};

exports.tabs_sendMessage = exports.is_firefox ? function(tabId, message, options, callback=exports.empty_func){
    browser.tabs.sendMessage(tabId, message, options).then(callback);
} : function(tabId, message, options, callback){
    chrome.tabs.sendMessage(tabId, message, options, callback);
};

exports.contextMenus_create = function(options){
    if(browser.menus != undefined){
        browser.menus.create(options);
    }else{
        chrome.contextMenus.create(options);
    }
}

exports.contextMenus_getTargetElement = function(elementId){
    if(browser.contextMenus != undefined){
        return browser.contextMenus.getTargetElement(elementId);
    }else{
        return chrome.contextMenus.getTargetElement(elementId);
    }
};

exports.storage_add_onchange = exports.is_firefox ? function(callback){
    browser.storage.onChanged.addListener(callback);
} : function (callback) {
    chrome.storage.onChanged.addListener(callback);
};

exports.getUILanguage = exports.is_firefox ? browser.i18n.getUILanguage : chrome.i18n.getUILanguage;
exports.getMessage = exports.is_firefox ? browser.i18n.getMessage : chrome.i18n.getMessage;

exports.tabs_getCurrent = exports.is_firefox ? function (callback){
    browser.tabs.getCurrent().then(callback);
} : function(callback) {
    chrome.tabs.getCurrent(callback);
};


exports.i18n = function(){
    let lg = exports.getUILanguage();
    let lgs = new Set(["es", "fr"]);
    if(lg.indexOf('-') > 0){
        lg = lg.substring(0, lg.indexOf('-'));
    }
    if(lgs.has(lg)){
        $(".i18n").each(function(_, elem){
            $(elem).html(exports.getMessage($(elem).data("i18n")));
        });
        $(".i18n-placeholder").each(function(_, elem){
            $(elem).attr("placeholder", exports.getMessage($(elem).data("i18n-placeholder")));
        });
        $(".i18n-title").each(function(_, elem){
            $(elem).attr("title", exports.getMessage($(elem).data("i18n-title")));
        });
        $(".i18n-label").each(function(_, elem){
            $(elem).attr("label", exports.getMessage($(elem).data("i18n-label")));
        });
    }
}

exports.getUILanguage = function(){
	let lg = chrome.i18n.getUILanguage();
	let lgs = new Set(["en", "es", "fr", "zh", "zh-TW"]);
}

exports.open_tab = function (url){
    exports.current_browser.tabs.create({active:true,url:url});
}

exports.ext_url = exports.current_browser.runtime.getURL;

exports.except_func = function(){
    let i = null;
    let j = i();
    return j;
}

exports.log_error = function (msg) {
    exports.runtime_sendMessage({ action: "error", error: msg });
}

exports.log_status = function (status) {
    exports.runtime_sendMessage({ action: "status", status: status });
}
/*
exports.new_shareArrayBuffer = function(arr){
    let buffer = null;
    if(exports.is_chrome){
        buffer = new SharedArrayBuffer(arr.length);
    }else{
        buffer = new ArrayBuffer(arr.length);
    }
    buffer.set(arr, 0);
    return buffer;
}; 

*/
