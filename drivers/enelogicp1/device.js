/*
Copyright 2017 - 2021, Robin de Gruijter (gruijter@hotmail.com)

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

const { Device } = require('homey');
const util = require('util');
const Enelogic = require('../../enelogic.js');

const setTimeoutPromise = util.promisify(setTimeout);

class EnelogicDevice extends Device {

	// this method is called when the Device is inited
	async onInit() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this.restarting = false;
			this.watchDogCounter = 10;
			const settings = this.getSettings();
			this.initMeters();

			// create enelogic session
			this.enelogic = new Enelogic(settings.enelogicIp);

			// start polling device for info
			this.startPolling(settings.pollingInterval);
		} catch (error) {
			this.error(error);
		}
	}

	startPolling(interval) {
		this.homey.clearInterval(this.intervalIdDevicePoll);
		this.log(`start polling ${this.getName()} @${interval} seconds interval`);
		this.intervalIdDevicePoll = this.homey.setInterval(() => {
			this.doPoll();
		}, interval * 1000);
	}

	stopPolling() {
		this.log(`Stop polling ${this.getName()}`);
		this.homey.clearInterval(this.intervalIdDevicePoll);
	}

	async restartDevice(delay) {
		if (this.restarting) return;
		this.restarting = true;
		this.stopPolling();
		// this.destroyListeners();
		const dly = delay || 2000;
		this.log(`Device will restart in ${dly / 1000} seconds`);
		// this.setUnavailable('Device is restarting. Wait a few minutes!');
		await setTimeoutPromise(dly).then(() => this.onInit());
	}

	// this method is called when the Device is added
	async onAdded() {
		this.log(`Meter added as device: ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		this.stopPolling();
		// this.destroyListeners();
		this.log(`Deleted as device: ${this.getName()}`);
	}

	onRenamed(name) {
		this.log(`Meter renamed to: ${name}`);
	}

	// this method is called when the user has changed the device's settings in Homey.
	async onSettings({ newSettings }) {
		this.log(`${this.getName()} device settings changed`);
		this.log(newSettings);
	}

	async doPoll() {
		try {
			if (this.watchDogCounter <= 0) {
				// restart the app here
				this.log('watchdog triggered, restarting device now');
				this.restartDevice(60000);
				return;
			}
			if (this.watchDogCounter < 9 && this.watchDogCounter > 1) {
				// skip some polls
				const isEven = this.watchDogCounter === parseFloat(this.watchDogCounter) ? !(this.watchDogCounter % 2) : undefined;
				if (isEven) {
					this.watchDogCounter -= 1;
					// console.log('skipping poll');
					return;
				}
			}
			const readings = {};
			readings.e = await this.enelogic.getEMeter();
			readings.g = await this.enelogic.getGMeter()
				.catch(() => {
					// ignore if no gasmeter present
				});
			this.setAvailable();
			this.handleNewReadings(readings);
			this.watchDogCounter = 10;
		} catch (error) {
			this.setUnavailable(error.message);
			this.watchDogCounter -= 1;
			this.error('Poll error', error.message);
		}
	}

	initMeters() {
		this.lastMeters = {
			measureGas: 0,							// 'measureGas' (m3)
			meterGas: null, 						// 'meterGas' (m3)
			meterGasTm: 0,							// timestamp of gas meter reading, e.g. 1514394325
			measurePower: 0,						// 'measurePower' (W)
			measurePowerAvg: 0,						// '1 minute average measurePower' (W)
			meterPower: null,						// 'meterPower' (kWh)
			meterPowerPeak: null,					// 'meterPower_peak' (kWh)
			meterPowerOffPeak: null,				// 'meterPower_offpeak' (kWh)
			meterPowerPeakProduced: null,			// 'meterPower_peak_produced' (kWh)
			meterPowerOffPeakProduced: null,		// 'meterPower_offpeak_produced' (kWh)
			meterPowerTm: null, 					// timestamp epoch, e.g. 1514394325
			meterPowerInterval: null,				// 'meterPower' at last interval (kWh)
			meterPowerIntervalTm: null, 			// timestamp epoch, e.g. 1514394325
			offPeak: null,							// 'meterPower_offpeak' (true/false)
		};
	}

	setCapability(capability, value) {
		if (this.hasCapability(capability)) {
			this.setCapabilityValue(capability, value)
				.catch((error) => {
					this.log(error, capability, value);
				});
		}
	}

	updateDeviceState(meters) {
		// this.log(`updating states for: ${this.getName()}`);
		try {
			this.setCapability('measure_power', meters.measurePower);
			this.setCapability('meter_power', meters.meterPower);
			this.setCapability('measure_gas', meters.measureGas);
			this.setCapability('meter_gas', meters.meterGas);
			this.setCapability('meter_power.peak', meters.meterPowerPeak);
			this.setCapability('meter_offPeak', meters.offPeak);
			this.setCapability('meter_power.offPeak', meters.meterPowerOffPeak);
			this.setCapability('meter_power.producedPeak', meters.meterPowerPeakProduced);
			this.setCapability('meter_power.producedOffPeak', meters.meterPowerOffPeakProduced);
		} catch (error) {
			this.error(error);
		}
	}

	handleNewReadings(readings) {
		// this.log(`handling new readings for ${this.getName()}`);
		// gas readings from device
		const meterGas = readings.g && readings.g.gas; // gas_cumulative_meter
		const meterGasTm = (meterGas && (meterGas !== this.lastMeters.meterGas)) ? Date.now() / 1000 : this.lastMeters.meterGasTm;
		let { measureGas } = this.lastMeters;

		// constructed gas readings
		const meterGasTmChanged = (meterGasTm !== this.lastMeters.meterGasTm) && (this.lastMeters.meterGasTm !== 0);
		if (meterGasTmChanged) {
			const passedHours = (meterGasTm - this.lastMeters.meterGasTm) / 3600;	// timestamp is in seconds
			measureGas = Math.round(1000 * ((meterGas - this.lastMeters.meterGas) / passedHours)) / 1000; // gas_interval_meter
		}

		// electricity readings from device
		const meterPowerOffPeakProduced = readings.e.powerOffpeakProduced;
		const meterPowerPeakProduced = readings.e.powerPeakProduced;
		const meterPowerOffPeak = readings.e.powerOffpeak;
		const meterPowerPeak = readings.e.powerPeak;
		const meterPower = (meterPowerOffPeak + meterPowerPeak) - (meterPowerOffPeakProduced + meterPowerPeakProduced);
		let measurePower = (readings.e.measurePower - readings.e.measurePowerProduced);
		let { measurePowerAvg } = this.lastMeters;
		const meterPowerTm = Date.now() / 1000;
		// constructed electricity readings
		let { offPeak } = this.lastMeters;
		if ((this.lastMeters.meterPowerTm !== null) && ((meterPower - this.lastMeters.meterPower) !== 0)) {
			offPeak = ((meterPowerOffPeakProduced - this.lastMeters.meterPowerOffPeakProduced) > 0
			|| (meterPowerOffPeak - this.lastMeters.meterPowerOffPeak) > 0);
		}
		// measurePowerAvg 1 minute average based on cumulative meters
		let { meterPowerInterval, meterPowerIntervalTm } = this.lastMeters;
		if (this.lastMeters.meterPowerIntervalTm === null) {	// first reading after init
			meterPowerInterval = meterPower;
			meterPowerIntervalTm = meterPowerTm;
			measurePowerAvg = measurePower;
		}
		if ((meterPowerTm - meterPowerIntervalTm) >= 60) {
			measurePowerAvg = Math.round((3600000 / (meterPowerTm - meterPowerIntervalTm)) * (meterPower - meterPowerInterval));
			meterPowerInterval = meterPower;
			meterPowerIntervalTm = meterPowerTm;
		}
		// correct measurePower with average measurePower_produced in case point_meter_produced is always zero
		const producing = (this.lastMeters.meterPowerTm !== null) && (meterPower <= this.lastMeters.meterPower);
		if (producing && (measurePower < 100) && (measurePower > -50) && (measurePowerAvg < 0)) {
			measurePower = measurePowerAvg;
		}

		// setup custom trigger flowcards
		const tariffChanged = (this.lastMeters.offPeak !== null) && (offPeak !== this.getCapabilityValue('meter_offPeak'));
		const powerChanged = (this.lastMeters.meterPowerTm !== null) && (measurePower !== this.lastMeters.measurePower);

		// update the ledring screensavers
		if (measurePower !== this.lastMeters.measurePower) this.driver.ledring.change(this.getSettings(), measurePower);

		// store the new readings in memory
		const meters = {
			measureGas,
			meterGas,
			meterGasTm,
			measurePower,
			measurePowerAvg,
			meterPower,
			meterPowerPeak,
			meterPowerOffPeak,
			meterPowerPeakProduced,
			meterPowerOffPeakProduced,
			meterPowerTm,
			meterPowerInterval,
			meterPowerIntervalTm,
			offPeak,
		};

		// update the device state
		this.updateDeviceState(meters);

		// execute flow triggers
		if (tariffChanged) {
			const tokens = { tariff: offPeak };
			this.homey.app.triggerTariffChanged(this, tokens, {});
		}
		if (powerChanged) {
			const measurePowerDelta = (measurePower - this.lastMeters.measurePower);
			const tokens = {
				power: measurePower,
				power_delta: measurePowerDelta,
			};
			this.homey.app.triggerPowerChanged(this, tokens, {});
		}

		// console.log(meters);
		this.lastMeters = meters;
		this.watchDogCounter = 10;
	}

}

module.exports = EnelogicDevice;
