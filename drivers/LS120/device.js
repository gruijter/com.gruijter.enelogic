/* eslint-disable no-await-in-loop */
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

			// check for version migration or capability change
			if (!this.migrated) await this.migrate();

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

	// Capability change or version migration before v4.3.0
	async migrate() {
		try {
			this.log(`checking migration for ${this.getName()}`);
			await setTimeoutPromise(5 * 1000); // wait a bit for Homey to settle
			const settings = this.getSettings();
			const p1Status = await this.youless.getP1Status().catch(this.error);
			// check and repair incorrect capability(order)
			const correctCaps = [];
			if (settings.include_gas) {
				correctCaps.push('measure_gas');
			}
			if (settings.include_off_peak) {
				correctCaps.push('meter_offPeak');
			}
			correctCaps.push('measure_power');	// always include measure_power
			if (p1Status && (p1Status.ver >= 40 || p1Status.l1)) { //  has current and power per phase
				correctCaps.push('measure_power.l1');
				if (settings.include3phase) {
					correctCaps.push('measure_power.l2');
					correctCaps.push('measure_power.l3');
				}
				correctCaps.push('measure_current.l1');
				if (settings.include3phase) {
					correctCaps.push('measure_current.l2');
					correctCaps.push('measure_current.l3');
				}
			}
			if (p1Status && (p1Status.ver >= 50 || p1Status.v1)) { // has voltage per phase
				correctCaps.push('measure_voltage.l1');
				if (settings.include3phase) {
					correctCaps.push('measure_voltage.l2');
					correctCaps.push('measure_voltage.l3');
				}
			}
			if (settings.include_off_peak) {
				correctCaps.push('meter_power.peak');
				correctCaps.push('meter_power.offPeak');
			}
			if (settings.include_production) {
				correctCaps.push('meter_power.producedPeak');
			}
			if (settings.include_production && settings.include_off_peak) {
				correctCaps.push('meter_power.producedOffPeak');
			}
			correctCaps.push('meter_power');	// always include meter_power
			if (settings.include_gas) {
				correctCaps.push('meter_gas');
			}

			// set selected capabilities in correct order
			for (let index = 0; index < correctCaps.length; index += 1) {
				const caps = await this.getCapabilities();
				const newCap = correctCaps[index];
				if (caps[index] !== newCap) {
					// remove all caps from here
					for (let i = index; i < caps.length; i += 1) {
						this.log(`removing capability ${caps[i]} for ${this.getName()}`);
						await this.removeCapability(caps[i])
							.catch((error) => this.log(error));
						await setTimeoutPromise(2 * 1000); // wait a bit for Homey to settle
					}
					// add the new cap
					this.log(`adding capability ${newCap} for ${this.getName()}`);
					await this.addCapability(newCap);
					await setTimeoutPromise(2 * 1000); // wait a bit for Homey to settle
				}
			}
			// set new migrate level
			this.setSettings({ level: this.homey.app.manifest.version });
			this.migrated = true;
			return Promise.resolve(this.migrated);
		} catch (error) {
			this.error('Migration failed', error);
			return Promise.reject(error);
		}
	}

	// this method is called when the user has changed the device's settings in Homey.
	async onSettings({ newSettings }) {
		this.log(`${this.getName()} device settings changed`);
		this.log(newSettings);
		this.migrated = false;
		this.restartDevice(2000);
		return Promise.resolve(true);
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
			if (!this.youless.loggedIn) await this.youless.login();
			const readings = await this.youless.getAdvancedStatus();
			if (!this.youless.hasMeter.p1 && !this.youless.hasMeter.gas) throw Error('No connection with Smart Meter');
			if (this.getSettings().filterReadings && !this.isValidReading(readings)) {
				this.watchDogCounter -= 1;
				return;
			}
			let p1Status = {};
			if (this.hasCapability('measure_power.l1')) {
				p1Status = await this.youless.getP1Status().catch(this.error);
			}
			readings.p1Status = p1Status || {};
			this.setAvailable();
			await this.handleNewReadings(readings);
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
			p1Status: {},							// 3 phase info DSMR ^4
		};
	}

	async setCapability(capability, value) {
		if (this.hasCapability(capability)) {
			await this.setCapabilityValue(capability, value)
				.catch((error) => {
					this.log(error, capability, value);
				});
		}
	}

	async updateDeviceState(meters) {
		// this.log(`updating states for: ${this.getName()}`);
		try {
			await this.setCapability('meter_offPeak', meters.offPeak);
			await this.setCapability('measure_power', meters.measurePower);
			await this.setCapability('measure_gas', meters.measureGas);
			await this.setCapability('meter_power', meters.meterPower);
			await this.setCapability('meter_gas', meters.meterGas);
			await this.setCapability('meter_power.peak', meters.meterPowerPeak);
			await this.setCapability('meter_power.offPeak', meters.meterPowerOffPeak);
			await this.setCapability('meter_power.producedPeak', meters.meterPowerPeakProduced);
			await this.setCapability('meter_power.producedOffPeak', meters.meterPowerOffPeakProduced);
			await this.setCapability('measure_power.l1', meters.p1Status.l1);
			await this.setCapability('measure_power.l2', meters.p1Status.l2);
			await this.setCapability('measure_power.l3', meters.p1Status.l3);
			await this.setCapability('measure_current.l1', meters.p1Status.i1);
			await this.setCapability('measure_current.l2', meters.p1Status.i2);
			await this.setCapability('measure_current.l3', meters.p1Status.i3);
			await this.setCapability('measure_voltage.l1', meters.p1Status.v1);
			await this.setCapability('measure_voltage.l2', meters.p1Status.v2);
			await this.setCapability('measure_voltage.l3', meters.p1Status.v3);
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
		if (this.lastMeters.meterPowerIntervalTm === null) { // first reading after init
			return validReading;	// We have to assume that the first reading after init is a valid reading :(
		}
		// check if gas readings make sense
		const meterGas = readings.gas;
		if (meterGas < this.lastMeters.meterGas) {
			this.log('negative gas usage');
			validReading = false;
		}
		if (meterGas - this.lastMeters.meterGas > 40) {
			this.log('unrealistic high gas usage > G25');
			validReading = false;
		}
		// check if timestamps make sense
		const { tm, gtm } = readings; // power meter timestamp, gas meter timestamp
		if (tm - this.lastMeters.meterPowerIntervalTm < 0) {
			this.log('power time is negative');
			validReading = false;
		}
		if (gtm - this.lastMeters.meterGasTm < 0) {
			this.log('gas time is negative');
			validReading = false;
		}
		if ((gtm !== 0) && (Math.abs(gtm - tm) > 45000)) {	// > 12 hrs difference
			this.log('gas and power time differ too much');
			validReading = false;
		}
		// check if power readings make sense
		if (Math.abs(readings.pwr) > 56000) {
			this.log('unrealistic high power >3x80A');
			validReading = false;
		}
		const {
			net, p1, p2, n1, n2,
		} = readings;
		if (Math.abs(net - ((p1 + p2) - (n1 + n2))) > 0.1) {
			this.log('power meters do not add up');
			validReading = false;
		}
		const timeDelta = tm - this.lastMeters.meterPowerIntervalTm; // in seconds
		if (Math.abs(net - this.lastMeters.meterPower) / (timeDelta / 60 / 60) > 56) {
			this.log('unrealistic high power meter delta >3x80A / 56KWh');
			validReading = false;
		}
		if (!validReading) {
			// this.log(this.lastMeters);
			this.log(readings);
		}
		return validReading;
	}

	async handleNewReadings(readings) {
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
				p1Status: readings.p1Status,
			};
			// update the device state
			await this.updateDeviceState(meters);

			// execute flow triggers
			if (tariffChanged) {
				this.log('Tariff changed. offPeak:', offPeak);
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
