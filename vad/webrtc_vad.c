/*
 *  Copyright (c) 2012 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */
#ifndef EM_PORT_API
#if defined(__EMSCRIPTEN__)
#include <emscripten.h>
#if defined(__cplusplus)
#define EM_PORT_API(rettype) extern "C" rettype EMSCRIPTEN_KEEPALIVE
#else
#define EM_PORT_API(rettype) rettype EMSCRIPTEN_KEEPALIVE
#endif
#else
#if defined(__cplusplus)
#define EM_PORT_API(rettype) extern "C" rettype
#else
#define EM_PORT_API(rettype) rettype
#endif
#endif
#endif

#include "webrtc_vad.h"

#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "base64.h"

#include "signal_processing_library.h"
#include "vad_core.h"

#include "wasm_debug.h"
#include "my_func.h"

//#include "typedefs.h"  // NOLINT(build/include)

static const int kInitCheck = 42;
static const int kValidRates[] = {8000, 16000, 32000, 48000};
static const size_t kRatesSize = sizeof(kValidRates) / sizeof(*kValidRates);
static const int kMaxFrameLengthMs = 30;


int VsetMode(VadInst *handle, int mode)
{
  VadInstT *self = (VadInstT *)handle;
  if (handle == NULL)
  {
    return -1;
  }
  if (self->init_flag != kInitCheck)
  {
    return -1;
  }
  if (self->aggressiveness_mode == mode)
  {
    return 0;
  }
  else
  {
    self->aggressiveness_mode = mode;
  }
  return WebRtcVad_set_mode_core(self, mode);
}

uint32_t get_buffer_start_time(uint32_t tCurrent, uint32_t sample_premillisecond, uint32_t offset_read)
{
  uint32_t ret_value = tCurrent - (offset_read / sample_premillisecond);
  //DBG_LOG(DEBUG_WASM_EMERG, "offset_read %d sample_premillisecond %d tCurrent %d", offset_read, sample_premillisecond, tCurrent);
  return ret_value > 0 ? ret_value : 0;
}

EM_PORT_API(VadInst *)
Vcreate()
{
  srand((unsigned int)time(NULL));
  VadInstT *self = (VadInstT *)malloc(sizeof(VadInstT));
  memset(self, 0, sizeof(VadInstT));
  WebRtcSpl_Init(); 
  self->init_flag = 0;
  self->aggressiveness_mode = -1;
  return (VadInst *)self;
}

EM_PORT_API(int)
Vinit(VadInst *handle)
{
  return WebRtcVad_InitCore((VadInstT *)handle);
}

EM_PORT_API(void)
Vfinal(VadInst *handle)
{
  VadInstT *self = (VadInstT *)handle;
  free(self->buf);
  free(self->buf_2);
  free(handle);
}

EM_PORT_API(void)
VfreeMemory(char *point)
{
  free(point);
}

int process(VadInst *handle, const int16_t *audio_frame)
{
  int vad = -2;
  VadInstT *self = (VadInstT *)handle;

  if (handle == NULL)
  {
    return -3;
  }
  if (self->init_flag != kInitCheck)
  {
    return -4;
  }
  if (self->buf == NULL)
  {
    return -7;
  }
  switch(self->output_sample_rate)
  {
    case 48000:
      vad = WebRtcVad_CalcVad48khz(self, audio_frame, FRAME_SIZE);
      break;
    case 32000:
      vad = WebRtcVad_CalcVad32khz(self, audio_frame, FRAME_SIZE);
      break;
    case 16000:
      vad = WebRtcVad_CalcVad16khz(self, audio_frame, FRAME_SIZE);
      break;
    case 8000:
      vad = WebRtcVad_CalcVad8khz(self, audio_frame, FRAME_SIZE);
      break;
    default:
      break;
  }
  return vad > 0 ? 1 : vad;
}

EM_PORT_API(int)
VsetBufferSize(VadInst *handle, 
  uint32_t msec3, 
  uint32_t msec2, 
  uint32_t msec1, 
  uint32_t msec0, 
  uint32_t delay_msec, 
  uint32_t in_sample_rate,
  uint32_t out_sample_rate,
  uint32_t cFrame,
  uint32_t base64,
  uint32_t little_endian)
{
  VadInstT *self = (VadInstT *)handle;

  if (handle == NULL)
  {
    return -1;
  }

  self->max_delay_msec = delay_msec;
    
  free(self->buf);
  free(self->buf_2);

  self->buflen = delay_msec * (out_sample_rate / 1000);
  if (self->buflen % 128 != 0 || self->buflen % FRAME_SIZE != 0)
  {
    return -2;
  }

  self->msec3 = msec3;
  self->msec2 = msec2;
  self->msec1 = msec1;
  self->msec0 = msec0;

  self->buf = (int16_t *)malloc((self->buflen + 4096 * 1024) * sizeof(int16_t));

  self->buf_2len = cFrame;
  self->buf_2 = (int16_t *)malloc(self->buf_2len * sizeof(int16_t));
  self->input_sample_rate = in_sample_rate;
  self->output_sample_rate = out_sample_rate;
  resetStatus(self, STATUS_UNDEFINED);

  self->base64_result = base64;
  self->little_endian_result = little_endian;

  if (self->buf == 0 || self->buf_2 == 0)
  {
    return -3;
  }
  return 0;
}

EM_PORT_API(void) 
Vreset(VadInst *handle)
{
  VadInstT *self = (VadInstT *)handle;
  resetStatus(self, STATUS_UNDEFINED);
}

