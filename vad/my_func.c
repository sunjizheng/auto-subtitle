#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <byteswap.h>
#include "my_func.h"
#include "sha256.h"
#include "wasm_debug.h"

#define N_ 1280
#define MN_ 320

static uint16_t convolve_1280(int16_t *pInBuf, uint32_t inBufLen, uint16_t **pOutBuf, uint32_t *pOutBufLen)
{
    uint32_t i = 0;
    int16_t v = 0;
    double w = 0;
    double lw = 0;
    double average = 0;
    double l_average = 0;
    double all_average = 0;
    double ker[N_];
    memset(ker, 0, N_ * sizeof(double));
    
    w = 1.0 / N_;
    lw = 1.0 / MN_;

    *pOutBufLen = inBufLen - N_ + 1;
    *pOutBuf = (uint16_t *)malloc(*pOutBufLen * sizeof(uint16_t));
    for (i = 0; i < inBufLen ; i++)
    {
        v = pInBuf[i] >= 0 ? pInBuf[i] : 0 - pInBuf[i];
        if (i < (N_ - 1))
        {
            ker[i] = v * w;
            average += ker[i];
        }
        else
        {
            average += v * w;
            ker[i % N_] = v * w;
            (*pOutBuf)[i - N_ + 1] = (uint16_t)average;
            average -= ker[(i + 1) % N_];
        }
        if ((i % MN_) == 0)
        {
            all_average += l_average * MN_ / inBufLen;
            l_average = 0;
        }
        l_average += v * lw;
    }
    all_average += l_average * MN_ / inBufLen;
    return ((uint16_t)((all_average + 25) / 50)) * 50;
}

static uint32_t argmin(uint16_t *pInBuf, uint32_t inBufLen)
{
    uint32_t i, ret_value;
    uint16_t min_value = 0xFFFF;
    for (i = 0; i < inBufLen; i++)
    {
        if (pInBuf[i] < min_value)
        {
            min_value = pInBuf[i];
            ret_value = i;
        }
    }
    return ret_value;
}

static uint32_t argmax(uint16_t *pInBuf, uint32_t inBufLen)
{
    uint32_t i, ret_value;
    uint16_t max_value = 0x0;
    for (i = 0; i < inBufLen; i++)
    {
        if (pInBuf[i] > max_value)
        {
            max_value = pInBuf[i];
            ret_value = i;
        }
    }
    return ret_value;
}

static void pcm_feature(uint16_t median, uint16_t *pInConvBuf, uint32_t inBufLen, uint16_t *pOutBuf, uint32_t *pOutBufLen)
{
    uint32_t i, ip = 0, il = 0;
    uint16_t v, l = 0;

    uint32_t median_point[MPL * 2];
    memset(median_point, 0 , sizeof(uint32_t) * MPL * 2);
    
    uint32_t top_point[MPL];
    memset(top_point, 0 , sizeof(uint32_t) * MPL);

    for (i = 0 ; i < inBufLen ; ++i)
    {
        v = pInConvBuf[i];
        if(v != median)
        {
            if(ip < MPL)
            {
                if(l < median && v > median)
                {
                    median_point[ip * 2] = i;
                    median_point[ip * 2 + 1] = 1;
                    ip++;
                }
                else if(l > median && v < median)
                {
                    median_point[ip * 2] = i;
                    median_point[ip * 2 + 1] = 0;
                    ip++;
                }
            }
            else
            {
                break;
            }
            l = v;
        }        
    }
    il = 0;
    for(i = 0 ; i < ip ; i++)
    {
        if(median_point[i * 2 + 1] == 0)
        {
            top_point[i] = argmax(pInConvBuf + il, median_point[i * 2] - il) + il;
        }
        else
        {
            top_point[i] = argmin(pInConvBuf + il, median_point[i * 2] - il) + il;
        }
        il = median_point[i * 2];
    }
    il = 0;
    *pOutBufLen = ip;
    for(i = 0 ; i < ip ; i++)
    {
        pOutBuf[i] = (uint16_t)((top_point[i] - il) % 0xFFFF);
        il = top_point[i];
    }
}

