'use strict';

const crypto = require('crypto'); // tot sign our pre-signed URL
const v4 = require('./aws-signature-v4'); // to generate our pre-signed URL
const marshaller = require("@aws-sdk/eventstream-marshaller"); // for converting binary event stream messages to and from JSON
const util_utf8_node = require("@aws-sdk/util-utf8-node"); // utilities for encoding and decoding UTF8

// our converter between binary event streams messages and JSON
const eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);

// our global variables for managing state
let language_code = null;
let region_ = null;
let sample_rate = 16000;
let auto_reconnect = 30;
let record_start_time = null;

let on_open_callback_func = null;
let on_result_callback_func = null;
let on_error_callback_func = null;
let on_close_callback_func = null;
let debug_log = null;

let socket_ = null;
let socket_id = 0;

let access_id = null;
let secret_key = null;
let session_token = null;

let on_open = (event) => {
    if (on_open_callback_func)
        on_open_callback_func(event);
    debug_log(`onopen ${event.target.id}`);
}

let on_message = (message) => {
    debug_log("on aws transcribe message");
    let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(message.data));
    let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
    if (messageWrapper.headers[":message-type"].value === "event") {
        handle_event_stream_message(messageBody);
    }
    else {
        if (on_error_callback_func) {
            on_error_callback_func(`transcribeException ${message.target.id}`, messageBody.Message);
        }
    }
}

let on_error = (errorEvent) => {
    switch (errorEvent.code) {
        case 'ECONNREFUSED':
            debug_log(`ECONNREFUSED ${this.no_reconnect} ${errorEvent.target.id}`);
            if (!this.no_reconnect) {
                setTimeout(reconnect, Math.random() * 500);
            }
            if (on_error_callback_func)
                on_error_callback_func("ECONNREFUSED", errorEvent);
            break;
        default:
            if (on_error_callback_func)
                on_error_callback_func("socketError", errorEvent);
            break;
    }
}

let on_close = (closeEvent) => {
    if (on_close_callback_func)
        on_close_callback_func(closeEvent);
    debug_log(`onclose ${this.no_reconnect} ${closeEvent.target.id}`);
    if (!this.no_reconnect) {
        setTimeout(reconnect, Math.random() * 500);
    }
}

function wire_socket_events() {
    socket_.addEventListener('open', on_open);
    socket_.addEventListener('message', on_message);
    socket_.addEventListener('error', on_error);
    socket_.addEventListener('close', on_close);
}

let handle_event_stream_message = function (messageJson) {
    let results = messageJson.Transcript.Results;
    if (results.length > 0) {
        if (results[0].Alternatives.length > 0) {
            if (!results[0].IsPartial) {
                let transcript = results[0].Alternatives[0].Transcript;
                transcript = decodeURIComponent(escape(transcript));
                debug_log("AWS result:" + JSON.stringify(transcript));
                on_result_callback_func({
                    data: transcript,
                    start_time: (results[0].StartTime + record_start_time),
                    end_time: (results[0].EndTime + record_start_time)
                });
            }
        }
    }
};

function convert_audio_to_binary_message(pcmEncodedBuffer) {
    let audioEventMessage = get_audio_event_message(Buffer.from(pcmEncodedBuffer));
    let binary = eventStreamMarshaller.marshall(audioEventMessage);
    return binary;
}

function get_audio_event_message(buffer) {
    return {
        headers: {
            ':message-type': {
                type: 'string',
                value: 'event'
            },
            ':event-type': {
                type: 'string',
                value: 'AudioEvent'
            }
        },
        body: buffer
    };
}

function create_presigned_url() {
    let endpoint = "transcribestreaming." + region_ + ".amazonaws.com:8443";

    return v4.createPresignedURL(
        'GET',
        endpoint,
        '/stream-transcription-websocket',
        'transcribe',
        crypto.createHash('sha256').update('', 'utf8').digest('hex'), {
        'key': access_id,
        'secret': secret_key,
        'sessionToken': session_token,
        'protocol': 'wss',
        'expires': 300,
        'region': region_,
        'query': "language-code=" + language_code + "&media-encoding=pcm&sample-rate=" + sample_rate
    }
    );
}

function reconnect() {
    if (reconnect.lockReconnect) return;
    reconnect.lockReconnect = true;
    if (auto_reconnect !== 0) {
        auto_reconnect -= 1;
        let url = create_presigned_url();
        socket_ = new WebSocket(url);
        socket_.id = socket_id++;
        socket_.binaryType = "arraybuffer";
        wire_socket_events();
        debug_log(`reconnect ${socket_.id}`);
    } else {
        if (on_close_callback_func) {
            on_close_callback_func("reconnects");
        }
    }
    reconnect.lockReconnect = false;
}

exports.connect = function () {
    debug_log('connect');
    auto_reconnect = 30;
    reconnect();
};

exports.settings = function (languageCode, region, accessId, secretKey, sessionToken, sampleRate) {
    debug_log('settings');
    language_code = languageCode;
    region_ = region;
    access_id = accessId;
    secret_key = secretKey;
    session_token = sessionToken;
    sample_rate = sampleRate;
};

exports.set_callbacks = function (onOpenCallbackFunc, onResultCallbackFunc, onErrorCallbackFunc, onCloseCallbackFunc, debugLog) {
    on_open_callback_func = onOpenCallbackFunc;
    on_result_callback_func = onResultCallbackFunc;
    on_error_callback_func = onErrorCallbackFunc;
    on_close_callback_func = onCloseCallbackFunc;
    debug_log = debugLog;
};

exports.close = function () {
    debug_log(`close ${socket_ ? socket_.id : null}`);
    auto_reconnect = 0;
    record_start_time = null;
    if (socket_ && (socket_.readyState === socket_.OPEN)) {
        socket_.no_reconnect = true;
        let emptyMessage = get_audio_event_message(Buffer.from(new Buffer([])));
        let emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
        socket_.send(emptyBuffer);
    } else {
        socket_ = null;
    }
};

exports.shutdown = function () {
    debug_log(`shutdown ${socket_ ? socket_.id : null}`);
    auto_reconnect = 0;
    record_start_time = null;
    if (socket_) {
        socket_.no_reconnect = true;
        socket_.removeEventListener('open', on_open);
        socket_.removeEventListener('message', on_message);
        socket_.removeEventListener('error', on_error);
        socket_.removeEventListener('close', on_close);
        socket_.close();
        socket_ = null;
    }
};

exports.send_pcm_data = function (rawAudioChunk, currentTime) {
    if (socket_ && (socket_.readyState === socket_.OPEN)) {
        if (record_start_time == null) {
            record_start_time = currentTime;
        }        
        debug_log(`send_pcm_data ${socket_ ? socket_.id : null}`);
        let binary = convert_audio_to_binary_message(rawAudioChunk);
        socket_.send(binary);
    }
};

