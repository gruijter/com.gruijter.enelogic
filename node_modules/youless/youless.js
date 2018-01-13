'use strict';

const http = require('http');
const util = require('util');

const defaultPort = 80;
const defaultPassword = '';

// only available for LS110 and LS120:
const loginPath = '/L?w=';
const basicStatusPath = '/a?f=j';
const setMeterTypePath = '/M?m='; // add a for analogue, d for digital e.g. /M?m=d
const setPowerCounterPath = '/M?k='; // add counter value. e.g. /M?c=12345
const setPowerPulsesPath = '/M?p='; // add pulses per kWh, e.g. /M?&p=1000
// const powerLogPath = '/V';	// add range h/w/d/m, selection, and json format. e.g. ?m=12&f=j
const syncTimePath = '/S?t=n';	// time will sync to unknown time server
const rebootPath = '/S?rb=';

// only available for LS120:
const infoPath = '/d';
const advancedStatusPath = '/e';
// const gasLogPath = '/W';	// add range w/d/m, selection, and json format. e.g. ?d=70&f=j

//  Only available for LS120 fw>-1.4:
const setS0PulsesPath = '/M?s='; // add pulses per kWh, e.g. /M?&s=1000
const setS0CounterPath = '/M?c='; // add counter value. e.g. /M?c=12345
// const s0LogPath = '/Z';	// add range h/w/d/m, selection, and json format. e.g. ?h=1&f=j

function toEpoch(time) {	// yymmddhhmm, e.g. 1712282000 > 1514487600
	const tmString = time.toString();
	if (tmString.length !== 10) {
		util.log('time has an invalid format');
		return 0;
	}
	const tm = new Date(`20${tmString.slice(0, 2)}`, tmString.slice(2, 4) - 1, tmString.slice(4, 6), tmString.slice(6, 8));
	return tm.getTime() / 1000 || 0;
}

class Youless {
	// Represents a session to a youless device.
	constructor(password, host, port) { // password, host, [port]
		this.password = password || defaultPassword;
		this.host = host;
		this.port = port || defaultPort;
		this.loggedIn = password === defaultPassword;
		this.cookie = ['undefined'];
		this.info = {
			model: undefined,			// will be filled automatically for LS120, will remain undefined for LS110
			mac: undefined,				// will be filled automatically for LS120, will remain undefined for LS110
			hasP1Meter: false,		// will be made true if p1 data is received in this session
			hasGasMeter: false,		// will be made true if gas data is received in this session
			hasS0Meter: false,		// will be made true if s0 data is received in this session, also means fw >= 1.4
		};
		this.getInfo()
			.then((info) => {
				this.info.model = info.model;
				this.info.mac = info.mac;
			})
			.catch((error) => {
				util.log(error);
			});
	}

