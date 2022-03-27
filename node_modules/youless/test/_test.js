/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2022 Robin de Gruijter <gruijter@hotmail.com> */

// INSTRUCTIONS FOR TESTING FROM DESKTOP:
// install node (https://nodejs.org)
// install this package: > npm i youless
// run the test: > npm test [password=xxx] [host=xxx] [port=xxx]

'use strict';

const os = require('os');
const YoulessSession = require('../youless');
const { version } = require('../package.json');
// const util = require('util');

let log = [];
let t0 = Date.now();
let errorCount = 0;
const youless = new YoulessSession();

// function to setup the router session
async function setupSession(options) {
	try {
		log.push('========== STARTING TEST ==========');
		log.push(`Node version: ${process.version}`);
		log.push(`Youless package version: ${version}`);
		log.push(`OS: ${os.platform()} ${os.release()}`);

		t0 = Date.now();
		log.push('t = 0');
		const opts = options;
		if (!opts.host) {
			// discover youless devices in the network
			log.push('no host was set: trying to discover youless devices');
			if (opts.password) youless.password = opts.password;
			const devices = await youless.discover(opts);
			opts.host = youless.host;
			log.push(devices);
			log.push(`t = ${(Date.now() - t0) / 1000}`);
		}
		// if a password is set you need to login. Optional use of password, host and port will override previous settings
		log.push('trying to login');
		const loggedIn = await youless.login(opts);
		log.push(`login successful: ${loggedIn}`);
		log.push(`t = ${(Date.now() - t0) / 1000}`);
		return Promise.resolve(youless);
	}	catch (error) {
		log.push(error);
		youless.password = '*****';
		log.push(youless);
		return Promise.reject(error);
	}
}

async function logError(error) {
	errorCount += 1;
	log.push(error.message);
	const lastResponse = { lastResponse: youless.lastResponse };
	log.push(lastResponse);
	if (!youless.loggedIn) {
		log.push('trying to login again...');
		await youless.login();
	}
	return {};
}

async function doTest() {
	try {
		// get the model name, firmware level, mac address and host address
		log.push('trying to get info');
		const info = await youless.getInfo();
		log.push(info);
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// // get raw P1 readings
		// log.push('trying to get raw P1 readings:');
		// const rawP1Status = await youless.getRawP1Status({ noCheck: true })
		// 	.catch((error) => logError(error));
		// log.push(rawP1Status);
		// log.push(`t = ${(Date.now() - t0) / 1000}`);

		// get basic power readings
		log.push('trying to get basic power readings');
		await youless.getBasicStatus()
			.then((basicStatus) => {
				log.push(basicStatus);
			})
			.catch((error) => logError(error));
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// get analogue and P1 power, S0 and gas meter readings (not available in LS110)
		log.push('trying to get advanced power readings (LS120 only)');
		await youless.getAdvancedStatus()
			.then((advancedStatus) => {
				log.push(advancedStatus);
				log.push('Available digital meters:');
				log.push(youless.hasMeter);
			})
			.catch((error) => logError(error));
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// get electricity Power log of the present month
		log.push('trying to get historic Power log of present month');
		await youless.getPowerlog()
			.then((powerLog) => {
				log.push(powerLog);
			})
			.catch((error) => logError(error));
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// get gas log of the present month
		log.push('trying to get historic gas log of present month (LS120 only)');
		await youless.getGaslog()
			.then((gasLog) => {
				log.push(gasLog);
			})
			.catch((error) => logError(error));
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// get S0 log of the present month
		log.push('trying to get historic S0 log of present month (LS120 only)');
		await youless.getS0log()
			.then((s0Log) => {
				log.push(s0Log);
			})
			.catch((error) => logError(error));
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// get S0 log of the present month
		log.push('trying to get the raw P1 status');
		await youless.getRawP1Status({ noCheck: true })
			.then((rawP1Status) => {
				log.push(rawP1Status);
			})
			.catch((error) => logError(error));
		log.push(`t = ${(Date.now() - t0) / 1000}`);

		// synchronize the device time
		// log.push('trying to set the device time');
		// const dateTime = await youless.syncTime()
		// 	.catch((error) => logError(error));
		// log.push(dateTime);

		// // set optical sensor luminace
		// log.push('trying to set optical sensor luminance');
		// await youless.setLuminace(0)
		// 	.catch((error) => logError(error));

		// // set the meter type to D(igital) or A(nalogue)
		// log.push('trying to set meter type to Analogue');
		// await youless.setMeterType('a')
		// 	.catch((error) => logError(error));

		// // set the S0 counter value (in KwH)
		// log.push('trying to set the S0 counter (LS120-EL only)');
		// await youless.setS0Counter(12345)
		// 	.catch((error) => logError(error));

		// // set the S0 pulses per KwH value NOTE: also resets powerPulses to 1000
		// log.push('trying to set the S0 pulses (LS120-EL only)');
		// await youless.setS0Pulses(1000)
		// 	.catch((error) => logError(error));

		// // set the Power counter value (in KwH) NOTE: also resets powerPulses to 1000
		// await youless.setPowerCounter(12345)
		// 	.catch((error) => logError(error));

		// // set the Power pulses per KwH value
		// // NOTE: must be performed AFTER setPowerCounter and setS0Pulses
		// // NOTE: will be automatically overwritten by P1 net value
		// await youless.setPowerPulses(1000)
		// 	.catch((error) => logError(error));

		// // reboot the youless device
		// log.push('trying to reboot the device (LS120-EL only)');
		// await youless.reboot()
		// 	.catch((error) => logError(error));

		// finish test
		youless.password = '*****';
		youless.lastResponse = '...';
		youless.cookie = Array.isArray(youless.cookie);
		log.push(youless);
		log.push(`t = ${(Date.now() - t0) / 1000}`);
		if (errorCount) {
			log.push(`test finished with ${errorCount} errors`);
		} else {
			log.push('test finished without errors :)');
		}

	}	catch (error) {
		log.push(error);
		youless.password = '*****';
		log.push(youless);
	}
}

exports.test = async (opts) => {
	log = [];	// empty the log
	try {
		await setupSession(opts);
		await doTest();
		return Promise.resolve(log);
	}	catch (error) {
		return Promise.resolve(log);
	}
};
