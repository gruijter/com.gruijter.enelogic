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

class LS120Device extends Homey.Device {

	// this method is called when the Device is inited
	async onInit() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this._driver = this.getDriver();
			this._ledring = this._driver.ledring;
			this.isValidReading = this._driver.isValidReading.bind(this);
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
			// register trigger flow cards of custom capabilities
			this.tariffChangedTrigger = new Homey.FlowCardTriggerDevice('tariff_changed')
				.register();
			this.powerChangedTrigger = new Homey.FlowCardTriggerDevice('power_changed_LS120')
				.register();
			// register condition flow cards
			const offPeakCondition = new Homey.FlowCardCondition('offPeakLS120');
			offPeakCondition.register()
				.registerRunListener(() => Promise.resolve(this.meters.lastOffpeak));
			// register action flow cards
			const reboot = new Homey.FlowCardAction('reboot_LS120');
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
							this.error(`rebooting failed ${error}`);
							callback(error);
						});
				});
			// start polling device for info
			this.intervalIdDevicePoll = setInterval(() => {
				this.doPoll();
			}, 1000 * settings.pollingInterval);
		} catch (error) {
			this.error(error);
		}
	}

	// this method is called when the Device is added
	onAdded() {
		this.log(`LS120P1 added as device: ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		// stop polling
		clearInterval(this.intervalIdDevicePoll);
		this.log(`LS120P1 deleted as device: ${this.getName()}`);
	}

	onRenamed(name) {
		this.log(`LS120P1 renamed to: ${name}`);
	}

	// this method is called when the user has changed the device's settings in Homey.
	async onSettings(oldSettingsObj, newSettingsObj, changedKeysArr) {
		this.log(`${this.getData().id} ${this.getName()} device settings changed`);
		await changedKeysArr.forEach(async (key) => {
			switch (key) {
				case 'include_off_peak':
					if (newSettingsObj.include_off_peak) {
						await this.addCapability('meter_offPeak');
						await this.addCapability('meter_power.peak');
						await this.addCapability('meter_power.offPeak');
					} else {
						await this.removeCapability('meter_offPeak');
						await this.removeCapability('meter_power.peak');
						await this.removeCapability('meter_power.offPeak');
					}
					break;
				case 'include_production':
					if (newSettingsObj.include_production) {
						await this.addCapability('meter_power.producedPeak');
						if (newSettingsObj.include_off_peak) {
							await this.addCapability('meter_power.producedOffPeak');
						}
					} else {
						await this.removeCapability('meter_power.producedPeak');
						await this.removeCapability('meter_power.producedOffPeak');
					}
					break;
				case 'include_gas':
					if (newSettingsObj.include_gas) {
						await this.addCapability('measure_gas');
						await this.addCapability('meter_gas');
					} else {
						await this.removeCapability('measure_gas');
						await this.removeCapability('meter_gas');
					}
					break;
				default:
					break;
			}
		});
		this.log(newSettingsObj);
		this.settings = newSettingsObj;
		Promise.resolve(true);
		this.restartDevice(1000);
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
					// this.log('skipping poll');
					return;
				}
			}
			// get new readings and update the devicestate
			if (!this.youless.loggedIn) {
				await this.youless.login()
					.catch(() => {
						// this.setUnavailable(error)
						// 	.catch(this.error);
						throw Error('Failed to login');
					});
			}
			// if (!this.youless.loggedIn) { return; }
			const readings = await this.youless.getAdvancedStatus();
			this.setAvailable();
			if (this.getSettings().filterReadings && !this.isValidReading(readings)) {
				this.watchDogCounter -= 1;
				return;
			}
			this.handleNewReadings(readings);
			this.watchDogCounter = 10;
		} catch (error) {
			this.setUnavailable(error.message);
			this.watchDogCounter -= 1;
			this.error('Poll error', error.message);
		}
	}

	restartDevice(delay) {
		// stop polling the device, then start init after short delay
		clearInterval(this.intervalIdDevicePoll);
		setTimeout(() => {
			this.onInit();
		}, delay || 10000);
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
			this.setCapability('measure_power', this.meters.lastMeasurePower);
			this.setCapability('meter_power', this.meters.lastMeterPower);
			this.setCapability('measure_gas', this.meters.lastMeasureGas);
			this.setCapability('meter_gas', this.meters.lastMeterGas);
			this.setCapability('meter_power.peak', this.meters.lastMeterPowerPeak);
			this.setCapability('meter_offPeak', this.meters.lastOffpeak);
			this.setCapability('meter_power.offPeak', this.meters.lastMeterPowerOffpeak);
			this.setCapability('meter_power.producedPeak', this.meters.lastMeterPowerPeakProduced);
			this.setCapability('meter_power.producedOffPeak', this.meters.lastMeterPowerOffpeakProduced);
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
			this.watchDogCounter = 10;
		} catch (error) {
			this.error(error);
		}
	}

}

module.exports = LS120Device;
