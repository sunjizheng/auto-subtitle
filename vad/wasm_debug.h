#include <stdarg.h>

// This define controls the debug message system at compilation time:
//  0-Disables the debug message system. If optimization is used(-Os,-Oz,...),
//      then the debug code will be optimized out because it becomes dead code.
// any other number enables it and leave the debug code ready for use
#define DEBUG_WASM_ENABLED  (1)

// Debug levels to be associated with each debug message,
// based on printk implemented in the linux kernel
// Only takes effect if DEBUG_WASM_ENABLED is not 0
typedef enum DEBUG_WASM_LEVELS
{
    DEBUG_WASM_EMERG =      0,
    DEBUG_WASM_ALERT =      1,
    DEBUG_WASM_CRIT =       2,
    DEBUG_WASM_ERR =        3,
    DEBUG_WASM_WARN =       4,
    DEBUG_WASM_NOTICE =     5,
    DEBUG_WASM_INFO =       6,
    DEBUG_WASM_DEBUG =      7
} DEBUG_WASM_LEVELS;

// Prototypes for set/get debug level, to be called from Javascript
void Dbg_Set_Level(const DEBUG_WASM_LEVELS level);
DEBUG_WASM_LEVELS Dbg_Get_Level(void);

// Main debug print function:
//  level-This debug message level
//  fmt-Message format
//  ...-Variable number of parameters with the message to be used
void Dbg_Printf(const DEBUG_WASM_LEVELS level, const char *fmt, ...);

// Main macro to be used in the wasm module.
//  It is a macro because it can then get information about the location where
//  it is placed, like file, line, function, etc...
//
#define DBG_LOG(level, fmt, ...) \
do \
{ \
    if (DEBUG_WASM_ENABLED) \
    { \
        Dbg_Printf(level,"%s:%d:%s(): " fmt, __FILE__, __LINE__, __func__, __VA_ARGS__); \
    } \
} while (0)

