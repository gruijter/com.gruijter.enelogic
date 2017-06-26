'use strict';

Homey.log('entering driver.js');

const http = require('http');
const util = require('util');
const devices = {};
const intervalIdFast = {};			// used for polling fast @ 400ms interval
const intervalIdSlow = {};			// used for polling slow @ 3s interval
const intervalIdFlow = {};			// used for calculating average flow every 60 seconds
const TimeoutIdBurstDelay = {};	// used to delay the slow polling by 5 seconds
const burst = {};
const pollOnce = {};

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

// the `added` method is called is when pairing is done and a device has been added
module.exports.added = (deviceData, callback) => {
	Homey.log('initializing device ');
	Homey.log(deviceData);
	initDevice(deviceData);
	callback(null, true);
};

module.exports.deleted = (deviceData, callback) => {
	Homey.log(`Deleting ${deviceData.id}`);
	clearInterval(intervalIdFast[deviceData.id]); // end fast polling of device for readings
	clearInterval(intervalIdSlow[deviceData.id]); // end slow polling of device for readings
	clearInterval(intervalIdFlow[deviceData.id]); // end calculating average flow
	clearTimeout(TimeoutIdBurstDelay[deviceData.id]);	// reset 5 seconds delay timer
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

	if (newSettingsObj.youLessIp === oldSettingsObj.youLessIp) {
		Homey.log('Storing new watermeter settings');
		devices[deviceData.id].pollingInterval = newSettingsObj.pollingInterval;
		devices[deviceData.id].optical_sensor_raw_max = newSettingsObj.optical_sensor_raw_max;
		devices[deviceData.id].optical_sensor_raw_min = newSettingsObj.optical_sensor_raw_min;
		devices[deviceData.id].last_meter_water = newSettingsObj.meter_water_offset;
		devices[deviceData.id].last_measure_water_meter = newSettingsObj.meter_water_offset;
		devices[deviceData.id].optical_sensor_pulse = newSettingsObj.optical_sensor_pulse * 2;
		devices[deviceData.id].auto_calibrate = newSettingsObj.auto_calibrate;
		devices[deviceData.id].log_raw = newSettingsObj.log_raw;

		callback(null, true); 	// always fire the callback, or the settings won't change!
		clearInterval(intervalIdFast[deviceData.id]);                // end polling of device for readings
		setTimeout(() => {                                   // wait for running poll to end
			initDevice(devices[deviceData.id].homey_device);        // init device and start polling again
		}, 5000);
		return;
	}

	validateConnection(newSettingsObj, (error, result) => {
		if (!error) {
			Homey.log('Storing new device settings');
			devices[deviceData.id].youLessIp = newSettingsObj.youLessIp;
			devices[deviceData.id].optical_sensor_raw_max = newSettingsObj.optical_sensor_raw_max;
			devices[deviceData.id].optical_sensor_raw_min = newSettingsObj.optical_sensor_raw_min;
			devices[deviceData.id].last_meter_water = newSettingsObj.meter_water_offset;
			devices[deviceData.id].last_measure_water_meter = newSettingsObj.meter_water_offset;
			devices[deviceData.id].optical_sensor_pulse = newSettingsObj.optical_sensor_pulse * 2;
			devices[deviceData.id].auto_calibrate = newSettingsObj.auto_calibrate;
			devices[deviceData.id].log_raw = newSettingsObj.log_raw;
			callback(null, true); 	// always fire the callback, or the settings won't change!
			initDevice(devices[deviceData.id].homey_device);        // init device and start polling again
		} else {
			Homey.log('Connection is invalid, ignoring new settings');
			callback(error, null); //  settings must not be saved
		}
	});
};

