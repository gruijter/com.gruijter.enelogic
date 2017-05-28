'use strict';

Homey.log('ledring.js started');

// module.exports.init = function() {         // enelogic_power animation init

const Animation = Homey.manager('ledring').Animation;

const framesPower = [];
const framePower = [];

// for every pixel...
for (let pixel = 0; pixel < 24; pixel++) {
	if (pixel < 1) {
		framePower.push({ r: 255,	g: 0,	b: 0 });
	} else {
		framePower.push({ r: 0, g: 255, b: 0 });
	}
}
framesPower.push(framePower);

const animationPower = new Animation({
	options: {
		fps: 1, 		// real frames per second
		tfps: 60, 	// target frames per second. this means that every frame will be interpolated 60 times
		rpm: 10,		// rotations per minute
	},
	frames: framesPower,
});

animationPower.register((err, result) => {
	Homey.manager('ledring').registerScreensaver('enelogic_power', animationPower);
	if (err) return Homey.error(err);
	Homey.log('enelogic_power ledring animation is registered');
	animationPower.on('screensaver_start', (screensaverId) => {
	//		Homey.log('Screensaver started');
	});
	animationPower.on('screensaver_stop', (screensaverId) => {
//  		Homey.log('Screensaver stopped')
	});
});

module.exports.change = (devicedata, measurepower) => {
// Homey.log("entering ledring change");
	let limit = (24 * measurepower / devicedata.ledring_usage_limit).toFixed(0);
	if (measurepower >= 0) {     // consuming power makes ledring red
		if (devicedata.ledring_usage_limit === 0) {  // ignore change when limit setting is 0
			Homey.log('ledring not changed');
			return;
		}
		// Homey.log("limit is: "+limit);
		if (limit > 24) { limit = 24; }
		for (let pixel = 0; pixel < 24; pixel++) {
			if (pixel < limit) {
				framePower[pixel] = { r: 80,	g: 0,	b: 0	};
			} else { framePower[pixel] = { r: 0, g: 80, b: 0 }; }
		}
		framesPower[0] = framePower;
	} else {             // producing power makes ledring blue
		if (devicedata.ledring_production_limit === 0) {  // ignore change when limit setting is 0
			Homey.log('ledring not changed');
			return;
		}

    // Homey.log("limit is: " + limit);
		limit = - limit;
		if (limit > 24) { limit = 24; }
		for (let pixel = 0; pixel < 24; pixel++) {
			if (pixel < limit) {
				framePower[pixel] = { r: 0,	g: 0,	b: 120 };
			} else { framePower[pixel] = { r: 0, g: 80, b: 0 }; }
		}
		framesPower[0] = framePower;
	}
	animationPower.updateFrames(framesPower);
	// Homey.log('ledring changed');
};
