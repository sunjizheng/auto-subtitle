
let gcp_key = null;
let language_code = null;
let vad_engine = null;
let first_time_play = true;
let farg_list = [];
let arr_ptr = null;
let heap_bytes = null;

const post_message = (action, payload) => {
    self.postMessage({
        action,
        payload
    });
};

function arrayToHeap(typedArray){
    let numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
    let ptr = self.vad._malloc(numBytes);
    let heapBytes = new Uint8Array(self.vad.HEAPU8.buffer, ptr, numBytes);
    heapBytes.set(new Uint8Array(typedArray.buffer));
    return heapBytes;
}

function freeArray(heapBytes){
    self.vad._free(heapBytes.byteOffset);
}

function heapToU8Array(heapBytes, size){
    let ret_val = new Uint8Array(size);
    let tmp = new Uint8Array(self.vad.HEAPU8.buffer, heapBytes, size);
    ret_val.set(tmp);
    return ret_val;
}

const debug_log = msg => post_message("debug-log", "speech2text:" + msg);
const show_notify_ui = (level, title, text) => post_message("show-notify-ui", {level, title, text});

Module['onRuntimeInitialized'] = () => {
    vad_engine = self.vad._Vcreate();
    let res = self.vad._Vinit(vad_engine);
    if(res != 0){
        debug_log(`vad engine init error ${res}`);
    }else{
        self.vad.addOnExit((status) => {
            self.vad._Vfinal(vad_engine);
            debug_log(`vad engine set mode error ${res}`);
        });
    }
};

