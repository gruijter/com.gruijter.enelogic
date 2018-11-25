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
const Youless = require('youless');

class LS110WaterDriver extends Homey.Driver {

	onInit() {
		this.log('entering LS110Water driver');
		this.Youless = Youless;
	}

	onPair(socket) {
		socket.on('validate', async (data, callback) => {
			try {
				this.log('save button pressed in frontend');
				const password = data.password;
				const host = data.youLessIp;
				const youless = new this.Youless(password, host);	// password, host, [port]
				await youless.login();
				const info = await youless.getInfo();
				callback(null, JSON.stringify(info)); // report success to frontend
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					callback(Error('Incorrect IP address'));
				}
				callback(error);
			}
		});
	}

	logRaw(opticalSensorRaw) {
		Homey.ManagerInsights.getLog('optical_sensor_raw')
			.then((log) => {
				log.createEntry(opticalSensorRaw)
					.catch(this.error);
			})
			.catch((error) => {
				if (error.message === 'invalid_log') {
					const options = {
						label: { en: 'raw optical data' },
						type: 'number',
						units: { en: '' },
						decimals: 0,
						chart: 'stepLine',
					};
					Homey.ManagerInsights.createLog('optical_sensor_raw', options)
						.then(() => {
							this.logRaw(opticalSensorRaw);
						})
						.catch(this.error);
				} else { this.error(error); }
			});
	}

	calculateFlow(readings) {
		// Returns average flow in liters per minute.
		let flow = 0;
		const tm = readings.tm;
		const lastTm = this.meters.lastMeasureWaterTm;
		if (lastTm !== 0) { // // skip after device init
			const timePast = tm - lastTm; // in seconds
			const usedWater = (this.meters.lastMeterWater - this.meters.lastMeasureWaterMeter) * 1000; // in liters
			flow = Math.round(((usedWater * 60) / timePast) * 10) / 10;
		}
		this.meters.lastMeasureWater = flow;
		this.meters.lastMeasureWaterTm = tm;
		this.meters.lastMeasureWaterMeter = this.meters.lastMeterWater;
		return flow;
	}

	pulseReceived(readings) {
		// convert raw data to counting pulses. Returns pulse (true/false)
		const opticalSensorRaw = readings.raw;
		let pulse = false;
		// set thresholds on 40% and 60% of max deviation
		const opticalSensorRawThresholdMax = Math.round(this.meters.optical_sensor_raw_min +
			((this.meters.optical_sensor_raw_max - this.meters.optical_sensor_raw_min) * 0.6));
		const opticalSensorRawThresholdMin = Math.round(this.meters.optical_sensor_raw_min +
			((this.meters.optical_sensor_raw_max - this.meters.optical_sensor_raw_min) * 0.4));
		// pulse received on rising edge
		if ((opticalSensorRaw > opticalSensorRawThresholdMax) &&
				(this.meters.lastOpticalSensorRaw <= opticalSensorRawThresholdMax)) {
			pulse = true;
		}
		// pulse received on falling edge
		if ((opticalSensorRaw < opticalSensorRawThresholdMin) &&
				(this.meters.lastOpticalSensorRaw >= opticalSensorRawThresholdMin)) {
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
		const raw = readings.raw;
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
						measure_water: measureWater,
					};
					this.measureWaterChangedTrigger
						.trigger(this, tokens)
						.catch(this.error);
					// .then(this.log('Measure water changed flow card triggered'));
				}
			}
		}
		// store the new readings in memory
		this.meters.lastMeterWater = meterWater;
		this.meters.lastMeasureWater = measureWater;
		this.meters.lastOpticalSensorRaw = raw;
		// this.meters.lastMeterWaterTm = meterWaterTm;
		// update the device state
		// this.log(this.meters);
		this.updateDeviceState();
	}

}

module.exports = LS110WaterDriver;
