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

	Homey.manager('flow').on('condition.offPeakLS120', (callback, args) => {
		Homey.log(args);
		const result = devices[args.LS120.id].lastOffpeak;
		Homey.log(`condition flow requested, offPeak is: ${result}`);
		callback(null, result);
	});
	callback(null, true);
};

module.exports.pair = function Pair(socket) {
  // Validate device connection data
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

	if (parseInt(newSettingsObj.ledring_usage_limit, 10) < 0 || !Number.isInteger(newSettingsObj.ledring_usage_limit) ||
	parseInt(newSettingsObj.ledring_production_limit, 10) < 0 || !Number.isInteger(newSettingsObj.ledring_production_limit)) {
		Homey.log('Ledring setting is invalid, ignoring new settings');
		callback('Ledring settings must be a positive integer number', null); //  settings must not be saved
		return;
	}

	if (newSettingsObj.youLessIp === oldSettingsObj.youLessIp) {
		Homey.log('Storing new ledring settings');
		devices[deviceData.id].ledring_usage_limit = newSettingsObj.ledring_usage_limit;
		devices[deviceData.id].ledring_production_limit = newSettingsObj.ledring_production_limit;
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
			devices[deviceData.id].ledring_production_limit = newSettingsObj.ledring_production_limit;
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
	meter_offPeak: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, false);
				return;
			}
			callback(null, device.lastOffpeak);
		},
	},
	measure_gas: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeasureGas);
		},
	},
	meter_gas: {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeterGas);
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
	},
	'meter_power.peak': {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeterPowerPeak);
		},
	},
	'meter_power.offPeak': {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeterPowerOffpeak);
		},
	},
	'meter_power.producedPeak': {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeterPowerPeakProduced);
		},
	},
	'meter_power.producedOffPeak': {
		get: (deviceData, callback) => {
			const device = devices[deviceData.id];
			if (device === undefined) {
				callback(); // null, 0);
				return;
			}
			callback(null, device.lastMeterPowerOffpeakProduced);
		},
	},
};