PPCM_DATA_HEADER toResult(
    int16_t *pData, 
    uint32_t dataLen, 
    uint32_t timeStart, 
    uint32_t timeEnd, 
    uint16_t* feature_data_buf, 
    uint32_t base64Result,
    uint32_t littleEndianResult)
{
    PPCM_DATA_HEADER pBuf = NULL;
    uint8_t* encrypt_data[1];
    uint8_t* encrypt_feature_data[1];
    uint32_t encrypt_len, encrypt_feature_len, total_len;
    uint16_t* convole_data[1];
    uint32_t convole_len, feature_len;
    uint16_t median;
  
    base64Result = 1;

    if (pData == NULL || dataLen <= (N_ + 1))
    {
        pBuf = (PPCM_DATA_HEADER)malloc(sizeof(PCM_DATA_HEADER));
        memset(pBuf, 0, sizeof(PCM_DATA_HEADER));
        pBuf->quiet = 1;
        pBuf->tStart = timeStart;
        pBuf->tEnd = timeEnd;
        //DBG_LOG(DEBUG_WASM_EMERG, "QUIET %p %d", pData, dataLen);
    }
    else
    {
        feature_len = 0;
        //feature: median = convolve_1280(pData, dataLen, convole_data, &convole_len);
        //feature: pcm_feature(median, convole_data[0], convole_len, feature_data_buf, &feature_len);
        //feature: free(convole_data[0]);
        
        total_len = sizeof(PCM_DATA_HEADER) 
            + feature_len * sizeof(uint16_t)
            + (base64Result ? (b64_encoded_size(dataLen * sizeof(uint16_t)) + 1) : (dataLen * sizeof(uint16_t)));
        pBuf = (PPCM_DATA_HEADER)malloc(total_len);
        memset(pBuf, 0, total_len);

        pBuf->tStart = timeStart;
        pBuf->tEnd = timeEnd;
        pBuf->feature_len = feature_len * sizeof(int16_t);
        pBuf->pcm_data_len = dataLen * sizeof(int16_t);
        //feature: memcpy(((BYTE*)pBuf) + sizeof(PCM_DATA_HEADER), (uint8_t *)feature_data_buf, pBuf->feature_len);
        if(!littleEndianResult){
            int16_t v;
            for(uint32_t i = 0 ; i < dataLen ; ++i){
                v = bswap_16(pData[i]);
                pData[i] = v;
            }
        }
        if(base64Result){
            pBuf->pcm_data_len = b64_encode((uint8_t *)pData, dataLen * sizeof(int16_t), (char*)pBuf + sizeof(PCM_DATA_HEADER) + pBuf->feature_len);
        }else{
            memcpy(((BYTE*)pBuf) + sizeof(PCM_DATA_HEADER) + pBuf->feature_len, (uint8_t *)pData, pBuf->pcm_data_len);
        }
        //DBG_LOG(DEBUG_WASM_EMERG, "VOICE %p %p %d %d %d %d %d", pData, pBuf, dataLen, pBuf->tStart, pBuf->tEnd, pBuf->feature_len, pBuf->pcm_data_len);
    }
    return pBuf;
}

void resetStatus(VadInstT *self, int32_t status)
{
    self->buf_offset_write = 0;
    self->buf_offset_read = 0;

    self->buf_status = status;
}

static int16_t audio_frame_mix(float32_t data1, float32_t data2, float32_t POW1, float32_t POW2)
{
    float32_t data_mix = 0, d1 = data1, d2 = data2;
    if( d1 < 0 && d2 < 0)  
        data_mix = d1 + d2 - (d1 * d2 / POW1);  
    else  
        data_mix = d1 + d2 - (d1 * d2 / POW2);
    data_mix = data_mix > 1 ? 1 : (data_mix < -1 ? -1 : data_mix);
    return data_mix < 0 ? (int16_t)(data_mix * 0x8000) : (int16_t)(data_mix * 0x7FFF);
}

void mix_2_channels(const float32_t* channel1,const  float32_t* channel2, int16_t* channel_out, uint32_t buffer_len)
{
    float32_t POW1 = -1;
    float32_t POW2 = 1;
    for(uint32_t i = 0 ; i < buffer_len ; ++i){
        channel_out[i] = audio_frame_mix(channel1[i], channel2[i], POW1, POW2);
    }
}

void float_2_int16(const float32_t* channel1, int16_t* channel_out, uint32_t buffer_len)
{
    float32_t data_mix = 0;
    for(uint32_t i = 0 ; i < buffer_len ; ++i){
        data_mix = channel1[i] > 1 ? 1 : (channel1[i] < -1 ? -1 : channel1[i]);
        channel_out[i] = data_mix < 0 ? (int16_t)(data_mix * 0x8000) : (int16_t)(data_mix * 0x7FFF);
    }   
}

uint32_t resample(const int16_t *input, uint32_t inputSize, int16_t *output, int inSampleRate, int outSampleRate) 
{
    if (input == NULL)
        return 0;
    uint64_t outputSize = inputSize * outSampleRate / inSampleRate;
    if (output == NULL)
        return outputSize;
    double stepDist = ((double) inSampleRate / (double) outSampleRate);
    const uint64_t fixedFraction = (1LL << 32);
    const double normFixed = (1.0 / (1LL << 32));
    uint64_t step = ((uint64_t) (stepDist * fixedFraction + 0.5));
    uint64_t curOffset = 0;
    for (uint32_t i = 0; i < outputSize; i += 1){
        *output++ = (int16_t)(input[0] + (input[1] - input[0]) * ((double) (curOffset >> 32) + ((curOffset & (fixedFraction - 1)) * normFixed)));
        curOffset += step;
        input += curOffset >> 32;
        curOffset &= (fixedFraction - 1);
    }
    return (uint32_t)outputSize;
}

