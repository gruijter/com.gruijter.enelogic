/*
Copyright 2017 - 2022, Robin de Gruijter (gruijter@hotmail.com)

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

class Ledring {
	constructor(opts) {
		this.homey = opts.homey;
		this.animation = {};
		this.registerScreensaver(opts.screensaver);
	}

	async registerScreensaver(screenSaverId) {
		try {
			// init frames cyclops
			const frame = [];
			frame.push({ r: 80, g: 0, b: 0 }); // first pixel is red
			for (let pixel = 1; pixel < 24; pixel += 1) {
				frame.push({ r: 0, g: 80, b: 0 });
			}
			// create the animation
			this.animation = await this.homey.ledring.createAnimation({
				options: {
					fps: 1, 	// real frames per second
					tfps: 60, 	// target frames per second. this means that every frame will be interpolated 60 times
					rpm: 10,	// rotations per minute
				},
				frames: [frame],
				priority: 'INFORMATIVE',
				duration: false,
			});
			// register the animation as screensaver
			await this.animation.registerScreensaver(screenSaverId);
			this.homey.log(`${screenSaverId} ledring screensaver ready!`);
		} catch (error) {
			this.homey.error(error);
		}
	}

	change(deviceSettings, measurepower) {
		try {
			const frame = [];
			let limit = ((24 * measurepower) / deviceSettings.ledring_usage_limit).toFixed(0);
			if (measurepower >= 0) {	// consuming power makes ledring red
				if (deviceSettings.ledring_usage_limit === 0) {	// ignore change when limit setting is 0
					return;
				}
				if (limit > 24) { limit = 24; }
				for (let pixel = 0; pixel < 24; pixel += 1) {
					if (pixel < limit) {
						frame[pixel] = { r: 80,	g: 0,	b: 0	};
					} else { frame[pixel] = { r: 0, g: 80, b: 0 }; }
				}
			} else {	// producing power makes ledring blue
				if (deviceSettings.ledring_production_limit === 0) {	// ignore change when limit setting is 0
					return;
				}
				limit = -((24 * measurepower) / deviceSettings.ledring_production_limit).toFixed(0);
				if (limit > 24) { limit = 24; }
				for (let pixel = 0; pixel < 24; pixel += 1) {
					if (pixel < limit) {
						frame[pixel] = { r: 0,	g: 0,	b: 120 };
					} else { frame[pixel] = { r: 0, g: 80, b: 0 }; }
				}
			}
			this.animation.updateFrames([frame]);
		} catch (error) {
			this.homey.error(error);
		}
	}

}

module.exports = Ledring;
