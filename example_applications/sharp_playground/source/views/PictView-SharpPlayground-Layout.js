const libPictView = require('pict-view');

const _LayoutTemplate = /*html*/`
<div class="sp-container">

	<div id="SharpPlayground-StatusBar" class="sp-status-bar">checking sharp&hellip;</div>

	<div class="sp-panel">
		<h2>1. Source image</h2>
		<div class="sp-row">
			<button id="SharpPlayground-UseSample" class="sp-btn sp-btn-secondary" type="button">Use built-in sample</button>
			<label class="sp-file">
				Upload your own
				<input id="SharpPlayground-FileInput" type="file" accept="image/*" />
			</label>
		</div>
		<div class="sp-preview" style="margin-top: 14px;">
			<img id="SharpPlayground-SrcPreview" alt="source preview" />
			<pre id="SharpPlayground-SrcInfo" class="sp-info sp-info-empty">no image selected</pre>
		</div>
	</div>

	<div class="sp-panel">
		<h2>2. Operations</h2>

		<div class="sp-row">
			<button class="sp-btn" data-op="metadata" type="button">Metadata</button>
		</div>

		<div class="sp-row">
			<button class="sp-btn" data-op="resize" type="button">Resize</button>
			<span class="sp-arg">w <input data-arg="w" type="number" value="200" min="1" max="4096" /></span>
			<span class="sp-arg">h <input data-arg="h" type="number" value="200" min="1" max="4096" /></span>
			<span class="sp-arg">fit
				<select data-arg="fit">
					<option value="inside">inside</option>
					<option value="cover">cover</option>
					<option value="fill">fill</option>
					<option value="contain">contain</option>
					<option value="outside">outside</option>
				</select>
			</span>
		</div>

		<div class="sp-row">
			<button class="sp-btn" data-op="format" type="button">Convert format</button>
			<span class="sp-arg">to
				<select data-arg="to">
					<option value="jpeg">jpeg</option>
					<option value="png">png</option>
					<option value="webp">webp</option>
				</select>
			</span>
			<span class="sp-arg">quality <input data-arg="quality" type="number" value="80" min="1" max="100" /></span>
		</div>

		<div class="sp-row">
			<button class="sp-btn" data-op="rotate" type="button">Rotate</button>
			<span class="sp-arg">angle <input data-arg="angle" type="number" value="90" min="-360" max="360" /></span>
		</div>

		<div class="sp-row">
			<button class="sp-btn" data-op="blur" type="button">Blur</button>
			<span class="sp-arg">sigma <input data-arg="sigma" type="number" value="5" min="0.3" max="100" step="0.1" /></span>
		</div>

		<div class="sp-row">
			<button class="sp-btn" data-op="grayscale" type="button">Grayscale</button>
		</div>

		<div class="sp-row">
			<button class="sp-btn" data-op="tint" type="button">Tint</button>
			<span class="sp-arg">r <input data-arg="r" type="number" value="120" min="0" max="255" /></span>
			<span class="sp-arg">g <input data-arg="g" type="number" value="180" min="0" max="255" /></span>
			<span class="sp-arg">b <input data-arg="b" type="number" value="240" min="0" max="255" /></span>
		</div>
	</div>

	<div class="sp-panel">
		<h2>3. Result</h2>
		<div class="sp-preview">
			<img id="SharpPlayground-OutPreview" alt="output preview" />
			<pre id="SharpPlayground-OutInfo" class="sp-info sp-info-empty">no operation run yet</pre>
		</div>
	</div>

</div>
`;

