function set_uninstall_url(installation_time, random_id) {
    const uninst_url = `http://www.auto-subtitle.com/uninstall-surveys?installed=${installation_time}&rand_id=${random_id}`;
    chrome.runtime.setUninstallURL(uninst_url);
}


function check_app_info(app_info) {
    if (app_info === undefined || app_info.random_id === undefined || app_info.installation_time === undefined) {
        app_info = {
            random_id: parseInt(Math.random() * 1000000000000000),
            installation_time: (new Date()).toISOString()
        };
        chrome.storage.local.set({ app_info });
        set_uninstall_url(app_info.installation_time, app_info.random_id);
    }
    return app_info;
}

function post_log(log_name, body) {
    const url = `https://www.auto-subtitle.com/log/${log_name}`;
    const post_info = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        body: JSON.stringify(body)
    };
    fetch(url, post_info)
        .then(function (res) { return res.json(); })
        .then(function (data) { console.log(`log: ${log_name} result:${JSON.stringify(data)}`) });
}

function has_jquery_ui() {
    return typeof(jQuery) !== 'undefined' && typeof(jQuery.ui) !== 'undefined';
}

function injected_code(tab_id, jquery_ui) {
    if (!jquery_ui) {
        chrome.scripting.insertCSS({
            target: { tabId: tab_id },
            files: ["jquery-ui.css"]
        });
        chrome.scripting.executeScript({
            target: { tabId: tab_id },
            files: ["jquery-3.4.1.min.js"]
        });
        chrome.scripting.executeScript({
            target: { tabId: tab_id },
            files: ["jquery-ui.min.js"]
        });    
    }
    chrome.scripting.executeScript({
        target: { tabId: tab_id },
        files: ["content2.js"]
    });
}


chrome.runtime.onInstalled.addListener(() => {
    let app_info;
    chrome.storage.local.get(['app_info'], param => {
        app_info = param.app_info;
        if (app_info === undefined || app_info.random_id === undefined || app_info.installation_time === undefined) {
            app_info = {
                random_id: parseInt(Math.random() * 1000000000000000),
                installation_time: (new Date()).toISOString()
            };
            chrome.storage.local.set({ app_info });
        }
        set_uninstall_url(app_info.installation_time, app_info.random_id);
    });
});


chrome.action.onClicked.addListener((tab) => {  //send to allframe of active tab
    chrome.tabs.sendMessage(tab.id, { action: "action-clicked" }, {}, response => { });
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log(`on message ${msg.action}`);
    if (!msg || !msg.action) return;
    switch (msg.action) {
        case "log-status":
            chrome.storage.local.get(['app_info', 'status_info'], param => {
                let app_info = check_app_info(param.app_info);
                let status_info = param.status_info;
                if (status_info === undefined || status_info.current_status === undefined || status_info.current_status_count === undefined) {
                    status_info = { current_status_count: 0, current_status: "none" };
                }
                if (status_info.current_status === msg.payload) {
                    status_info.current_status_count++;
                } else {
                    post_log("status2", {
                        installation_time: app_info.installation_time,
                        random_id: app_info.random_id,
                        contents: [[status_info.current_status, status_info.current_status_count],
                        [msg.payload, 0]]
                    });
                    status_info = { current_status_count: 0, current_status: msg.payload };
                }
                chrome.storage.local.set({ status_info });
            });
            break;
        case "log-error":
            chrome.storage.local.get(['app_info', 'log_error', 'status_info'], param => {
                let now = Date.now();
                let app_info = check_app_info(param.app_info);
                let log_error = param.log_error;
                let status_info = param.status_info;
                if (log_error === undefined || log_error.report_count === undefined || log_error.report_time === undefined
                    || (now - log_error.report_time) > 3600000) {
                    log_error = { report_count: 0, report_time: now };
                } else {
                    log_error.report_count++;
                }
                chrome.storage.local.set({ log_error });
                if (log_error.report_count < 3) {
                    post_log("error", {
                        installation_time: app_info.installation_time,
                        random_id: app_info.random_id,
                        status: status_info ? (status_info.current_status || "none") : "none",
                        error: JSON.stringify(msg.payload)
                    });
                }
            });
            break;
        case "capture-ready": {
            chrome.storage.local.get(["current_tab_frame"], param => {
                let ctf = param && param.current_tab_frame;
                console.log("current_tab_frame " + JSON.stringify(ctf));
                if (ctf && ctf.tab_id !== undefined && ctf.frame_id !== undefined) {
                    chrome.tabs.sendMessage(ctf.tab_id, {action: "stop-capture-stream"}, {frameId: ctf.frame_id});
                    chrome.tabs.sendMessage(ctf.tab_id, {action: "close-dialog"}, {});
                }
                chrome.scripting.executeScript(
                    {
                        target: { tabId: sender.tab.id, allFrames: false },
                        function: has_jquery_ui,
                    },
                    (injectionResults) => {
                        const hasJqueryUI = injectionResults[0];
                        console.log('Has jQuery ui: ' + hasJqueryUI.result);
                        injected_code(sender.tab.id, hasJqueryUI.result);
                    });
                
                chrome.storage.local.set({ current_tab_frame: { tab_id: sender.tab.id, frame_id: sender.frameId } });
            });
        }
            break;
        case "close-dialog": {
                chrome.storage.local.get(["current_tab_frame"], param => {
                    let ctf = param && param.current_tab_frame;
                    console.log("current_tab_frame " + JSON.stringify(ctf));
                    if (ctf && ctf.tab_id !== undefined && ctf.frame_id !== undefined) {
                        chrome.tabs.sendMessage(ctf.tab_id, {action: "stop-capture-stream"}, {frameId: ctf.frame_id});
                    }
                    chrome.storage.local.set({ current_tab_frame: {} });
                });
            }
                break;
    }
});
