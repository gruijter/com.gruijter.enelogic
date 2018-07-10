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
along with com.gruijter.enelogic.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');
const Ledring = require('./ledring.js');
const Logger = require('./captureLogs.js');
// const Youless = require('youless');
// const Enelogic = require('./enelogic.js');

class MyApp extends Homey.App {

	onInit() {
		this.log('Enelogic App is running!');
		this.ledring = new Ledring();
		this.logger = new Logger();	// [logName] [, logLength]

		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error);
		});
		Homey.on('unload', () => {
			this.log('app unload called');
			// save logs to persistant storage
			this.logger.saveLogs();
		});
		// testing stuff
		// this.youless = new Youless('', '');	// password, host [, port]
		// this.testYouless();
		// this.enelogic = new Enelogic('');	// host [, port]
		// this.testEnelogic();
	}

	// ============================================================
	// logfile stuff for frontend API here
	deleteLogs() {
		return this.logger.deleteLogs();
	}
	getLogs() {
		return this.logger.logArray;
	}

	// ===================================================================
	// testing stuff here
	async testEnelogic() {
		try {
			// get the e meter values
			const eMeter = await this.enelogic.getEMeter();
			console.log(eMeter);
			// get the g meter values
			const gMeter = await this.enelogic.getGMeter();
			console.log(gMeter);
		}	catch (error) {
			console.log(error);
		}
	}

	async testYouless() {
		try {
			// get the model name and mac address (no need to login first)
			const info = await this.youless.getInfo();
			console.log(info);
			// if a password is set you need to login. Optional use of host and port will override previous settings
			await this.youless.login('password'); // [host], [port])
			console.log(this.youless);
			// get basic power readings
			const basicStatus = await this.youless.getBasicStatus();
			console.log(basicStatus);
			// get analogue and P1 power, S0 and gas meter readings (not available in LS110)
			const advancedStatus = await this.youless.getAdvancedStatus();
			console.log(advancedStatus);
			// synchronize the device time
			await this.youless.syncTime();
			// set the meter type to D(igital) or A(nalogue)
			await this.youless.setMeterType('a');
			// set the S0 counter value (in KwH)
			await this.youless.setS0Counter(12345);
			// set the S0 pulses per KwH value NOTE: also resets powerPulses to 1000
			await this.youless.setS0Pulses(1000);
			// set the Power counter value (in KwH) NOTE: also resets powerPulses to 1000
			await this.youless.setPowerCounter(12345);
			// set the Power pulses per KwH value NOTE: must be performed AFTER setPowerCounter and setS0Pulses
			await this.youless.setPowerPulses(1000);
			// reboot the youless device
			await this.youless.reboot();
		}	catch (error) {
			console.log(error);
		}
	}

}

module.exports = MyApp;


// no login required for getInfo
// youless.getInfo()
// 	.then((response) => {
// 		console.log(response);
// 	})
// 	.catch((error) => {
// 		console.log(error);
// 	});

// youless.login() // password, [host], [port]
// 	.then((response) => {
// 		console.log(response);
// 		youless.getBasicStatus()
// 			.then((res) => {
// 				console.log(res);
// 			})
// 			.catch((err) => {
// 				console.log(err);
// 			});
// 	})
// 	.catch((error) => {
// 		console.log(error);
// 	});

// youless.getBasicStatus()
// 	.then((response) => {
// 		console.log(response);
// 	})
// 	.catch((error) => {
// 		console.log(error);
// 	});
//
// youless.getAdvancedStatus()
// 	.then((response) => {
// 		console.log(response);
// 	})
// 	.catch((error) => {
// 		console.log(error);
// 	});
