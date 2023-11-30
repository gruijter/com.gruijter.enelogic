/*
Copyright 2017 - 2023, Robin de Gruijter (gruijter@hotmail.com)

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

class LS120Device extends Device {

	// this method is called when the Device is inited
	async onInit() {
		this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this.restarting = false;
			this.watchDogCounter = 10;
			const settings = this.getSettings();
			this.initMeters();

			// create session
			const options = {
				password: settings.password,
				host: settings.youLessIp,
				port: settings.port,
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
		// this.setUnavailable('Device is restarting. Wait a few minutes!').catch(this.error);
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
		try {
			const options = {
				password: newSettings.password,
				host: newSettings.youLessIp,
				port: newSettings.port,
				timeout: (newSettings.pollingInterval * 900),
			};
			await this.youless.login(options);
			// set the new power meter in the youless device
			this.youless.setS0Counter(newSettings.set_meter_s0)
				.catch(this.error);
			if (newSettings.homey_energy_type === 'solarpanel') {
				this.setEnergy({ cumulative: false }).catch(this.error);
				this.setClass('solarpanel').catch(this.error);
			} else if (newSettings.homey_energy_type === 'cumulative') {
				this.setEnergy({ cumulative: true }).catch(this.error);
				this.setClass('sensor').catch(this.error);
			} else {
				this.setEnergy({ cumulative: false }).catch(this.error);
				this.setClass('sensor').catch(this.error);
			}
			this.restartDevice(1000).catch(this.error);
			return Promise.resolve(true);
		} catch (error) {
			this.error(error.message);
			return Promise.reject(error);
		}
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
			// get new readings and update the devicestate
			if (!this.youless.loggedIn) {
				await this.youless.login()
					.catch((error) => {
						this.setUnavailable(error).catch(this.error);
						// throw Error('Failed to login');
					});
			}
			if (!this.youless.loggedIn) { return; }
			const readings = await this.youless.getAdvancedStatus();
			this.setAvailable().catch(this.error);
			this.handleNewReadings(readings);
			this.watchDogCounter = 10;
		} catch (error) {
			this.setUnavailable(error.message).catch(this.error);
			this.watchDogCounter -= 1;
			this.error('Poll error', error.message);
		}
	}

	initMeters() {
		this.lastMeters = {
			measureWater: 0,
			measureWaterTm: 0,
			measureWaterTmHomey: 0,
			meterWater: null,
			measurePower: 0,						// 'measurePower' (W)
			meterPower: null,						// 'meterPower' (kWh)
			meterPowerTm: null, 					// timestamp epoch, e.g. 1514394325
			measureGas: 0,						// 'measurePower' (W)
			meterGas: null,						// 'meterPower' (kWh)
			meterGasTm: null, 					// timestamp epoch, e.g. 1514394325
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
			this.setCapability('measure_water', meters.measureWater);
			this.setCapability('meter_water', meters.meterWater);
			this.setCapability('measure_gas', meters.measureGas);
			this.setCapability('meter_gas', meters.meterGas);
			// update meter in device settings
			const settings = this.getSettings();
			const meter = Math.round((meters.meterPower || meters.meterWater || meters.meterGas || null) * 10000) / 10000;
			if (meter !== settings.set_meter_s0) {
				this.setSettings({ set_meter_s0: meter }).catch(this.error);
			}
			// update the device info
			// const deviceInfo = this.youless.info;
			// const settings = this.getSettings();
			// Object.keys(deviceInfo).forEach((key) => {
			// 	if (settings[key] !== deviceInfo[key].toString()) {
			// 		this.log(`device information has changed. ${key}: ${deviceInfo[key].toString()}`);
			// 		this.setSettings({ [key]: deviceInfo[key].toString() })
			// 			.catch(this.error);
			// 	}
			// });
			// reset watchdog
		} catch (error) {
			this.error(error);
		}
	}

	handleNewPowerReadings(readings) {
		try {
			// console.log(`handling new readings for ${this.getName()}`);
			// electricity readings from device
			const meterPower = readings.cs0;
			const measurePower = readings.ps0;
			const meterPowerTm = readings.ts0;

			// setup custom trigger flowcards
			const powerChanged = measurePower !== this.lastMeters.measurePower;

			// update the ledring screensavers
			if (measurePower !== this.lastMeters.measurePower) this.driver.ledring.change(this.getSettings(), measurePower);

			// store the new readings in memory
			const meters = {
				measurePower,
				meterPower,
				meterPowerTm,
			};
			// update the device state
			this.updateDeviceState(meters);

			// execute flow triggers
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
		}	catch (error) {
			this.error(error);
		}

	}

	handleNewWaterReadings(readings) {
		try {
			// this.log(`handling new readings for ${this.getName()}`, readings);
			// water readings from device
			const meterWater = readings.cs0;
			const measureWaterTm = readings.ts0; // readings.tm ,only changes on a new pulse
			let measureWater = Math.round(readings.ps0 / 6) / 10; // readings.ps0 (in liter / hr) to liter / min

			// recalculate measureWater for flow start and stop situations
			let { measureWaterTmHomey } = this.lastMeters; // Homey time on last pulse

			// new pulse received or device init
			const timePast = this.lastMeters.measureWaterTm && (measureWaterTm - this.lastMeters.measureWaterTm); // booleanish
			if (timePast) measureWaterTmHomey = Date.now();	// renew the homey time on last pulse

			// water flow just started, set flow to 2 l/min when not in device init
			if (!measureWater && timePast) measureWater = 2;

			// keep old flow after water flow just started
			if (!measureWater && !timePast) measureWater = this.lastMeters.measureWater;

			// long time no pulse, water flow probably stopped
			const timeout = (120 / (measureWater || 1)); // 2 min timeout @ 1 liter per minute, 2 min when flow=0
			if (!timePast && ((Date.now() - measureWaterTmHomey) > (timeout * 1000))) measureWater = 0;

			// update the ledring screensavers
			if (measureWater !== this.lastMeters.measureWater) this.driver.ledring.change(this.getSettings(), measureWater);

			// store the new readings in memory
			const meters = {
				meterWater,
				measureWater,
				measureWaterTm,
				measureWaterTmHomey,
			};
			// update the device state
			this.updateDeviceState(meters);

			// trigger the custom trigger flowcards
			if (measureWater !== this.lastMeters.measureWater) {
				const tokens = {
					flow: measureWater,
				};
				this.homey.app.triggerMeasureWaterChanged(this, tokens, {});
			}

			// console.log(meters);
			this.lastMeters = meters;
		}	catch (error) {
			this.error(error);
		}
	}

	handleNewGasReadings(readings) {
		try {
			// console.log(`handling new readings for ${this.getName()}`);
			// gas readings from device
			const meterGas = readings.cs0;
			const measureGas = Math.round(readings.ps0 / 100) / 10;
			const meterGasTm = readings.ts0;

			// setup custom trigger flowcards
			const gasChanged = measureGas !== this.lastMeters.measureGas;

			// update the ledring screensavers
			if (gasChanged) this.driver.ledring.change(this.getSettings(), measureGas);

			// store the new readings in memory
			const meters = {
				measureGas,
				meterGas,
				meterGasTm,
			};
			// update the device state
			this.updateDeviceState(meters);

			// console.log(meters);
			this.lastMeters = meters;
		}	catch (error) {
			this.error(error);
		}

	}

	handleNewReadings(readings) {
		if (this.hasCapability('meter_power')) {
			this.handleNewPowerReadings(readings);
		}
		if (this.hasCapability('meter_water')) {
			this.handleNewWaterReadings(readings);
		}
		if (this.hasCapability('meter_gas')) {
			this.handleNewGasReadings(readings);
		}
	}

	async reboot(source) {
		this.log(`Rebooting ${this.getName()} via ${source}`);
		await this.youless.reboot();
		this.setUnavailable('rebooting now').catch(this.error);
	}

}

module.exports = LS120Device;
