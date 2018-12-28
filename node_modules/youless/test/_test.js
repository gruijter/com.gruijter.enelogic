/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017, 2018, Robin de Gruijter <gruijter@hotmail.com> */

// INSTRUCTIONS FOR TESTING FROM DESKTOP:
// install node (https://nodejs.org)
// install this package: > npm i youless
// run the test: > npm test [password]

'use strict';

const os = require('os');
const YoulessSession = require('../youless.js');
const { version } = require('../package.json');
// const util = require('util');

let log = [];

const youless = new YoulessSession();

// function to setup the router session
async function setupSession(password, host, port) {
	try {
		log.push('========== STARTING TEST ==========');
		log.push(`Node version: ${process.version}`);
		log.push(`Youless package version: ${version}`);
		log.push(`OS: ${os.platform()} ${os.release()}`);
		let testHost = host;
		if (!host) {
			// discover youless devices in the network
			log.push('no host was set: trying to discover youless devices');
			const devices = await youless.discover();
			testHost = youless.host;
			log.push(devices);
		}
		// if a password is set you need to login. Optional use of password, host and port will override previous settings
		log.push('trying to login');
		const loggedIn = await youless.login(password, testHost, port);
		log.push(`login successful: ${loggedIn}`);
		return Promise.resolve(youless);
	}	catch (error) {
		log.push(error);
		youless.password = '*****';
		log.push(youless);
		return Promise.reject(error);
	}
}

async function doTest() {
	try {
		// get the model name, firmware level, mac address and host address
		log.push('trying to get info');
		const info = await youless.getInfo();
		log.push(info);

		// get basic power readings
		log.push('trying to get basic power readings');
		const basicStatus = await youless.getBasicStatus();
		log.push(basicStatus);

		// get analogue and P1 power, S0 and gas meter readings (not available in LS110)
		log.push('trying to get advanced power readings (LS120-EL only)');
		const advancedStatus = await youless.getAdvancedStatus().catch(() => undefined);
		log.push(advancedStatus);
		log.push('Available digital meters:');
		log.push(youless.hasMeter);

		// get electricity Power log of the present month
		log.push('trying to get historic Power log of present month');
		const powerLog = await youless.getPowerlog().catch(() => undefined);
		log.push(powerLog);

		// get gas log of the present month
		log.push('trying to get historic gas log of present month (LS120-EL only)');
		const gasLog = await youless.getGaslog().catch(() => undefined);
		log.push(gasLog);

		// get S0 log of the present month
		log.push('trying to get historic S0 log of present month (LS120-EL only)');
		const s0Log = await youless.getS0log().catch(() => undefined);
		log.push(s0Log);

		// synchronize the device time
		log.push('trying to set the device time');
		const dateTime = await youless.syncTime();
		log.push(dateTime);

		// // set the meter type to D(igital) or A(nalogue)
		// log.push('trying to set meter type to Analogue');
		// await youless.setMeterType('a');

		// // set the S0 counter value (in KwH)
		// log.push('trying to set the S0 counter (LS120-EL only)');
		// await youless.setS0Counter(12345);

		// // set the S0 pulses per KwH value NOTE: also resets powerPulses to 1000
		// log.push('trying to set the S0 pulses (LS120-EL only)');
		// await youless.setS0Pulses(1000);

		// // set the Power counter value (in KwH) NOTE: also resets powerPulses to 1000
		// await youless.setPowerCounter(12345);

		// // set the Power pulses per KwH value
		// // NOTE: must be performed AFTER setPowerCounter and setS0Pulses
		// // NOTE: will be automatically overwritten by P1 net value
		// await youless.setPowerPulses(1000);

		// // reboot the youless device
		// log.push('trying to reboot the device (LS120-EL only)');
		// await youless.reboot();

	}	catch (error) {
		log.push(error);
		youless.password = '*****';
		log.push(youless);
	}
}

exports.test = async (password, host, port) => {
	log = [];	// empty the log
	try {
		await setupSession(password, host, port);
		await doTest();
		return Promise.resolve(log);
	}	catch (error) {
		return Promise.resolve(log);
	}
};
