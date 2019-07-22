/* eslint-disable prefer-destructuring */

'use strict';

const http = require('http');
// const dns = require('dns');
const os = require('os');
// const util = require('util');

const defaultPort = 80;	// alternatives: 32848, 16464, 49232
const defaultPassword = '';
const defaultCookie = ['undefined'];
// const youlessMacId = '72:b8:ad:14';

// available for LS110 and LS120:
const homePath = '/H';	// home page, only works after login if password is set
const networkPath = '/N';	// network settings, only works after login if password is set
const basicStatusPath = '/a?f=j';
const setMeterTypePath = '/M?m='; // add a for analogue, d for digital e.g. /M?m=d
const setPowerCounterPath = '/M?k='; // add counter value. e.g. /M?c=12345
const setPowerPulsesPath = '/M?p='; // add pulses per kWh, e.g. /M?&p=1000
const powerLogPath = '/V';	// add range h/w/d/m, selection, and json format. e.g. ?m=12&f=j
const syncTimePath = '/S?t=n';	// time will sync to unknown time server

// only available for LS120:
const loginPath = '/L?w=';
const rebootPath = '/S?rb=';
const discoverPath = '/d';
const advancedStatusPath = '/e';
const gasLogPath = '/W';	// add range w/d/m, selection, and json format. e.g. ?d=70&f=j

//  Only available for LS120 fw>-1.4:
const setS0PulsesPath = '/M?s='; // add pulses per kWh, e.g. /M?&s=1000
const setS0CounterPath = '/M?c='; // add counter value. e.g. /M?c=12345
const s0LogPath = '/Z';	// add range h/w/d/m, selection, and json format. e.g. ?h=1&f=j

const regExTimeResponse = /Tijd:(.*?)<tr>/;
const regExModelResponse = /Model:(.*?)<tr>/;
const regExFirmwareResponse = /Firmware versie:(.*?)<tr>/;
const regExMacResponse = /MAC Adres:(.*?)<tr>/;
const regExTagRemove = /[/dhrt<>*]/mg;

function toEpoch(time) {	// yymmddhhmm, e.g. 1712282000 > 1514487600
	const tmString = time.toString();
	if (tmString.length !== 10) {
		// util.log('time has an invalid format');
		return 0;
	}
	const tm = new Date(`20${tmString.slice(0, 2)}`, Number(tmString.slice(2, 4)) - 1,
		tmString.slice(4, 6), tmString.slice(6, 8), tmString.slice(8, 10));
	return tm.getTime() / 1000 || 0;
}

class Youless {
	constructor(password, host, port) {
		this.password = password || defaultPassword;
		this.host = host;
		this.port = port || defaultPort;
		this.loggedIn = password === defaultPassword;
		this.cookie = defaultCookie;
		this.timeout = 4000;	// milliseconds for http request
		this.info = {	// will be filled automatically on getInfo2()
			model: undefined,
			mac: undefined,
			firmware: undefined,
			host: this.host,
		};
		this.hasMeter = {	// will be filled automatically on getAdvancedStatus()
			p1: undefined,
			gas: undefined,
			s0: undefined,
		};
		this.lastResponse = undefined;
	}

