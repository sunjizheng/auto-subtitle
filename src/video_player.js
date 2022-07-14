const adapter = require("./adapter");


let src_url_hash = "";
let video_js_player = null;

let sentences_ = [];
let o_sentences = [];
let sentences_read_idx = 0;

let video_buf = [];
let media_source = null;
let source_buffer = null;
let track_original = null;
let track_translate = null;
let track_both = null;
let mime_codec = 'video/webm; codecs="vp8, opus"';
let time_delay = 15;
let input_sample_rate = null;
let interval_id = null;
let source_player_status = "";
let translating = 0;
let poster = false;
let video_current_time = -10;
let fast_mode = false;
let first_chunk_time = 0;
let first_playing_chunk = true;
let current_range_idx = 0;
let ui_status = "none";
let contnet_win_port2 = null;

let cloud_platform = ["gcp", "aws"];

let aws_params = {
    access_id: "",
    secret_key: "",
    session_token: "",
    region: ""
};

let gcp_params = {
    key: ""
};

let sr_worker_file = {
    aws: "./aws-transcribe-worker.js",
    gcp: "./gcp-speech-to-text-worker.js"
};

let tr_worker_file = {
    aws: "./aws-translate-worker.js",
    gcp: "./gcp-translate-worker.js"
};

let language_params = {
    speech: "",
    subtitle: "",
    speech_label: "",
    subtitle_label: "",
    sr_provider: "aws",
    tr_provider: "aws"
};

let current_sr_worker_service = null;
let current_tr_worker_service = null;

function show_notify_ui(level, title, text) {
    $.notify({
        title: title,
        text: text,
        image: "<img src='images/mail.png'/>"
    }, {
        style: 'metro',
        className: level,
        autoHide: false,
        clickToHide: true
    });
}

addEventListener('error', function (event) {
    let msg = {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    };
    chrome.runtime.sendMessage({ action: "log-error", payload: msg });
    show_notify_ui("error", `ERROR:${event.filename}:${event.lineno}:${event.colno}`, event.message);
    console.error("video_player:", event);
});

document.addEventListener("contextmenu", function (event) {
    event.preventDefault();
}, false);

function open_tab(url) {
    adapter.current_browser.tabs.create({
        active: true,
        url: url
    });
}

function handle_btn_as_link() {
    $(".aslink").off("click");
    $(".aslink").on("click", function () {
        open_tab($(this).data("href"));
    });
}

function show_content(temp_id) {
    $("#view").children().remove();
    $("#view").append($("#" + temp_id).contents().clone());
    handle_btn_as_link();
    ui_status = temp_id;
}

const is_video_playing = video => !!(video.currentTime() > 0 && !video.paused() && !video.ended() && video.readyState() > 2);

function show_poster(show) {
    if (poster != show) {
        if (show) {
            $('#poster').show();
            $('#dst').hide();
        } else {
            $('#poster').hide();
            $('#dst').show();
        }
        poster = show;
    }
}

function append_sentences(data, start_time, end_time) {
    sentences_.push({ data, start_time, end_time });
    if (video_buf.length > 0 && video_buf[0].currentTime > end_time) {
        time_delay += video_buf[0].currentTime - end_time + 0.9;
    }
}

function reset_source() {
    console.log("reset_source");
    //source_player_status = "";
    sentences_ = [];
    sentences_read_idx = 0;
    o_sentences = [];
    video_buf = [];
    try {
        if (track_original) {
            track_original.mode = "hidden";
        }
        if (track_translate) {
            track_translate.mode = "hidden";
        }
        if (track_both) {
            track_both.mode = "hidden";
        }
        if (window.source_buffer) {
            media_source.removeSourceBuffer(window.source_buffer);
        }
        if (media_source) {
            media_source.endOfStream();
        }
    } catch (e) {
        console.error("reset", e);
    } finally {
        track_original = null;
        track_translate = null;
        track_both = null;
        source_buffer = null;
        media_source = null;
        current_range_idx = 0;
        time_delay = 15;
    }
}

