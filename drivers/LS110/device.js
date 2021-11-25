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

class LS110Device extends Device {

	// this method is called when the Device is inited
	async onInit() {
		this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this.restarting = false;
			this.watchDogCounter = 10;
			const settings = this.getSettings();
			this.meters = {};
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
		try {
			// set the new power meter in the youless device
			this.youless.setPowerCounter(newSettings.set_meter_power)
				.catch(this.error);
			if (newSettings.homey_energy_type === 'solarpanel') {
				this.setEnergy({ cumulative: false });
				this.setClass('solarpanel');
			} else if (newSettings.homey_energy_type === 'cumulative') {
				this.setEnergy({ cumulative: true });
				this.setClass('sensor');
			} else {
				this.setEnergy({ cumulative: false });
				this.setClass('sensor');
			}
			this.restartDevice(1000);
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
						this.setUnavailable(error)
							.catch(this.error);
						// throw Error('Failed to login');
					});
			}
			if (!this.youless.loggedIn) { return; }
			const readings = await this.youless.getBasicStatus();
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
			measurePower: 0,						// 'measurePower' (W)
			meterPower: null,						// 'meterPower' (kWh)
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
			// update meter in device settings
			const settings = this.getSettings();
			const meter = Math.round(meters.meterPower * 10000) / 10000;
			if (meter !== settings.set_meter_power) {
				this.setSettings({ set_meter_power: meter })
					.catch(this.error);
			}
		} catch (error) {
			this.error(error);
		}
	}

	handleNewReadings(readings) {
		try {
			// console.log(`handling new readings for ${this.getName()}`);
			// electricity readings from device
			const meterPower = readings.net;
			const measurePower = readings.pwr;

			const measurePowerDelta = (measurePower - this.lastMeters.measurePower);

			// trigger the custom trigger flowcards
			if (measurePower !== this.lastMeters.measurePower) {
				const tokens = {
					power: measurePower,
					power_delta: measurePowerDelta,
				};
				this.homey.flow.getDeviceTriggerCard('power_changed')
					.trigger(this, tokens)
					.catch(this.error);
			}

			// update the ledring screensavers
			if (measurePower !== this.lastMeters.measurePower) this.driver.ledring.change(this.getSettings(), measurePower);

			// store the new readings in memory
			const meters = {
				measurePower,
				meterPower,
			};
			// update the device state
			this.updateDeviceState(meters);
			// console.log(meters);
			this.lastMeters = meters;
		}	catch (error) {
			this.error(error);
		}

	}

	async reboot(source) {
		this.log(`Rebooting ${this.getName()} via ${source}`);
		await this.youless.reboot();
		this.setUnavailable('rebooting now');
	}

}

module.exports = LS110Device;
