@echo off
if defined EMSDK (
  set "EMCC=%EMSDK%\upstream\emscripten\emcc.py"
) else (
  set "EMCC=emsdk\upstream\emscripten\emcc.py"
)
python "%EMCC%" wasm-morph/morph.cpp -O3 ^
  -s WASM=1 ^
  -s MODULARIZE=1 ^
  -s EXPORT_ES6=1 ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s "EXPORTED_FUNCTIONS=['_malloc','_free']" ^
  -s "EXPORTED_RUNTIME_METHODS=['HEAPU8']" ^
  -lembind ^
  -o wasm-morph/morph_wasm.js
