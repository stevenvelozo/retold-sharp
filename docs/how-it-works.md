# How It Works

`retold-sharp` has two moving parts: an **install-time bootstrap** that fetches sharp with the right environment, and a **runtime passthrough** that resolves whichever sharp copy should win and exposes the diagnostic helpers. This page covers both, the environment variables that control them, and how to diagnose a bad install.

## The problem it bypasses

Sharp's installer treats a system `libvips` -- one already present from Homebrew, apt, or an ML pipeline -- as a signal that the user wants to compile sharp from source against that library. On a machine where libvips exists for unrelated reasons, that build path is taken unintentionally and fails with a misleading error:

```
Please add node-addon-api to your dependencies
```

Sharp ships an opt-out, `SHARP_IGNORE_GLOBAL_LIBVIPS=1`, which forces it to use its prebuilt binaries instead of detecting and building against the host libvips. The catch is *timing*: the variable has to be present in the environment before `npm install` runs sharp's lifecycle script, and there is no clean, portable way to pin an environment variable for a single dependency's install through `.npmrc` or `package.json`.

`retold-sharp` closes that gap by owning the sharp install itself, in its own lifecycle script, with the variable injected into the child process it spawns.

## Install-time bootstrap

The bootstrap lives at `install/Bootstrap-Sharp.js` and is wired into both the `install` and `postinstall` lifecycle scripts in `package.json`:

```json
"scripts": {
	"install": "node install/Bootstrap-Sharp.js",
	"postinstall": "node install/Bootstrap-Sharp.js"
}
```

Both hooks point at the same script; the script is idempotent, so running it twice is safe -- the second pass sees sharp already resolvable and exits immediately.

The bootstrap runs these steps, in order:

1. **Honor the skip flag.** If `RETOLD_SHARP_SKIP_INSTALL=1` is set, it logs and exits `0` without doing anything.
2. **Check for an existing sharp.** It calls `require.resolve('sharp', { paths: [<module root>] })`. If sharp is already resolvable from `retold-sharp`'s directory -- because the consumer or a parent package installed it -- it logs the resolved path and exits `0`, leaving that copy in place. This is what makes the power-user path work.
3. **Install the pinned sharp.** Otherwise it spawns a child `npm install` for the pinned spec (`sharp@<config.sharpVersion>`) into `retold-sharp/node_modules/`, with `SHARP_IGNORE_GLOBAL_LIBVIPS=1` merged into the child's environment. The install uses `--no-save --no-package-lock --no-audit --no-fund --include=optional`, runs with `stdio: 'inherit'` so its output is visible, and runs through a shell.
4. **Verify the install.** After the child install, it resolves sharp again. If sharp still cannot be resolved, it logs that something went wrong and exits `1`.
5. **Optionally add the WASM fallback.** If `RETOLD_SHARP_INCLUDE_WASM=1` is set, it additionally installs `@img/sharp-wasm32@<config.sharpWasmVersion>` with `--cpu=wasm32 --os=linux` so sharp's loader can fall back to WASM at runtime on platforms the native binary will not run on. A failure here is logged but **not** fatal -- native sharp still works.

The key line is the injected environment for the spawned install:

```javascript
let tmpEnv = Object.assign({}, process.env, { SHARP_IGNORE_GLOBAL_LIBVIPS: '1' });
```

Because the variable lives only in the child process `retold-sharp` spawns, the consumer never has to set it, and a host libvips never diverts the install into the build-from-source path.

### Version pinning

The sharp version is pinned in `retold-sharp`'s own `package.json` under the `config` block:

```json
"config": {
	"sharpVersion": "^0.34.5",
	"sharpWasmVersion": "^0.34.5"
}
```

`config.sharpVersion` is the spec the bootstrap installs; `config.sharpWasmVersion` is the spec used when the WASM fallback is requested. Bumping these two lines upgrades sharp across every consumer that depends on `retold-sharp`.

## Runtime passthrough

The runtime entry point is `source/Retold-Sharp.js` (the package `main`). On load it resolves sharp using Node's standard upward `node_modules` walk, starting from its own directory:

```javascript
let tmpSharpPath = require.resolve('sharp', { paths: [libPath.resolve(__dirname, '..')] });
_sharpModule = require(tmpSharpPath);
```

Because resolution starts at `retold-sharp` and walks upward, a sharp installed higher in the tree (at the consumer level) is found and used in preference to the bootstrapped copy. A power user who built their own sharp -- perhaps against a custom libvips -- gets their copy at runtime, matching the bootstrap's decision to skip when sharp is already present.

