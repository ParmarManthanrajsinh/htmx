emcc wasm-morph/morph.cpp -O3 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -lembind \
  -o wasm-morph/morph_wasm.js
