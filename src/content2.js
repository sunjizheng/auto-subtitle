
let vp_html = chrome.runtime.getURL("video_player.html");

function close_dialog(notify_bg){
    console.log("dialog close");
    if (notify_bg) {
        chrome.runtime.sendMessage({action: "close-dialog"});
    }
    $("#auto-subtitle-embedded-dialog").remove();
}

window.dst_player_dlg = $('<div id="auto-subtitle-embedded-dialog" title="Auto-Subtitle Extension">' +
`<iframe id="auto-subtitle" src="${vp_html}"` + 
' style="border: none; height: 100%; width: 100%; overflow: hidden; padding: 0px;"' + 
' scrolling="no"></iframe></div>').dialog({
    resizable: true, 
    height: 700,
    width: 660, 
    minHeight: 240, 
    minWidth: 320,
    create: function( event, ui ) {
        console.log("dialog create");
    },
    close: function(event, ui){
        close_dialog(true);
    }
});



chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log(`on message ${msg.action}`);
    if (!msg || !msg.action) return;
    switch (msg.action) {
        case "close-dialog": {
            close_dialog(false);
        }
        break;
    }
});

//dst_player_dlg.dialog( "moveToTop" );
//dst_player_dlg.dialog( "option", "position", { my: "left top", at: "left bottom", of: button } ); https://api.jqueryui.com/position/
