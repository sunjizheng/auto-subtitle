const mime_codec = 'video/webm; codecs="vp8, opus"';
let unique_id_base = 0;
let this_video = null;
let src_video = null;
let media_recorder = null;
let capture_stream = null;
let audio_stream_source = null;
let audio_context = null;
let script_node = null;
let video_current_time = -100;
let dst_player_channel = null;

addEventListener('error', function (event) {
    if (event.filename && (event.filename.slice(0, 4) == "http" || event.filename.slice(0, 4) == "blob")) return;
    let msg = { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno };
    chrome.runtime.sendMessage({ action: "log-error", payload: msg });
    console.log(`error: ${JSON.stringify(event)}`);
});

const is_video_playing = video => !!(video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2);


function post_player_message(msg, transfer) {
    if (dst_player_channel) {
        if(transfer){
            dst_player_channel.port1.postMessage(msg, [transfer]);
        } else {
            dst_player_channel.port1.postMessage(msg);
        }
    } else {
        console.log("port_ is not available");
    }
}

function on_pause() {
    console.log("********************pause********************");
    if (dst_player_channel) {
        if (media_recorder) {
            media_recorder.pause();
        }
        post_player_message({ action: "source-player-status-changed", payload: "pause" });
    }
}

function on_playing() {
    console.log("********************playing********************");
    if (dst_player_channel) {
        if (media_recorder && media_recorder.state == "paused") {
            media_recorder.resume();
        }
        post_player_message({ action: "source-player-status-changed", payload: "playing" });
        if (src_video.currentTime < video_current_time || src_video.currentTime - video_current_time > 1.9) {
            stop_capture_stream();
            start_capture_stream();
        }
    }
}

function on_ended() {
    console.log("********************ended********************");
    if (dst_player_channel) {
        post_player_message({ action: "source-player-status-changed", payload: "ended", currentTime: src_video.currentTime });
        stop_capture_stream();
    }
}

function on_suspend() {
    console.log("********************suspend********************");
    if (dst_player_channel) {
        post_player_message({ action: "source-player-status-changed", payload: "suspend" });
    }
}

function on_stalled() {
    console.log("********************stalled********************");
}

function on_waiting() {
    console.log("********************waiting********************");
    post_player_message({ action: "source-player-status-changed", payload: "waiting" });
}

function on_seeked() {
    console.log("********************seeked********************");
}

function on_play() {
    console.log("********************paly********************");
}

function attach_events(video_ctl) {
    if (src_video) {
        src_video.removeEventListener("pause", on_pause);
        src_video.removeEventListener("playing", on_playing);
        src_video.removeEventListener("play", on_play);
        src_video.removeEventListener("ended", on_ended);
        src_video.removeEventListener("seeked", on_seeked);
        src_video.removeEventListener("suspend", on_suspend);
        src_video.removeEventListener("stalled", on_stalled);
        src_video.removeEventListener("waiting", on_waiting);
    }
    src_video = video_ctl;
    src_video.addEventListener("pause", on_pause);
    src_video.addEventListener("playing", on_playing);
    src_video.addEventListener("play", on_play);
    src_video.addEventListener("ended", on_ended);
    src_video.addEventListener("seeked", on_seeked);
    src_video.addEventListener("suspend", on_suspend);
    src_video.addEventListener("stalled", on_stalled);
    src_video.addEventListener("waiting", on_waiting);
}

function is_rect_in_viewport(r) {
    return r.bottom > 0 &&
        r.right > 0 &&
        r.left < (window.innerWidth || document.documentElement.clientWidth) &&
        r.top < (window.innerHeight || document.documentElement.clientHeight);
}

function add_capture_buttons() {
    let allVideos = document.querySelectorAll("video");
    allVideos.forEach((video) => {
        let btn = null;
        const rect = video.getBoundingClientRect();
        if (is_rect_in_viewport(rect) && video.dataset.autosubtitlebuttonid === undefined) {
            const btn_id = "autosub" + unique_id_base++;
            btn = document.createElement("div");
            btn.setAttribute("id", btn_id);
            btn.classList.add("autosub-capture-btn");
            btn.addEventListener("click", (event) => {
                this_video = video;
                chrome.runtime.sendMessage({ action: "capture-ready" });    
                console.log("capture-ready");
                event.stopPropagation();
                return false;
            });
            btn.addEventListener("mouseup", (event) => {
                event.stopPropagation();
                return false;
            });
            btn.addEventListener("mousedown", (event) => {
                event.stopPropagation();
                return false;
            });
            document.body.appendChild(btn);
            video.dataset.autosubtitlebuttonid = btn_id;
        } else {
            btn = document.getElementById(video.dataset.autosubtitlebuttonid);
        }
        if (btn) {
            btn.style.cssText = `left: ${rect.left + 2}px; top: ${rect.top + (rect.height / 3) + 2}px;`;
        }
    });
}

function blingbling() {
    let light = 30;
    let interval_id = setInterval(() => {
        if (light) {
            if ((light % 2) === 0) {
                document.querySelectorAll("div.autosub-capture-btn").forEach((btn) => {
                    btn.classList.add('autosub-capture-btn-hover');
                });
            } else {
                document.querySelectorAll("div.autosub-capture-btn").forEach((btn) => {
                    btn.classList.remove('autosub-capture-btn-hover');
                });
            }
        } else {
            document.querySelectorAll("div.autosub-capture-btn").forEach((btn) => {
                btn.classList.remove('autosub-capture-btn-hover');
            });
            clearInterval(interval_id);
        }
        light--;
    }, 300);
}

