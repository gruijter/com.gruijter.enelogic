'use strict';

Homey.log('entering driver.js');

const http = require('http');
const util = require('util');
const ledring = require('../../ledring.js');
const devices = {};
const intervalId = {};

module.exports.init = function Init(devicesData, callback) {
	Homey.log('init in driver.js started');
	devicesData.forEach(initDevice);
	callback(null, true);
};

module.exports.pair = function Pair(socket) {
  // Validate connection data
	socket.on('validate', (serverData, callback) => {
		validateConnection(serverData, (error, result) => {
			if (!error) {
				Homey.log('Pairing successful');
				callback(null, result);
			} else {
				Homey.log('Pairing unsuccessful');
				callback(error, null);
			}
		});
	});
};

// the `added` method is called is when pairing is done and a device has been added for firmware 8.33+
module.exports.added = (deviceData, callback) => {
	Homey.log('initializing device ');
	Homey.log(deviceData);
	initDevice(deviceData);
	callback(null, true);
};

module.exports.deleted = (deviceData, callback) => {
	Homey.log(`Deleting ${deviceData.id}`);
	clearInterval(intervalId[deviceData.id]); // end polling of device for readings
	setTimeout(() => {         // wait for running poll to end
		delete devices[deviceData.id];
	}, 5000);
	callback(null, true);
};

module.exports.renamed = (deviceData, newName) => {
	Homey.log(`${devices[deviceData.id].name} has been renamed to ${newName}`);
	devices[deviceData.id].name = newName;
//    Homey.log(devices[deviceData.id].name);
};

module.exports.settings = (deviceData, newSettingsObj, oldSettingsObj, changedKeysArr, callback) => {
	// run when the user has changed the device's settings in Homey.
	if (devices[deviceData.id] === undefined) {
		Homey.log('not ready with device init, ignoring change');
		callback('error: device does not exist (yet)', null); //  settings must not be saved
		return;
	}

	Homey.log(`${devices[deviceData.id].name} has new settings for ${changedKeysArr}`);
	Homey.log(deviceData);
	Homey.log('old settings: ');
	Homey.log(oldSettingsObj);
	Homey.log('new settings: ');
	Homey.log(newSettingsObj);

	if (parseInt(newSettingsObj.ledring_usage_limit, 10) < 0 || !Number.isInteger(newSettingsObj.ledring_usage_limit)) {
		Homey.log('Ledring setting is invalid, ignoring new settings');
		callback('Ledring settings must be a positive integer number', null); //  settings must not be saved
		return;
	}

	if (newSettingsObj.youLessIp === oldSettingsObj.youLessIp) {
		Homey.log('Storing new ledring settings');
		devices[deviceData.id].ledring_usage_limit = newSettingsObj.ledring_usage_limit;
		callback(null, true); 	// always fire the callback, or the settings won't change!
		clearInterval(intervalId[deviceData.id]);                // end polling of device for readings
		setTimeout(() => {                                   // wait for running poll to end
			initDevice(devices[deviceData.id].homey_device);        // init device and start polling again
		}, 5000);
		return;
	}

	validateConnection(newSettingsObj, (error, result) => {
		if (!error) {
			Homey.log('Storing new device settings');
			devices[deviceData.id].youLessIp = newSettingsObj.youLessIp;
			devices[deviceData.id].ledring_usage_limit = newSettingsObj.ledring_usage_limit;
			callback(null, true); 	// always fire the callback, or the settings won't change!
			clearInterval(intervalId[deviceData.id]);                // end polling of device for readings
			setTimeout(() => {                                   // wait for running poll to end
				initDevice(devices[deviceData.id].homey_device);        // init device and start polling again
			}, 5000);
		} else {
			Homey.log('Connection is invalid, ignoring new settings');
			callback(error, null); //  settings must not be saved
		}
	});
};

module.exports.capabilities = {
	measure_power: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				// callback(null, 0);
				return;
			}
			callback(null, device.lastMeasurePower);
		},
	},
	meter_power: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeterPower);
		},
	}
};

function validateConnection(serverData, callback) {  // Validate connection data
	Homey.log('Validating', serverData);

	const options = {
		host: serverData.youLessIp,
		port: 80,
		path: '/a?f=j',
	};

	http.get(options, (res) => {
		let body = '';
		res.on('data', (data) => {
			body += data;
		});

		res.on('end', () => {
			Homey.log(body);
			const result = tryParseJSON(body);
			Homey.log(util.inspect(result, false, 10, true));
			if (safeRead(result, 'con') !== undefined) {   // check if json data exists
				Homey.log('Connecting successful!');
				callback(null, result);
				return;
			}
			Homey.log('Error during connecting');
			callback(res.statusCode, null);
		});
	}).on('error', (err) => {
		Homey.log(`Got error: ${err.message}`);
		Homey.log('Error during connecting');
		callback(err, null);
	});
}  // end validate routine


