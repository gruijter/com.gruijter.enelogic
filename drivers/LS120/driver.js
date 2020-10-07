/* eslint-disable import/no-extraneous-dependencies */
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

class LS120Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS120 driver');
		this.Youless = Youless;
		this.ledring = new Ledring({ screensaver: 'enelogic_power', homey: this });
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
				const info = await youless.getInfo();
				if (info.model !== 'LS120') {
					throw Error('Incorrect youless model found');
				}
				const device = {
					name: `${info.model}P1_${info.host}`,
					data: { id: `LS120P1_${info.mac}` },
					settings: {
						youLessIp: host,
						password,
						model: info.model,
						mac: info.mac,
						ledring_usage_limit: 3000,
						ledring_production_limit: 3000,
					},
					capabilities: [
						'measure_power',
						'meter_power',
						// 'measure_gas',
						// 'meter_gas',
						// 'meter_offPeak',
						// 'meter_power.peak',
						// 'meter_power.offPeak',
						// 'meter_power.producedPeak',
						// 'meter_power.producedOffPeak',
					],
				};
				if (data.includeOffPeak) {
					device.capabilities.push('meter_offPeak');
					device.capabilities.push('meter_power.peak');
					device.capabilities.push('meter_power.offPeak');
				}
				if (data.includeProduction) {
					device.capabilities.push('meter_power.producedPeak');
				}
				if (data.includeProduction && data.includeOffPeak) {
					device.capabilities.push('meter_power.producedOffPeak');
				}
				if (data.includeGas) {
					device.capabilities.push('measure_gas');
					device.capabilities.push('meter_gas');
				}
				callback(null, JSON.stringify(device)); // report success to frontend
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					callback(Error('Incorrect IP address'));
					return;
				}
				callback(error);
			}
		});
	}

	isValidReading(readings) {	// call with device as this
		let validReading = true;
		if (this.meters.lastMeterPowerIntervalTm === null) { // first reading after init
			return validReading;	// We have to assume that the first reading after init is a valid reading :(
		}
		// check if gas readings make sense
		const meterGas = readings.gas;
		if (meterGas < this.meters.lastMeterGas) {
			this.log('negative gas usage');
			validReading = false;
		}
		if (meterGas - this.meters.lastMeterGas > 40) {
			this.log('unrealistic high gas usage > G25');
			validReading = false;
		}
		// check if timestamps make sense
		const tm = readings.tm; // power meter timestamp
		// const gts = readings.gts; // gas meter timestamp yyMMddhhmm
		const gtm = readings.gtm; // gas meter timestamp
		// const ts0 = readings.ts0; // S0 meter timestamp
		if (tm - this.meters.lastMeterPowerTm < 0) {
			this.log('power time is negative');
			validReading = false;
		}
		if (gtm - this.meters.lastMeterGasTm < 0) {
			this.log('gas time is negative');
			validReading = false;
		}
		// if ((ts0 !== 0) && (Math.abs(ts0 - tm) > 45000)) {	// > 12 hrs difference
		// 	this.log('S0 and power time differ too much');
		// 	validReading = false;
		// }
		// if ((gts !== 0) && (gts.toSting().length !== 10)) {
		// 	this.log('gas time has invalid format');
		// 	validReading = false;
		// }
		if ((gtm !== 0) && (Math.abs(gtm - tm) > 45000)) {	// > 12 hrs difference
			this.log('gas and power time differ too much');
			validReading = false;
		}
		// check if power readings make sense
		if (Math.abs(readings.pwr) > 56000) {
			this.log('unrealistic high power >3X80A');
			validReading = false;
		}
		const net = readings.net;
		const p1 = readings.p1;
		const p2 = readings.p2;
		const n1 = readings.n1;
		const n2 = readings.n2;
		if (Math.abs(net - ((p1 + p2) - (n1 + n2))) > 0.1) {
			this.log('power meters do not add up');
			validReading = false;
		}
		const timeDelta = tm - this.meters.lastMeterPowerIntervalTm; // in seconds
		if (Math.abs(net - this.meters.lastMeterPower) / (timeDelta / 60 / 60) > 56) {
			this.log('unrealistic high power meter delta >3X80A / 56KWh');
			validReading = false;
		}
		if (!validReading) {
			this.log(this.meters);
			this.log(readings);
		}
		return validReading;
	}

	handleNewReadings(readings) {	// call with device as this
		try {
			// this.log(`handling new readings for ${this.getName()}`);
			// gas readings from device
			let measureGas = this.meters.lastMeasureGas;
			const meterGas = readings.gas || this.meters.lastMeterGas; // gas_cumulative_meter
			const meterGasTm = readings.gtm || this.meters.lastMeterGasTm; // gas_meter_timestamp, youless fw ^1.3.4
			// constructed gas readings
			const meterGasTmChanged = (meterGasTm !== this.meters.lastMeterGasTm) && (this.meters.lastMeterGasTm !== 0);
			if (meterGasTmChanged) {
				const passedHours = (meterGasTm - this.meters.lastMeterGasTm) / 3600;	// timestamp is in seconds
				measureGas = Math.round(1000 * ((meterGas - this.meters.lastMeterGas) / passedHours)) / 1000; // gas_interval_meter
			}
			// electricity readings from device
			let measurePower = readings.pwr;
			const meterPowerOffpeakProduced = readings.n1 || this.meters.lastMeterPowerPeakProduced;
			const meterPowerPeakProduced = readings.n2 || this.meters.lastMeterPowerOffpeakProduced;
			const meterPowerOffpeak = readings.p1 || this.meters.lastMeterPowerOffpeak;
			const meterPowerPeak = readings.p2 || this.meters.lastMeterPowerPeak;
			const meterPower = readings.net || this.meters.lastMeterPower;
			const meterPowerTm = readings.tm || this.meters.lastMeterPowerTm;
			// constructed electricity readings
			let offPeak = this.meters.lastOffpeak;
			if ((meterPower - this.meters.lastMeterPower) !== 0) {
				offPeak = ((meterPowerOffpeakProduced - this.meters.lastMeterPowerOffpeakProduced) > 0
				|| (meterPowerOffpeak - this.meters.lastMeterPowerOffpeak) > 0);
			}
			// measurePowerAvg based on cumulative meters
			if (!this.meters.lastMeterPowerIntervalTm) {	// after ap init
				this.meters.lastMeterPowerInterval = meterPower;
				this.meters.lastMeterPowerIntervalTm = meterPowerTm;
			}
			const meterPowerDelta = meterPower - this.meters.lastMeterPowerInterval;
			const meterPowerTmDelta = meterPowerTm - this.meters.lastMeterPowerIntervalTm;
			let measurePowerAvg = this.meters.lastMeasurePowerAvg || measurePower;
			if (meterPowerTmDelta >= 60) {
				this.meters.lastMeterPowerInterval = meterPower;
				this.meters.lastMeterPowerIntervalTm = meterPowerTm;
				measurePowerAvg = Math.round((3600000 / meterPowerTmDelta) * meterPowerDelta);
			}
			// console.log(meterPowerTmDelta, measurePower, measurePowerAvg, meterPower, meterPowerDelta);
			// correct measurePower with average measurePower_produced in case point_meter_produced is always zero
			if (meterPowerDelta < 0 && measurePower >= 0) {
				measurePower = measurePowerAvg;
			}
			const measurePowerDelta = (measurePower - this.meters.lastMeasurePower);
			// trigger the custom trigger flowcards
			if (offPeak !== this.meters.lastOffpeak) {
				const tokens = { tariff: offPeak };
				this.tariffChangedTrigger
					.trigger(this, tokens)
					.catch(this.error);
				// .then(this.log('Tariff change flow card triggered'));
			}
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
			this.meters.lastMeasureGas = measureGas; // || this.meters.lastMeasureGas;
			this.meters.lastMeterGas = meterGas; // || this.meters.lastMeterGas;
			this.meters.lastMeterGasTm = meterGasTm; // || this.meters.lastMeterGasTm;
			this.meters.lastMeasurePower = measurePower; // || this.meters.lastMeasurePower;
			this.meters.lastMeasurePowerAvg = measurePowerAvg;
			this.meters.lastMeterPower = meterPower; // || this.meters.lastMeterPower;
			this.meters.lastMeterPowerPeak = meterPowerPeak; // || this.meters.lastMeterPowerPeak;
			this.meters.lastMeterPowerOffpeak = meterPowerOffpeak; // || this.meters.lastMeterPowerOffpeak;
			this.meters.lastMeterPowerPeakProduced = meterPowerPeakProduced; // || this.meters.lastMeterPowerPeakProduced;
			this.meters.lastMeterPowerOffpeakProduced = meterPowerOffpeakProduced; // || this.meters.lastMeterPowerOffpeakProduced;
			this.meters.lastMeterPowerTm = meterPowerTm; // || this.meters.lastMeterPowerTm;
			this.meters.lastOffpeak = offPeak; // || this.meters.lastOffpeak;
			// update the device state
			// this.log(this.meters);
			this.updateDeviceState();
		}	catch (error) {
			this.log(error);
		}
	}
}

module.exports = LS120Driver;
