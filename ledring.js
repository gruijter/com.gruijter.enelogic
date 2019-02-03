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

const framesPower = [];
const framePower = [];
const myAnimation = new Homey.LedringAnimation({
	options: {
		fps: 1, 	// real frames per second
		tfps: 60, 	// target frames per second. this means that every frame will be interpolated 60 times
		rpm: 10,	// rotations per minute
	},
	frames: framesPower,
	duration: false,
});

const registerScreensaver = async () => {
	try {
		// Homey V2 racing issues resolver
		await setTimeoutPromise(3 * 1000, 'waiting is done');
		// Init frame for every pixel...
		for (let pixel = 0; pixel < 24; pixel += 1) {
			if (pixel < 1) {
				framePower.push({ r: 80, g: 0, b: 0 });
			} else {
				framePower.push({ r: 0, g: 80, b: 0 });
			}
		}
		framesPower.push(framePower);
		await myAnimation
			// .on('start', () => {
			// 	// The animation has started playing
			// 	console.log('animation started');
			// })
			// .on('stop', () => {
			// 	// The animation has stopped playing
			// 	console.log('animation stopped');
			// })
			.register();
		// Homey V2 racing issues resolver
		await setTimeoutPromise(3 * 1000, 'waiting is done');
		// await myAnimation.start();
		// await myAnimation.stop();
		await myAnimation.registerScreensaver('enelogic_power');
		// Homey V2 racing issues resolver
		await setTimeoutPromise(3 * 1000, 'waiting is done');
		myAnimation.updateFrames(framesPower);
		Homey.app.log('Ledring screensaver ready!');
	} catch (error) {
		Homey.app.log(error);
	}
};

class Ledring {
	constructor() {
		this.log = Homey.app.log;
		this.animation = myAnimation;
		registerScreensaver();
		this.log('ledring.js started');
	}

	change(deviceSettings, measurepower) {
		// Homey.app.log('entering ledring change');
		let limit = ((24 * measurepower) / deviceSettings.ledring_usage_limit).toFixed(0);
		if (measurepower >= 0) {	// consuming power makes ledring red
			if (deviceSettings.ledring_usage_limit === 0) {	// ignore change when limit setting is 0
				// Homey.app.log('ledring not changed');
				return;
			}
			// this.log("limit is: "+limit);
			if (limit > 24) { limit = 24; }
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < limit) {
					framePower[pixel] = { r: 80,	g: 0,	b: 0	};
				} else { framePower[pixel] = { r: 0, g: 80, b: 0 }; }
			}
			framesPower[0] = framePower;
		} else {	// producing power makes ledring blue
			if (deviceSettings.ledring_production_limit === 0) {	// ignore change when limit setting is 0
				// this.log('ledring not changed');
				return;
			}
			// this.log("limit is: " + limit);
			limit = -limit;
			if (limit > 24) { limit = 24; }
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < limit) {
					framePower[pixel] = { r: 0,	g: 0,	b: 120 };
				} else { framePower[pixel] = { r: 0, g: 80, b: 0 }; }
			}
			framesPower[0] = framePower;
		}
		this.animation.updateFrames(framesPower)
			.catch((error) => {
				this.log(error);
			});
		// this.log('ledring changed');
	}

}

module.exports = Ledring;
