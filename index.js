// Sienna NDI Monitor

var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

const xml2js = require('xml2js');

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.SOURCES = [];
instance.prototype.CURRENT_INDEX = 0;

instance.prototype.Timer = undefined;

instance.prototype.init = function () {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.initFeedbacks();
	self.initVariables();
	self.init_connection();
};

instance.prototype.updateConfig = function (config) {
	var self = this;
	self.config = config;

	self.initFeedbacks();
	self.initVariables();
	self.init_connection();
};

instance.prototype.init_connection = function () {
	var self = this;

	if (self.config.polling) {
		if (self.Timer === undefined) {
			self.Timer = setInterval(self.getSources.bind(self), self.config.polling);	
		}
	}

	self.getSources();
};

instance.prototype.getSources = function () {
	let self = this;

	if (self.config.host) {
		let sources_url = '/ndisources.xml';
		let current_source_url = '/currentsource.xml';

		self.SOURCES = [];

		try {
			self.getRest(sources_url, self.config.host, 8088)
			.then(function(arrResult) {
				if (arrResult[2].error) {
					//throw an error
					self.status(self.STATUS_ERROR, 'Error obtaining Sources from NDI Monitor.');
					self.log('error', 'Error obtaining Sources from NDI Monitor');
					self.StopTimer();
				}
				else {
					let xml = arrResult[2];
					let parseString = xml2js.parseString;
					parseString(xml, function (err, result) {
						if (result.NDI_SOURCES.NAME) {
							let entries = result.NDI_SOURCES.NAME;
							self.SOURCES = [];
							for (let i = 0; i < entries.length; i++) {
								let sourceObj = {};
								sourceObj.id = entries[i];
								sourceObj.label = entries[i];
								self.SOURCES.push(sourceObj);
							}
							self.setVariable('total_sources', entries.length.toString());
						}
						else {
							self.SOURCES = [
								{id: '', label: 'No sources found.'}
							];
							self.setVariable('total_sources', '0');
						}

						self.actions();
					});

					self.getRest(current_source_url, self.config.host, 8088)
					.then(function(arrResult) {
						if (arrResult[2].error) {
							//throw an error
							self.status(self.STATUS_ERROR, 'Error obtaining Current Source from NDI Monitor.');
							self.log('error', 'Error obtaining Current Source from NDI Monitor');
							self.StopTimer();
						}
						else {
							let current_source = arrResult[2].toString();
							self.setVariable('current_source', current_source);
		
							for (let i = 0; i < self.SOURCES.length; i++) {
								if (self.SOURCES[i].id === current_source) {
									self.setVariable('current_source_index', i);
									self.CURRENT_INDEX = i;
									break;
								}
							}
							
							self.status(self.STATUS_OK);
						}
					})
					.catch(function(arrResult) {
						self.status(self.STATUS_ERROR, 'Error obtaining Current Source from NDI Monitor.');
						self.log('error', 'Error obtaining Current Source from NDI Monitor.');
						self.StopTimer();
					});
					
					self.status(self.STATUS_OK);
				}
			})
			.catch(function(arrResult) {
				self.status(self.STATUS_ERROR, 'Error obtaining Sources from NDI Monitor.');
				self.log('error', 'Error obtaining Sources from NDI Monitor.');
				self.StopTimer();
			});
		}
		catch(error) {
			self.status(self.STATUS_ERROR, 'Error obtaining Sources from NDI Monitor.');
			self.log('error', 'Error obtaining Sources from NDI Monitor.');
			self.StopTimer();
			self.status(self.STATUS_ERROR);
		}
	}
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module allows you to set sources for Sienna NDI Monitor.'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'IP Address',
			default: '192.168.75.101',
			regex: self.REGEX_IP,
			width: 12
		},
		{
			type: 'textinput',
			id: 'polling',
			label: 'Polling Interval (in ms)',
			default: 10000,
			width: 12,
			regex: self.REGEX_NUMBER
		}
	]
}

//Stops the Polling Interval for new Sources and Current Source
instance.prototype.StopTimer = function () {
	var self = this;
	
	if (self.Timer) {
		clearInterval(self.Timer);
		delete self.Timer;
		self.log('warn', 'Stopping Polling Interval until error is resolved.');
	}
}

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this;

	self.StopTimer();

	debug('destroy', self.id);
}