class PictViewSharpPlaygroundLayout extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._sourceBuffer = null;
		this._sourceMime = '';
	}

	_setStatus(pText, pCssClass)
	{
		let tmpEl = document.getElementById('SharpPlayground-StatusBar');
		if (!tmpEl)
		{
			return;
		}
		tmpEl.textContent = pText;
		tmpEl.className = 'sp-status-bar ' + (pCssClass || '');
	}

	_refreshStatus()
	{
		fetch('/api/status')
			.then((pResponse) => pResponse.json())
			.then((pStatus) =>
			{
				if (pStatus.available)
				{
					let tmpVersions = pStatus.versions || {};
					this._setStatus(
						`sharp ${tmpVersions.sharp || '?'} · libvips ${tmpVersions.vips || '?'} · mode: ${pStatus.mode || '?'}`,
						'sp-status-ok');
				}
				else
				{
					this._setStatus(`sharp not available: ${pStatus.error || 'unknown'}`, 'sp-status-bad');
				}
			})
			.catch((pError) =>
			{
				this._setStatus(`status fetch failed: ${pError.message} (start the API server with: npm start)`, 'sp-status-bad');
			});
	}

	_setSource(pBuffer, pMime, pLabel)
	{
		this._sourceBuffer = pBuffer;
		this._sourceMime = pMime;

		let tmpBlob = new Blob([pBuffer], { type: pMime });
		let tmpSrcImg = document.getElementById('SharpPlayground-SrcPreview');
		let tmpSrcInfo = document.getElementById('SharpPlayground-SrcInfo');
		let tmpOutImg = document.getElementById('SharpPlayground-OutPreview');
		let tmpOutInfo = document.getElementById('SharpPlayground-OutInfo');

		tmpSrcImg.src = URL.createObjectURL(tmpBlob);
		tmpSrcInfo.textContent = `${pLabel} — ${(pBuffer.byteLength / 1024).toFixed(1)} KB · ${pMime}`;
		tmpSrcInfo.className = 'sp-info';
		tmpOutImg.removeAttribute('src');
		tmpOutInfo.textContent = 'no operation run yet';
		tmpOutInfo.className = 'sp-info sp-info-empty';
	}

	_runOp(pButton)
	{
		if (!this._sourceBuffer)
		{
			window.alert('Pick a source image first.');
			return;
		}

		let tmpOp = pButton.dataset.op;
		let tmpParams = new URLSearchParams({ op: tmpOp });
		let tmpRow = pButton.closest('.sp-row');
		if (tmpRow)
		{
			let tmpArgs = tmpRow.querySelectorAll('[data-arg]');
			for (let i = 0; i < tmpArgs.length; i++)
			{
				tmpParams.set(tmpArgs[i].dataset.arg, tmpArgs[i].value);
			}
		}

		let tmpOutImg = document.getElementById('SharpPlayground-OutPreview');
		let tmpOutInfo = document.getElementById('SharpPlayground-OutInfo');
		tmpOutImg.removeAttribute('src');
		tmpOutInfo.textContent = `running ${tmpOp}…`;
		tmpOutInfo.className = 'sp-info';

		let tmpStart = performance.now();

		fetch('/api/process?' + tmpParams.toString(),
			{
				method: 'POST',
				headers: { 'Content-Type': this._sourceMime || 'application/octet-stream' },
				body: this._sourceBuffer
			})
			.then((pResponse) =>
			{
				let tmpElapsed = (performance.now() - tmpStart).toFixed(1);
				let tmpContentType = pResponse.headers.get('content-type') || '';

				if (!pResponse.ok)
				{
					if (tmpContentType.includes('json'))
					{
						return pResponse.json().then((pErr) => Promise.reject(new Error(pErr.error)));
					}
					return pResponse.text().then((pErr) => Promise.reject(new Error(pErr)));
				}

				if (tmpContentType.startsWith('application/json'))
				{
					return pResponse.json().then((pJson) =>
					{
						tmpOutInfo.textContent = `${tmpOp} (${tmpElapsed}ms)\n` + JSON.stringify(pJson, null, 2);
						tmpOutImg.removeAttribute('src');
					});
				}

				return pResponse.arrayBuffer().then((pBuffer) =>
				{
					let tmpBlob = new Blob([pBuffer], { type: tmpContentType });
					tmpOutImg.src = URL.createObjectURL(tmpBlob);
					tmpOutInfo.textContent = `${tmpOp} (${tmpElapsed}ms) — ${(pBuffer.byteLength / 1024).toFixed(1)} KB · ${tmpContentType}`;
				});
			})
			.catch((pError) =>
			{
				tmpOutInfo.textContent = `error: ${pError.message}`;
			});
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		if (!this._initialSetupComplete)
		{
			this._initialSetupComplete = true;

			document.getElementById('SharpPlayground-UseSample').addEventListener('click', () =>
			{
				fetch('/api/sample')
					.then((pResponse) => pResponse.arrayBuffer())
					.then((pBuffer) => this._setSource(pBuffer, 'image/png', 'sample 256x256 RGB gradient'))
					.catch((pError) => this._setStatus(`sample fetch failed: ${pError.message}`, 'sp-status-bad'));
			});

			document.getElementById('SharpPlayground-FileInput').addEventListener('change', (pEvent) =>
			{
				let tmpFile = pEvent.target.files[0];
				if (!tmpFile) return;
				tmpFile.arrayBuffer().then((pBuffer) =>
				{
					this._setSource(pBuffer, tmpFile.type || 'application/octet-stream', tmpFile.name);
				});
			});

			let tmpOpButtons = document.querySelectorAll('button[data-op]');
			for (let i = 0; i < tmpOpButtons.length; i++)
			{
				tmpOpButtons[i].addEventListener('click', (pEvent) => this._runOp(pEvent.currentTarget));
			}

			this._refreshStatus();
		}

		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}
}

module.exports = PictViewSharpPlaygroundLayout;

module.exports.default_configuration =
{
	ViewIdentifier: 'SharpPlaygroundLayout',
	Templates:
	[
		{
			Hash: 'SharpPlayground-Layout-Template',
			Template: _LayoutTemplate
		}
	],
	Renderables:
	[
		{
			RenderableHash: 'SharpPlayground-Layout',
			TemplateHash: 'SharpPlayground-Layout-Template',
			ContentDestinationAddress: '#SharpPlayground-Application-Container',
			RenderMethod: 'replace'
		}
	],
	DefaultRenderable: 'SharpPlayground-Layout'
};
