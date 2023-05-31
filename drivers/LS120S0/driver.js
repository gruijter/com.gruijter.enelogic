/* eslint-disable prefer-destructuring */
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

const Homey = require('homey');
const Youless = require('youless');
const Ledring = require('../../ledring');

class LS120S0Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS120S0 driver');
		this.ledring = new Ledring({ screensaver: 'youless_s0', homey: this.homey });
	}

	async onPair(session) {
		session.setHandler('discover', async () => {
			this.log('device discovery started');
			const youless = new Youless();	// password, host, [port]
			const discovered = await youless.discover();
			return JSON.stringify(discovered); // report success to frontend
		});
		session.setHandler('validate', async (data) => {
			try {
				this.log('save button pressed in frontend');
				const options = {
					password: data.password,
					host: data.youLessIp,
				};
				const youless = new Youless(options);	// password, host, [port]
				await youless.login();
				await youless.getAdvancedStatus();	// check for s0 meter
				const info = await youless.getInfo();
				if (!youless.hasMeter.s0) throw Error('No S0 information found on the device');
				const device = {
					name: `${info.model}S0_${info.host}`,
					data: { id: `LS120S0_${info.mac}` },
					settings: {
						youLessIp: options.host,
						password: options.password,
						model: info.model,
						mac: info.mac,
					},
				};
				if (data.meterSelection === 'Power') {
					device.capabilities = [
						'measure_power',
						'meter_power',
					];
					device.settings.ledring_usage_limit = 3000;
				}
				if (data.meterSelection === 'Water') {
					device.capabilities = [
						'measure_water',
						'meter_water',
					];
					device.settings.ledring_usage_limit = 0;
				}
				if (data.meterSelection === 'Gas') {
					device.capabilities = [
						'measure_gas',
						'meter_gas',
					];
					device.settings.ledring_usage_limit = 0;
				}
				return JSON.stringify(device); // report success to frontend
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					throw Error('Incorrect IP address');
				} else throw error;
			}
		});
	}

}

module.exports = LS120S0Driver;
