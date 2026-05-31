# retold-sharp

> A drop-in wrapper around the sharp image library that bypasses sharp's global-libvips detection at install time

- Drop-in replacement: `require('retold-sharp')` anywhere `require('sharp')` worked
- Installs sharp with `SHARP_IGNORE_GLOBAL_LIBVIPS=1` so a host libvips never triggers a build from source
- Power-user passthrough resolves your own sharp copy when present
- `checkAvailable()` and `getMode()` diagnostic helpers for native / WASM bindings

[GitHub](https://github.com/fable-retold/retold-sharp)
[Get Started](#retold-sharp)
