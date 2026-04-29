/**
 * retold-sharp tests — verify the wrapper resolves sharp, exposes the
 * sharp constructor, and reports availability via the diagnostic
 * helpers.
 */

const Chai = require('chai');
const Expect = Chai.expect;

suite('retold-sharp', () =>
{
	suite('module surface', () =>
	{
		test('exports a callable constructor', () =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');
			Expect(libRetoldSharp).to.be.a('function');
		});

		test('exposes checkAvailable()', () =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');
			Expect(libRetoldSharp.checkAvailable).to.be.a('function');
		});

		test('exposes getMode()', () =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');
			Expect(libRetoldSharp.getMode).to.be.a('function');
		});
	});

	suite('checkAvailable()', () =>
	{
		test('returns an object with the expected shape', () =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');
			let tmpStatus = libRetoldSharp.checkAvailable();

			Expect(tmpStatus).to.be.an('object');
			Expect(tmpStatus).to.have.property('available').that.is.a('boolean');
			Expect(tmpStatus).to.have.property('mode');
			Expect(tmpStatus).to.have.property('versions');
			Expect(tmpStatus).to.have.property('error');
		});

		test('reports available=true when sharp is installed', () =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');
			let tmpStatus = libRetoldSharp.checkAvailable();

			// On a developer machine with a working install we expect this.
			// If this test fails, the bootstrap install didn't work.
			Expect(tmpStatus.available).to.equal(true);
			Expect(tmpStatus.mode).to.be.oneOf(['native', 'wasm']);
			Expect(tmpStatus.error).to.equal(null);
		});

		test('reports versions including sharp + vips', () =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');
			let tmpStatus = libRetoldSharp.checkAvailable();

			if (tmpStatus.available)
			{
				Expect(tmpStatus.versions).to.be.an('object');
				Expect(tmpStatus.versions).to.have.property('sharp');
				Expect(tmpStatus.versions).to.have.property('vips');
			}
		});
	});

	suite('drop-in compatibility with sharp', () =>
	{
		test('can resize a 1x1 image (basic API)', (fDone) =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');

			libRetoldSharp(Buffer.from([255, 0, 0]), { raw: { width: 1, height: 1, channels: 3 } })
				.resize(2, 2, { fit: 'fill' })
				.png()
				.toBuffer()
				.then((pBuffer) =>
				{
					Expect(Buffer.isBuffer(pBuffer)).to.equal(true);
					Expect(pBuffer.length).to.be.greaterThan(0);
					fDone();
				})
				.catch(fDone);
		});

		test('can extract metadata', (fDone) =>
		{
			const libRetoldSharp = require('../source/Retold-Sharp.js');

			libRetoldSharp(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]),
				{ raw: { width: 2, height: 2, channels: 3 } })
				.png()
				.toBuffer()
				.then((pPngBuffer) =>
				{
					return libRetoldSharp(pPngBuffer).metadata();
				})
				.then((pMeta) =>
				{
					Expect(pMeta.width).to.equal(2);
					Expect(pMeta.height).to.equal(2);
					Expect(pMeta.format).to.equal('png');
					fDone();
				})
				.catch(fDone);
		});
	});
});
