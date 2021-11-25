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
const Youless = require('youless');
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

class LS110WaterDevice extends Device {

	// this method is called when the Device is inited
	async onInit() {
		this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this.restarting = false;
			this.watchDogCounter = 10;
			const settings = this.getSettings();
			this.meters = {};
			this.burstMode = true;
			this.initMeters();

			// create session
			const options = {
				password: settings.password,
				host: settings.youLessIp,
				timeout: (settings.pollingInterval * 900),
			};
			this.youless = new Youless(options);

			// sync time in youless
			this.youless.login()
				.then(() => {
					this.youless.syncTime()
						.catch((error) => {
							this.error(error.message);
						});
				})
				.catch((error) => {
					this.error(error.message);
				});

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
	async onSettings({ newSettings }) { // , oldSettings, changedKeys) {
		this.log(`${this.getName()} device settings changed`);
		this.log(newSettings);
		this.restartDevice(1000);
	}

	async doPoll() {
		// this.log('polling for new readings');
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
			let pollOnce = false;
			if ((Date.now() - this.meters.lastSlowPollTm) > 2000) {
				// this.log('polling in slow mode');
				pollOnce = true;
				this.meters.lastSlowPollTm = Date.now();
			}
			if (!this.burstMode && !pollOnce) { return; }	// skip polling if not in burst or poll once mode
			if (!this.youless.loggedIn) {
				await this.youless.login()
					.catch((error) => {
						this.setUnavailable(error)
							.catch(this.error);
						// throw Error('Failed to login');
					});
				if (!this.youless.loggedIn) { return; }
			}
			const readings = await this.youless.getBasicStatus()
				.catch((error) => {
					if (error.message.includes('Connection timeout')) {
						return;
					}
					this.setUnavailable(error)
						.catch(this.error);
					throw error;
				});
			if (!readings) { return; }
			this.setAvailable()
				.catch(this.error);
			this.handleNewReadings(readings);
			return;
		} catch (error) {
			this.setUnavailable(error.message);
			this.watchDogCounter -= 1;
			this.error('Poll error', error.message);
		}
	}