function close_source() {
    console.log("close_source");
    if (interval_id) {
        clearInterval(interval_id);
        interval_id = null;
    }
    reset_source();
}

function can_play_video_clip() {
	//for test
	//return true;
    if (sentences_.length !== 0 && (video_buf[0] == null || (video_buf[0].currentTime <= (sentences_[sentences_.length - 1].end_time + 0.9)))) return true;
    if (!fast_mode && (video_buf[video_buf.length - 1] == null || (video_buf[video_buf.length - 1].currentTime - video_buf[0].currentTime) > time_delay)) return true;
    return false;
}

function to_next_time_range() {
    let timeRangs = video_js_player.buffered();
    let ct = video_js_player.currentTime();
    if (timeRangs.length === 0) return;
    if (ct < timeRangs.start(0)) {
        video_js_player.currentTime(timeRangs.start(0));
        current_range_idx = 0;
        return;
    } else if (ct > timeRangs.end(timeRangs.length - 1)) {
        return;
    } else if (current_range_idx < (timeRangs.length - 1) && Math.abs(timeRangs.end(current_range_idx) - ct) < 0.1) {
        current_range_idx++;
        video_js_player.currentTime(timeRangs.start(current_range_idx));
        console.log("jump to next time range")
    } else {
        let low = 0;
        let height = timeRangs.length - 1;
        let mid;
        while (low < height) {
            mid = Math.floor((low + height) / 2);
            if (timeRangs.start(mid) <= ct && ct <= timeRangs.end(mid)) {
                current_range_idx = mid;
                if (current_range_idx < (timeRangs.length - 1)) {
                    current_range_idx++;
                    video_js_player.currentTime(timeRangs.start(current_range_idx));
                    console.log("jump to one time range")
                }
                break;
            } else if (ct > timeRangs.end(mid)) {
                low = mid + 1;
            } else {
                height = mid - 1;
            }
        }
    }
}

function open_source() {
    console.log("open_source");
    interval_id = setInterval(() => {
        if (video_buf.length !== 0) {
            console.log(`*** video: ${video_buf[0] == null ? "oo" : video_buf[0].currentTime} ${video_buf[video_buf.length - 1] == null ? "oo" : video_buf[video_buf.length - 1].currentTime}`);
            console.log(o_sentences.length !== 0 ? `*** osent: ${o_sentences[0].start_time} ${o_sentences[o_sentences.length - 1].end_time}` : "*** osent: ***");
            console.log(sentences_.length !== 0 ? `*** sent: ${sentences_[0].start_time} ${sentences_[sentences_.length - 1].end_time}` : "*** sent: ***");
            if (can_play_video_clip()) {
                //show_poster(false);
                if (media_source == null) {
                    console.log(`new media source ${media_source} ${source_buffer}`);
                    media_source = new MediaSource();
                    video_js_player.src({ src: URL.createObjectURL(media_source), type: "video/webm" });
                    track_original = video_js_player.addTextTrack("subtitles", language_params.speech_label, language_params.speech);
                    track_original.mode = "showing";
                    if (language_params.speech.split('-')[0] !== language_params.subtitle) {
                        track_translate = video_js_player.addTextTrack("subtitles", language_params.subtitle_label, language_params.subtitle);
                        track_both = video_js_player.addTextTrack("subtitles", `${language_params.subtitle_label} & ${language_params.speech_label}`, language_params.subtitle);
                        track_both.mode = "showing";
                        track_translate.mode = "hidden";
                        track_original.mode = "hidden";
                    }
                    media_source.addEventListener('sourceopen', () => {
                        console.log('onSourceOpen');
                        source_buffer = media_source.addSourceBuffer(mime_codec);
                        source_buffer.mode = 'sequence';
                        source_buffer.onerror = (event) => {
                            console.log("SourceBuffer onerror:" + JSON.stringify(event));
                        }
                    });
                }
                if (source_buffer != null && !source_buffer.updating) {
                    const o = video_buf.shift();
                    if (o != null) {
                        console.log(`appendBuffer currentTime:${o.currentTime} length:${o.data.byteLength}`);
                        source_buffer.appendBuffer(o.data);
                    } else {
                        console.log("media_source.endOfStream");
                        media_source.endOfStream();
                    }
                }
            } else if (source_player_status == "playing" && media_source === null) {
                //show_poster(true);
            }
        }
        if (track_original) {
            if (sentences_.length !== 0) {
                let i = sentences_read_idx;
                for (; i < sentences_.length; ++i) {
                    let e = sentences_[i];
                    let o = o_sentences[i];
                    if (e && e.data) {
                        console.log(`vtt: ${e.start_time - first_chunk_time}, ${e.end_time - first_chunk_time}, ${e.data}, ${video_js_player.currentTime()}`);
                        console.log(`vtt: ${o.start_time - first_chunk_time}, ${o.end_time - first_chunk_time}, ${o.data}, ${video_js_player.currentTime()}`);
                        track_original.addCue(new VTTCue(o.start_time - first_chunk_time, o.end_time - first_chunk_time, o.data));
                        if (track_translate) {
                            track_translate.addCue(new VTTCue(e.start_time - first_chunk_time, e.end_time - first_chunk_time, e.data));
                            track_both.addCue(new VTTCue(e.start_time - first_chunk_time, e.end_time - first_chunk_time, e.data + '\n' + o.data));
                        }
                    }
                }
                sentences_read_idx = i;
            }
        }
        let networkState = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'][video_js_player.networkState()];
        let readyState = ["HAVE_NOTHING", "HAVE_METADATA", "HAVE_CURRENT_DATA", "HAVE_FUTURE_DATA", "HAVE_ENOUGH_DATA"][video_js_player.readyState()];
        console.log(`sourceBuffer: ${source_buffer ? source_buffer.timestampOffset : "***"} currentTime: ${video_js_player.currentTime()} networkState: ${networkState} readyState:${readyState}`);

        if (video_js_player.readyState() == 2) {
            to_next_time_range();
        }
        if (translating > 0) translating--;
    }, 500);
}