function top_win_send_port_2_dst_player(port) {
    let player_win = null;
    player_win = frames["auto-subtitle"] && frames["auto-subtitle"].contentWindow;
    if (player_win){
        player_win.postMessage({ action: "auto-subtitle-make-connection" }, chrome.runtime.getURL("/"), [port]);
    } else {
        console.log("Can not find auto-subtitle iframe.");
    }
}

function recordr_request_data(){
    if(media_recorder){
      if(media_recorder.state == "recording"){
        media_recorder.requestData();
      }else{
        setTimeout(recordr_request_data, 1000);
      }
    }
  }

function start_capture_stream() {
    console.log("start_capture_stream");
    post_player_message({ action: "init_stream", url: src_video.src });

    capture_stream = src_video.mozCaptureStream ? src_video.mozCaptureStream() : src_video.captureStream();

    audio_context = new AudioContext();
    audio_stream_source = audio_context.createMediaStreamSource(capture_stream);
    script_node = audio_context.createScriptProcessor(8192, 1, 1);
    script_node.onaudioprocess = function (audioProcessingEvent) {
        if (audio_context) {
            let inputChannel = audioProcessingEvent.inputBuffer.getChannelData(0);
            //let outputBuffer = audioProcessingEvent.outputBuffer;
            if (inputChannel[0] != 0 || inputChannel[4095] != 0 || inputChannel[8191] != 0 || is_video_playing(src_video)) {
                //let chan2 = (inputBuffer.numberOfChannels >= 2 ? inputBuffer.getChannelData(1).buffer.slice(0) : null);
                let chan1 = inputChannel.buffer.slice(0);
                let msg = {
                    action: "audio-chunk",
                    sampleRate: audio_context.sampleRate,
                    sampleNumber: 8192,
                    channel1: chan1,
                    channel2: null,
                    currentTime: src_video.currentTime
                    //currentTime: audioProcessingEvent.playbackTime
                };
                post_player_message(msg, msg.channel1);
                console.log(`audio: ${src_video.currentTime} ${audioProcessingEvent.playbackTime}`);
            }
        }
    };

    let options = {
        //audioBitsPerSecond : 128000,
        //videoBitsPerSecond : 2500000,
        audioBitsPerSecond: 32000,
        videoBitsPerSecond: 625000,
        //bitsPerSecond: ,
        mimeType: mime_codec
    };
    media_recorder = new MediaRecorder(capture_stream, options);
    media_recorder.ondataavailable = function (e) {
        e.data.arrayBuffer().then(arraybuf => {
            let ct = src_video.currentTime - 1;
            ct = ct >= 0 ? ct : 0;
            let length = arraybuf.byteLength;
            if (length > 0) {
                console.log(`video: ${ct} ${length}`);
                let msg = {
                    action: "video-chunk",
                    data: arraybuf,
                    currentTime: ct
                };
                post_player_message(msg, msg.data);
                video_current_time = ct;
            }
            setTimeout(recordr_request_data, 1000);
        });
    };
    media_recorder.start();
    audio_stream_source.connect(script_node);
    script_node.connect(audio_context.destination);
    setTimeout(recordr_request_data, 1000);
    src_video.loop = false;
    src_video.muted = false;
    src_video.volume = 0.02;
}

function stop_capture_stream() {
    console.log("stop_capture_stream");
    try {
        if (media_recorder) {
            media_recorder.ondataavailable = function (e) { };
            media_recorder.stop();
        }
        if (script_node) {
            script_node.disconnect();
        }
        if (audio_stream_source) {
            audio_stream_source.disconnect();
        }
        if (audio_context) {
            audio_context.close();
        }
        if (capture_stream) {
            capture_stream.getTracks().forEach(
                track => track.stop()
            );
        }
    }
    catch (e) {
        console.error("reset", e);
    }
    finally {
        media_recorder = null;
        audio_stream_source = null;
        script_node = null;
        audio_context = null;
        capture_stream = null;
    }
}

setTimeout(() => {
    add_capture_buttons();
    setInterval(add_capture_buttons, 5000);
}, 1000);


"scroll resize".split(" ").forEach((e) => {
    addEventListener(e, () => {
        document.querySelectorAll("div.autosub-capture-btn").forEach((btn) => {
            btn.remove();
        });
        document.querySelectorAll("video").forEach((video) => {
            if (video.dataset.autosubtitlebuttonid) {
                delete video.dataset.autosubtitlebuttonid;
            }
        });
    });
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log(`on message ${msg.action}`);
    if (!msg || !msg.action) return;
    switch (msg.action) {
        case "action-clicked": {
            add_capture_buttons();
            blingbling();
        }
        break;
        case "dst-iframe-ready": {
            attach_events(this_video);
            dst_player_channel = new MessageChannel();
            if (top === window) {
                top_win_send_port_2_dst_player(dst_player_channel.port2);
            } else {
                top.postMessage({ action: "auto-subtitle-make-connection" }, "*", [dst_player_channel.port2]);
            }
        }
        break;
        case "dst-player-ready": {
            if (is_video_playing(src_video)) {
                post_player_message({ action: "source-player-status-changed", payload: "playing" });
                stop_capture_stream();
                start_capture_stream();
            } else {
                if (src_video) {
                    src_video.play();
                }
            }
        }
        break;
        case "stop-capture-stream": {
            stop_capture_stream();
        }
        break;
    }
});

addEventListener("message", function (event) {
    console.log(`message ${event.data.action}`);
    let msg = event.data;
    if (!msg || !msg.action) return true;
    switch (msg.action) {
        case "auto-subtitle-make-connection": {
            top_win_send_port_2_dst_player(event.ports[0]);
        }
        break;
    }    
    return true;
}, false);