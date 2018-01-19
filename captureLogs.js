'use strict';

const Homey = require('homey');
const StdOutFixture = require('fixture-stdout');
const fs = require('fs');
// const util = require('util');

class captureLogs {
	// Log object to keep logs in memory and in persistent storage
	// captures and reroutes Homey's this.log (stdout) and this.err (stderr)

	constructor(logName, logLength) {
		this.logName = logName || 'log';
		this.logLength = logLength || 50;
		this.logFile = `/userdata/${this.logName}.json`;
		this.logArray = [];
		this.getLogs();
		this.captureStdOut();
		this.captureStdErr();
		// Homey.app.log('capture is ready :)');
	}

	getLogs() {
		fs.readFile(this.logFile, 'utf8', (err, data) => {
			if (err) {
				Homey.app.error('error reading logfile: ', err.message);
				return [];
			}
			try {
				this.logArray = JSON.parse(data);
				// console.log(this.logArray);
			} catch (error) {
				Homey.app.error('error parsing logfile: ', err.message);
				return [];
			}
			// Homey.app.log('logs retrieved from module');
			return this.logArray;
		});
	}
	saveLogs() {
		fs.writeFile(this.logFile, JSON.stringify(this.logArray), (err) => {
			if (err) {
				Homey.app.error('error writing logfile: ', err.message);
			} else {
				Homey.app.log('logfile saved');
			}
		});
	}
	deleteLogs() {
		// this.log('deleting logs from frontend');
		fs.unlink(this.logFile, (err) => {
			if (err) {
				Homey.app.error('error deleting logfile: ', err.message);
				return err;
			}
			this.logArray = [];
			Homey.app.log('logfile deleted');
			return true;
		});
	}

	captureStdOut() {
		// Capture all writes to stdout (e.g. this.log)
		this.captureStdout = new StdOutFixture({ stream: process.stdout });
		Homey.app.log('capturing stdout');
		this.captureStdout.capture((string) => {
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
			// return false;	// prevent the write to the original stream
		});
		// captureStdout.release();
	}
	captureStdErr() {
		// Capture all writes to stderr (e.g. this.error)
		this.captureStderr = new StdOutFixture({ stream: process.stderr });
		Homey.app.log('capturing stderr');
		this.captureStderr.capture((string) => {
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
			// return false;	// prevent the write to the original stream
		});
		// captureStderr.release();
	}
	releaseStdOut() {
		this.captureStdout.release();
	}
	releaseStdErr() {
		this.captureStderr.release();
	}

}

module.exports = captureLogs;