module.exports.capabilities = {
	meter_water: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				// callback(null, 0);
				return;
			}
			callback(null, device.last_meter_water);
		},
	},
	measure_water: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.last_measure_water);
		},
	},
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
			if (safeRead(result, 'raw') !== undefined) {   // check if json data exists
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
	clearInterval(intervalIdFast[deviceData.id]); // end fast polling of device for readings
	clearInterval(intervalIdSlow[deviceData.id]); // end slow polling of device for readings
	clearInterval(intervalIdFlow[deviceData.id]); // end calculating average flow
	clearTimeout(TimeoutIdBurstDelay[deviceData.id]);	// reset 5 seconds delay timer
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
			burst[deviceData.id] = true;
			pollOnce[deviceData.id] = false;
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
		last_meter_water: settings.meter_water_offset,   // meter_water (m3)
		last_measure_water: null,    // flow (l/min)
		last_measure_water_timestamp: null, // timestamp
		last_measure_water_meter: null,    	// meter_water at timestamp
		last_optical_sensor_raw: null,   // reflectiveness integer
		optical_sensor_raw_max: settings.optical_sensor_raw_max,    // max reflectiveness integer
		optical_sensor_raw_min: settings.optical_sensor_raw_min,    // min reflectiveness integer
		optical_sensor_pulse: settings.optical_sensor_pulse * 2, // number of pulses per m3, both rising and falling edge
		auto_calibrate: settings.auto_calibrate,	// true or false
		log_raw: settings.log_raw,		// true or false
		readingsW: {},   // or settings.readings
		homey_device: deviceData,								// deviceData object from moment of pairing
	};
	Homey.log('init buildDevice is: ');
	Homey.log(devices[deviceData.id]);
}