const post_speech_data = (langSpeech, dataSpeech) => {
    if(gcp_key){
        fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${gcp_key}`, {
            method:"POST",
            mode: 'cors',
            body:JSON.stringify({
                config: {
                    encoding: "LINEAR16",
                    sampleRateHertz: 16000,
                    audioChannelCount: 1,
                    enableSeparateRecognitionPerChannel: false,
                    languageCode: langSpeech,
                    maxAlternatives: 1,
                    profanityFilter: false,
                    enableWordTimeOffsets: true,
                    enableAutomaticPunctuation: false,
                    useEnhanced: true
                },
                audio: {
                    content: dataSpeech
                }
            })
        }).then(resp => {
            return resp.json();
        }).then(data => {
            let e = farg_list.shift();
            if(data.results){
                for(let r of data.results){
                    let ss = parseFloat(r.alternatives[0].words[0].startTime);
                    let se = parseFloat(r.alternatives[0].words[r.alternatives[0].words.length - 1].endTime);
                    post_message("sentences", {
                        data: r.alternatives[0].transcript, 
                        start_time:e.start_time + ss, 
                        end_time:e.start_time + se
                    });
                }
            } else {
                if(data.error) {
                    show_notify_ui("error", "speech.googleapis.com", data.error.message);
                }
                post_message("sentences", {
                    data: null, 
                    start_time:e.start_time, 
                    end_time:e.end_time
                });
            }
            debug_log(`sentence:${data.results ? data.results[0].alternatives[0].transcript : ""}`);
            peek_first_farg();
        }).catch(function(error) {
            show_notify_ui("warning", "speech.googleapis.com", error.message);
            peek_first_farg();
        });
    }
};

const peek_first_farg = () => {
    debug_log(`peek_first_farg: 1`);
    if(farg_list.length){
        let e = farg_list[0];
        debug_log(`peek_first_farg: 2 ${e.in_progress == undefined}`);
        if(e.in_progress === undefined){
            if(e.quiet){
                debug_log(`peek_first_farg: 3 ${e.start_time} ${e.end_time}`);
                post_message("sentences", {
                    data:null, 
                    start_time:e.start_time, 
                    end_time:e.end_time
                });
                farg_list.shift();
                peek_first_farg();
            }else{
                debug_log(`peek_first_farg: 4`);
                e.in_progress = true;
                post_speech_data(language_code, e.data);
            }
        }
    }
};

function end_stream(currentTime){
    let res = self.vad._Vprocess(vad_engine, 0, 0 , 0, currentTime);
    if(res !== 0)
    {
        let pcm_pos = 24 + self.vad.getValue(res + 8, 'i32', false);
        let data_len = pcm_pos + self.vad.getValue(res + 12, 'i32', false);
        let data = heapToU8Array(res, data_len);
        self.vad._VfreeMemory(res);
        /*    
        unsigned long quiet;        //[0]
        unsigned long reserve;      //[1]
        unsigned long feature_len;  //[2]
        unsigned long pcm_data_len; //[3]
        unsigned long tStart;       //[4]
        unsigned long tEnd;         //[5]
        */
        let quiet = new Uint32Array(data.buffer, 0, 6);
        debug_log(`farg_list quiet:${quiet[0]} flen:${quiet[2]} dlen:${quiet[3]} time: ${quiet[4]} ${quiet[5]}`);
        if((quiet[5] - quiet[4]) > 0 && (quiet[5] - quiet[4]) <= 35000){
            farg_list.push({
                data:quiet[0] === 1 ? null : (new TextDecoder("utf-8")).decode(new Uint8Array(data.buffer, pcm_pos, quiet[3])), 
                quiet:(quiet[0] === 1), 
                start_time:quiet[4] / 1000.0, 
                end_time:quiet[5] / 1000.0});
            peek_first_farg();
        }
        else
        {
            debug_log("farg_list error");
        }
    }
}

self.onmessage = function(event){
    let msg = event.data;
    let payload = msg.payload;
    switch(msg.action){
        case "source-player-status-changed":
            switch(payload){
                case "playing":
                    first_time_play = true;
                    break;
                case "ended":
                    end_stream(msg.currentTime);
                    break;
                case "pause":
                    break;
                case "waiting":
                    break;
            }
        break;
        case "audio-chunk":{
            if(vad_engine === null) break;
            if(first_time_play){
                self.vad._VsetBufferSize(vad_engine, 10000, 11000, 12000, 13000, 15000, msg.sampleRate, 16000, 8192, 1, 1);
                first_time_play = false;
            }
            let res = null;
            if(msg.channel2)
            {
                let c1 = new Float32Array(msg.channel1);
                let c2 = new Float32Array(msg.channel2);
                let buf_input1 = arrayToHeap(c1);
                let buf_input2 = arrayToHeap(c2);
                res = self.vad._Vprocess(vad_engine, buf_input1.byteOffset, buf_input2.byteOffset, c1.length, msg.currentTime);
                freeArray(buf_input1);
                freeArray(buf_input2); 
            }
            else
            {
                let c1 = new Float32Array(msg.channel1);
                if(arr_ptr == null && heap_bytes == null){
                    let numBytes = c1.length * c1.BYTES_PER_ELEMENT;
                    arr_ptr = self.vad._malloc(numBytes);
                    heap_bytes = new Uint8Array(self.vad.HEAPU8.buffer, arr_ptr, numBytes);
                }
                heap_bytes.set(new Uint8Array(c1.buffer));

                res = self.vad._Vprocess(vad_engine, heap_bytes.byteOffset, 0 , c1.length, msg.currentTime);
            }
            if(res !== 0)
            {
                let pcm_pos = 24 + self.vad.getValue(res + 8, 'i32', false);
                let data_len = pcm_pos + self.vad.getValue(res + 12, 'i32', false);
                let data = heapToU8Array(res, data_len);
                self.vad._VfreeMemory(res);
                /*    
                unsigned long quiet;        //[0]
                unsigned long reserve;      //[1]
                unsigned long feature_len;  //[2]
                unsigned long pcm_data_len; //[3]
                unsigned long tStart;       //[4]
                unsigned long tEnd;         //[5]
                */
                let quiet = new Uint32Array(data.buffer, 0, 6);
                debug_log(`farg_list quiet:${quiet[0]} flen:${quiet[2]} dlen:${quiet[3]} time: ${quiet[4]} ${quiet[5]}`);
                if((quiet[5] - quiet[4]) > 0 && (quiet[5] - quiet[4]) <= 35000){
                    farg_list.push({
                        data:quiet[0] === 1 ? null : (new TextDecoder("utf-8")).decode(new Uint8Array(data.buffer, pcm_pos, quiet[3])), 
                        quiet:(quiet[0] === 1), 
                        start_time:quiet[4] / 1000.0, 
                        end_time:quiet[5] / 1000.0});
                    peek_first_farg();
                }
                else
                {
                    debug_log("farg_list error");
                }
            }
        }
        break;
        case "settings":{
            debug_log(JSON.stringify(payload));
            gcp_key = payload.key;
            language_code = payload.language_code;
        }
        break;
    }
};