/*
Copyright 2017 - 2021, Robin de Gruijter (gruijter@hotmail.com)

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

const http = require('http');
// const util = require('util');

const eMeterPath = '/cgi/electricityMeter/update';
const gMeterPath = '/cgi/gasMeter/update';
const defaultPort = 1000;

const regexDetected = new RegExp(/<detected>(.*?)<\/detected>/);
const regexSwtch = new RegExp(/<text id="e_switch">(.*?)<\/text>/);
const regexMeasurePower = new RegExp(/<reading id="p_consumed" unit="kW">(.*?)<\/reading>/);
const regexMeasurePowerProduced = new RegExp(/<reading id="p_produced" unit="kW">(.*?)<\/reading>/);
const regexPowerPeak = new RegExp(/<reading id="e_consumed_2" unit="kWh">(.*?)<\/reading>/);
const regexPowerOffpeak = new RegExp(/<reading id="e_consumed_1" unit="kWh">(.*?)<\/reading>/);
const regexPowerPeakProduced = new RegExp(/<reading id="e_produced_2" unit="kWh">(.*?)<\/reading>/);
const regexPowerOffpeakProduced = new RegExp(/<reading id="e_produced_1" unit="kWh">(.*?)<\/reading>/);
const regexGas = new RegExp(/<reading id="consumed" unit="m3">(.*?)<\/reading>/);
const regexValve = new RegExp(/<text id="valve">(.*?)<\/text>/);

class Enelogic {
	// Represents a session to a enelogic device.
	constructor(host, port) {
		this.host = host;
		this.port = port || defaultPort;
	}

	getEMeter(host, port) {
		this.host = host || this.host;
		this.port = port || this.port;
		return new Promise((resolve, reject) => {
			this._makeRequest(eMeterPath)
				.then((result) => {
					let readings = {};
					try {
						const detected = regexDetected.exec(result.body)[1];
						const swtch = regexSwtch.exec(result.body)[1];
						const measurePower = 1000 * Number(regexMeasurePower.exec(result.body)[1]);
						const measurePowerProduced = 1000 * Number(regexMeasurePowerProduced.exec(result.body)[1]);
						const powerPeak = Number(regexPowerPeak.exec(result.body)[1]);
						const powerOffpeak = Number(regexPowerOffpeak.exec(result.body)[1]);
						const powerPeakProduced = Number(regexPowerPeakProduced.exec(result.body)[1]);
						const powerOffpeakProduced = Number(regexPowerOffpeakProduced.exec(result.body)[1]);
						readings = {
							detected,
							swtch,
							measurePower,
							measurePowerProduced,
							powerPeak,
							powerOffpeak,
							powerPeakProduced,
							powerOffpeakProduced,
						};
					}	catch (error) {
						reject(Error('Error parsing power information'));
						return readings;
					}
					return resolve(readings);
				})
				.catch((error) => {
					reject(error);	// request failed
				});
		});
	}

	getGMeter(host, port) {
		this.host = host || this.host;
		this.port = port || this.port;
		return new Promise((resolve, reject) => {
			this._makeRequest(gMeterPath)
				.then((result) => {
					let readings = {};
					try {
						const detected = regexDetected.exec(result.body)[1];
						const valve = regexValve.exec(result.body)[1];
						const gas = Number(regexGas.exec(result.body)[1]);
						readings = {
							detected,
							valve,
							gas,
						};
					}	catch (error) {
						reject(Error('Error parsing gas information'));
						return readings;
					}
					return resolve(readings);
				})
				.catch((error) => {
					reject(error);	// request failed
				});
		});
	}

	_makeRequest(action) {
		return new Promise((resolve, reject) => {
			const headers = {
				Connection: 'keep-alive',
			};
			const options = {
				hostname: this.host,
				port: 1000,
				path: action,
				headers,
				method: 'GET',
			};
			const req = http.request(options, (res) => {
				const { statusCode } = res;
				const contentType = res.headers['content-type'];
				let error;
				if (statusCode !== 200) {
					error = new Error(`Request Failed. Status Code: ${statusCode}`);
				} else if (!/^text\/xml/.test(contentType)) {
					error = new Error(`Invalid content-type. Expected text/xml but received ${contentType}`);
				}
				if (error) {
					// consume response data to free up memory
					res.resume();
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
				reject(e);
			});
			req.setTimeout(8000, () => {
				req.abort();
				reject(Error('Connection timeout'));
			});
			req.end();
		});
	}

}

module.exports = Enelogic;

/*
gasMeter xml:
<update>
	<detected>true</detected>
	<reading id="consumed" unit="m3">5349.409000</reading>
	<text id="valve">off</text>
</update>

gasMeter JSON:
{
	detected: 'false',
	valve: 'off',
	gas: 5349.409,
};

eMeter xml:
<update>
	<detected>true</detected>
	<reading id="e_consumed_1" unit="kWh">9773.940000</reading>
	<reading id="e_consumed_2" unit="kWh">8459.415000</reading>
	<reading id="e_produced_1" unit="kWh">0.001000</reading>
	<reading id="e_produced_2" unit="kWh">0.000000</reading>
	<reading id="p_consumed" unit="kW">0.260000</reading>
	<reading id="p_produced" unit="kW">0.000000</reading>
	<text id="e_switch">out</text>
</update>

eMeter JSON:
{
	detected: 'true',
	swtch: 'out',
	measurePower: 0.26,
	measurePowerProduced: 0,
	powerPeak: 8459.415,
	powerOffpeak: 9773.94,
	powerPeakProduced: 0,
	powerOffpeakProduced: 0.001,
};
*/