function validateConnection(serverData, callback) {  // Validate connection data
	Homey.log('Validating', serverData);

	const options = {
		host: serverData.youLessIp,
		port: 80,
		path: '/e',
	};

	http.get(options, (res) => {
		let body = '';
		res.on('data', (data) => {
			body += data;
		});

		res.on('end', () => {
			Homey.log(body);
			const result = tryParseJSON(body)[0];
			Homey.log(util.inspect(result, false, 10, true));
			if (safeRead(result, 'tm') !== undefined) {   // check if json data exists
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
		youLessIp: settings.youLessIp || settings.enelogicIp,
		pollingInterval: settings.pollingInterval,
		ledring_usage_limit: settings.ledring_usage_limit,
		ledring_production_limit: settings.ledring_production_limit,
		lastMeasureGas: 0,       								// 'measureGas' (m3)
		lastMeterGas: null,    									// 'meterGas' (m3)
		lastMeterGas_tm: null,									// timestamp of gas meter reading, e.g. 1706232000 (yymmddhhmm)
		lastMeasurePower: 0,       							// 'measurePower' (W)
		lastMeterPower: null,    								// 'meterPower' (kWh)
		lastMeterPowerPeak: null,    						// 'meterPower_peak' (kWh)
		lastMeterPowerOffpeak: null,    				// 'meterPower_offpeak' (kWh)
		lastMeterPowerPeakProduced: null,    		// 'meterPower_peak_produced' (kWh)
		lastMeterPowerOffpeakProduced: null,		// 'meterPower_offpeak_produced' (kWh)
		lastMeterPowerInterval: null,    				// meterPower at last interval (kWh)
		lastMeterPowerInterval_tm: null,    		// timestamp
		lastOffpeak: null,											// 'meterPower_offpeak' (true/false)
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
		path: '/e',
	};

	http.get(options, (res) => {
		let body = '';
		res.on('data', (data) => {
			body += data;
		});

		res.on('end', () => {
			// Homey.log(body);
			const result = tryParseJSON(body)[0];
			// app is initializing or data is corrupt
			if (safeRead(result, 'tm') !== undefined) {   // check if json data exists
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

function toEpoch(time) {
	const tmString = time.toString();
	const tm = new Date(`20${tmString.slice(0, 2)}`, tmString.slice(2, 4), tmString.slice(4, 6), tmString.slice(6, 8));
	return tm;
}

function handleNewReadings(deviceData) {
  // Homey.log('storing new readings');
//  Homey.log(util.inspect(deviceData, false, 10, true));

  // app is initializing or data is corrupt
	if (safeRead(deviceData, 'readings') === undefined) {
		return;
	}
	if (Number(safeRead(deviceData, 'readings.pwr')) > 20000) return;	// ignore invalid readings

	// init all readings
	let electricityPointMeterConsumed = 0;
	let electricityPointMeterProduced = -deviceData.lastMeasurePower;
	let electricityCumulativeMeterOffpeakProduced = deviceData.lastMeterPowerOffpeakProduced;
	let electricityCumulativeMeterPeakProduced = deviceData.lastMeterPowerPeakProduced;
	let electricityCumulativeMeterOffpeakConsumed = deviceData.lastMeterPowerOffpeak;
	let electricityCumulativeMeterPeakConsumed = deviceData.lastMeterPowerPeak;
	// const lastMeterPowerInterval = deviceData.lastMeterPowerInterval;
	let lastMeterPowerTimestamp = deviceData.lastMeterPowerInterval_tm;
	let measureGas = deviceData.lastMeasureGas;

	// gas readings from device
	const meterGas = Number(safeRead(deviceData, 'readings.gas')); // gas_cumulative_meter
	const meterGasTm = Number(safeRead(deviceData, 'readings.gts')); // gas_meter_timestamp
	if (deviceData.lastMeterGas_tm === null) { deviceData.lastMeterGas_tm = meterGasTm; } // first reading after init
	// constructed gas readings
	if ((deviceData.lastMeterGas !== meterGas) || (deviceData.lastMeterGas_tm !== meterGasTm)) {
		let passedHours = (toEpoch(meterGasTm) - toEpoch(deviceData.lastMeterGas_tm)) / 1000 / 60 / 60;
		if (meterGasTm === undefined) { passedHours = 1; }
		measureGas = Math.round((meterGas - deviceData.lastMeterGas) / passedHours * 1000) / 1000; // gas_interval_meter
	}

// electricity readings from device
	// electricityPointMeterProduced = Number(safeRead(deviceData,'readings.pwr'));
	electricityPointMeterConsumed = Number(safeRead(deviceData, 'readings.pwr'));
	electricityCumulativeMeterOffpeakProduced = Number(safeRead(deviceData, 'readings.n1'));
	electricityCumulativeMeterPeakProduced = Number(safeRead(deviceData, 'readings.n2'));
	electricityCumulativeMeterOffpeakConsumed = Number(safeRead(deviceData, 'readings.p1'));
	electricityCumulativeMeterPeakConsumed = Number(safeRead(deviceData, 'readings.p2'));
	lastMeterPowerTimestamp = safeRead(deviceData, 'readings.tm');

// constructed electricity readings
	const meterPower = (electricityCumulativeMeterOffpeakConsumed + electricityCumulativeMeterPeakConsumed
		- electricityCumulativeMeterOffpeakProduced - electricityCumulativeMeterPeakProduced);
	let measurePower = electricityPointMeterConsumed; // - electricityPointMeterProduced;
	const measurePowerDelta = (measurePower - deviceData.lastMeasurePower);
	let offPeak = deviceData.lastOffpeak;
	if ((electricityCumulativeMeterOffpeakProduced - deviceData.lastMeterPowerOffpeakProduced
		+ electricityCumulativeMeterOffpeakConsumed - deviceData.lastMeterPowerOffpeak
		+ electricityCumulativeMeterPeakProduced - deviceData.lastMeterPowerPeakProduced
		+ electricityCumulativeMeterPeakConsumed - deviceData.lastMeterPowerPeak) !== 0) {
		offPeak = ((electricityCumulativeMeterOffpeakProduced - deviceData.lastMeterPowerOffpeakProduced) > 0
		|| (electricityCumulativeMeterOffpeakConsumed - deviceData.lastMeterPowerOffpeak) > 0);
	}

  // measurePower_produced 2 minutes average
	if (deviceData.lastMeterPowerInterval_tm === null) {
		deviceData.lastMeterPowerInterval = meterPower;
		deviceData.lastMeterPowerInterval_tm = lastMeterPowerTimestamp;
	}
	if ((lastMeterPowerTimestamp - deviceData.lastMeterPowerInterval_tm) >= 120
	&& deviceData.lastMeterPowerInterval_tm != null) {
		electricityPointMeterProduced = (3600000 / 120 * (deviceData.lastMeterPowerInterval - meterPower));
		deviceData.lastMeterPowerInterval = meterPower;
		deviceData.lastMeterPowerInterval_tm = lastMeterPowerTimestamp;
	}

 // correct measurePower with average measurePower_produced in case point_meter_produced is always zero
	if (measurePower === 0 && electricityPointMeterProduced > 0) {
		measurePower = 0 - electricityPointMeterProduced;
	}

  // Homey.log(deviceData.lastOffpeak);
	if (offPeak !== deviceData.lastOffpeak) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_offPeak', offPeak);
		// Trigger flow for tariff_changed
		Homey.manager('flow').triggerDevice('tariff_changed', { tariff: offPeak },
			null,	devices[deviceData.id].homey_device);
	}

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
	if (electricityCumulativeMeterPeakConsumed !== deviceData.lastMeterPowerPeak) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_power.peak', electricityCumulativeMeterPeakConsumed);
	}
	if (electricityCumulativeMeterOffpeakConsumed !== deviceData.lastMeterPowerOffpeak) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_power.offPeak', electricityCumulativeMeterOffpeakConsumed);
	}
	if (electricityCumulativeMeterPeakProduced !== deviceData.lastMeterPowerPeakProduced) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_power.producedPeak', electricityCumulativeMeterPeakProduced);
	}
	if (electricityCumulativeMeterOffpeakProduced !== deviceData.lastMeterPowerOffpeakProduced) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_power.producedOffPeak', electricityCumulativeMeterOffpeakProduced);
	}
//  Homey.log(meterGas);
	if (meterGas !== deviceData.lastMeterGas) {
		module.exports.realtime(devices[deviceData.id].homey_device, 'meter_gas', meterGas);
		module.exports.realtime(devices[deviceData.id].homey_device, 'measure_gas', measureGas);
	}

	deviceData.lastMeterPowerPeak = electricityCumulativeMeterPeakConsumed;
	deviceData.lastMeterPowerOffpeak = electricityCumulativeMeterOffpeakConsumed;
	deviceData.lastMeterPowerPeakProduced = electricityCumulativeMeterPeakProduced;
	deviceData.lastMeterPowerOffpeakProduced = electricityCumulativeMeterOffpeakProduced;
	deviceData.lastMeasurePower = measurePower;
	deviceData.lastMeterPower = meterPower;
	deviceData.lastMeasureGas = measureGas;
	deviceData.lastMeterGas = meterGas;
	deviceData.lastMeterGas_tm = meterGasTm;
	deviceData.lastOffpeak = offPeak;

  // Homey.log(deviceData);

}
