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

class LS120Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS120 driver');
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
						callback(null, JSON.stringify(youless.info)); // report success to frontend
					})
					.catch(() => {
						if (youless.info.model === 'LS120') {
							callback(null, JSON.stringify(youless.info)); // report success to frontend
						} else { callback(Error('Incorrect or no youless model found')); }
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
		// this.log(`handling new readings for ${this.getName()}`);
		// gas readings from device
		const meterGas = readings.gas; // gas_cumulative_meter
		const meterGasTm = readings.gtm; // gas_meter_timestamp, youless fw ^1.3.4
		let measureGas = this.meters.lastMeasureGas;
		// constructed gas readings
		const meterGasChanged = (this.meters.lastMeterGas !== meterGas) && (this.meters.lastMeterGasTm !== 0);
		const meterGasTmChanged = (meterGasTm !== this.meters.lastMeterGasTm) && (this.meters.lastMeterGasTm !== 0);
		if (meterGasChanged || meterGasTmChanged) {
			const passedHours = (meterGasTm - this.meters.lastMeterGasTm) / 3600000;
			if (passedHours > 0) {
				measureGas = Math.round((meterGas - this.meters.lastMeterGas) / passedHours) / 1000; // gas_interval_meter
			}
		}
		// electricity readings from device
		const meterPowerOffpeakProduced = readings.n1;
		const meterPowerPeakProduced = readings.n2;
		const meterPowerOffpeak = readings.p1;
		const meterPowerPeak = readings.p2;
		const meterPower = readings.net;
		let measurePower = readings.pwr;
		let measurePowerAvg = this.meters.lastMeasurePowerAvg;
		const meterPowerTm = readings.tm;
		// constructed electricity readings
		let offPeak = this.meters.lastOffpeak;
		if ((meterPower - this.meters.lastMeterPower) !== 0) {
			offPeak = ((meterPowerOffpeakProduced - this.meters.lastMeterPowerOffpeakProduced) > 0
			|| (meterPowerOffpeak - this.meters.lastMeterPowerOffpeak) > 0);
		}
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
		// correct measurePower with average measurePower_produced in case point_meter_produced is always zero
		if (measurePower === 0 && measurePowerAvg < 0) {
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
			this._ledring.change(this.getSettings(), this.meters.lastMeasurePower);
		}
		// store the new readings in memory
		this.meters.lastMeasureGas = measureGas; // || this.meters.lastMeasureGas;
		this.meters.lastMeterGas = meterGas; // || this.meters.lastMeterGas;
		this.meters.lastMeterGasTm = meterGasTm || this.meters.lastMeterGasTm;
		this.meters.lastMeasurePower = measurePower; // || this.meters.lastMeasurePower;
		this.meters.lastMeasurePowerAvg = measurePowerAvg; // || this.meters.lastMeasurePowerAvg;
		this.meters.lastMeterPower = meterPower; // || this.meters.lastMeterPower;
		this.meters.lastMeterPowerPeak = meterPowerPeak; // || this.meters.lastMeterPowerPeak;
		this.meters.lastMeterPowerOffpeak = meterPowerOffpeak; // || this.meters.lastMeterPowerOffpeak;
		this.meters.lastMeterPowerPeakProduced = meterPowerPeakProduced; // || this.meters.lastMeterPowerPeakProduced;
		this.meters.lastMeterPowerOffpeakProduced = meterPowerOffpeakProduced; // || this.meters.lastMeterPowerOffpeakProduced;
		this.meters.lastMeterPowerTm = meterPowerTm || this.meters.lastMeterPowerTm;
		this.meters.lastOffpeak = offPeak;
		// update the device state
		// this.log(this.meters);
		this.updateDeviceState();
	}

}

module.exports = LS120Driver;
