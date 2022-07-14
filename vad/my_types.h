#ifndef MY_TYPES_H_
#define MY_TYPES_H_

typedef long long   int64_t;
typedef int         int32_t;
typedef short       int16_t;
typedef signed char        int8_t;

typedef unsigned long long  uint64_t;
typedef unsigned int       uint32_t;
typedef unsigned short      uint16_t;
typedef unsigned char       uint8_t;

typedef float float32_t;
typedef double float64_t;

#include "limits.h"
#include "stdint.h"
//#define INT32_MAX LONG_MAX
//#define INT32_MIN LONG_MIN

#define MULTI 1
#define FRAME_SIZE (160 * MULTI)


#endif