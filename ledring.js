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
along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');

class Ledring {
	constructor() {
		Homey.app.log('ledring.js started');
		this.framesPower = [];
		this.framePower = [];

		// Init frame for every pixel...
		for (let pixel = 0; pixel < 24; pixel += 1) {
			if (pixel < 1) {
				this.framePower.push({ r: 80,	g: 0,	b: 0 });
			} else {
				this.framePower.push({ r: 0, g: 80, b: 0 });
			}
		}
		this.framesPower.push(this.framePower);

		this.myAnimation = new Homey.LedringAnimation({
			options: {
				fps: 1, 		// real frames per second
				tfps: 60, 	// target frames per second. this means that every frame will be interpolated 60 times
				rpm: 10,		// rotations per minute
			},
			frames: this.framesPower,
		});

		// register the animation with Homey
		this.myAnimation
			.on('start', () => {
				// The animation has started playing
			})
			.on('stop', () => {
				// The animation has stopped playing
			})
			.register()
			.then(() => {
				// Homey.app.log('Animation registered!');
				// myAnimation.start();
				// register the screensaver with Homey
				this.myAnimation.registerScreensaver('enelogic_power')
					.then(() => {
						Homey.app.log('screensaver registered!');
					})
					.catch((error) => {
						Homey.app.log(error);
					});
			})
			.catch((error) => {
				Homey.app.log(error);
			});
	}

	change(deviceSettings, measurepower) {
		// Homey.app.log('entering ledring change');
		let limit = ((24 * measurepower) / deviceSettings.ledring_usage_limit).toFixed(0);
		if (measurepower >= 0) {	// consuming power makes ledring red
			if (deviceSettings.ledring_usage_limit === 0) {	// ignore change when limit setting is 0
				// Homey.app.log('ledring not changed');
				return;
			}
			// Homey.app.log("limit is: "+limit);
			if (limit > 24) { limit = 24; }
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < limit) {
					this.framePower[pixel] = { r: 80,	g: 0,	b: 0	};
				} else { this.framePower[pixel] = { r: 0, g: 80, b: 0 }; }
			}
			this.framesPower[0] = this.framePower;
		} else {	// producing power makes ledring blue
			if (deviceSettings.ledring_production_limit === 0) {	// ignore change when limit setting is 0
				// Homey.app.log('ledring not changed');
				return;
			}
			// Homey.app.log("limit is: " + limit);
			limit = -limit;
			if (limit > 24) { limit = 24; }
			for (let pixel = 0; pixel < 24; pixel += 1) {
				if (pixel < limit) {
					this.framePower[pixel] = { r: 0,	g: 0,	b: 120 };
				} else { this.framePower[pixel] = { r: 0, g: 80, b: 0 }; }
			}
			this.framesPower[0] = this.framePower;
		}
		this.myAnimation.updateFrames(this.framesPower)
			.catch((error) => {
				Homey.app.log(error);
			});
		// Homey.app.log('ledring changed');
	}


}

module.exports = Ledring;
