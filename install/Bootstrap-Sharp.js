/**
 * Bootstrap-Sharp — Install sharp into retold-sharp's own node_modules
 * with SHARP_IGNORE_GLOBAL_LIBVIPS=1 set, so that machines with a
 * Homebrew/system libvips don't trip sharp's "build from source"
 * fallback (which then dies because node-addon-api isn't a declared dep).
 *
 * Behavior:
 *   1. If sharp is already resolvable from this directory (because the
 *      consumer or a parent package installed it), do nothing — power
 *      users who built their own sharp keep that copy.
 *   2. Otherwise, run a child `npm install sharp@VERSION` with the
 *      env var set, into retold-sharp/node_modules/.
 *   3. If RETOLD_SHARP_INCLUDE_WASM=1, also install @img/sharp-wasm32
 *      with --cpu=wasm32 so sharp's loader can fall back to WASM at
 *      runtime on unsupported platforms (Synology NAS, etc).
 *
 * Skip entirely with RETOLD_SHARP_SKIP_INSTALL=1 (e.g. CI that primes
 * its own node_modules cache).
 */

const libChildProcess = require('node:child_process');
const libPath = require('node:path');

const _MODULE_ROOT = libPath.resolve(__dirname, '..');
const _PACKAGE = require('../package.json');

const log = (pMessage) =>
{
	console.log(`retold-sharp: ${pMessage}`);
};

const tryResolveSharp = () =>
{
	try
	{
		return require.resolve('sharp', { paths: [_MODULE_ROOT] });
	}
	catch (pError)
	{
		return null;
	}
};

const main = () =>
{
	if (process.env.RETOLD_SHARP_SKIP_INSTALL === '1')
	{
		log('RETOLD_SHARP_SKIP_INSTALL=1 set, skipping bootstrap');
		process.exit(0);
	}

	let tmpExisting = tryResolveSharp();
	if (tmpExisting)
	{
		log(`sharp already resolvable at ${tmpExisting} — using existing copy`);
		process.exit(0);
	}

	let tmpSharpSpec = `sharp@${_PACKAGE.config.sharpVersion}`;

	log(`installing ${tmpSharpSpec} with SHARP_IGNORE_GLOBAL_LIBVIPS=1`);

	let tmpEnv = Object.assign({}, process.env, { SHARP_IGNORE_GLOBAL_LIBVIPS: '1' });

	let tmpResult = libChildProcess.spawnSync(
		'npm',
		[
			'install',
			tmpSharpSpec,
			'--no-save',
			'--no-package-lock',
			'--no-audit',
			'--no-fund',
			'--include=optional'
		],
		{
			cwd: _MODULE_ROOT,
			env: tmpEnv,
			stdio: 'inherit',
			shell: true
		}
	);

	if (tmpResult.status !== 0)
	{
		log('bootstrap failed — sharp will not be available at runtime');
		process.exit(tmpResult.status == null ? 1 : tmpResult.status);
	}

	let tmpInstalled = tryResolveSharp();
	if (!tmpInstalled)
	{
		log('bootstrap completed but sharp is still not resolvable — something went wrong');
		process.exit(1);
	}

	if (process.env.RETOLD_SHARP_INCLUDE_WASM === '1')
	{
		let tmpWasmSpec = `@img/sharp-wasm32@${_PACKAGE.config.sharpWasmVersion}`;
		log(`RETOLD_SHARP_INCLUDE_WASM=1 — additionally installing ${tmpWasmSpec}`);

		let tmpWasmResult = libChildProcess.spawnSync(
			'npm',
			[
				'install',
				tmpWasmSpec,
				'--no-save',
				'--no-package-lock',
				'--no-audit',
				'--no-fund',
				'--cpu=wasm32',
				'--os=linux'
			],
			{
				cwd: _MODULE_ROOT,
				env: tmpEnv,
				stdio: 'inherit',
				shell: true
			}
		);

		if (tmpWasmResult.status !== 0)
		{
			log('wasm fallback install failed — continuing (sharp itself works)');
		}
	}

	log(`bootstrap complete — sharp resolvable at ${tmpInstalled}`);
	process.exit(0);
};

main();
