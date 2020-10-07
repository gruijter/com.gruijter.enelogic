/* eslint-disable prefer-destructuring */
/*
Copyright 2017 - 2020, Robin de Gruijter (gruijter@hotmail.com)

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
along with com.gruijter.enelogic.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');
const Youless = require('youless');
const Ledring = require('../../ledring.js');

class LS120S0Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS120S0 driver');
		this.Youless = Youless;
		this.ledring = new Ledring({ screensaver: 'enelogic_s0', homey: this });
	}

	onPair(socket) {
		socket.on('discover', async (data, callback) => {
			try {
				this.log('device discovery started');
				const youless = new this.Youless();	// password, host, [port]
				const discovered = await youless.discover();
				callback(null, JSON.stringify(discovered)); // report success to frontend
			}	catch (error) {
				callback(error);
			}
		});
		socket.on('validate', async (data, callback) => {
			try {
				this.log('save button pressed in frontend');
				const password = data.password;
				const host = data.youLessIp;
				const youless = new this.Youless(password, host);	// password, host, [port]
				await youless.login();
				await youless.getAdvancedStatus();	// check for s0 meter
				const info = await youless.getInfo();
				if (!youless.hasMeter.s0) {
					callback(Error('No S0 information found on the device'));
					return;
				}
				const device = {
					name: `${info.model}S0_${info.host}`,
					data: { id: `LS120S0_${info.mac}` },
					settings: {
						youLessIp: host,
						password,
						model: info.model,
						mac: info.mac,
					},
				};
				if (data.meterSelection === 'Power') {
					device.capabilities = [
						'measure_power',
						'meter_power',
					];
					device.settings.ledring_usage_limit = 3000;
				}
				if (data.meterSelection === 'Water') {
					device.capabilities = [
						'measure_water',
						'meter_water',
					];
					device.settings.ledring_usage_limit = 0;
				}
				callback(null, JSON.stringify(device)); // report success to frontend
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					callback(Error('Incorrect IP address'));
				}
				callback(error);
			}
		});
	}

	handleNewPowerReadings(readings) {	// call with device as this
		// this.log(`handling new readings for ${this.getName()}`);
		// electricity readings from device
		const meterPower = readings.cs0;
		const measurePower = readings.ps0;
		const meterPowerTm = readings.ts0;
		// constructed electricity readings
		// let measurePowerAvg = this.meters.lastMeasurePowerAvg;
		// // measurePowerAvg 2 minutes average based on cumulative meters
		// if (this.meters.lastMeterPowerIntervalTm === null) {	// first reading after init
		// 	this.meters.lastMeterPowerInterval = meterPower;
		// 	this.meters.lastMeterPowerIntervalTm = meterPowerTm;
		// }
		// if ((meterPowerTm - this.meters.lastMeterPowerIntervalTm) >= 120) {
		// 	measurePowerAvg = Math.round((3600000 / 120) * (meterPower - this.meters.lastMeterPowerInterval));
		// 	this.meters.lastMeterPowerInterval = meterPower;
		// 	this.meters.lastMeterPowerIntervalTm = meterPowerTm;
		// }
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
			this._ledring.change(this.getSettings(), measurePower);
		}
		// store the new readings in memory
		this.meters.lastMeasurePower = measurePower; // || this.meters.lastMeasurePower;
		this.meters.lastMeterPower = meterPower; // || this.meters.lastMeterPower;
		this.meters.lastMeterPowerTm = meterPowerTm || this.meters.lastMeterPowerTm;
		// this.meters.lastMeasurePowerAvg = measurePowerAvg; // || this.meters.lastMeasurePowerAvg;
	}

	handleNewWaterReadings(readings) {	// call with device as this
		// this.log(`handling new readings for ${this.getName()}`, readings);
		// water readings from device
		const meterWater = readings.cs0;
		let measureWater = 	this.meters.lastMeasureWater;

		if (readings.ps0 !== 0 && (readings.tm - readings.ts0) > 3600 / readings.ps0) {
			// flow based on time different between current report time (tm) and last meter update (ts0)
			measureWater = 1 / ((readings.tm - readings.ts0) / 60);
			// this.log('Water pulse overdue: calulated flow', measureWater, 'reported meter:', meterWater);
		} else {
			// flow based on readings from s0 port
			measureWater = readings.ps0 / 60; // readings.ps0 (in liter / hr) to liter / min
			// this.log('water pulse on time: reported flow', measureWater, 'reported meter:', meterWater);
			// update the ledring screensavers
			this._ledring.change(this.getSettings(), measureWater);
		}
		// store the new readings in memory
		this.meters.lastMeterWater = meterWater;
		this.meters.lastMeasureWater = measureWater;
	}

	handleNewReadings(readings) {
		if (this.hasCapability('meter_power')) {
			this._driver.handleNewPowerReadings.call(this, readings);
		}
		if (this.hasCapability('meter_water')) {
			this._driver.handleNewWaterReadings.call(this, readings);
		}
		// update the device state
		this.updateDeviceState();
	}

}

module.exports = LS120S0Driver;
