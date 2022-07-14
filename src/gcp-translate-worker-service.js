let gcp_key = null;


const post_message = (action, payload) => {
    self.postMessage({ action, payload });
};

const debug_log = msg => post_message("debug-log", "translate:" + msg);
const show_notify_ui = (level, title, text) => post_message("show-notify-ui", { level, title, text });

self.onmessage = function (event) {
    let action = event.data.action;
    let payload = event.data.payload;
    switch (action) {
        case "translate": {
            if (gcp_key) {
                fetch(`https://translation.googleapis.com/language/translate/v2?key=${gcp_key}`, {
                    method: "POST",
                    mode: 'cors',
                    body: JSON.stringify({
                        q: payload.Text,
                        source: payload.SourceLanguageCode,
                        target: payload.TargetLanguageCode,
                        format: 'text'
                    })
                }).then(resp => {
                    return resp.json();
                }).then(data => {
                    if (data.error) {
                        show_notify_ui("error", "translation.googleapis.com", data.error.message);
                    }
                    post_message("translate", data.data ? data.data.translations[0].translatedText : null);
                }).catch(function (error) {
                    show_notify_ui("warning", "translation.googleapis.com", error.message);
                    post_message("translate", null);
                });
            }
        }
            break;
        case "settings": {
            debug_log("settings gcp " + JSON.stringify(payload));
            gcp_key = payload.key;
        }
            break;
    }
};