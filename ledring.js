"use strict";

Homey.log("ledring.js started");


//module.exports.init = function() {         // enelogic_power animation init

  var Animation = Homey.manager('ledring').Animation;

  global.frames_enelogic_power = [];
  global.frame_enelogic_power = [];

  // for every pixel...
  for( var pixel = 0; pixel < 24; pixel++ ) {
  	if( pixel < 1) {
  		frame_enelogic_power.push({
  			r: 255,	g: 0,	b: 0
  		});
  	} else {
  		frame_enelogic_power.push({
  			r: 0, g: 255, b: 0
  		})
  	}
  }
  frames_enelogic_power.push(frame_enelogic_power);

  var animation_enelogic_power = new Animation({

      options: {
          fps     : 1, 	// real frames per second
          tfps    : 60, 	// target frames per second. this means that every frame will be interpolated 60 times
          rpm     : 10,	// rotations per minute
      },
      frames    : frames_enelogic_power
  })

  animation_enelogic_power.register(function(err, result){
  	Homey.manager('ledring').registerScreensaver('enelogic_power', animation_enelogic_power)
  	if( err ) return Homey.error(err);
    Homey.log("enelogic_power ledring animation is registered");
  	animation_enelogic_power.on('screensaver_start', function( screensaver_id ){
  //		Homey.log('Screensaver started');
  	})
  	animation_enelogic_power.on('screensaver_stop', function( screensaver_id ){
//  		Homey.log('Screensaver stopped')
  	})
  })

//}      // End enelogic_power animation init


module.exports.change = function (device_data, measure_power, callback) {

  //Homey.log("entering ledring change");

  if (measure_power>=0) {     // consuming power makes ledring red

    if (device_data.ledring_usage_limit==0) {  // ignore change when limit setting is 0
      callback("ledring not changed");
      return
    }

    var limit = (24 * measure_power / device_data.ledring_usage_limit).toFixed(0);
    //Homey.log("limit is: "+limit);
    if (limit > 24) { limit = 24};
    for( var pixel = 0; pixel < 24; pixel++ ) {
      if( pixel < limit) {
        frame_enelogic_power[pixel]={
          r: 80,	g: 0,	b: 0
        };
      } else {
          frame_enelogic_power[pixel]={
            r: 0, g: 80, b: 0
          }
        }
      }
    frames_enelogic_power[0]=frame_enelogic_power;
  }

  else {             // producing power makes ledring blue

    if (device_data.ledring_production_limit==0) {  // ignore change when limit setting is 0
      callback("ledring not changed");
      return
    };

      var limit = -(24 * measure_power / device_data.ledring_production_limit).toFixed(0);
      //Homey.log("limit is: "+limit);
      if (limit > 24) { limit = 24};
      for( var pixel = 0; pixel < 24; pixel++ ) {
          if( pixel < limit) {
            frame_enelogic_power[pixel]={
              r: 0,	g: 0,	b: 120
            };
          } else {
              frame_enelogic_power[pixel]={
                r: 0, g: 80, b: 0
              }
            }
        }
      frames_enelogic_power[0]=frame_enelogic_power;
    }

  animation_enelogic_power.updateFrames(frames_enelogic_power);
  callback("ledring changed");

}
