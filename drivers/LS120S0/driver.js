'use strict';

const Homey = require('homey');
const Youless = require('youless');

class LS120S0Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS120S0 driver');
		this.Youless = Youless;
	}

	onPair(socket) {
		socket.on('validate', async (data, callback) => {
			try {
				this.log('save button pressed in frontend');
				const password = data.password;
				const host = data.youLessIp;
				const youless = new this.Youless(password, host);	// password, host, [port]
				// this.log(youless);
				// try to login
				await youless.login();
				// try to get advancedStatus and connected meters
				await youless.getAdvancedStatus()
					.then(() => {
						if (youless.info.hasS0Meter) {
							callback(null, JSON.stringify(youless.info)); // report success to frontend
						} else { callback(Error('No S0 meter available')); }
					})
					.catch(() => {
						if (youless.info.hasS0Meter) {
							callback(null, JSON.stringify(youless.info)); // report success to frontend
						} else { callback(Error('No S0 meter available')); }
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
	// 	if (this.meters.lastMeterPowerIntervalTm === null) { // first reading after init
	// 		return validReading;	// We have to assume that the first reading after init is a valid reading :(
	// 	}
	// 	// check if timestamps make sense
	// 	const tm = readings.tm; // power meter timestamp
	// 	const ts0 = readings.ts0; // S0 meter timestamp
	// 	// if (tm - this.meters.lastMeterPowerTm < 0) {
	// 	// 	this.log('power time is negative');
	// 	// 	validReading = false;
	// 	// }
	// 	if ((ts0 !== 0) && (Math.abs(ts0 - tm) > 45000)) {	// > 12 hrs difference
	// 		this.log('S0 and power time differ too much');
	// 		validReading = false;
	// 	}
	// 	if (!validReading) {
	// 		this.log(this.meters);
	// 		this.log(readings);
	// 	}
	// 	return validReading;
	// }

	handleNewReadings(readings) {	// call with device as this
		// this.log(`handling new readings for ${this.getName()}`);
		// electricity readings from device
		const meterPower = readings.cs0;
		const measurePower = readings.ps0;
		let measurePowerAvg = this.meters.lastMeasurePowerAvg;
		const meterPowerTm = readings.ts0;
		// constructed electricity readings
		// measurePowerAvg 2 minutes average based on cumulative meters
		if (this.meters.lastMeterPowerIntervalTm === null) {	// first reading after init
			this.meters.lastMeterPowerInterval = meterPower;
			this.meters.lastMeterPowerIntervalTm = meterPowerTm;
		}
		if ((meterPowerTm - this.meters.lastMeterPowerIntervalTm) >= 120) {
			measurePowerAvg = Math.round((3600000 / 120) * (meterPower - this.meters.lastMeterPowerInterval));
			this.meters.lastMeterPowerInterval = meterPower;
			this.meters.lastMeterPowerIntervalTm = meterPowerTm;
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
			// .then(this.error('Power change flow card triggered'));
			// update the ledring screensavers
			this._ledring.change(this.getSettings(), this.meters.lastMeasurePower);
		}
		// store the new readings in memory
		this.meters.lastMeasurePower = measurePower; // || this.meters.lastMeasurePower;
		this.meters.lastMeasurePowerAvg = measurePowerAvg; // || this.meters.lastMeasurePowerAvg;
		this.meters.lastMeterPower = meterPower; // || this.meters.lastMeterPower;
		this.meters.lastMeterPowerTm = meterPowerTm || this.meters.lastMeterPowerTm;
		// update the device state
		// this.log(this.meters);
		this.updateDeviceState();
	}

}

module.exports = LS120S0Driver;
