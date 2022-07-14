#!/bin/bash

emcc --std=c++11 checks.cc -o checks.o

emcc -O2 -s ASSERTIONS=1 -s ALLOW_MEMORY_GROWTH=1 -s SAFE_HEAP=1 -s ABORTING_MALLOC=0 -s SINGLE_FILE=1 -s EXIT_RUNTIME=1 -s INITIAL_MEMORY=536870912 -s EXTRA_EXPORTED_RUNTIME_METHODS=["addOnExit","getValue","print","printErr"] -g4 --source-map-base "http://127.0.0.1:8000/" checks.o spl_init.c vad_core.c vad_filterbank.c vad_gmm.c vad_sp.c webrtc_vad.c resample_48khz.c resample_by_2_internal.c resample_fractional.c division_operations.c energy.c get_scaling_square.c downsample_fast.c min_max_operations.c cross_correlation.c vector_scaling_operations.c wasm_debug.c base64.c my_func.c sha256.c -o wvad.js

cp ./wvad.js ../src
echo "self.vad = Module;" >> ../src/wvad.js


#-s SAFE_HEAP_LOG=1