PPCM_DATA_HEADER Vprocess_XK(VadInst *handle, const int16_t *audio_frame, uint32_t tCurrent, uint32_t *fragment_start)
{
  VadInstT *self = (VadInstT *)handle;
  PPCM_DATA_HEADER retValue = NULL;
  uint32_t result = 0;
  uint32_t sample_premillisecond = self->output_sample_rate / 1000;
  if (self->buf_status == STATUS_VOICE)
  {
    if (self->buf_offset_read >= (sample_premillisecond * self->msec0))
    {
      VsetMode(handle, 0);
    }
    else if (self->buf_offset_read >= (sample_premillisecond * self->msec1))
    {
      VsetMode(handle, 1);
    }
    else if (self->buf_offset_read >= (sample_premillisecond * self->msec2))
    {
      VsetMode(handle, 2);
    }
    else
    {
      VsetMode(handle, 3);
    }
  }
  else
  {
    VsetMode(handle, 3);
  }
  result = process(handle, audio_frame);
  //DBG_LOG(DEBUG_WASM_EMERG, "process %d", result);
  if (self->buf_offset_read >= self->buflen)
  { //end of buffer
    if (self->buf_status == STATUS_VOICE)
    {
      *fragment_start = audio_frame - self->buf;
      retValue = toResult(self->buf, 
        self->buf_offset_read, 
        get_buffer_start_time(tCurrent, sample_premillisecond, *fragment_start), 
        tCurrent, 
        self->feature_buf,
        self->base64_result,
        self->little_endian_result);
        self->buf_status = result;
    }
    else
    {
      *fragment_start = audio_frame - self->buf;
      retValue = toResult(NULL, 0, 
        get_buffer_start_time(tCurrent, sample_premillisecond, *fragment_start),
        tCurrent, 0, self->base64_result, self->little_endian_result);
      self->buf_status = result;

    }
  }
  else
  {
    switch (self->buf_status)
    {
    case STATUS_VOICE:
    {
      switch (result)
      {
      case STATUS_VOICE:
        break;
      case STATUS_QUIET:
        if (self->buf_offset_read >= (sample_premillisecond * self->msec3))
        {
          *fragment_start = audio_frame - self->buf;
          retValue = toResult(self->buf,
            *fragment_start, get_buffer_start_time(tCurrent, sample_premillisecond, *fragment_start),
            tCurrent,
            self->feature_buf,
            self->base64_result,
            self->little_endian_result);
          self->buf_status = result;
        }
        break;
      }
    }
    break;
    case STATUS_QUIET:
    {
      switch (result)
      {
      case STATUS_VOICE:
        {
          *fragment_start = audio_frame - self->buf;
          retValue = toResult(NULL, 
            0, 
            get_buffer_start_time(tCurrent, sample_premillisecond, *fragment_start),
            tCurrent,
            0,
            self->base64_result,
            self->little_endian_result);
          self->buf_status = result;
        }
        break;
      case STATUS_QUIET:
        break;
      }
    }
    break;
    case STATUS_UNDEFINED:
    {
      *fragment_start = audio_frame - self->buf;
      retValue = toResult(NULL,
        0,
        get_buffer_start_time(tCurrent, sample_premillisecond, *fragment_start),
        tCurrent,
        0,
        self->base64_result,
        self->little_endian_result);
      self->buf_status = result;
    }
    break;
    }
  }

  return retValue;
}

EM_PORT_API(PPCM_DATA_HEADER)
Vprocess(VadInst *handle, const float32_t *inputBuffer1, const float32_t *inputBuffer2, uint32_t bufLen, float64_t currentTime)
{
  VadInstT *self = (VadInstT *)handle;
  uint32_t tCurrent = (uint32_t)(currentTime * 1000);
  PPCM_DATA_HEADER retValue = NULL;
  uint32_t fragment_start = 0;
  uint32_t sample_premillisecond = self->output_sample_rate / 1000;
  tCurrent -= (self->buf_offset_write - self->buf_offset_read) / sample_premillisecond;
  if(inputBuffer1)
  {
    //mixing
    if (inputBuffer2)
    {
      mix_2_channels(inputBuffer1, inputBuffer2, self->buf_2, bufLen);
    }
    else
    {
      float_2_int16(inputBuffer1, self->buf_2, bufLen);
    }
    //resample
    if (self->input_sample_rate != self->output_sample_rate)
    {
      self->buf_offset_write += resample(self->buf_2, bufLen, self->buf + self->buf_offset_write,
                                            self->input_sample_rate, self->output_sample_rate);
    }
    else
    {
      memcpy(self->buf + self->buf_offset_write, self->buf_2, bufLen * sizeof(int16_t));
      self->buf_offset_write += bufLen;
    }
    //vad
    while (retValue == NULL && (self->buf_offset_write - self->buf_offset_read) >= FRAME_SIZE)
    {
      retValue = Vprocess_XK(handle, self->buf + self->buf_offset_read, tCurrent, &fragment_start);
      self->buf_offset_read += FRAME_SIZE;
      tCurrent += FRAME_SIZE / sample_premillisecond;
    }
    if (retValue && fragment_start != 0)
    {
      memmove(self->buf,
              self->buf + fragment_start,
              (self->buf_offset_write - fragment_start) * sizeof(int16_t));
      self->buf_offset_write -= fragment_start;
      self->buf_offset_read -= fragment_start;
    }
  }
  else
  {
    if (self->buf_status == STATUS_VOICE)
    {
      retValue = toResult(self->buf, 
        self->buf_offset_write, 
        tCurrent - (self->buf_offset_write / sample_premillisecond), 
        tCurrent, 
        self->feature_buf,
        self->base64_result,
        self->little_endian_result);
    }
    else
    {
      retValue = toResult(NULL, 
        0, 
        tCurrent - (self->buf_offset_write / sample_premillisecond), 
        tCurrent, 
        0,
        self->base64_result,
        self->little_endian_result);
    }
    resetStatus(self, STATUS_UNDEFINED);  
  }
  return retValue;
}

