const libPictApplication = require('pict-application');

const libPictViewSharpPlaygroundLayout = require('./views/PictView-SharpPlayground-Layout.js');

class PictApplicationSharpPlayground extends libPictApplication
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.pict.addView('SharpPlaygroundLayout', libPictViewSharpPlaygroundLayout.default_configuration, libPictViewSharpPlaygroundLayout);
	}

	onAfterInitializeAsync(fCallback)
	{
		this.pict.views.SharpPlaygroundLayout.render();

		return super.onAfterInitializeAsync(fCallback);
	}
}

module.exports = PictApplicationSharpPlayground;

module.exports.default_configuration =
{
	Name: 'SharpPlaygroundExample',
	Hash: 'SharpPlaygroundExample'
};