// Set up Feedbacks
instance.prototype.initFeedbacks = function () {
	var self = this;

	var feedbacks = {

	};

	//self.setFeedbackDefinitions(feedbacks);
}

// Set up available variables
instance.prototype.initVariables = function () {
	var self = this;

	var variables = [
		{
			label: 'Current Source',
			name: 'current_source'
		},
		{
			label: 'Current Source Index',
			name: 'current_source_index'
		},
		{
			label: 'Total Sources',
			name: 'total_sources'
		}
	];

	self.setVariableDefinitions(variables);
}

instance.prototype.init_presets = function () {
	var self = this;
	var presets = [];

	self.setPresetDefinitions(presets);
}

instance.prototype.actions = function (system) {
	var self = this;

	self.setActions({
		'set_source_list': {
			label: 'Set Source By List',
			options: [
				{
					type: 'dropdown',
					label: 'Source',
					id: 'source',
					choices: self.SOURCES
				}
			]
		},
		'set_source_name': {
			label: 'Set Source By Name',
			options: [
				{
					type: 'textinput',
					label: 'Source',
					id: 'source'
				}
			]
		},
		'set_source_clear': {
			label: 'Clear The Current Source'
		}
	});
}

instance.prototype.action = function (action) {
	var self = this;
	var options = action.options;

	let set_source_url = '/setsource.xml?ndisource=';
	let clear_source_url = '/clearsource.xml';
	
	if (self.config.host) {
		try {
			switch (action.action) {
				case 'set_source_list':
				case 'set_source_name':
					self.getRest(set_source_url + options.source, self.config.host, 8088)
					.then(function(arrResult) {
						if (arrResult[2].error) {
							//throw an error
							self.status(self.STATUS_ERROR, 'Error Setting Source on NDI Monitor.');
							self.log('error', 'Error Ssetting Source on NDI Monitor.');
						}
						else {
							self.status(self.STATUS_OK);
						}
					})
					.catch(function(arrResult) {
						self.status(self.STATUS_ERROR, 'Error Setting Source on NDI Monitor.');
						self.log('error', 'Error Setting Source on NDI Monitor.');
					});
					break;
				case 'set_source_clear':
					self.getRest(clear_source_url, self.config.host, 8088)
					.then(function(arrResult) {
						if (arrResult[2].error) {
							//throw an error
							self.status(self.STATUS_ERROR, 'Error Clearing Source on NDI Monitor.');
							self.log('error', 'Error Clearing Source on NDI Monitor.');
						}
						else {
							self.status(self.STATUS_OK);
						}
					})
					.catch(function(arrResult) {
						self.status(self.STATUS_ERROR, 'Error Clearing Source on NDI Monitor.');
						self.log('error', 'Error Clearing Source on NDI Monitor.');
					});
					break;
			}
		}
		catch(error) {
			self.status(self.STATUS_ERROR, 'Error performing action on NDI Monitor.');
			self.log('error', 'Error performing action on NDI Monitor.');
			self.status(self.STATUS_ERROR);
		}
	}
}

instance.prototype.getRest = function(cmd, host, port) {
	var self = this;
	return self.doRest('GET', cmd, host, port, {});
};

instance.prototype.doRest = function(method, cmd, host, port, body) {
	var self = this;
	var url = self.makeUrl(cmd, host, port);

	return new Promise(function(resolve, reject) {

		function handleResponse(err, result) {
			if (err === null && typeof result === 'object' && result.response.statusCode === 200) {
				// A successful response

				var objJson = result.data;
				
				resolve([ host, port, objJson ]);

			} else {
				// Failure. Reject the promise.
				var message = 'Unknown error';

				if (result !== undefined) {
					if (result.response !== undefined) {
						message = result.response.statusCode + ': ' + result.response.statusMessage;
					} else if (result.error !== undefined) {
						// Get the error message from the object if present.
						message = result.error;
					}
				}

				reject([ host, port, message ]);
			}
		}

		switch(method) {
			case 'GET':
				self.system.emit('rest_get', url, function(err, result) {
					handleResponse(err, result);
				});
				break;

			default:
				throw new Error('Invalid method');
		}
	});
};

instance.prototype.makeUrl = function(cmd, host, port) {
	var self = this;

	if (cmd[0] !== '/') {
		throw new Error('cmd must start with a /');
	}

	return 'http://' + host + ':' + port + cmd;
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;