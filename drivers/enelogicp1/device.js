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
			this.meters = {};
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
		this.meters = {
			lastMeasureGas: 0,										// 'measureGas' (m3)
			lastMeterGas: null, 									// 'meterGas' (m3)
			lastMeterGasTm: 0,										// timestamp of gas meter reading, e.g. 1514394325
			lastMeasurePower: 0,									// 'measurePower' (W)
			lastMeasurePowerAvg: 0,								// '2 minute average measurePower' (kWh)
			lastMeterPower: null,									// 'meterPower' (kWh)
			lastMeterPowerPeak: null,							// 'meterPower_peak' (kWh)
			lastMeterPowerOffpeak: null,					// 'meterPower_offpeak' (kWh)
			lastMeterPowerPeakProduced: null,			// 'meterPower_peak_produced' (kWh)
			lastMeterPowerOffpeakProduced: null,	// 'meterPower_offpeak_produced' (kWh)
			lastMeterPowerTm: null, 							// timestamp epoch, e.g. 1514394325
			lastMeterPowerInterval: null,					// 'meterPower' at last interval (kWh)
			lastMeterPowerIntervalTm: null, 			// timestamp epoch, e.g. 1514394325
			lastOffpeak: null,										// 'meterPower_offpeak' (true/false)
		};
	}

	updateDeviceState() {
		// this.log(`updating states for: ${this.getName()}`);
		try {
			this.setCapabilityValue('measure_power', this.meters.lastMeasurePower);
			this.setCapabilityValue('meter_offPeak', this.meters.lastOffpeak);
			this.setCapabilityValue('measure_gas', this.meters.lastMeasureGas);
			this.setCapabilityValue('meter_gas', this.meters.lastMeterGas);
			this.setCapabilityValue('meter_power', this.meters.lastMeterPower);
			this.setCapabilityValue('meter_power.peak', this.meters.lastMeterPowerPeak);
			this.setCapabilityValue('meter_power.offPeak', this.meters.lastMeterPowerOffpeak);
			this.setCapabilityValue('meter_power.producedPeak', this.meters.lastMeterPowerPeakProduced);
			this.setCapabilityValue('meter_power.producedOffPeak', this.meters.lastMeterPowerOffpeakProduced);
			// reset watchdog
			this.watchDogCounter = 10;
		} catch (error) {
			this.error(error);
		}
	}

	handleNewReadings(readings) {
		// this.log(`handling new readings for ${this.getName()}`);
		// gas readings from device
		let meterGas = this.meters.lastMeterGas;
		let measureGas = this.meters.lastMeasureGas;
		if (readings.g !== undefined) {
			meterGas = readings.g.gas; // gas_cumulative_meter
			const meterGasTm = Date.now() / 1000; // gas_meter_timestamp
			// constructed gas readings
			if (this.meters.lastMeterGas !== meterGas) {
				if (this.meters.lastMeterGas !== null) {	// first reading after init
					let hoursPassed = (meterGasTm - this.meters.lastMeterGasTm) / 3600;	// hrs
					if (hoursPassed > 1.5) { // too long ago; assume 1 hour interval
						hoursPassed = 1;
					}
					measureGas = Math.round(1000 * ((meterGas - this.meters.lastMeterGas) / hoursPassed)) / 1000; // gas_interval_meter
				}
				this.meters.lastMeterGasTm = meterGasTm;
			}
		}

		// electricity readings from device
		const meterPowerOffpeakProduced = readings.e.powerOffpeakProduced;
		const meterPowerPeakProduced = readings.e.powerPeakProduced;
		const meterPowerOffpeak = readings.e.powerOffpeak;
		const meterPowerPeak = readings.e.powerPeak;
		let measurePower = (readings.e.measurePower - readings.e.measurePowerProduced);
		let measurePowerAvg = this.meters.lastMeasurePowerAvg;
		const meterPowerTm = Date.now() / 1000; // readings.tm;
		// constructed electricity readings
		const meterPower = (meterPowerOffpeak + meterPowerPeak) - (meterPowerOffpeakProduced + meterPowerPeakProduced);
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

		// trigger the custom trigger flowcards
		if ((this.lastMeters.offPeak !== null) && (offPeak !== this.lastMeters.offPeak)) {
			const tokens = { tariff: offPeak };
			this.homey.flow.getDeviceTriggerCard('tariff_changed')
				.trigger(this, tokens)
				.catch(this.error);
		}
		if ((this.lastMeters.meterPowerTm !== null) && (measurePower !== this.lastMeters.measurePower)) {
			const measurePowerDelta = (measurePower - this.lastMeters.measurePower);
			const tokens = {
				power: measurePower,
				power_delta: measurePowerDelta,
			};
			this.homey.flow.getDeviceTriggerCard('power_changed')
				.trigger(this, tokens)
				.catch(this.error);
		}

		// store the new readings in memory
		this.meters.lastMeasureGas = measureGas;
		this.meters.lastMeterGas = meterGas;
		// this.meters.lastMeterGasTm = meterGasTm || this.meters.lastMeterGasTm;
		this.meters.lastMeasurePower = measurePower;
		this.meters.lastMeasurePowerAvg = measurePowerAvg;
		this.meters.lastMeterPower = meterPower;
		this.meters.lastMeterPowerPeak = meterPowerPeak;
		this.meters.lastMeterPowerOffpeak = meterPowerOffpeak;
		this.meters.lastMeterPowerPeakProduced = meterPowerPeakProduced;
		this.meters.lastMeterPowerOffpeakProduced = meterPowerOffpeakProduced;
		this.meters.lastMeterPowerTm = meterPowerTm;
		this.meters.lastOffpeak = offPeak;
		// update the device state
		// this.log(this.meters);
		this.updateDeviceState();
	}

}

module.exports = EnelogicDevice;
