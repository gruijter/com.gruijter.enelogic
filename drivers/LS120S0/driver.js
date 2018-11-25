/* eslint-disable prefer-destructuring */
/*
Copyright 2017, 2018, Robin de Gruijter (gruijter@hotmail.com)

This file is part of com.gruijter.enelogic.

com.gruijter.enelogic is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.enelogic is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
*/

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
				await youless.login();
				await youless.getAdvancedStatus();	// check for s0 meter
				const info = await youless.getInfo();
				if (youless.hasMeter.s0) {
					callback(null, JSON.stringify(info)); // report success to frontend
				} else { callback(Error('No S0 meter available')); }
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					callback(Error('Incorrect IP address'));
				}
				callback(error);
			}
		});
	}

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