$(window).on("unload", function () {
    close_source();
    if (current_sr_worker_service) current_sr_worker_service.terminate();
    if (current_tr_worker_service) current_tr_worker_service.terminate();
    current_sr_worker_service = null;
    current_tr_worker_service = null;
    console.log("beforeunload");
});

function translate() {
    if (translating === 0) {
        translating = 16;
        if (sentences_.length < o_sentences.length) {
            let o = o_sentences[sentences_.length];
            if (o.data === null) {
                console.log(`push translate: ${JSON.stringify(o)}`);
                append_sentences(o.data, o.start_time, o.end_time);
                translating = 0;
                translate();
            } else {
                console.log(`post translate: ${JSON.stringify(o)}`);
                post_tr_message("translate", {
                    Text: o.data,
                    SourceLanguageCode: language_params.speech.split('-')[0],
                    TargetLanguageCode: language_params.subtitle
                });
            }
        } else {
            translating = 0;
        }
    }
}

function start_service() {
    current_sr_worker_service = new Worker(sr_worker_file[language_params.sr_provider]);
    console.log(`sr_service ${sr_worker_file[language_params.sr_provider]}`);

    current_sr_worker_service.onmessage = function (event) {
        let action = event.data.action;
        let payload = event.data.payload;
        switch (action) {
            case "debug-log":
                console.log("current_sr_worker_service: " + payload);
                break;
            case "sentences":
                console.log(`push sentences:${JSON.stringify(payload)}`);
                o_sentences.push(payload);
                if (language_params.speech.split('-')[0] === language_params.subtitle) {
                    append_sentences(payload.data, payload.start_time, payload.end_time);
                } else {
                    translate();
                }
                break;
            case "show-notify-ui":
                show_notify_ui(payload.level, payload.title, payload.text);
                chrome.runtime.sendMessage({ action: "log-error", payload: { "sr": payload } });
                break;
        }
    };

    current_tr_worker_service = new Worker(tr_worker_file[language_params.tr_provider]);
    console.log(`tr service: ${tr_worker_file[language_params.tr_provider]}`);
    current_tr_worker_service.onmessage = function (event) {
        let action = event.data.action;
        let payload = event.data.payload;
        switch (action) {
            case "debug-log":
                console.log("current_tr_worker_service: " + payload);
                break;
            case "translate": {
                console.log(`push translate:${JSON.stringify(payload)}`);
                let o = o_sentences[sentences_.length];
                append_sentences(payload, o.start_time, o.end_time);
                translating = 0;
                translate();
            }
                break;
            case "show-notify-ui":
                show_notify_ui(payload.level, payload.title, payload.text);
                chrome.runtime.sendMessage({ action: "log-error", payload: { "tr": payload } });
                break;
        }
    };
}

