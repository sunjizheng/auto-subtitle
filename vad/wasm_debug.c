#include <emscripten.h>
#include <emscripten/html5.h>
#include <stdio.h>
#include "wasm_debug.h"

// Static variable that holds the current debug level for the entire wasm module
// By default only print messages with levels EMERG and lower
static DEBUG_WASM_LEVELS debugWasmLevel = DEBUG_WASM_EMERG;

//
// Sets a new debug level
//
EMSCRIPTEN_KEEPALIVE void Dbg_Set_Level(const DEBUG_WASM_LEVELS level)
{
    debugWasmLevel=level;
}

//
// Gets current debug level
//
EMSCRIPTEN_KEEPALIVE DEBUG_WASM_LEVELS Dbg_Get_Level(void)
{
    return debugWasmLevel;
}

//
// Main debug print function:
//  Note EMSCRIPTEN implements stderr to print into the Browser's console
//
void Dbg_Printf(const DEBUG_WASM_LEVELS level, const char *fmt, ...)
{
    // Only logs the message if the wasm debug level is equal or higher than
    // this message level
    char buff[2048];
    if( 1 || level <= debugWasmLevel )
    {
        // Gets the variable argument list and feeds to vfprintf
        // EMSCRIPTEN logs writes to stderr to the console, exactly what we need
        va_list args;
        va_start(args, fmt);
        vsnprintf(buff, 2048, fmt, args);
        va_end(args);
        emscripten_console_log(buff);
    }
}