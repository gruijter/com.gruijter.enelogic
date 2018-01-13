'use strict';

const Homey = require('homey');
const Youless = require('youless');

class LS110Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS110 driver');
		this.Youless = Youless;
	}

	onPair(socket) {
		socket.on('validate', async (data, callback) => {
			try {
				this.log('save button pressed in frontend');
				const password = data.password;
				const host = data.youLessIp;
				const youless = new this.Youless(password, host);	// password, host, [port]
				this.log(youless);
				// try to login
				await youless.login();
				// try to get basicStatus and connected meters
				await youless.getBasicStatus()
					.then(() => {
						callback(null, 'Youless device found!'); // report success to frontend
					})
					.catch(() => {
						callback(Error('Error retrieving basic status'));
					});
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					callback(Error('Incorrect IP address'));
				}
				callback(error);
			}
		});
	}

	// isValidReading(readings) {	// call with device as this
	// 	let validReading = true;
	// 	const tm = readings.tm;
	// 	if (this.meters.lastMeterPowerIntervalTm === null) { // first reading after init
	// 		return validReading;	// We have to assume that the first reading after init is a valid reading :(
	// 	}
	// 	// check if con is 'OK'
	// 	const con = readings.con; // connection status
	// 	if (con !== 'OK') {
	// 		this.log('device is not connected somehow..');
	// 		validReading = false;
	// 	}
	// 	// check if timestamps make sense
	// 	if (tm - this.meters.lastMeterPowerTm < 0) {
	// 		this.log('power time is negative');
	// 		validReading = false;
	// 	}
	// 	// check if power readings make sense
	// 	if (Math.abs(readings.pwr) > 56000) {
	// 		this.log('unrealistic high power >3X80A');
	// 		validReading = false;
	// 	}
	// 	const net = readings.net;
	// 	const timeDelta = tm - this.meters.lastMeterPowerIntervalTm; // in seconds
	// 	if (Math.abs(net - this.meters.lastMeterPower) / (timeDelta / 60 / 60) > 56) {
	// 		this.log('unrealistic high power meter delta >3X80A / 56KWh');
	// 		validReading = false;
	// 	}
	// 	return validReading;
	// }

	handleNewReadings(readings) {	// call with device as this
		// this.log(`handling new readings for ${this.getName()}`);
		// electricity readings from device
		const meterPower = readings.net;
		let measurePower = readings.pwr;
		let measurePowerAvg = this.meters.lastMeasurePowerAvg;
		const meterPowerTm = readings.tm;

		// measurePowerAvg 2 minutes average based on cumulative meter
		if (this.meters.lastMeterPowerIntervalTm === null) {	// first reading after init
			this.meters.lastMeterPowerInterval = meterPower;
			this.meters.lastMeterPowerIntervalTm = meterPowerTm;
		}
		if ((meterPowerTm - this.meters.lastMeterPowerIntervalTm) >= 120) {
			measurePowerAvg = Math.round((3600000 / 120) * (meterPower - this.meters.lastMeterPowerInterval));
			this.meters.lastMeterPowerInterval = meterPower;
			this.meters.lastMeterPowerIntervalTm = meterPowerTm;
		}
		// correct measurePower with average measurePower_produced in case point_meter_produced is always zero
		if (measurePower === 10 && measurePowerAvg < 0) {
			measurePower = measurePowerAvg;
		}
		const measurePowerDelta = (measurePower - this.meters.lastMeasurePower);
		// trigger the custom trigger flowcards
		if (measurePower !== this.meters.lastMeasurePower) {
			const tokens = {
				power: measurePower,
				power_delta: measurePowerDelta,
			};
			this.powerChangedTrigger
				.trigger(this, tokens)
				.catch(this.error);
			// .then(this.log('Power change flow card triggered'));
			// update the ledring screensavers
			this._ledring.change(this.getSettings(), this.meters.lastMeasurePower);
		}
		// store the new readings in memory
		this.meters.lastMeasurePower = measurePower;
		this.meters.lastMeasurePowerAvg = measurePowerAvg;
		this.meters.lastMeterPower = meterPower;
		this.meters.lastMeterPowerTm = meterPowerTm;
		// update the device state
		this.updateDeviceState();
	}

}

module.exports = LS110Driver;
