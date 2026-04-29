/**
 * Sharp-API-Server — serves the Sharp Playground example.
 *
 * - Static: dist/ (built by `npx quack build && npx quack copy` from the
 *   example_applications/sharp_playground directory).
 * - API:
 *     GET  /api/status        -> retold-sharp.checkAvailable()
 *     GET  /api/sample        -> a 256x256 RGB gradient PNG
 *     POST /api/process       -> body is image bytes, query param op=<name>
 *
 * Usage:
 *     cd example_applications/sharp_playground
 *     npm install
 *     npm run build
 *     npm start [port]   # default 7780
 *
 * The static-only `npx quack examples` runner from the parent module loads
 * the page but the API endpoints will fail; use `npm start` here for the
 * full experience.
 */

const libHttp = require('node:http');
const libFs = require('node:fs');
const libPath = require('node:path');
const libUrl = require('node:url');

const libRetoldSharp = require('retold-sharp');

const _DEFAULT_PORT = 7780;
const _MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const _DIST_ROOT = libPath.resolve(__dirname, '..', '..', 'dist');

const _MIME_TYPES =
{
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.map': 'application/json; charset=utf-8'
};

const sendJson = (pResponse, pStatus, pPayload) =>
{
	let tmpBody = JSON.stringify(pPayload);
	pResponse.writeHead(pStatus,
	{
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(tmpBody)
	});
	pResponse.end(tmpBody);
};

const sendError = (pResponse, pStatus, pMessage) =>
{
	sendJson(pResponse, pStatus, { error: pMessage });
};

const sendImage = (pResponse, pBuffer, pFormat) =>
{
	let tmpContentType =
		pFormat === 'jpeg' ? 'image/jpeg' :
		pFormat === 'png' ? 'image/png' :
		pFormat === 'webp' ? 'image/webp' :
		'application/octet-stream';
	pResponse.writeHead(200,
	{
		'Content-Type': tmpContentType,
		'Content-Length': pBuffer.length
	});
	pResponse.end(pBuffer);
};

const serveStatic = (pResponse, pPathname) =>
{
	let tmpRel = pPathname === '/' ? '/index.html' : pPathname;
	let tmpFull = libPath.normalize(libPath.join(_DIST_ROOT, tmpRel));

	if (!tmpFull.startsWith(_DIST_ROOT))
	{
		return sendError(pResponse, 403, 'forbidden');
	}

	libFs.stat(tmpFull, (pStatError, pStat) =>
	{
		if (pStatError || !pStat.isFile())
		{
			pResponse.writeHead(404, { 'Content-Type': 'text/plain' });
			pResponse.end(`not found: ${tmpRel}\n\n(did you run "npm run build" first?)`);
			return;
		}
		let tmpExt = libPath.extname(tmpFull).toLowerCase();
		let tmpMime = _MIME_TYPES[tmpExt] || 'application/octet-stream';
		libFs.readFile(tmpFull, (pError, pBody) =>
		{
			if (pError)
			{
				return sendError(pResponse, 500, pError.message);
			}
			pResponse.writeHead(200, { 'Content-Type': tmpMime, 'Content-Length': pBody.length });
			pResponse.end(pBody);
		});
	});
};

const readBody = (pRequest, fCallback) =>
{
	let tmpChunks = [];
	let tmpTotalBytes = 0;
	let tmpAborted = false;

	pRequest.on('data', (pChunk) =>
	{
		if (tmpAborted) return;
		tmpTotalBytes += pChunk.length;
		if (tmpTotalBytes > _MAX_UPLOAD_BYTES)
		{
			tmpAborted = true;
			pRequest.destroy();
			fCallback(new Error(`upload exceeds ${_MAX_UPLOAD_BYTES} bytes`));
			return;
		}
		tmpChunks.push(pChunk);
	});
	pRequest.on('end', () => { if (!tmpAborted) fCallback(null, Buffer.concat(tmpChunks)); });
	pRequest.on('error', (pError) => { if (!tmpAborted) fCallback(pError); });
};

const buildSampleImage = () =>
{
	let tmpWidth = 256;
	let tmpHeight = 256;
	let tmpPixels = Buffer.alloc(tmpWidth * tmpHeight * 3);
	for (let tmpY = 0; tmpY < tmpHeight; tmpY++)
	{
		for (let tmpX = 0; tmpX < tmpWidth; tmpX++)
		{
			let tmpIdx = (tmpY * tmpWidth + tmpX) * 3;
			tmpPixels[tmpIdx] = tmpX;
			tmpPixels[tmpIdx + 1] = tmpY;
			tmpPixels[tmpIdx + 2] = (tmpX + tmpY) & 0xff;
		}
	}
	return libRetoldSharp(tmpPixels, { raw: { width: tmpWidth, height: tmpHeight, channels: 3 } }).png().toBuffer();
};