If resolution succeeds, the module attaches the two diagnostic helpers onto the sharp constructor and re-exports it, so the default export *is* sharp:

```javascript
_sharpModule.checkAvailable = checkAvailable;
_sharpModule.getMode = getMode;
module.exports = _sharpModule;
```

If resolution fails, it exports a stand-in function instead. The stand-in throws when called as the constructor, but still carries `checkAvailable()` and `getMode()` so a consumer can detect the failure without crashing on require. See [Quickstart](quickstart.md) for the consumer-side pattern.

### How `getMode()` decides native vs. WASM

`getMode()` does not load sharp -- it inspects the filesystem. Starting at `retold-sharp`'s directory and walking up the `node_modules` chain, it looks for:

- `@img/sharp-{platform}-{arch}` (for example `@img/sharp-darwin-arm64`) -- returns `'native'`
- `@img/sharp-wasm32` -- returns `'wasm'`

The platform/arch string is built from `process.platform` and `process.arch`. If neither directory is found anywhere up the chain, it returns `null`. Whichever copy of sharp got resolved, its sibling `@img` package lives in the same `node_modules` directory, so this walk reports the binding that the resolved sharp will actually use.

### How `checkAvailable()` proves the binding runs

`checkAvailable()` goes one step further than `getMode()`: it actually exercises the binding. It instantiates a 1x1 raw pixel buffer through the sharp constructor:

```javascript
_sharpModule(Buffer.from([0, 0, 0]), { raw: { width: 1, height: 1, channels: 3 } });
```

If that call throws, the binding loaded but cannot run on this machine (the classic Synology / odd-architecture case), and `checkAvailable()` returns `available: false` with the error message. If it succeeds, it returns `available: true`, the mode from `getMode()`, and sharp's own `versions` object. The check is fully synchronous, so it is safe to run at service startup before accepting traffic.

## Environment variables

| Variable | Where it applies | Effect |
|----------|------------------|--------|
| `SHARP_IGNORE_GLOBAL_LIBVIPS` | Set automatically by the bootstrap (`=1`) on the child install | Forces sharp to use prebuilt binaries instead of detecting and building against a host libvips. You do not set this yourself -- `retold-sharp` injects it. |
| `RETOLD_SHARP_SKIP_INSTALL` | Read by the bootstrap at install time | When `=1`, skips the bootstrap entirely. Useful for CI that primes its own `node_modules` cache, or for environments with no network access during install. |
| `RETOLD_SHARP_INCLUDE_WASM` | Read by the bootstrap at install time | When `=1`, additionally installs `@img/sharp-wasm32` (pinned to `config.sharpWasmVersion`) so sharp's loader can fall back to WASM on platforms where the native binary will not run. |

> Note: `RETOLD_SHARP_INCLUDE_WASM` is honored by the bootstrap source but is not mentioned in the package README; the behavior here is described from `install/Bootstrap-Sharp.js`.

## Diagnostics

When sharp is misbehaving, work from the runtime helpers outward:

1. **`checkAvailable()`** is the first call. `available: true` with a non-null `versions` block means the binding loaded and ran. `available: false` carries the error message -- a resolution failure reads like `sharp module not loaded` or the resolver's own message, while a binding that loads but cannot run surfaces the runtime error from the 1x1 smoke test.
2. **`getMode()`** tells you which binding is on disk (`native`, `wasm`, or `null`). A `null` here means neither an `@img/sharp-{platform}-{arch}` nor an `@img/sharp-wasm32` directory was found up the chain -- usually a sign the bootstrap was skipped or failed.
3. **Bootstrap output.** The bootstrap logs every decision with a `retold-sharp:` prefix during `npm install` -- whether it skipped, which spec it installed, and the final resolved path. If the install failed, that log explains where. Re-running the install (or `node install/Bootstrap-Sharp.js` from the module root) reproduces it.

The bundled playground exposes `checkAvailable()` over HTTP at `GET /api/status`, which is a convenient way to confirm the binding in a running service. See [Quickstart](quickstart.md) for the playground.

## Related Modules

- [orator-conversion](https://fable-retold.github.io/orator-conversion/) -- requires `retold-sharp` directly (`const libSharp = require('retold-sharp')`) for its image conversion endpoints, relying on the drop-in passthrough
- [sharp](https://sharp.pixelplumbing.com/) (external) -- the image library `retold-sharp` installs and re-exports
