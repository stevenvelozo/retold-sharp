# retold-sharp

> A drop-in wrapper around the [sharp](https://sharp.pixelplumbing.com/) image library that bypasses sharp's global-libvips detection at install time

`retold-sharp` exists to solve one specific install-time problem: sharp treats the presence of a system `libvips` (installed via Homebrew, apt, or an ML pipeline) as a signal to compile sharp from source. On a machine where libvips happens to be present for unrelated reasons, that build path fails with a misleading `Please add node-addon-api to your dependencies` error.

Sharp exposes an opt-out -- `SHARP_IGNORE_GLOBAL_LIBVIPS=1` -- but the variable has to be set in the environment *before* `npm install` runs sharp's lifecycle script, and there is no clean way to pin that at the project level through `.npmrc` or `package.json`. `retold-sharp` installs sharp in its own `install` lifecycle script, with the variable injected into the child process. Consumers depend on `retold-sharp` instead of `sharp` and get a working sharp regardless of what is on the host.

## Features

- **Drop-in replacement** -- the default export is the sharp constructor itself; anywhere `require('sharp')` works, `require('retold-sharp')` works the same way
- **Install-time libvips bypass** -- bootstraps sharp with `SHARP_IGNORE_GLOBAL_LIBVIPS=1` so a host libvips never triggers the build-from-source path
- **Power-user passthrough** -- if sharp is already resolvable from your project, the bootstrap skips itself and the runtime uses your copy
- **Diagnostic helpers** -- `checkAvailable()` runs a synchronous 1x1 pixel smoke test; `getMode()` reports `native`, `wasm`, or `null`
- **Optional WASM fallback** -- `RETOLD_SHARP_INCLUDE_WASM=1` additionally installs `@img/sharp-wasm32` for platforms the native binary will not run on
- **Single-line version pin** -- the sharp version lives in this package's `package.json` under `config.sharpVersion`

## Quick Start

```javascript
const libSharp = require('retold-sharp');

libSharp('input.jpg')
	.resize(300, 200)
	.toFile('out.jpg');
```

See the [Quickstart](quickstart.md) for installation, the diagnostic helpers, and the bundled playground.

## Installation

```bash
npm install retold-sharp
```

The package runs a bootstrap during install that fetches the pinned sharp build. See [How It Works](how-it-works.md) for what the bootstrap does and the environment variables that control it.

## Diagnostic Helpers

The exported object carries two helpers in addition to the constructor:

| Helper | Returns | Purpose |
|--------|---------|---------|
| `checkAvailable()` | `{ available, mode, versions, error }` | Synchronous smoke test that instantiates a 1x1 raw pixel buffer to exercise the binding |
| `getMode()` | `'native'` &#124; `'wasm'` &#124; `null` | Reports which `@img/sharp-*` package is on disk under the resolution path |

```javascript
const libSharp = require('retold-sharp');

libSharp.checkAvailable();
//  => { available: true, mode: 'native', versions: { sharp, vips, ... }, error: null }

libSharp.getMode();
//  => 'native' | 'wasm' | null
```

`checkAvailable()` catches the case where the sharp module loads but the underlying binary will not run -- the classic Synology / odd-architecture failure mode.

## Documentation

- [Quickstart](quickstart.md) -- install, drop-in usage, diagnostics, and the bundled playground
- [How It Works](how-it-works.md) -- the install-time libvips-detection bypass, the runtime resolution walk, and the environment variables

## Related Modules

- [orator-conversion](https://fable-retold.github.io/orator-conversion/) -- consumes `retold-sharp` for its image conversion endpoints (`require('retold-sharp')` as a drop-in for sharp)
- [sharp](https://sharp.pixelplumbing.com/) (external) -- the underlying high-performance image library that `retold-sharp` wraps and installs