function check_param(provider) {
    switch (provider) {
        case "aws":
            return aws_params.access_id !== "" && aws_params.secret_key !== "";
        case "gcp":
            return gcp_params.key !== "";
        default:
            return false;
    }
}

function show_language_ui() {
    show_content("language");
    $("#tabs").tabs();
    $('#btn_start').button().click(function () {
        let tab_idx = $("#tabs").tabs("option", "active");
        let api_provider = cloud_platform[tab_idx];
        let speech_language_ok = check_param(api_provider);
        let subtitle_language_ok = check_param(api_provider);
        fast_mode = api_provider === "gcp";
        language_params = {
            speech: $(`#speech-language-${tab_idx}`).val(),
            subtitle: $(`#subtitle-language-${tab_idx}`).val(),
            speech_label: $(`#speech-language-${tab_idx} option:selected`).text(),
            subtitle_label: $(`#subtitle-language-${tab_idx} option:selected`).text(),
            sr_provider: api_provider,
            tr_provider: api_provider
        };
        chrome.storage.local.set({
            language_params: language_params
        });
        if (speech_language_ok && subtitle_language_ok) {
            show_player_ui();
        } else {
            show_options_ui(tab_idx);
        }
    });
    adapter.storage_local_get("language_params", params => {
        if (params && !$.isEmptyObject(params) && params.language_params.speech != "") {
            let tab_idx = 0;
            language_params = params.language_params;
            language_params.sr_provider = language_params.sr_provider || "gcp";
            language_params.tr_provider = language_params.tr_provider || "gcp";
            switch (language_params.sr_provider) {
                case "gcp":
                    tab_idx = 0;
                    break;
                case "aws":
                    tab_idx = 1;
                    break;
            }
            $("#tabs").tabs("option", "active", tab_idx);
            $(`#speech-language-${tab_idx} option[value="${language_params.speech}"]`).attr("selected", true);
            $(`#subtitle-language-${tab_idx} option[value="${language_params.subtitle}"]`).attr("selected", true);
        }
    });
    chrome.storage.local.get(['current_tab_frame'], param => {
        let ctf = param && param.current_tab_frame;
        console.log("current_tab_frame " + JSON.stringify(ctf));
        if (ctf && ctf.tab_id !== undefined && ctf.frame_id !== undefined) {
            console.log("dst-iframe-ready");
            chrome.tabs.sendMessage(ctf.tab_id, { action: "dst-iframe-ready" }, { frameId: ctf.frame_id });
        }
    });
}

function post_settings() {
    let payload = language_params.sr_provider === "aws" ? {
        region: aws_params.region,
        access_id: aws_params.access_id,
        secret_key: aws_params.secret_key,
        session_token: aws_params.session_token
    } : {
        key: gcp_params.key
    };
    $.extend(payload, {
        language_code: language_params.speech
    });
    let sr_settings = {
        action: "settings",
        payload
    };
    console.log(`sr settings: ${JSON.stringify(sr_settings)}`)
    post_sr_message(sr_settings);

    let tr_settings = language_params.tr_provider === "aws" ? {
        region: aws_params.region,
        access_id: aws_params.access_id,
        secret_key: aws_params.secret_key,
        session_token: aws_params.session_token
    } : {
        key: gcp_params.key
    };
    console.log(`tr settings: ${JSON.stringify(tr_settings)}`)
    post_tr_message("settings", tr_settings);
}