function initDevice(deviceData) {
	Homey.log('entering initDevice');
	// initDevice: retrieve device settings, buildDevice and start polling it
	Homey.log('getting settings');
	module.exports.getSettings(deviceData, (err, settings) => {
		if (err) {
			Homey.log('error retrieving device settings');
		} else {    // after settings received build the new device object
			Homey.log('retrieved settings are:');
			Homey.log(util.inspect(settings, true, 10, true));
			if (settings.pollingInterval === undefined) {    // needed to migrate from v1.0.3 to 1.0.4
				settings.pollingInterval = 10;
			}
			buildDevice(deviceData, settings);
			startPolling(deviceData);
		}
	});
} // end of initDevice

function buildDevice(deviceData, settings) {
	devices[deviceData.id] = {
		id: deviceData.id,
		name: settings.name,
		youLessIp: settings.youLessIp,
		pollingInterval: settings.pollingInterval,
		ledring_usage_limit: settings.ledring_usage_limit,
		ledring_production_limit: 3000,
		lastMeasurePower: 0,       							// 'measurePower' (W)
		lastMeterPower: null,    								// 'meterPower' (kWh)
		readings: {},   												// or settings.readings
		homey_device: deviceData,								// deviceData object from moment of pairing
	};
	Homey.log('init buildDevice is: ');
	Homey.log(devices[deviceData.id]);
}

function startPolling(deviceData) {     // start polling device for readings every 10+ seconds
	intervalId[deviceData.id] = setInterval(() => {
		checkProduction(devices[deviceData.id]);
	}, 1000 * devices[deviceData.id].pollingInterval);
}

// function to safely get property without risk of 'Cannot read property'
function safeRead(instance, path) {
	return path.split('.').reduce((p, c) => p ? p[c] : undefined, instance);
}

// function to prevent 'Unexpected token' errors
function tryParseJSON(jsonString) {
	try {
		const o = JSON.parse(jsonString);
		if (o && typeof o === 'object' && o !== null) {
			// Homey.log('JSON past')
			return o;
		}
		Homey.log('Not a valid JSON');
	}	catch (e) {
		Homey.log('Not a valid JSON');
	}
	return false;
}

function checkProduction(deviceData) {
 // Homey.log('checking e-meter for '+deviceData.id)
	const options = {
		host: deviceData.youLessIp,
		port: 80,
		path: '/a?f=j',
	};

	http.get(options, (res) => {
		let body = '';
		res.on('data', (data) => {
			body += data;
		});

		res.on('end', () => {
			// Homey.log(body);
			const result = tryParseJSON(body);
			// app is initializing or data is corrupt
			if (safeRead(result, 'con') !== undefined) {   // check if json data exists
				// Homey.log('New data received');
				module.exports.setAvailable(devices[deviceData.id].homey_device);
				deviceData.readings = result;
				handleNewReadings(deviceData);
				return;
			}
			Homey.log('Error reading device');
			module.exports.setUnavailable(devices[deviceData.id].homey_device, 'Error reading device');
		});

	}).on('error', (err) => {
		Homey.log(`Got error: ${err.message}`);
		Homey.log('Error reading device');
		module.exports.setUnavailable(devices[deviceData.id].homey_device, err.message);
	});
}


function handleNewReadings(deviceData) {
  // Homey.log('storing new readings');
//  Homey.log(util.inspect(deviceData, false, 10, true));

  // app is initializing or data is corrupt
	if (safeRead(deviceData, 'readings') === undefined) {
		return;
	}

	// init all readings
	let measurePower = 0;
	let meterPower = deviceData.lastMeterPower;

// electricity readings from device
	measurePower = Number(safeRead(deviceData, 'readings.pwr'));
	meterPower = Number(safeRead(deviceData, 'readings.cnt').replace(',', '.'));

	if (measurePower > 20000) return;	// ignore invalid readings

// constructed readings
	const measurePowerDelta = (measurePower - deviceData.lastMeasurePower);

//  Homey.log(measurePower);
	if (measurePower !== deviceData.lastMeasurePower) {
    // Homey.log.log(measurePowerDelta);
		module.exports.realtime(devices[deviceData.id].homey_device, 'measure_power', measurePower);
// Trigger flow for power_changed
		Homey.manager('flow').triggerDevice('power_changed', {
			power: measurePower,
			power_delta: measurePowerDelta,
		}, null, devices[deviceData.id].homey_device);

// adapt ledring to match
		ledring.change(devices[deviceData.id], measurePower);
	}

//  Homey.log(meterPower);
	if (meterPower !== deviceData.lastMeterPower) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_power', meterPower);
	}

	deviceData.lastMeasurePower = measurePower;
	deviceData.lastMeterPower = meterPower;

  // Homey.log(deviceData);

}
