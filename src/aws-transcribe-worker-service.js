const aws_transcribe_api = require("./aws-transcribe");

let language_code = null;
let connected = false;

const post_message = (action, payload) => {
    self.postMessage({ action, payload });
};

const debug_log = msg => post_message("debug-log", msg);
const show_notify_ui = (level, title, text) => post_message("show-notify-ui", { level, title, text });

const open_callback_func = e => debug_log("websocket connect " + e);
const result_callback_func = e => post_message("sentences", e);
const error_callback_func = (t, e) => {
    show_notify_ui("error", "AWS transcribe api", e);
    debug_log("on error " + t + e);
}
const close_callback_func = e => {
    debug_log("on close " + e);
}

const mix_2_pcm = (channel1, channel2) => {
    let out = new Int16Array(channel1.length);
    if (channel2) {
        for (let i = 0; i < channel1.length; ++i) {
            let data_mix = null;
            let d1 = channel1[i];
            let d2 = channel2[i];
            if (d1 < 0 && d2 < 0)
                data_mix = d1 + d2 + (d1 * d2);
            else
                data_mix = d1 + d2 - (d1 * d2);
            data_mix = data_mix > 1 ? 1 : (data_mix < -1 ? -1 : data_mix);
            out[i] = data_mix < 0 ? Math.floor(data_mix * 0x8000) : Math.floor(data_mix * 0x7FFF);
        }
    } else {
        for (let i = 0; i < channel1.length; ++i) {
            let data_mix = channel1[i] > 1 ? 1 : (channel1[i] < -1 ? -1 : channel1[i]);
            out[i] = data_mix < 0 ? Math.floor(data_mix * 0x8000) : Math.floor(data_mix * 0x7FFF);
        }
    }
    return out;
};

const resample = (buffer, inputSampleRate, outputSampleRate) => {
    if (outputSampleRate === inputSampleRate) {
        return buffer;
    }
    let sampleRateRatio = inputSampleRate / outputSampleRate;
    let newLength = Math.round(buffer.length / sampleRateRatio);
    let result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
        let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0,
            count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
};

const get_sample_rate = () => {
    let sampleRate;
    if (language_code == "en-US" || language_code == "es-US")
        sampleRate = 16000;
    else
        sampleRate = 8000;
    return sampleRate;
}

self.onmessage = function (event) {
    let msg = event.data;
    let action = msg.action;
    let payload = msg.payload;
    switch (action) {
        case "source-player-status-changed":
            switch (payload) {
                case "playing":
                    break;
                case "ended":
                    aws_transcribe_api.close();
                    connected = false;
                    break;
                case "pause":
                    aws_transcribe_api.shutdown();
                    connected = false;
                    break;
                case "waiting":
                    //aws_transcribe_api.shutdown();
                    //connected = false;
                    break;
            }
            break;
        case "audio-chunk": {
            if (!connected) {
                aws_transcribe_api.connect();
                connected = true;
            }
            let c1 = resample(new Float32Array(msg.channel1), msg.sampleRate, get_sample_rate());
            let c2 = null;
            if (msg.channel2) {
                c2 = resample(new Float32Array(msg.channel2), msg.sampleRate, get_sample_rate());
            }
            let pcm_data = mix_2_pcm(c1, c2);
            debug_log(`aws_transcribe_api.send_pcm_data ${pcm_data.length} ${msg.currentTime}`);
            aws_transcribe_api.send_pcm_data(pcm_data.buffer, msg.currentTime);
        }
            break;
        case "settings": {
            language_code = payload.language_code;
            aws_transcribe_api.set_callbacks(
                open_callback_func,
                result_callback_func,
                error_callback_func,
                close_callback_func,
                debug_log);
            aws_transcribe_api.settings(
                payload.language_code,
                payload.region,
                payload.access_id,
                payload.secret_key,
                payload.session_token,
                get_sample_rate());
        }
            break;
    }
};