	/**
	* Discovers LS120 devices in the local network, and LS110 devices if no password is set in the device.
	* Also sets the ip address of the first discovered device as host address for this session.
	* @returns {Promise<info[]>} Array with info on discovered devices, including host ip address.
	*/
	async discover() {
		const timeoutBefore = this.timeout;
		const hostBefore = this.host;
		try {
			const hostsToTest = [];	// make an array of all host IP's in the LAN
			const servers = [];
			// const servers = dns.getServers() || [];	// get the IP address of all routers in the LAN
			const ifaces = os.networkInterfaces();	// get ip address info from all network interfaces
			Object.keys(ifaces).forEach((ifName) => {
				ifaces[ifName].forEach((iface) => {
					if (iface.family === 'IPv4' && !iface.internal) {
						servers.push(iface.address);
					}
				});
			});
			servers.map((server) => {
				const splitServer = server.split('.').slice(0, 3);
				const reducer = (accumulator, currentValue) => `${accumulator}.${currentValue}`;
				const segment = splitServer.reduce(reducer);
				if (segment.slice(0, 3) === '127') { return undefined; }
				for (let host = 1; host <= 254; host += 1) {
					const ipToTest = `${segment}.${host}`;
					hostsToTest.push(ipToTest);
				}
				return hostsToTest;
			});
			this.timeout = 3000;	// temporarily set http timeout to 3.5 seconds
			const allHostsPromise = hostsToTest.map(async (hostToTest) => {
				const result = await this.getInfo(hostToTest)
					.catch(() => undefined);
				return result;
			});
			const allHosts = await Promise.all(allHostsPromise);
			const discoveredHosts = allHosts.filter(host => host);
			this.timeout = timeoutBefore;	// reset the timeout
			if (discoveredHosts[0]) {
				this.host = discoveredHosts[0].host;
			} else { throw Error('No device discovered. Please provide host ip manually'); }
			return Promise.resolve(discoveredHosts);
		} catch (error) {
			this.host = hostBefore;
			this.timeout = timeoutBefore;
			this.lastResponse = error;
			return Promise.reject(error);
		}
	}

	/**
	* Login to the device. Passing parameters will override the previous settings.
	* If host is not set, login will try to auto discover it.
	* @param {string} [password = ''] - The login password. NOTE: Only works for LS120.
	* @param {string} [host] - The url or ip address of the device.
	* @param {number} [port] - The  port of the device.
	* @returns {Promise<Youless.loggedIn>} The loggedIn state.
	*/
	async login(password, host, port) {
		try {
			this.password = password || this.password;
			this.host = host || await this.host;
			this.port = port || this.port;
			if (!this.host || this.host === '' || !this.port) {
				await this.discover()
					.catch(() => {
						throw Error('Cannot login: host IP and/or port not set');
					});
			}
			if (this.password !== '') {
				await this._makeRequest(loginPath + this.password);
			}
			this.loggedIn = true;
			return Promise.resolve(this.loggedIn);
		} catch (error) {
			this.loggedIn = false;
			return Promise.reject(error);
		}
	}

