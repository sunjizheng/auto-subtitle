#ifndef MY_FUNC_H
#define MY_FUNC_H

#include "my_types.h"
#include "vad_core.h"
#include "base64.h"

#define STATUS_VOICE (1)
#define STATUS_QUIET (0)
#define STATUS_UNDEFINED (-1)

typedef struct PCM_DATA_HEADER_{
    unsigned long quiet;
    unsigned long reserve;
    unsigned long feature_len;
    unsigned long pcm_data_len;
    unsigned long tStart;
    unsigned long tEnd;
}* PPCM_DATA_HEADER, PCM_DATA_HEADER;

PPCM_DATA_HEADER toResult(int16_t* pData, 
    uint32_t dataLen, 
    uint32_t timeStart, 
    uint32_t timeEnd, 
    uint16_t* feature_data_buf, 
    uint32_t base64Result, 
    uint32_t littleEndianResult);
void resetStatus(VadInstT* self, int32_t status);
void mix_2_channels(const float32_t* channel1,const float32_t* channel2, int16_t* channel_out, uint32_t buffer_len);
void float_2_int16(const float32_t* channel1, int16_t* channel_out, uint32_t buffer_len);
uint32_t resample(const int16_t *input, uint32_t inputSize, int16_t *output, int inSampleRate, int outSampleRate);
#endif