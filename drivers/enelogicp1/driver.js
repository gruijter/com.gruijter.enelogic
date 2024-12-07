/*
Copyright 2017 - 2024, Robin de Gruijter (gruijter@hotmail.com)

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
const Enelogic = require('../../enelogic');
const Ledring = require('../../ledring');

class EnelogicDriver extends Homey.Driver {

	onInit() {
		this.log('entering Enelogic driver');
		this.ledring = new Ledring({ screensaver: 'enelogic_power_legacy', homey: this.homey });
	}

	async onPair(session) {
		session.setHandler('validate', async (data) => {
			try {
				this.log('save button pressed in frontend');
				// this.settings.host = data.enelogicIp;
				const enelogic = new Enelogic(data.enelogicIp);
				// this.log(enelogic);
				// try to get status
				await enelogic.getEMeter();
				return 'Enelogic device found!'; // report success to frontend
			}	catch (error) {
				this.error('Pair error', error);
				if (error.code === 'EHOSTUNREACH') {
					throw Error('Incorrect IP address');
				} else throw error;
			}
		});
	}
}

module.exports = EnelogicDriver;