	/**
	* Get device information. NOTE: Only works for LS120, or if logged in, or when no password is set in device
	* @param {string} [host] - The url or ip address of the device.
	* @returns {Promise<info>}
	*/
	async getInfo(host) {
		try {
			const info = this.info;
			let info1;
			// first try info2 (only available when loggedIn)
			const info2 = await this._getInfo2(host || this.host)
				.catch(() => undefined);
			if (info2) {
				info.model = info2.model;
				info.mac = info2.mac;
				info.firmware = info2.firmware;
				info.host = info2.host;
			} else {
				// now try info1 (only available for LS120)
				info1 = await this._getInfo1(host || this.host)
					.catch(() => undefined);
				if (info1) {
					info.model = info1.model;
					info.mac = info1.mac;
					info.host = info1.host;
				}
			}
			if (!info1 && !info2) {
				throw Error('Info could not be retrieved from device');
			}
			this.info = info;
			return Promise.resolve(info);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Get basic power information.
	* @returns {Promise<basicStatus>}
	*/
	async getBasicStatus() {
		try {
			const result = await this._makeRequest(basicStatusPath);
			const basicStatus = JSON.parse(result.body);
			if (!Object.prototype.hasOwnProperty.call(basicStatus, 'con')) {
				throw Error('no status information found');
			}
			if (Object.keys(basicStatus).length < 8) {
				throw Error('incomplete status information');
			}
			if (basicStatus.cnt) {
				basicStatus.net = Number(basicStatus.cnt.toString().replace(',', '.'));
			}
			basicStatus.tm = Date.now() / 1000;
			return Promise.resolve(basicStatus);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Get advanced power information. Only works on Enelogic (-EL) device firmware.
	* @returns {Promise<advancedStatus>}
	*/
	async getAdvancedStatus() {	// only available for LS120
		try {
			const result = await this._makeRequest(advancedStatusPath);
			const advancedStatus = JSON.parse(result.body)[0];
			if (!advancedStatus.tm) {
				throw Error('no status information found');
			}
			const minLength = (3 + (4 * this.hasMeter.p1) + (this.hasMeter.gas
				*	(1 + (1 * this.hasMeter.s0))) + (3 * this.hasMeter.s0)) || 3;
			if (Object.keys(advancedStatus).length < minLength) {
				throw Error('incomplete status information');
			}
			if (advancedStatus.p1) {	// p1 meter connected
				this.hasMeter.p1 = true;
			} else {	// no p1 meter available
				this.hasMeter.p1 = false;
			}
			if (advancedStatus.gts) {	// gas meter connected, and gas timestamp available
				this.hasMeter.gas = true;
				advancedStatus.gtm = toEpoch(advancedStatus.gts);
			} else if (advancedStatus.gas) {	// gas meter connected, no gas timestamp avialable (fw<1.4)
				this.hasMeter.gas = true;
				advancedStatus.gts = 0;
				advancedStatus.gtm = 0;
			} else {	// no gas meter available
				this.hasMeter.gas = false;
				advancedStatus.gas = 0;
				advancedStatus.gts = 0;
				advancedStatus.gtm = 0;
			}
			if (advancedStatus.ts0) {	// S0 meter available (fw>=v1.4)
				this.hasMeter.s0 = true;
			} else {	// no S0 meter available (fw<1.4)
				this.hasMeter.s0 = false;
				advancedStatus.ts0 = 0;
				advancedStatus.ps0 = 0;
				advancedStatus.cs0 = 0;
			}
			return Promise.resolve(advancedStatus);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Get historic electricity Power data.
	* @param {string} [resolution = 'Days'] - The interval of logdata in: M(inutes), T(enminutes), H(ours) or D(ays)
	* @param {number} [period = this month] - The period that can be selected for historic data depends on the device type and selected resolution:
	* - Minutes: period 1 (this hour) - 20 (20 hours ago) (LS110: max 2 hours ago)
	* - Tenminutes: period 1 (this day) - 30 (30 days ago) (LS110: max 3 days ago)
	* - Hours: period 1 (this day) - 70 (70 days ago) (LS110: max 7 days ago)
	* - Days: period 1 (January) - 12 (December)
	* @returns {Promise<powerLog>}
	*/
	async getPowerlog(resolution, period) {
		try {
			const res = resolution || 'd';	// defaults to days
			const now = new Date();
			const thisMonth = now.getMonth() + 1;
			const per = Number(period) || thisMonth; // defaults to this month
			let range;
			switch (res[0].toLowerCase()) {
				case 'm':
					range = 'h';
					break;
				case 't':
					range = 'w';
					break;
				case 'h':
					range = 'd';
					break;
				case 'd':
					range = 'm';
					break;
				default:
					throw Error('The resolution can only be M(inutes), T(enminutes, H(ours) or D(ays)');
			}
			const getPowerlogPath = `${powerLogPath}?${range}=${per}&f=j`;
			const result = await this._makeRequest(getPowerlogPath);
			const powerLog = JSON.parse(result.body);
			return Promise.resolve(powerLog);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Get historic S0 Power data. Note: Only available for LS120.
	* @param {string} [resolution = 'Days'] - The interval of logdata in: M(inutes), T(enminutes), H(ours) or D(ays)
	* @param {number} [period = this month] - The period that can be selected for historic data depends on the selected resolution:
	* - Minutes: period 1 (this hour) - 20 (20 hours ago)
	* - Tenminutes: period 1 (this day) - 30 (30 days ago)
	* - Hours: period 1 (this day) - 70 (70 days ago)
	* - Days: period 1 (January) - 12 (December)
	* @returns {Promise<s0Log>}
	*/
	async getS0log(resolution, period) {
		try {
			const res = resolution || 'd';	// defaults to days
			const now = new Date();
			const thisMonth = now.getMonth() + 1;
			const per = Number(period) || thisMonth; // defaults to this month
			let range;
			switch (res[0].toLowerCase()) {
				case 'm':
					range = 'h';
					break;
				case 't':
					range = 'w';
					break;
				case 'h':
					range = 'd';
					break;
				case 'd':
					range = 'm';
					break;
				default:
					throw Error('The resolution can only be M(inutes), T(enminutes, H(ours) or D(ays)');
			}
			const getS0logPath = `${s0LogPath}?${range}=${per}&f=j`;
			const result = await this._makeRequest(getS0logPath);
			const s0Log = JSON.parse(result.body);
			return Promise.resolve(s0Log);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Get historic gas usage data. Note: Only available for LS120.
	* @param {string} [resolution = 'Days'] - The interval of logdata in: T(enminutes), H(ours) or D(ays)
	* @param {number} [period = this month] - The period that can be selected for historic data depends on the selected resolution:
	* - Tenminutes: period 1 (this day) - 30 (30 days ago)
	* - Hours: period 1 (this day) - 70 (70 days ago)
	* - Days: period 1 (January) - 12 (December)
	* @returns {Promise<gasLog>}
	*/
	async getGaslog(resolution, period) {
		try {
			const res = resolution || 'd';	// defaults to days
			const now = new Date();
			const thisMonth = now.getMonth() + 1;
			const per = Number(period) || thisMonth; // defaults to this month
			let range;
			switch (res[0].toLowerCase()) {
				case 't':
					range = 'w';
					break;
				case 'h':
					range = 'd';
					break;
				case 'd':
					range = 'm';
					break;
				default:
					throw Error('The resolution can only be T(enminutes), H(ours) or D(ays)');
			}
			const getGaslogPath = `${gasLogPath}?${range}=${per}&f=j`;
			const result = await this._makeRequest(getGaslogPath);
			const gasLog = JSON.parse(result.body);
			return Promise.resolve(gasLog);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Set meter type to D(igital) or A(nalog).
	* @param {string} value - The meter type A(analog) or D(igital).
	* @returns {Promise<finished>}
	*/
	async setMeterType(value) {
		try {
			const validTypes = ['d', 'D', 'a', 'A'];
			if (!(typeof value === 'string') || !(validTypes.indexOf(value[0]) > -1)) {
				throw Error('Meter Type can only be D(igital) or A(nalog)');
			}
			await this._makeRequest(setMeterTypePath + value);
			return Promise.resolve(true);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Set the Power counter value (in KwH) NOTE: also resets powerPulses to 1000
	* @param {number} value - the Power counter value (in KwH)
	* @returns {Promise<finished>}
	*/
	async setPowerCounter(value) {
		try {
			await this._makeRequest(setPowerCounterPath + Number(value));
			return Promise.resolve(true);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Set the Power pulses per KwH value
	* NOTE: must be performed AFTER setPowerCounter and setS0Pulses
	* NOTE: will be automatically overwritten by P1 net value
	* @param {number} value - the number of pules per KwH, e.g. 1000
	* @returns {Promise<finished>}
	*/
	async setPowerPulses(value) {
		try {
			const success = await this._makeRequest(setPowerPulsesPath + Number(value));
			return Promise.resolve(success);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Set the S0 counter value.
	* @param {number} value - set the S0 counter value (in KwH)
	* @returns {Promise<finished>}
	*/
	async setS0Counter(value) {
		try {
			await this._makeRequest(setS0CounterPath + (Number(value) * 1000));
			return Promise.resolve(true);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Set the S0 pulses per KwH value NOTE: also resets powerPulses to 1000
	* @param {number} value - the number of pules per KwH, e.g. 1000
	* @returns {Promise<finished>}
	*/
	async setS0Pulses(value) {
		try {
			await this._makeRequest(setS0PulsesPath + Number(value));
			return Promise.resolve(true);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Synchronize the device time with the internet
	* @returns {Promise<dateTime>}
	*/
	async syncTime() {
		try {
			const res = await this._makeRequest(syncTimePath);
			const dateTimeDirty = res.body.match(regExTimeResponse)[1];
			const dateTime = dateTimeDirty.replace(regExTagRemove, '');
			return Promise.resolve(dateTime);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	* Reboot the youless device. NOTE: Only works for LS120
	* @returns {Promise<finished>}
	*/
	async reboot() {
		try {
			await this._makeRequest(rebootPath);
			return Promise.resolve(true);
		} catch (error) {
			return Promise.reject(error);
		}
	}


	// Get device information without need for credentials. NOTE: Only works for LS120
	async _getInfo1(host) {
		const hostBefore = this.host;
		try {
			this.host = host || hostBefore;
			const result = await this._makeRequest(discoverPath);
			this.host = hostBefore;
			const info1 = JSON.parse(result.body);
			if (!info1.model) {
				throw Error('no youless model found');
			}
			info1.host = host || hostBefore;
			return Promise.resolve(info1);
		} catch (error) {
			this.host = hostBefore;
			return Promise.reject(error);
		}
	}


	// Get device information. NOTE: Login is required if a password is set in the device.
	async _getInfo2(host) {
		const hostBefore = this.host;
		try {
			// this.loggedIn = true;
			const info2 = { };
			this.host = host || hostBefore;
			const res = await this._makeRequest(homePath);
			const res2 = await this._makeRequest(networkPath);
			this.host = hostBefore;
			const model = res.body.match(regExModelResponse)[1];
			info2.model = model.replace(regExTagRemove, '');
			const mac = res2.body.match(regExMacResponse)[1];
			info2.mac = mac.replace(regExTagRemove, '');
			const firmware = res.body.match(regExFirmwareResponse)[1];
			info2.firmware = firmware.replace(regExTagRemove, '');
			info2.host = host || hostBefore;
			return Promise.resolve(info2);
		} catch (error) {
			this.host = hostBefore;
			return Promise.reject(error);
		}
	}

	async _makeRequest(action) {
		try {
			if (!this.loggedIn && !action.includes(loginPath) && !action.includes(discoverPath)) {
				return Promise.reject(Error('Not logged in'));
			}
			const headers = {
				'Content-Length': 0,
				Connection: 'keep-alive',
			};
			if (!action.includes(loginPath) && !action.includes(discoverPath) && this.cookie !== defaultCookie) {
				headers.Cookie = this.cookie;
			}
			const options = {
				hostname: this.host,
				port: this.port,
				path: action,
				headers,
				method: 'GET',
				'User-Agent': 'Youless.js',
			};
			const res = await this._makeHttpRequest(options, '');
			this.lastResponse = res.body;
			const { statusCode } = res;
			const contentType = res.headers['content-type'];
			if ((statusCode === 302) && options.path.includes(loginPath)) {
				// redirect after login, that's ok
			}	else if (statusCode === 403) {
				this.loggedIn = false;
				throw Error('Incorrect password');
			}	else if (statusCode === 404) {
				throw Error('Page Not found');
			}	else if (statusCode !== 200) {
				throw Error(`Request Failed. Status Code: ${statusCode}`);
			} else if
			(!/^application\/json/.test(contentType)
			&& !options.path.includes('/H')
			&& (options.path.includes('?f=j') || options.path.includes('/d') || options.path.includes('/e'))) {
				throw Error(`Invalid content-type. Expected application/json but received ${contentType}`);
			}
			if (res.headers['set-cookie']) {
				this.cookie = res.headers['set-cookie'];
			}
			this.loggedIn = true;
			return Promise.resolve(res);
		}	catch (error) {
			return Promise.reject(error);
		}
	}

	_makeHttpRequest(options, postData) {
		return new Promise((resolve, reject) => {
			const req = http.request(options, (res) => {
				let resBody = '';
				res.on('data', (chunk) => {
					resBody += chunk;
				});
				res.once('end', () => {
					res.body = resBody;
					return resolve(res); // resolve the request
				});
			});
			req.write(postData);
			req.end();
			req.setTimeout(this.timeout, () => {
				req.abort();
				reject(Error('Connection timeout'));
			});
			req.once('error', (e) => {
				this.lastResponse = e;	// e.g. ECONNREFUSED // ECONNRESET // EHOSTUNREACH on wrong IP
				reject(e);
			});
		});
	}

}

module.exports = Youless;


// definitions for JSDoc

/**
* @class Youless
* @classdesc Class representing a session with a youless device.
* @param {string} [password = ''] - The login password.
* @param {string} [host] - The url or ip address of the router. Will be automatically discovered on first login.
* @param {number} [port = 80] - The port of the device
* @example // create a youless session, login to device, fetch basic power info
	const Youless = require('youless');

	const youless = new Youless();

	async function getPower() {
		try {
			// fill in the password of the device. Use '' if no password is set in the device
			// fill in the ip address of the device, e.g. '192.168.1.50'
			// do not fill in an ip address if you want to autodiscover the device during login
			await youless.login('devicePassword', 'deviceIp');
			const powerInfo = await youless.getBasicInfo();
			console.log(powerInfo);
		} catch (error) {
			console.log(error);
		}
	}

	getPower();

	* @property {number} timeout - http timeout in milliseconds.
	* @property {boolean} loggedIn - login state.
*/

/**
* @typedef info
* @description device information
* @property {string} model e.g. 'LS120'
* @property {string} mac  e.g. '72:b8:ad:14:16:2d'
* @property {string} firmware  e.g. '1.4.1-EL'
* @property {string} host e.g. '192.168.1.10'
*/

/**
* @typedef dateTime
* @description string containing date and time e.g '24-11-18 14:22'
*/

/**
* @typedef basicStatus
* @description basicStatus is an object containing power information.
* @property {string} cnt counter in kWh. e.g. ' 16844,321'
* @property {number} pwr power consumption in Watt. e.g. 3030
* @property {number} lvl moving average level (intensity of reflected light on analog meters) e.g. 73
* @property {string} dev deviation of reflection. e.g. '(&plusmn;0%)'
* @property {string} det unknown. e.g. ''
* @property {string} con connection status e.g.'OK'
* @property {string} sts time until next status update with online monitoring. e.g. '(23)'
* @property {number} [ps0] computed S0 power. e.g. 0.  NOTE: only for LS120 ^1.4 version firmware
* @property {number} raw raw 10-bit light reflection level (without averaging). e.g. 732
* @property {number} net netto counter cnt converted to a number. e.g. 16844.321
* @property {number} tm time of retrieving info. unix-time-format. e.g. 1542575626.489
* @example // basicStatus information
{ cnt: ' 20289,512', pwr: 640, lvl: 62, dev: '(&plusmn;0%)', det: '', con: 'OK',
sts: '(17)', cs0: ' 12345,0000', ps0: 0, raw: 627, net: 20289.512, tm: 1543065737.936 }
*/

/**
* @typedef advancedStatus
* @description advancedStatus is an object containing power information.
* @property {number} tm time of retrieving info. unix-time-format. e.g. 1542575626
* @property {number} pwr power consumption in Watt. e.g. 3030
* @property {number} [ts0] time of the last S0 measurement. unix-time-format. e.g. 1542575626 NOTE: only for LS120 ^1.4 version firmware
* @property {number} [cs0] counter of S0 input (KwH). e.g. 0 NOTE: only for LS120 ^1.4 version firmware
* @property {number} [ps0] computed S0 power. e.g. 0. NOTE: only for LS120 ^1.4 version firmware
* @property {number} p1 P1 consumption counter (low tariff). e.g. 16110.964
* @property {number} p2 P2 consumption counter (high tariff). e.g. 896.812
* @property {number} n1 N1 production counter (low tariff). e.g. 1570.936
* @property {number} n2 N2 production counter (high tariff). e.g. 4250.32
* @property {number} gas counter gas-meter (in m^3). e.g. 6161.243
* @property {number} [gts] time of the last gas measurement (yyMMddhhmm). e.g. 1811182200 NOTE: only for LS120 ^1.4 version firmware
* @property {number} [gtm] time of the last gas measurement. unix-time-format. e.g. 1542574800 NOTE: only for LS120 ^1.4 version firmware
* @example // advancedStatus information
{ tm: 1543065732, net: 20289.512, pwr: 640, ts0: 1542562800, cs0: 12345, ps0: 0, p1: 16168.673,
p2: 9942.712, n1: 1570.936, n2: 4250.937, gas: 6192.638, gts: 1811241400, gtm: 1543064400 }
*/

/**
* @typedef powerLog
* @description contains historic electricity Power data
* @property {string} un - the unit of the data 'Watt' or 'kWh'
* @property {string} tm  - the date/time of the first log entry. e.g. '2018-11-01T00:00:00'
* @property {number} dt - the entry interval delta in seconds. e.g. 86400 (= 1 day)
* @property {Array.string} val - an array containing the log entries. Closing entry is always null
* @example // daily power usage in the month November
	{
		un: 'kWh',
		tm: '2018-11-01T00:00:00',
		dt: 86400,
		val: [' 24,770', ' 14,930', ' 16,270', ' 10,380', ' 14,700', ' 9,000', ' 18,430',
		' 15,420', ' 22,430', ' 22,900', ' 17,820', ' 15,250', ' 13,080', ' 22,780',
		' 12,410', ' 16,090', ' 9,860', ' 15,180', ' 13,790', ' 13,330', ' 20,000',
		' 24,040', ' 18,100', ' 22,430', ' 22,900', ' 17,820', ' 15,250', ' 16,090',
		' 22,430', ' 22,900', null ]
	}
*/

/**
* @typedef s0Log
* @description contains historic electricity Power data
* @property {string} un - the unit of the data 'Watt' or 'kWh'
* @property {string} tm  - the date/time of the first log entry. e.g. '2018-11-01T00:00:00'
* @property {number} dt - the entry interval delta in seconds. e.g. 86400 (= 1 day)
* @property {Array.string} val - an array containing the log entries. Closing entry is always null
* @example // daily power usage in the month November
	{
		un: 'kWh',
		tm: '2018-11-01T00:00:00',
		dt: 86400,
		val: [' 24,770', ' 14,930', ' 16,270', ' 10,380', ' 14,700', ' 9,000', ' 18,430',
		' 15,420', ' 22,430', ' 22,900', ' 17,820', ' 15,250', ' 13,080', ' 22,780',
		' 12,410', ' 16,090', ' 9,860', ' 15,180', ' 13,790', ' 13,330', ' 20,000',
		' 24,040', ' 18,100', ' 22,430', ' 22,900', ' 17,820', ' 15,250', ' 16,090',
		' 22,430', ' 22,900', null ]
	}
*/

/**
* @typedef gasLog
* @description contains historic gas usage data
* @property {string} un - the unit of the data 'm3' or 'L' (liter)
* @property {string} tm  - the date/time of the first log entry. e.g. '2018-11-01T00:00:00'
* @property {number} dt - the entry interval delta in seconds. e.g. 86400 (= 1 day)
* @property {Array.string} val - an array containing the log entries. Closing entry is always null
* @example // daily gas usage in the month November
	{
		un: 'm3',
		tm: '2018-11-01T00:00:00',
		dt: 86400,
		val: [' 5,580', ' 3,380', ' 4,350', ' 1,960', ' 3,130', ' 3,280', ' 2,500',
		' 2,970', ' 3,780', ' 4,440', ' 2,860', ' 3,470', ' 2,300', ' 4,110',
		' 2,940', ' 4,380', ' 4,860', ' 5,890', ' 5,480', ' 5,670', ' 3,790',
		' 6,390', ' 7,450', ' 3,380', ' 4,350', ' 1,960', ' 3,130', ' 3,780',
		' 5,480', ' 5,670', null ]
	}
*/

/*
more detailed information on: http://wiki.td-er.nl/index.php?title=YouLess
*/