const applyOperation = (pInputBuffer, pOp, pParams) =>
{
	let tmpPipeline = libRetoldSharp(pInputBuffer);

	switch (pOp)
	{
		case 'metadata':
			return tmpPipeline.metadata().then((pMeta) => ({ kind: 'json', payload: pMeta }));

		case 'resize':
		{
			let tmpW = parseInt(pParams.w, 10) || 200;
			let tmpH = parseInt(pParams.h, 10) || 200;
			let tmpFit = ['inside', 'cover', 'fill', 'contain', 'outside'].includes(pParams.fit) ? pParams.fit : 'inside';
			let tmpFormat = pParams.to || 'png';
			tmpPipeline = tmpPipeline.resize(tmpW, tmpH, { fit: tmpFit, withoutEnlargement: false });
			tmpPipeline = tmpPipeline.toFormat(tmpFormat, { quality: parseInt(pParams.quality, 10) || 80 });
			return tmpPipeline.toBuffer().then((pBuffer) => ({ kind: 'image', format: tmpFormat, payload: pBuffer }));
		}

		case 'format':
		{
			let tmpFormat = ['jpeg', 'png', 'webp'].includes(pParams.to) ? pParams.to : 'jpeg';
			let tmpQuality = parseInt(pParams.quality, 10) || 80;
			return tmpPipeline.toFormat(tmpFormat, { quality: tmpQuality }).toBuffer()
				.then((pBuffer) => ({ kind: 'image', format: tmpFormat, payload: pBuffer }));
		}

		case 'rotate':
		{
			let tmpAngle = parseInt(pParams.angle, 10) || 90;
			return tmpPipeline.rotate(tmpAngle).png().toBuffer()
				.then((pBuffer) => ({ kind: 'image', format: 'png', payload: pBuffer }));
		}

		case 'blur':
		{
			let tmpSigma = parseFloat(pParams.sigma) || 5;
			return tmpPipeline.blur(tmpSigma).png().toBuffer()
				.then((pBuffer) => ({ kind: 'image', format: 'png', payload: pBuffer }));
		}

		case 'grayscale':
			return tmpPipeline.grayscale().png().toBuffer()
				.then((pBuffer) => ({ kind: 'image', format: 'png', payload: pBuffer }));

		case 'tint':
		{
			let tmpR = parseInt(pParams.r, 10);
			let tmpG = parseInt(pParams.g, 10);
			let tmpB = parseInt(pParams.b, 10);
			if (Number.isNaN(tmpR) || Number.isNaN(tmpG) || Number.isNaN(tmpB))
			{
				return Promise.reject(new Error('tint requires r, g, b query params'));
			}
			return tmpPipeline.tint({ r: tmpR, g: tmpG, b: tmpB }).png().toBuffer()
				.then((pBuffer) => ({ kind: 'image', format: 'png', payload: pBuffer }));
		}

		default:
			return Promise.reject(new Error(`unknown op: ${pOp}`));
	}
};

const handleRequest = (pRequest, pResponse) =>
{
	let tmpUrl = libUrl.parse(pRequest.url, true);

	if (pRequest.method === 'GET' && tmpUrl.pathname === '/api/status')
	{
		return sendJson(pResponse, 200, libRetoldSharp.checkAvailable());
	}

	if (pRequest.method === 'GET' && tmpUrl.pathname === '/api/sample')
	{
		return buildSampleImage()
			.then((pBuffer) => sendImage(pResponse, pBuffer, 'png'))
			.catch((pError) => sendError(pResponse, 500, pError.message));
	}

	if (pRequest.method === 'POST' && tmpUrl.pathname === '/api/process')
	{
		let tmpOp = tmpUrl.query.op;
		if (!tmpOp)
		{
			return sendError(pResponse, 400, 'missing op query param');
		}

		return readBody(pRequest, (pError, pBuffer) =>
		{
			if (pError)
			{
				return sendError(pResponse, 400, pError.message);
			}
			if (!pBuffer || pBuffer.length === 0)
			{
				return sendError(pResponse, 400, 'empty body — POST the image bytes');
			}
			applyOperation(pBuffer, tmpOp, tmpUrl.query)
				.then((pResult) =>
				{
					if (pResult.kind === 'json')
					{
						return sendJson(pResponse, 200, pResult.payload);
					}
					return sendImage(pResponse, pResult.payload, pResult.format);
				})
				.catch((pProcessError) => sendError(pResponse, 500, pProcessError.message));
		});
	}

	if (pRequest.method === 'GET')
	{
		return serveStatic(pResponse, tmpUrl.pathname);
	}

	return sendError(pResponse, 404, `not found: ${pRequest.method} ${tmpUrl.pathname}`);
};

const tmpPort = parseInt(process.argv[2], 10) || _DEFAULT_PORT;
const tmpServer = libHttp.createServer(handleRequest);
tmpServer.listen(tmpPort, () =>
{
	let tmpStatus = libRetoldSharp.checkAvailable();
	console.log(`Sharp Playground: http://localhost:${tmpPort}`);
	console.log(`  sharp available: ${tmpStatus.available}, mode: ${tmpStatus.mode}, vips: ${tmpStatus.versions ? tmpStatus.versions.vips : 'n/a'}`);
	console.log(`  serving dist from: ${_DIST_ROOT}`);
});
