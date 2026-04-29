/**
 * retold-sharp — drop-in passthrough for the sharp image library.
 *
 * Default export is the sharp constructor function itself, so any code
 * that did `require('sharp')` can change to `require('retold-sharp')`
 * without further modification.
 *
 * Adds two diagnostic helpers on the exported object:
 *
 *   retoldSharp.checkAvailable()
 *     Synchronous smoke test — instantiates a 1x1 raw pixel buffer to
 *     exercise the native or WASM binding. Returns:
 *       {
 *         available: boolean,
 *         mode: 'native' | 'wasm' | null,
 *         versions: { sharp, vips, ... } | null,
 *         error: string | null
 *       }
 *
 *   retoldSharp.getMode()
 *     Returns 'native', 'wasm', or null based on which @img/sharp-*
 *     package is on disk under retold-sharp's resolution path.
 *
 * The wrapper resolves sharp using Node's standard upward node_modules
 * walk, starting from this file's directory. So if a power user installed
 * sharp themselves at the consumer level, retold-sharp uses that copy.
 */

const libPath = require('node:path');
const libFs = require('node:fs');

let _sharpModule = null;
let _sharpResolutionError = null;

try
{
	let tmpSharpPath = require.resolve('sharp', { paths: [libPath.resolve(__dirname, '..')] });
	_sharpModule = require(tmpSharpPath);
}
catch (pError)
{
	_sharpResolutionError = pError;
}

const getMode = () =>
{
	if (!_sharpModule)
	{
		return null;
	}

	let tmpPlatform = `${process.platform}-${process.arch}`;
	let tmpModuleRoot = libPath.resolve(__dirname, '..');

	// Walk up node_modules from retold-sharp looking for @img/sharp-{platform}.
	// Whichever copy of sharp got resolved, its sibling @img package lives
	// in the same node_modules directory.
	let tmpCurrent = tmpModuleRoot;
	while (true)
	{
		let tmpNativeDir = libPath.join(tmpCurrent, 'node_modules', '@img', `sharp-${tmpPlatform}`);
		if (libFs.existsSync(tmpNativeDir))
		{
			return 'native';
		}

		let tmpWasmDir = libPath.join(tmpCurrent, 'node_modules', '@img', 'sharp-wasm32');
		if (libFs.existsSync(tmpWasmDir))
		{
			return 'wasm';
		}

		let tmpParent = libPath.dirname(tmpCurrent);
		if (tmpParent === tmpCurrent)
		{
			break;
		}
		tmpCurrent = tmpParent;
	}

	return null;
};

const checkAvailable = () =>
{
	if (!_sharpModule)
	{
		return {
			available: false,
			mode: null,
			versions: null,
			error: _sharpResolutionError ? _sharpResolutionError.message : 'sharp module not loaded'
		};
	}

	try
	{
		// 1x1 raw pixel smoke test — exercises the native/WASM binding
		// synchronously, catching the case where sharp loads but the
		// underlying binary won't actually run on this machine.
		_sharpModule(Buffer.from([0, 0, 0]), { raw: { width: 1, height: 1, channels: 3 } });

		return {
			available: true,
			mode: getMode(),
			versions: _sharpModule.versions || null,
			error: null
		};
	}
	catch (pError)
	{
		return {
			available: false,
			mode: null,
			versions: null,
			error: pError.message
		};
	}
};

if (_sharpModule)
{
	_sharpModule.checkAvailable = checkAvailable;
	_sharpModule.getMode = getMode;
	module.exports = _sharpModule;
}
else
{
	// Sharp couldn't be resolved at all. Export a stand-in that throws
	// on use, but lets callers still invoke checkAvailable() to find out.
	const tmpStub = function ()
	{
		throw new Error(`retold-sharp: sharp is not available (${_sharpResolutionError ? _sharpResolutionError.message : 'unknown'})`);
	};
	tmpStub.checkAvailable = checkAvailable;
	tmpStub.getMode = getMode;
	module.exports = tmpStub;
}
