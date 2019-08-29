/*
Copyright 2017 - 2019, Robin de Gruijter (gruijter@hotmail.com)

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

class EnelogicDevice extends Homey.Device {

	// this method is called when the Device is inited
	async onInit() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this._driver = this.getDriver();
			this._ledring = this._driver.ledring;
			this.handleNewReadings = this._driver.handleNewReadings.bind(this);
			this.watchDogCounter = 10;
			const settings = this.getSettings();
			this.meters = {};
			this.initMeters();
			// create youless session
			this.enelogic = new this._driver.Enelogic(settings.enelogicIp);
			// register trigger flow cards of custom capabilities
			this.tariffChangedTrigger = new Homey.FlowCardTriggerDevice('tariff_changed')
				.register();
			this.powerChangedTrigger = new Homey.FlowCardTriggerDevice('power_changed')
				.register();
			// register condition flow cards
			const offPeakCondition = new Homey.FlowCardCondition('offPeak');
			offPeakCondition.register()
				.registerRunListener(() => Promise.resolve(this.meters.lastOffpeak));
			// start polling device for info
			this.intervalIdDevicePoll = setInterval(() => {
				try {
					if (this.watchDogCounter <= 0) {
						// restart the app here
						this.log('watchdog triggered, restarting app now');
						this.restartDevice();
					}
					// get new readings and update the devicestate
					this.doPoll();
				} catch (error) {
					this.watchDogCounter -= 1;
					this.error('intervalIdDevicePoll error', error);
				}
			}, 1000 * settings.pollingInterval);
		} catch (error) {
			this.error(error);
		}
	}

	// this method is called when the Device is added
	onAdded() {
		this.log(`Enelogic added as device: ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		// stop polling
		clearInterval(this.intervalIdDevicePoll);
		this.log(`Enelogic deleted as device: ${this.getName()}`);
	}

	onRenamed(name) {
		this.log(`Enelogic renamed to: ${name}`);
	}

	// this method is called when the user has changed the device's settings in Homey.
	onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
		this.log('settings change requested by user');
		this.log(newSettingsObj);
		this.enelogic.getEMeter(newSettingsObj.enelogicIp)
			.then(() => {		// new settings are correct
				this.log(`${this.getName()} device settings changed`);
				// do callback to confirm settings change
				callback(null, true);
				this.restartDevice();
			})
			.catch((error) => {		// new settings are incorrect
				this.error(error.message);
				this.enelogic.getEMeter(oldSettingsObj.enelogicIp);
				return callback(error);
			});
	}

	async doPoll() {
		// this.log('polling for new readings');
		try {
			const readings = {};
			readings.e = await this.enelogic.getEMeter();
			readings.g = await this.enelogic.getGMeter()
				.catch(() => {
					// ignore if no gasmeter present
				});
			this.setAvailable();
			this.handleNewReadings(readings);
		} catch (error) {
			this.watchDogCounter -= 1;
			this.error(`poll error: ${error}`);
			this.setUnavailable(error)
				.catch(this.error);
		}
	}

	restartDevice() {
		// stop polling the device, then start init after short delay
		clearInterval(this.intervalIdDevicePoll);
		setTimeout(() => {
			this.onInit();
		}, 10000);
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

}

module.exports = EnelogicDevice;