	login(password, host, port) { // password, [host], [port]
		util.log('youless login requested');
		return new Promise((resolve, reject) => {
			this.password = password || this.password;
			if (password === '') {
				this.password = '';
			}
			this.host = host || this.host;
			this.port = port || this.port;
			this._makeRequest(loginPath + this.password)
				.then((result) => {
					if (!result.headers.hasOwnProperty('set-cookie')) {
						reject(Error('no cookie found after login'));
						return;
					}
					this.cookie = result.headers['set-cookie'];
					this.loggedIn = true;
					resolve(true);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	getInfo() { // no login required for getInfo
		util.log('youless getInfo requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(infoPath)
				.then((result) => {
					let response;
					try {
						response = JSON.parse(result.body);
						if (!response.hasOwnProperty('model')) {
							reject(Error('no youless model found'));
							return;
						}
					}	catch (error) {
						reject(Error('no JSON information found'));
					}
					resolve(response);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	getBasicStatus() {
		// util.log('youless getBasicStatus requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(basicStatusPath)
				.then((result) => {
					let response;
					try {
						response = JSON.parse(result.body);
						if (!response.hasOwnProperty('con')) {
							reject(Error('no status information found'));
							return;
						}
					}	catch (error) {
						reject(Error('no JSON information found'));
					}
					if (Object.keys(response).length < 8) {
						reject(Error('incomplete status information'));
						return;
					}
					if (response.hasOwnProperty('cnt')) {
						response.net = Number(response.cnt.toString().replace(',', '.'));
					}
					response.tm = Date.now() / 1000;
					resolve(response);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	getAdvancedStatus() {	// only available for LS120
		// util.log('youless getAdvancedStatus requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(advancedStatusPath)
				.then((result) => {
					let response;
					try {
						response = JSON.parse(result.body)[0];
						if (!response.hasOwnProperty('tm')) {
							reject(Error('no status information found'));
							return;
						}
						const minLength = (3 + (4 * this.info.hasP1Meter) + (this.info.hasGasMeter
															* (1 + (1 * this.info.hasS0Meter))) + (3 * this.info.hasS0Meter)) || 3;
						if (Object.keys(response).length < minLength) {
							this.info.hasP1Meter = undefined;
							this.info.hasGasMeter = undefined;
							this.info.hasS0Meter = undefined;
							reject(Error('incomplete status information'));
							return;
						}
						if (response.hasOwnProperty('p1')) {	// p1 meter connected
							this.info.hasP1Meter = true;
						} else {	// no p1 meter available
							this.info.hasP1Meter = false;
						}
						if (response.hasOwnProperty('gts')) {	// gas meter connected, and gas timestamp available
							this.info.hasGasMeter = true;
							response.gtm = toEpoch(response.gts);
						} else if (response.hasOwnProperty('gas')) {	// gas meter connected, no gas timestamp avialable (fw<1.4)
							this.info.hasGasMeter = true;
							response.gts = 0;
							response.gtm = 0;
						} else {	// no gas meter available
							this.info.hasGasMeter = false;
							response.gas = 0;
							response.gts = 0;
							response.gtm = 0;
						}
						if (response.hasOwnProperty('ts0')) {	// S0 meter available (fw>=v1.4)
							this.info.hasS0Meter = true;
						} else {	// no S0 meter available (fw<1.4)
							this.info.hasS0Meter = false;
							response.ts0 = 0;
							response.ps0 = 0;
							response.cs0 = 0;
						}
					}	catch (error) {
						reject(Error('no JSON information found'));
					}
					resolve(response);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	setMeterType(value) {
		util.log('youless set Meter Type requested');
		return new Promise((resolve, reject) => {
			const validTypes = ['d', 'D', 'a', 'A'];
			if (!(typeof value === 'string') || !(validTypes.indexOf(value[0]) > -1)) {
				reject(Error('Meter Type can only be D(igital) or A(nalogue)'));
				return;
			}
			this._makeRequest(setMeterTypePath + value)
				.then(() => {
					resolve(`Youless Meter Type counter was set to: ${value[0]}`);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	setPowerCounter(value) {
		util.log('youless set Power counter requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(setPowerCounterPath + Number(value))
				.then(() => {
					resolve(`Youless Power counter was set to ${value}`);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	setPowerPulses(value) {
		util.log('youless set Power pulses requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(setPowerPulsesPath + Number(value))
				.then(() => {
					resolve(`Youless Power pulses was set to ${value}`);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	setS0Counter(value) {
		util.log('youless set S0 counter requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(setS0CounterPath + (Number(value) * 1000))
				.then(() => {
					resolve('Youless S0 counter was set');
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	setS0Pulses(value) {
		util.log('youless set S0 pulses requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(setS0PulsesPath + Number(value))
				.then(() => {
					resolve(`Youless S0 pulses was set to ${value}`);
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	syncTime() {
		util.log('youless sync time requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(syncTimePath)
				.then(() => {
					resolve('Youless sync time initiated');
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	reboot() {
		util.log('youless reboot requested');
		return new Promise((resolve, reject) => {
			this._makeRequest(rebootPath)
				.then(() => {
					resolve('Youless reboot initiated');
				})
				.catch((error) => {
					reject(error);
				});
		});
	}

	_makeRequest(action) {
		return new Promise((resolve, reject) => {
			if (!this.loggedIn && !action.includes(loginPath) && !action.includes(infoPath)) {
				reject(Error('Not logged in'));
				return;
			}
			const headers = {
				Connection: 'keep-alive',
			};
			if (!action.includes(loginPath) && !action.includes(infoPath)) {
				headers.Cookie = this.cookie;
			}
			const options = {
				hostname: this.host,
				port: this.port,
				path: action,
				headers,
				method: 'GET',
			};
			const req = http.request(options, (res) => {
				const { statusCode } = res;
				const contentType = res.headers['content-type'];
				let error;
				if ((statusCode === 302) && options.path.includes(loginPath)) {
					// redirect after login, that's ok
				}	else if (statusCode === 403) {
					error = new Error('Incorrect password');
				}	else if (statusCode === 404) {
					error = new Error('Not found. Wrong IP address?');
				}	else if (statusCode !== 200) {
					error = new Error(`Request Failed. Status Code: ${statusCode}`);
				} else if (!/^application\/json/.test(contentType)
										&& !options.path.includes('/S?')
										&& !options.path.includes('/M?')) {
					error = new Error(`Invalid content-type. Expected application/json but received ${contentType}`);
				}
				if (error) {
					// consume response data to free up memory
					res.resume();
					this.loggedIn = false;
					reject(error);
					return;
				}
				let resBody = '';
				res.on('data', (chunk) => {
					resBody += chunk;
				});
				res.on('end', () => {
					res.body = resBody;
					resolve(res); // resolve the request
				});
			});
			req.on('error', (e) => {
				this.loggedIn = false;
				util.log('got an e');
				reject(e);
			});
			req.setTimeout(3000, () => {
				req.abort();
				reject(Error('Connection timeout'));
			});
			req.end();
		});
	}
}

module.exports = Youless;

/*
info response:
{"model":"LS120","mac":"72:b8:ad:12:16:2d'"}

basicStatus response:
{ cnt: ' 16844,321',
  pwr: 3030,
  lvl: 73,
  dev: '(&plusmn;0%)',
  det: '',
  con: 'OK',
  sts: '(23)',
  ps0: 0,
  raw: 732,
	net: 16844.321,
	tm: 151447267 }

cnt: counter in kWh
pwr: Pwer consumption in Watt
lvl: moving average level (intensity of reflected light on analog meters)
dev: deviation of reflection
con: connection status
sts: Time until next status update with online monitoring
raw: raw 10-bit light reflection level (without averaging)
net: Netto counter cnt converted to a number
tm: time of retrieving info. unix-time-format (1489333828 => Sun, 12 Mar 2017 15:50:28 GMT)

additional  response for LS120 ^1.4 version firmware:
ps0: S0: Computed power


advancedStatus response:
{ tm: 1514472671,
net: 16844.321,
pwr: 3030,
ts0: 1514470438,
cs0: 0,
ps0: 0,
p1: 13192.24,
p2: 8453.663,
n1: 1303.886,
n2: 3497.696,
gas: 5469.084,
gts: 1712282000
gtm: 1514487600 }

"tm": unix-time-format (1489333828 => Sun, 12 Mar 2017 15:50:28 GMT)
"net": Netto counter, as displayed in the web-interface of the LS-120. It seems equal to: p1 + p2 - n1 - n2 Perhaps also includes some user set offset.
"pwr": Actual power use in Watt (can be negative)
"p1": P1 consumption counter (low tariff)
"p2": P2 consumption counter (high tariff)
"n1": N1 production counter (low tariff)
"n2": N2 production counter (high tariff)
"Gas": counter gas-meter (in m^3)

additional  response for ^1.4 version firmware:
ts0: S0: Unix timestamp of the last S0 measurement.
cs0: S0: kWh counter of S0 input
ps0: S0: Computed power
gts: Last timestamp created by the 'smart meter'. "1711032100" = 2017/11/03 21:00 (yyMMddhhmm) Can be used to see if P1 communication fails.
gtm: gts timestamp converted to unix-time-format

more detailed information on: http://wiki.td-er.nl/index.php?title=YouLess
*/
