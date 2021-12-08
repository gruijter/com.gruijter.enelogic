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

class LS120Device extends Device {

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
				reversed: settings.reversed,
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
	async onSettings({ newSettings, changedKeys }) {
		this.log(`${this.getName()} device settings changed`);
		this.log(newSettings);
		try {
			await changedKeys.forEach(async (key) => {
				switch (key) {
					case 'include_off_peak':
						if (newSettings.include_off_peak) {
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
						if (newSettings.include_production) {
							await this.addCapability('meter_power.producedPeak');
							if (newSettings.include_off_peak) {
								await this.addCapability('meter_power.producedOffPeak');
							}
						} else {
							await this.removeCapability('meter_power.producedPeak');
							await this.removeCapability('meter_power.producedOffPeak');
						}
						break;
					case 'include_gas':
						if (newSettings.include_gas) {
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
			const readings = await this.youless.getAdvancedStatus();
			if (this.getSettings().filterReadings && !this.isValidReading(readings)) {
				this.watchDogCounter -= 1;
				return;
			}
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

	isValidReading(readings) {
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
		const { tm, gtm } = readings; // power meter timestamp, gas meter timestamp
		if (tm - this.meters.lastMeterPowerTm < 0) {
			this.log('power time is negative');
			validReading = false;
		}
		if (gtm - this.meters.lastMeterGasTm < 0) {
			this.log('gas time is negative');
			validReading = false;
		}
		if ((gtm !== 0) && (Math.abs(gtm - tm) > 45000)) {	// > 12 hrs difference
			this.log('gas and power time differ too much');
			validReading = false;
		}
		// check if power readings make sense
		if (Math.abs(readings.pwr) > 56000) {
			this.log('unrealistic high power >3X80A');
			validReading = false;
		}
		const {
			net, p1, p2, n1, n2,
		} = readings;
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

	handleNewReadings(readings) {
		try {
			// this.log(`handling new readings for ${this.getName()}`);
			// gas readings from device
			const meterGas = readings.gas; // gas_cumulative_meter
			const meterGasTm = readings.gtm; // gas_meter_timestamp
			let { measureGas } = this.lastMeters;

			// constructed gas readings
			const meterGasTmChanged = (meterGasTm !== this.lastMeters.meterGasTm) && (this.lastMeters.meterGasTm !== 0);
			if (meterGasTmChanged) {
				const passedHours = (meterGasTm - this.lastMeters.meterGasTm) / 3600;	// timestamp is in seconds
				measureGas = Math.round(1000 * ((meterGas - this.lastMeters.meterGas) / passedHours)) / 1000; // gas_interval_meter
			}
			// electricity readings from device
			const meterPowerOffPeakProduced = readings.n1;
			const meterPowerPeakProduced = readings.n2;
			const meterPowerOffPeak = readings.p1;
			const meterPowerPeak = readings.p2;
			const meterPower = readings.net;
			let measurePower = readings.pwr;
			let { measurePowerAvg } = this.lastMeters;
			const meterPowerTm = readings.tm;
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
			// console.log(meters);
			this.lastMeters = meters;
			this.watchDogCounter = 10;
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

module.exports = LS120Device;
