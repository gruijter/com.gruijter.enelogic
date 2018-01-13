'use strict';

const Homey = require('homey');

class LS110WaterDevice extends Homey.Device {

	// this method is called when the Device is inited
	async onInit() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this._driver = this.getDriver();
			this.handleNewReadings = this._driver.handleNewReadings.bind(this);
			this.pulseReceived = this._driver.pulseReceived.bind(this);
			this.logRaw = this._driver.logRaw.bind(this);
			this.calculateFlow = this._driver.calculateFlow.bind(this);
			this.watchDogCounter = 10;
			this.settings = this.getSettings();
			// migrate from sdk1 version app
			if (!this.settings.hasOwnProperty('password')) {
				this.log('Whoohoo, migrating from v1 now :)');
				this.settings.password = '';
				this.setSettings(this.settings)
					.catch(this.error);
			}
			this.meters = {};
			this.burstMode = true;
			this.initMeters();
			// create youless session
			this.youless = new this._driver.Youless(this.settings.password, this.settings.youLessIp);
			// sync time in youless
			await this.youless.syncTime();
			// this.log(this.youless);
			// register trigger flow cards of custom capabilities
			this.measureWaterChangedTrigger = new Homey.FlowCardTriggerDevice('measure_water_changed')
				.register();
			// register action flow cards
			const reboot = new Homey.FlowCardAction('reboot_LS110Water');
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
					this.log('intervalIdDevicePoll error', error);
				}
			}, this.settings.pollingInterval);
		} catch (error) {
			this.log(error);
		}
	}

	// this method is called when the Device is added
	onAdded() {
		this.log(`LS110 added as device: ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		// stop polling
		clearInterval(this.intervalIdDevicePoll);
		this.log(`LS110 deleted as device: ${this.getName()}`);
	}

	onRenamed(name) {
		this.log(`LS110 renamed to: ${name}`);
	}

	// this method is called when the user has changed the device's settings in Homey.
	onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
		this.log('settings change requested by user');
		this.log(newSettingsObj);
		this.youless.login(newSettingsObj.password, newSettingsObj.youLessIp) // password, [host], [port]
			.then(() => {		// new settings are correct
				this.log(`${this.getName()} device settings changed`);
				// do callback to confirm settings change
				callback(null, true);
				this.restartDevice();
			})
			.catch((error) => {		// new settings are incorrect
				this.log(error.message);
				return callback(error, null);
			});
	}

	async doPoll() {
		// this.log('polling for new readings');
		let pollOnce = false;
		if ((Date.now() - this.meters.lastSlowPollTm) > 2000) {
			// this.log('polling in slow mode');
			pollOnce = true;
			this.meters.lastSlowPollTm = Date.now();
		}
		if (!this.burstMode && !pollOnce) { return; }	// skip polling if not in burst or poll once mode
		let err;
		if (!this.youless.loggedIn) {
			await this.youless.login()
				.catch((error) => {
					this.log(`login error: ${error}`);
					err = new Error(`Login error: ${error}`);
				});
		}
		if (err) {
			this.setUnavailable(err)
				.catch(this.error);
			return;
		}
		await this.youless.getBasicStatus()
			.then((readings) => {
				this.setAvailable();
				// this.log(readings);
				this.handleNewReadings(readings);
			})
			.catch((error) => {
				this.log(`poll error: ${error}`);
				this.setUnavailable(error)
					.catch(this.error);
			});
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

	updateDeviceState() {
		// this.log(`updating states for: ${this.getName()}`);
		try {
			this.setCapabilityValue('measure_water', this.meters.lastMeasureWater);
			this.setCapabilityValue('meter_water', this.meters.lastMeterWater);
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
			this.log(error);
		}
	}

}

module.exports = LS110WaterDevice;