function startPolling(deviceData) {     // start polling device for readings
	intervalIdFast[deviceData.id] = setInterval(() => {
		checkWater(devices[deviceData.id]);
	}, devices[deviceData.id].pollingInterval);
	intervalIdSlow[deviceData.id] = setInterval(() => {
		checkWaterSlow(devices[deviceData.id]);
	}, 3000);
	intervalIdFlow[deviceData.id] = setInterval(() => {  // start calculating average flow every 60 seconds
		calculateFlow(devices[deviceData.id]);
		saveMeterSettings(devices[deviceData.id]);
	}, 60000);
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

// check slow every 5 seconds
function checkWaterSlow(deviceData) {
	// Homey.log('slow check');
	pollOnce[deviceData.id] = true;
	checkWater(deviceData);
	pollOnce[deviceData.id] = false;
}

function checkWater(deviceData) {
	if (!burst[deviceData.id] && !pollOnce[deviceData.id]) { return; }	// skip polling if not in burst or slow poll mode
	// Homey.log(`checking device for ${deviceData.id}`);
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
			if (safeRead(result, 'raw') !== undefined) {   // check if json data exists
				// Homey.log('New data received');
				module.exports.setAvailable(devices[deviceData.id].homey_device);
				deviceData.readingsW = result;
				handleNewWaterReadings(deviceData);
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

function calculateFlow(deviceData) {
  // app is initializing or data is corrupt
	if (safeRead(deviceData, 'readingsW') === undefined) {
		return;
	}
  // calculate average flow in liters per minute
	const timestamp = new Date(); // .getTime();
	const timePast = timestamp - deviceData.last_measure_water_timestamp;
	let measureWater = 0;
	if (deviceData.last_measure_water_timestamp != null) {
		const usedWater = (deviceData.last_meter_water - deviceData.last_measure_water_meter) * 1000; // in liters
		measureWater = Math.round(usedWater * 60000 / timePast * 10) / 10;
		module.exports.realtime(devices[deviceData.id].homey_device, 'measure_water', measureWater);
		// Trigger flow for measure_water_changed
		if (measureWater !== deviceData.last_measure_water) {
			Homey.manager('flow').triggerDevice('measure_water_changed', {
				flow: measureWater,
			}, null, devices[deviceData.id].homey_device);
		}
	}
	deviceData.last_measure_water = measureWater;
	deviceData.last_measure_water_timestamp = timestamp;
	deviceData.last_measure_water_meter = deviceData.last_meter_water;
}

// store meter settings from memory to device settings
function saveMeterSettings(deviceData) {
	module.exports.setSettings(deviceData.homey_device, {
		meter_water_offset: deviceData.last_meter_water,
		optical_sensor_raw_max: deviceData.optical_sensor_raw_max,
		optical_sensor_raw_min: deviceData.optical_sensor_raw_min,
	}, (err, settings) => {
		// Homey.log(err);
	});
}

function logRaw(opticalSensorRaw) {
	Homey.manager('insights').createLog('optical_sensor_raw', {
		label: {
			en: 'raw optical data',
		},
		type: 'number',
		units: {
			en: '',
		},
		decimals: 0,
		chart: 'stepLine',
	}, (err, success) => {
		// if( err ) return console.error(err);
		Homey.manager('insights').createEntry('optical_sensor_raw', opticalSensorRaw, new Date(), (err, succ) => {
			if (err) return console.error(err);
		});
	});
}

function handleNewWaterReadings(deviceData) {
  // app is initializing or data is corrupt
	if (safeRead(deviceData, 'readingsW') === undefined) {
		return;
	}

	// init water readings
	let meterWater = deviceData.last_meter_water;

	// get the reflectiveness raw data;
	const opticalSensorRaw = Number(safeRead(deviceData, 'readingsW.raw'));

	// check if water is flowing
	if (Math.abs(opticalSensorRaw - deviceData.last_optical_sensor_raw) > 3) {  // filter out small noise
		burst[deviceData.id] = true;
		// Homey.log('burstmode on');
		clearTimeout(TimeoutIdBurstDelay[deviceData.id]);	// reset 5 seconds delay timer
		//  logging of raw reflectivenes in Insights
		if (deviceData.log_raw) { logRaw(opticalSensorRaw); }
	} else {
		// set a delay for 5 seconds to end burstmode
		if (TimeoutIdBurstDelay[deviceData.id] !== undefined) {
			// Homey.log(TimeoutIdBurstDelay[deviceData.id]);
			if (TimeoutIdBurstDelay[deviceData.id]._onTimeout === null) {
				TimeoutIdBurstDelay[deviceData.id] = setTimeout(() => {
					burst[deviceData.id] = false;
					// Homey.log('burstmode off');
				}, 5000);
			}
		} else {
			TimeoutIdBurstDelay[deviceData.id] = setTimeout(() => {
				burst[deviceData.id] = false;
				// Homey.log('burstmode off');
			}, 5000);
		}

	}

	// convert raw data to counting pulses
	// set thresholds on 30% and 70% of max deviation
	const opticalSensorRawThresholdMax = Math.round(deviceData.optical_sensor_raw_min +
		(deviceData.optical_sensor_raw_max - deviceData.optical_sensor_raw_min) * 0.7);
	const opticalSensorRawThresholdMin = Math.round(deviceData.optical_sensor_raw_min +
		(deviceData.optical_sensor_raw_max - deviceData.optical_sensor_raw_min) * 0.3);
	// pulse received on rising edge
	if ((opticalSensorRaw > opticalSensorRawThresholdMax) &&
	(deviceData.last_optical_sensor_raw < opticalSensorRawThresholdMax)) {
		meterWater = meterWater + 1 / deviceData.optical_sensor_pulse;
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_water', meterWater);
	}
	// pulse received on falling edge
	if ((opticalSensorRaw < opticalSensorRawThresholdMin) &&
	(deviceData.last_optical_sensor_raw > opticalSensorRawThresholdMin)) {
		meterWater = meterWater + 1 / deviceData.optical_sensor_pulse;
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_water', meterWater);
	}
	// calibrating the pulse limits
	if (deviceData.auto_calibrate) {
		if (opticalSensorRaw < deviceData.optical_sensor_raw_min) {
			deviceData.optical_sensor_raw_min = opticalSensorRaw;
		}
		if (opticalSensorRaw > deviceData.optical_sensor_raw_max) {
			deviceData.optical_sensor_raw_max = opticalSensorRaw;
		}
	}

	//  update readings in device memory
	if (meterWater !== deviceData.last_meter_water) {
		deviceData.last_optical_sensor_raw = opticalSensorRaw;
		deviceData.last_meter_water = Math.round(meterWater * 100000) / 100000;
		// Homey.log(deviceData);
	}
	deviceData.last_optical_sensor_raw = opticalSensorRaw;
	// deviceData.last_meter_water = meterWater;

}
