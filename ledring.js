/*
Copyright 2017 - 2019, Robin de Gruijter (gruijter@hotmail.com)

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
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

class Ledring {
	constructor(screensaver) {
		this.log = Homey.app.log;
		this.framesPower = [];
		this.framePower = [];
		this.animation = new Homey.LedringAnimation({
			options: {
				fps: 1, 	// real frames per second
				tfps: 60, 	// target frames per second. this means that every frame will be interpolated 60 times
				rpm: 10,	// rotations per minute
			},
			frames: this.framesPower,
			duration: false,
		});
		this.registerScreensaver(screensaver);
	}

	async registerScreensaver(screensaver) {
		try {
			// Homey V2 racing issues resolver
			await setTimeoutPromise(1 * 1000, 'waiting is done');
			// Init frame for every pixel...
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < 1) {
					this.framePower.push({ r: 80, g: 0, b: 0 });
				} else {
					this.framePower.push({ r: 0, g: 80, b: 0 });
				}
			}
			this.framesPower.push(this.framePower);
			await this.animation
				.register();
			// Homey V2 racing issues resolver
			await setTimeoutPromise(1 * 1000, 'waiting is done');
			await this.animation.registerScreensaver(screensaver);
			// Homey V2 racing issues resolver
			await setTimeoutPromise(1 * 1000, 'waiting is done');
			this.animation.updateFrames(this.framesPower);
			Homey.app.log(`${screensaver} ledring screensaver ready!`);
		} catch (error) {
			Homey.app.log(error);
		}
	}

	change(deviceSettings, measurepower) {
		let limit = ((24 * measurepower) / deviceSettings.ledring_usage_limit).toFixed(0);
		if (measurepower >= 0) {	// consuming power makes ledring red
			if (deviceSettings.ledring_usage_limit === 0) {	// ignore change when limit setting is 0
				return;
			}
			if (limit > 24) { limit = 24; }
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < limit) {
					this.framePower[pixel] = { r: 80,	g: 0,	b: 0	};
				} else { this.framePower[pixel] = { r: 0, g: 80, b: 0 }; }
			}
			this.framesPower[0] = this.framePower;
		} else {	// producing power makes ledring blue
			if (deviceSettings.ledring_production_limit === 0) {	// ignore change when limit setting is 0
				return;
			}
			limit = -limit;
			if (limit > 24) { limit = 24; }
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < limit) {
					this.framePower[pixel] = { r: 0,	g: 0,	b: 120 };
				} else { this.framePower[pixel] = { r: 0, g: 80, b: 0 }; }
			}
			this.framesPower[0] = this.framePower;
		}
		this.animation.updateFrames(this.framesPower)
			.catch((error) => {
				this.log(error);
			});
	}

}

module.exports = Ledring;