	initMeters() {
		this.meters = {
			lastMeterWater: this.settings.meter_water_offset, // meter_water (m3)
			lastMeasureWaterMeter: this.settings.meter_water_offset, // meterWater at lastMeasureWaterTm
			lastMeasureWater: 0, // flow (l/min)
			// lastMeterWaterTm: 0, // timestamp Youless time
			lastMeasureWaterTm: 0, // timestamp for average flow calculation Youless time
			lastSlowPollTm: 0, // timestamp Homey time
			lastOpticalSensorRaw: null, // reflectiveness
			optical_sensor_raw_min: this.settings.optical_sensor_raw_min,	// min reflectiveness
			optical_sensor_raw_max: this.settings.optical_sensor_raw_max,	// max reflectiveness
			// optical_sensor_pulse: this.settings.optical_sensor_pulse * 2, // number of pulses per m3, both rising and falling edge
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

	updateDeviceState() {
		// this.log(`updating states for: ${this.getName()}`);
		try {
			this.setCapability('measure_water', this.meters.lastMeasureWater);
			this.setCapability('meter_water', this.meters.lastMeterWater);
			// update meter in device settings
			const settings = this.getSettings();
			const meterWater = Math.round(this.meters.lastMeterWater * 10000) / 10000;
			if (meterWater !== settings.meter_water_offset) {
				this.setSettings({ meter_water_offset: meterWater })
					.catch(this.error);
			}
			// reset watchdog
			this.watchDogCounter = 10;
		} catch (error) {
			this.error(error);
		}
	}

	async logRaw(opticalSensorRaw) {
		try {
			let log = await this.homey.insights.getLog('optical_sensor_raw')
				.catch(() => null);
			if (!log) {
				const options = {
					label: { en: 'Raw optical data' },
					title: { en: 'Raw optical data' },
					type: 'number',
					units: { en: '' },
					decimals: 0,
					chart: 'stepLine',
				};
				log = await this.homey.insights.createLog('optical_sensor_raw', options);
			}
			log.createEntry(opticalSensorRaw);
		} catch (error) {
			this.log(error);
		}
	}

	calculateFlow(readings) {
		// Returns average flow in liters per minute.
		let flow = 0;
		const { tm } = readings;
		const lastTm = this.meters.lastMeasureWaterTm;
		if (lastTm !== 0) { // // skip after device init
			const timePast = tm - lastTm; // in seconds
			const usedWater = (this.meters.lastMeterWater - this.meters.lastMeasureWaterMeter) * 1000; // in liters
			flow = Math.round(((usedWater * 60) / timePast) * 10) / 10;
		}
		this.meters.lastMeasureWaterTm = tm;
		this.meters.lastMeasureWaterMeter = this.meters.lastMeterWater;
		return flow;
	}

	pulseReceived(readings) {
		// convert raw data to counting pulses. Returns pulse (true/false)
		const opticalSensorRaw = readings.raw;
		let pulse = false;
		// set thresholds on 40% and 60% of max deviation
		const opticalSensorRawThresholdMax = Math.round(this.meters.optical_sensor_raw_min
			+ ((this.meters.optical_sensor_raw_max - this.meters.optical_sensor_raw_min) * 0.6));
		const opticalSensorRawThresholdMin = Math.round(this.meters.optical_sensor_raw_min
			+ ((this.meters.optical_sensor_raw_max - this.meters.optical_sensor_raw_min) * 0.4));
		// pulse received on rising edge
		if ((opticalSensorRaw > opticalSensorRawThresholdMax)
			&& (this.meters.lastOpticalSensorRaw <= opticalSensorRawThresholdMax)) {
			pulse = true;
		}
		// pulse received on falling edge
		if ((opticalSensorRaw < opticalSensorRawThresholdMin)
			&& (this.meters.lastOpticalSensorRaw >= opticalSensorRawThresholdMin)) {
			pulse = true;
		}
		// calibrating the pulse limits
		if (this.settings.auto_calibrate) {
			const deltaMin = (this.meters.optical_sensor_raw_min - opticalSensorRaw);
			const deltaMax = (opticalSensorRaw - this.meters.optical_sensor_raw_max);
			if (deltaMin > 0) {
				this.meters.optical_sensor_raw_min = opticalSensorRaw;
				// update pulse limits in device settings
				if (Math.abs(opticalSensorRaw - this.settings.optical_sensor_raw_min) > 15) {
					const newSetting = Math.round((this.settings.optical_sensor_raw_min + opticalSensorRaw) / 2);
					this.log(`adapting min to ${newSetting}`);
					this.setSettings({ optical_sensor_raw_min: newSetting })
						.catch(this.error);
					this.settings.optical_sensor_raw_min = newSetting;
				}
			}
			if (deltaMax > 0) {
				this.meters.optical_sensor_raw_max = opticalSensorRaw;
				// update pulse limits in device settings
				if (Math.abs(opticalSensorRaw - this.settings.optical_sensor_raw_max) > 15) {
					const newSetting = Math.round((this.settings.optical_sensor_raw_max + opticalSensorRaw) / 2);
					this.log(`adapting max to ${newSetting}`);
					this.setSettings({ optical_sensor_raw_max: newSetting })
						.catch(this.error);
					this.settings.optical_sensor_raw_max = newSetting;
				}
			}
			// compensate for long term optical measurement shift
			if (pulse) {
				this.meters.optical_sensor_raw_min += 0.1;
				this.meters.optical_sensor_raw_max -= 0.1;
			}
		}
		return pulse;
	}

	handleNewReadings(readings) {	// call with device as this
		// this.log(`handling new readings for ${this.getName()}`);
		let meterWater = this.meters.lastMeterWater;
		let measureWater = this.meters.lastMeasureWater;
		const meterWaterTm = readings.tm;
		// if (meterWaterTm < this.meters.lastMeterWaterTm) {
		// 	this.log('reading is out of sync..');
		// }
		const { raw } = readings;
		if (this.meters.lastMeasureWaterTm === 0) {	// do after device init, and 'return'
			this.meters.lastMeasureWaterTm = meterWaterTm;
		} else {
			// log raw sensor data in insights
			if (this.settings.log_raw) { this.logRaw(raw); }
			if (Math.abs(raw - this.meters.lastOpticalSensorRaw) > 4) { // filter out small noise
				// update water meter if pulse received (and calibrate pulse limits)
				if (this.pulseReceived(readings)) {
					meterWater += (1 / (this.settings.optical_sensor_pulse * 2));
					this.meters.lastMeterWater = meterWater;
				}
				// start|end burst mode if water is|isn't flowing
				this.burstMode = true;
			} else { this.burstMode = false; }

			// update measureWater every 60 seconds
			if ((meterWaterTm - this.meters.lastMeasureWaterTm) >= 60) {
				measureWater = this.calculateFlow(readings);
				// trigger the custom trigger flowcards
				if (measureWater !== this.meters.lastMeasureWater) {
					const tokens = {
						flow: measureWater,
					};
					this.homey.flow.getDeviceTriggerCard('measure_water_changed')
						.trigger(this, tokens)
						.catch(this.error);
					// update the ledring screensavers
					this.driver.ledring.change(this.getSettings(), measureWater);
				}
			}
		}
		// store the new readings in memory
		this.meters.lastMeterWater = meterWater;
		this.meters.lastMeasureWater = measureWater;
		this.meters.lastOpticalSensorRaw = raw;
		this.updateDeviceState();
	}

	async reboot(source) {
		this.log(`Rebooting ${this.getName()} via ${source}`);
		await this.youless.reboot();
		this.setUnavailable('rebooting now');
	}
}

module.exports = LS110WaterDevice;