function show_player_ui() {
    show_content("player");
    let options = {
        autoplay: "any",
        controls: true,
        liveui: true,
        controlBar: {
            playToggle: true,
            captionsButton: false,
            chaptersButton: false,
            remainingTimeDisplay: false,
            progressControl: {
                seekBar: true
            },
            fullscreenToggle: true,
            playbackRateMenuButton: false
        }
    };
    video_js_player = videojs("dst", options);
    $('#btn_settings').click(function () {
        chrome.runtime.openOptionsPage();
    });
    start_service();
    post_settings();
    open_source();
    console.log("show_palyer_ui");
    chrome.storage.local.get(['current_tab_frame'], param => {
        let ctf = param && param.current_tab_frame;
        console.log("current_tab_frame " + JSON.stringify(ctf));
        if (ctf && ctf.tab_id !== undefined && ctf.frame_id !== undefined) {
            console.log("dst-player-ready");
            chrome.tabs.sendMessage(ctf.tab_id, { action: "dst-player-ready" }, { frameId: ctf.frame_id });
        }
    });
}

function show_options_ui(tab_idx) {
    let disable_tabs_id = [0, 1];
    show_content("options");
    disable_tabs_id.splice(tab_idx, 1);
    $("#aws_secret_key").hidePassword(true);
    $("#gcp_key").hidePassword(true);
    $("#tabs").tabs({
        active: tab_idx,
        disabled: disable_tabs_id
    });
    $("#note-" + tab_idx).show();
    $.each(disable_tabs_id, function (i, n) {
        $("#note-" + n).hide();
    });

    $('#btn_prev').button().click(function () {
        show_language_ui();
    });
    $('#btn_next').button().click(function () {
        let options_param = {
            aws_params: {
                access_id: $("#aws_access_id").val().trim(),
                secret_key: $("#aws_secret_key").val().trim(),
                session_token: "",
                region: $("#region").val()
            },
            gcp_params: {
                key: $("#gcp_key").val().trim()
            }
        };
        adapter.current_browser.storage.local.set(options_param);
        aws_params = options_param.aws_params;
        gcp_params = options_param.gcp_params;
        let api_provider = cloud_platform[tab_idx];
        let speech_language_ok = check_param(api_provider);
        let subtitle_language_ok = check_param(api_provider);
        if (speech_language_ok && subtitle_language_ok) {
            show_player_ui();
        } else {
            let empty_warn = [
                "You need to fill the KEY.",
                "You need to fill these settings."
            ];
            $(`<div title="Auto-Subtitle">${empty_warn[tab_idx]}</div>`).dialog({
                dialogClass: "no-close",
                buttons: [{
                    text: "OK",
                    click: function () {
                        $(this).dialog("close");
                    }
                }]
            });
        }
    });
    adapter.storage_local_get("aws_params", params => {
        if (params && !$.isEmptyObject(params) && params.aws_params.access_id != "" && params.aws_params.secret_key != "") {
            $("#aws_access_id").val(params.aws_params.access_id);
            $("#aws_secret_key").val(params.aws_params.secret_key);
            $(`#region option[value="${params.aws_params.region}"]`).attr("selected", true);
        }
    });
    adapter.storage_local_get("gcp_params", params => {
        if (params && !$.isEmptyObject(params) && params.gcp_params.key != "") {
            $("#gcp_key").val(params.gcp_params.key);
        }
    });
}

$(function () {
    adapter.storage_local_get("gcp_params", params => {
        if (params.gcp_params) gcp_params = params.gcp_params;
    });
    adapter.storage_local_get("aws_params", params => {
        if (params.aws_params) aws_params = params.aws_params;
    });
    /*adapter.storage_add_onchange((changes, areaName) => {
        if (areaName == "local") {
            console.log("storage_onchange" + JSON.stringify(changes));
        }
    });*/
    show_language_ui();
    setInterval(function (_) {
        if (ui_status == "player") {
            if (video_js_player && is_video_playing(video_js_player))
                chrome.runtime.sendMessage({ action: "log-status", payload: `playing with ${language_params.sr_provider}` });
            else
                chrome.runtime.sendMessage({ action: "log-status", payload: `player with ${language_params.sr_provider}` });
        } else {
            chrome.runtime.sendMessage({ action: "log-status", payload: ui_status });
        }
    }, 10000);
});


