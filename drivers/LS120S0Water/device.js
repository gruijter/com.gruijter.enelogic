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

class LS120S0WaterDevice extends Homey.Device {

	// this method is called when the Device is inited
	async onInit() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this._driver = this.getDriver();
			this._ledring = Homey.app.ledring;
			this.handleNewReadings = this._driver.handleNewReadings.bind(this);
			this.watchDogCounter = 10;
			const settings = this.getSettings();
			this.meters = {};
			this.initMeters();
			// create youless session
			this.youless = new this._driver.Youless(settings.password, settings.youLessIp);
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
			// this.log(this.youless);
			
			// register action flow cards
			const reboot = new Homey.FlowCardAction('reboot_LS120S0Water');
			reboot.register()
				.on('run', (args, state, callback) => {
					this.log('reboot of device requested by action flow card');
					this.youless.reboot()
						.then(() => {
							this.log('rebooting now');
							this.setUnavailable('rebooting now')
								.catch(this.error);
							callback(null, true);
						})
						.catch((error) => {
							this.log(`rebooting failed ${error}`);
							callback(error);
						});
				});
			// start polling device for info
			this.intervalIdDevicePoll = setInterval(async () => {
				try {
					if (this.watchDogCounter <= 0) {
						// restart the app here
						this.log('watchdog triggered, restarting app now');
						this.restartDevice();
					}
					// get new readings and update the devicestate
					await this.doPoll();
					this.watchDogCounter = 10;
				} catch (error) {
					this.watchDogCounter -= 1;
					this.log('intervalIdDevicePoll error', error);
				}
			}, 1000 * settings.pollingInterval);
		} catch (error) {
			this.error(error);
		}
	}

	// this method is called when the Device is added
	onAdded() {
		this.log(`LS120S0Water added as device: ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		// stop polling
		clearInterval(this.intervalIdDevicePoll);
		this.log(`LS120S0Water deleted as device: ${this.getName()}`);
	}

	onRenamed(name) {
		this.log(`LS120S0Water renamed to: ${name}`);
	}

	// this method is called when the user has changed the device's settings in Homey.
	onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
		this.log('settings change requested by user');
		this.log(newSettingsObj);
		this.youless.login(newSettingsObj.password, newSettingsObj.youLessIp) // password, [host], [port]
			.then(() => {		// new settings are correct
				this.log(`${this.getName()} device settings changed`);
				// set the new power meter in the youless device
				this.youless.setS0Counter(newSettingsObj.set_meter_s0)
					.catch(this.error);
				// do callback to confirm settings change
				callback(null, true);
				this.restartDevice();
			})
			.catch((error) => {		// new settings are incorrect
				this.error(error.message);
				return callback(error, null);
			});
	}

	async doPoll() {
		// this.log('polling for new readings');
		try {
			if (!this.youless.loggedIn) {
				await this.youless.login()
					.catch((error) => {
						this.setUnavailable(error)
							.catch(this.error);
						// throw Error('Failed to login');
					});
			}
			if (!this.youless.loggedIn) { return; }
			const readings = await this.youless.getAdvancedStatus();
			this.setAvailable();
			this.handleNewReadings(readings);
		} catch (error) {
			this.watchDogCounter -= 1;
			this.error(`poll error: ${error}`);
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
			lastMeterWater: 0,
			lastMeasureWater: 0,
		};
	}

	updateDeviceState() {
		// this.log(`updating states for: ${this.getName()}`);
		try {
			this.setCapabilityValue('measure_water', this.meters.lastMeasureWater);
			this.setCapabilityValue('meter_water', this.meters.lastMeterWater);
			this.watchDogCounter = 10;
		} catch (error) {
			this.error(error);
		}
	}

}

module.exports = LS120S0WaterDevice;
