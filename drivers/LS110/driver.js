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

class LS110Driver extends Homey.Driver {

	onInit() {
		this.log('entering LS110 driver');
		this.ledring = new Ledring({ screensaver: 'youless_power', homey: this.homey });
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
					port: data.port,
				};
				const youless = new Youless(options);	// password, host, [port]
				await youless.login();
				const info = await youless.getInfo();
				const device = {
					name: `${info.model}_${info.host}`,
					data: { id: `LS110_${info.mac}` },
					settings: {
						youLessIp: options.host,
						port: options.port,
						password: options.password,
						model: info.model,
						mac: info.mac,
						ledring_usage_limit: 3000,
					},
					capabilities: [
						'measure_power',
						'meter_power',
					],
				};
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

module.exports = LS110Driver;
