'use strict';

const Homey = require('homey');
const Ledring = require('./ledring.js');
const fs = require('fs');
const StdOutFixture = require('fixture-stdout');
// const Enelogic = require('./enelogic.js');

class MyApp extends Homey.App {

	onInit() {
		this.initLogCapture();
		this.log('Enelogic App is running!');
		this.ledring = new Ledring();

		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error);
		});
		Homey.on('unload', () => {
			this.log('app unload called');
			// save logs to persistant storage
			this.setLogFile();
		});
		// this.youless = new Youless('', '');	// password, host, [port]
		// this.test();
		// this.enelogic = new Enelogic('217.101.224.161');
		// this.testEnelogic();
	}

	// capture all logs for frontend
	initLogCapture(logLength, logName) {
		logLength = logLength || 50;
		logName = logName || 'log';
		const logFile = `/userdata/${logName}.json`;
		this.logArray = [];
		this.getLogFile = () => {
			fs.readFile(logFile, 'utf8', (err, data) => {
				if (err) {
					this.log('error reading logfile: ', err);
					return [];
				}
				try {
					this.logArray = JSON.parse(data);
					// console.log(this.logArray);
				} catch (error) {
					this.log('error parsing logfile: ', error);
					return [];
				}
				return this.logArray;
			});
		};
		this.setLogFile = () => {
			fs.writeFile(logFile, JSON.stringify(this.logArray), (err) => {
				if (err) {
					this.log('error writing logfile: ', err);
				} else {
					this.log('logfile saved');
				}
			});
		};
		// load logFile into memory
		this.getLogFile();
		// provide logs function for frontend api
		this.getLogs = () => {
			// this.log('getting logs for frontend');
			return this.logArray;
		};
		// Capture all writes to stdout (e.g. this.log)
		const captureStdout = new StdOutFixture({ stream: process.stdout });
		captureStdout.capture((string) => {
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
			// return false;	// prevent the write to the original stream
		});
		// captureStdout.release();
		// Capture all writes to stderr (e.g. this.error)
		const captureStderr = new StdOutFixture({ stream: process.stderr });
		captureStderr.capture((string) => {
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
			// return false;	// prevent the write to the original stream
		});
		// captureStderr.release();
	}

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

	async test() {
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
