const AWS = require('aws-sdk');

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
            self.translator.translateText(payload, (err, data) => {
                if (err) {
                    show_notify_ui("error", "AWS translate api", err.message);
                    debug_log(err);
                    post_message("translate", null);
                } else if (data) {
                    post_message("translate", data.TranslatedText ? data.TranslatedText : null);
                }else{
                    post_message("translate", null);
                }
            });
        }
            break;
        case "settings": {
            debug_log("settings aws" + JSON.stringify(payload));
            AWS.config.region = payload.region;
            AWS.config.credentials = new AWS.Credentials({
                accessKeyId: payload.access_id,
                secretAccessKey: payload.secret_key,
                sessionToken: payload.session_token
            });
            self.translator = new AWS.Translate({ region: AWS.config.region });
        }
            break;
    }
};