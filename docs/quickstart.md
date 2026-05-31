# Quickstart

`retold-sharp` is a drop-in wrapper around [sharp](https://sharp.pixelplumbing.com/). The fastest path is to install it, require it exactly where you would have required sharp, and confirm the binding works with the diagnostic helpers.

## Install

```bash
npm install retold-sharp
```

During install, `retold-sharp` runs a bootstrap script that fetches the pinned sharp build with `SHARP_IGNORE_GLOBAL_LIBVIPS=1` set in the child process. If sharp is already resolvable from your project, the bootstrap skips itself. See [How It Works](how-it-works.md) for the full mechanism and the environment variables that control it.

## Drop-in usage

The default export is the sharp constructor function itself. Any code that did `require('sharp')` can switch to `require('retold-sharp')` with no other changes.

```javascript
const libSharp = require('retold-sharp');

libSharp('input.jpg')
	.resize(300, 200)
	.toFile('out.jpg');
```

The full sharp API is available on the returned pipeline -- `resize`, `rotate`, `blur`, `grayscale`, `tint`, `toFormat`, `metadata`, `toBuffer`, `toFile`, and the rest. Refer to the [sharp documentation](https://sharp.pixelplumbing.com/) for the operation reference.

A buffer-in / buffer-out example:

```javascript
const libSharp = require('retold-sharp');

libSharp(pInputBuffer)
	.resize(200, 200, { fit: 'inside' })
	.toFormat('webp', { quality: 80 })
	.toBuffer()
	.then((pOutputBuffer) =>
	{
		// pOutputBuffer is a WebP-encoded image
	});
```

## Confirm the binding works

Before relying on sharp in a long-running service, call `checkAvailable()`. It runs a synchronous 1x1 raw pixel smoke test that exercises the native or WASM binding, so it catches the case where the module loads but the underlying binary will not actually run on the host.

```javascript
const libSharp = require('retold-sharp');

let tmpStatus = libSharp.checkAvailable();
//  => { available: true, mode: 'native', versions: { sharp, vips, ... }, error: null }

if (!tmpStatus.available)
{
	throw new Error(`sharp is not usable: ${tmpStatus.error}`);
}
```

The return shape is always the same four keys:

| Key | Type | Notes |
|-----|------|-------|
| `available` | `boolean` | `true` only after the 1x1 smoke test runs without throwing |
| `mode` | `'native'` &#124; `'wasm'` &#124; `null` | `null` when the binding could not be exercised |
| `versions` | object &#124; `null` | sharp's own `versions` object (`sharp`, `vips`, and the underlying library versions) when available |
| `error` | string &#124; `null` | the error message when `available` is `false` |

To inspect which binding is on disk without running the smoke test, use `getMode()`:

```javascript
const libSharp = require('retold-sharp');

libSharp.getMode();
//  => 'native' | 'wasm' | null
```

`getMode()` walks up the `node_modules` chain from `retold-sharp` looking for an `@img/sharp-{platform}-{arch}` directory (native) or `@img/sharp-wasm32` (WASM), and returns `null` if neither is found.

## When sharp could not be resolved

If sharp is not resolvable at all -- for example the bootstrap was skipped and nothing else installed sharp -- `retold-sharp` still loads. The default export becomes a stand-in function that throws on use, but `checkAvailable()` and `getMode()` remain callable so a service can detect the condition and report it cleanly rather than crashing on require.

```javascript
const libSharp = require('retold-sharp');

let tmpStatus = libSharp.checkAvailable();
if (!tmpStatus.available)
{
	// tmpStatus.error explains why; calling libSharp(...) here would throw
}
```

## Bundled playground

A Pict-based playground lives at `example_applications/sharp_playground/`. It serves a static UI plus a small Node API (`/api/status`, `/api/sample`, `/api/process`) backed by `retold-sharp`.

```bash
cd example_applications/sharp_playground
npm install
npm run build           # bundle the Pict app into dist/
npm start               # serves dist/ + the /api/* sharp endpoints on :7780
```

From the `retold-sharp` root you can also run:

```bash
npm run example         # npx quack examples (builds + serves the static index)
```

`npx quack examples` serves only the static UI shell. For the live image operations you must run `npm start` from inside `example_applications/sharp_playground/` -- that boots the Node API server backed by `retold-sharp`. The API server listens on port `7780` by default; pass a port as the first argument to override it (for example `npm start 8080`).
