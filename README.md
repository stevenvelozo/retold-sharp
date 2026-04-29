# retold-sharp

Drop-in wrapper around [sharp](https://sharp.pixelplumbing.com/) that bypasses sharp's global-libvips detection at install time.

## Why this exists

Sharp's installer treats the presence of a system `libvips` (e.g. via Homebrew, apt, or an ML pipeline) as a signal that the user wants to compile sharp from source. On a machine where libvips was installed for unrelated reasons, this triggers a build path that fails with a misleading `Please add node-addon-api to your dependencies` error.

Sharp exposes an opt-out — `SHARP_IGNORE_GLOBAL_LIBVIPS=1` — but the env var must be set before `npm install` runs sharp's lifecycle script, and there's no clean way to pin that at the project level via `.npmrc` or `package.json`.

`retold-sharp` solves this by installing sharp itself, in its own `install` lifecycle script, with the env var injected into the child process. Consumers depend on `retold-sharp` instead of `sharp` and get a working sharp regardless of what's on the host.

## Use

```js
const libSharp = require('retold-sharp');

libSharp('input.jpg').resize(300, 200).toFile('out.jpg');
```

The default export is the sharp constructor — anywhere `require('sharp')` works, `require('retold-sharp')` works the same way.

## Diagnostic helpers

```js
const libSharp = require('retold-sharp');

libSharp.checkAvailable();
//  => { available: true, mode: 'native', versions: { sharp, vips, ... }, error: null }

libSharp.getMode();
//  => 'native' | 'wasm' | null
```

`checkAvailable()` runs a 1×1 pixel smoke test synchronously — it catches the case where the sharp module loads but the underlying binary won't run (the classic Synology/odd-arch failure mode).

## Power user mode

If sharp is already resolvable from your project (because you installed it yourself, perhaps with a custom libvips build), `retold-sharp` detects that at install time and skips its own bootstrap. The runtime passthrough also walks up the standard `node_modules` chain, so your copy wins.

## Skip the bootstrap

`RETOLD_SHARP_SKIP_INSTALL=1` skips the bootstrap entirely — useful for CI that primes its own `node_modules` cache, or for environments without network access during install.

## Pinning sharp's version

The pinned sharp version lives in this package's `package.json` under `config.sharpVersion`. Bump that one line to upgrade sharp across every Retold consumer.

## Example application

A Pict-based playground lives at `example_applications/sharp_playground/`. To run it:

```bash
cd example_applications/sharp_playground
npm install
npm run build           # bundle the Pict app into dist/
npm start               # serves dist/ + the /api/* sharp endpoints on :7780
```

Or from the retold-sharp root:

```bash
npm run example         # → npx quack examples (builds + serves the static index)
```

Note: `npx quack examples` serves only the static UI shell. For the live image operations, run `npm start` from inside `example_applications/sharp_playground/` — that boots the Node API server backed by retold-sharp.