document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
        chrome.runtime.sendMessage({ action: "log-status", payload: "unload" });
    }
});

function post_sr_message(msg, transferable) {
	//for test
	//return;
    if (current_sr_worker_service) {
        current_sr_worker_service.postMessage(msg, transferable);
    } else {
        console.error("current_sr_worker_service not available", msg);
    }
}

function post_tr_message(action, payload) {
    if (current_tr_worker_service) {
        current_tr_worker_service.postMessage({
            action: action,
            payload: payload
        });
    } else {
        console.error("current_tr_worker_service not available", action);
    }
}

function port2_onmessage (event) {
    let msg = event.data;
    switch (msg.action) {
        case "video-chunk":
            console.log(`video: currentTime:${msg.currentTime} length:${msg.data.byteLength} gap:${msg.currentTime - video_current_time}`);
            if (first_playing_chunk && (msg.currentTime < video_current_time || (msg.currentTime - video_current_time) > 1.9)) {
                reset_source();
                first_chunk_time = msg.currentTime;
                console.log(`first_chunk_time: ${first_chunk_time}`);
                post_sr_message({
                    action: "source-player-status-changed",
                    payload: "playing"
                });
            }
            video_buf.push(msg);
            if (video_js_player && msg) {
                video_js_player.duration(msg.currentTime + 1 - first_chunk_time);
            }
            first_playing_chunk = false;
            video_current_time = msg.currentTime;
            break;
        case "audio-chunk":
            console.log(`audio: ${msg.currentTime} ${msg.channel1.byteLength}`);
            post_sr_message(msg, (msg.channel2 ? [msg.channel1, msg.channel2] : [msg.channel1]));
            break;
        case "source-player-status-changed":
            let payload = msg.payload;
            console.log(`source_player_status_changed ${payload}`);
            switch (payload) {
                case "playing":
                    source_player_status = "playing";
                    first_playing_chunk = true;
                    break;
                case "ended":
                    source_player_status = "ended";
                    video_buf.push(null);
                    post_sr_message({
                        action: "source-player-status-changed",
                        payload: "ended",
                        currentTime: msg.currentTime
                    });
                    break;
                case "pause":
                    source_player_status = "pause";
                    post_sr_message({
                        action: "source-player-status-changed",
                        payload: "pause"
                    });
                    break;
                case "waiting":
                    source_player_status = "waiting";
                    post_sr_message({
                        action: "source-player-status-changed",
                        payload: "waiting"
                    });
                    break;
            }
            break;
        case "init-stream":
            console.log("init-stream");
            src_url_hash = hex_sha256(msg.url);
            break;
        case "reset-video-chunk":
            break;
    }
}


addEventListener("message", event => {
    let msg = event.data;
    if (!msg || !msg.action) return true;
    console.log(`message: ${msg.action}`);
    switch (msg.action) {
        case "auto-subtitle-make-connection":
            contnet_win_port2 = event.ports[0];
            contnet_win_port2.onmessage = port2_onmessage;
            break;
        case "close-window":
            /*chrome.storage.local.get(['current_tab_frame'], param => {
                let ctf = param && param.current_tab_frame;
                console.log("current_tab_frame " + JSON.stringify(ctf));
                if (ctf && ctf.tab_id !== undefined && ctf.frame_id !== undefined) {
                    console.log("stop-capture-stream");
                    chrome.tabs.sendMessage(ctf.tab_id, { action: "stop-capture-stream" }, { frameId: ctf.frame_id });
                }
            });*/
            close_source();
            break;
    }
    return true;
}, false);
