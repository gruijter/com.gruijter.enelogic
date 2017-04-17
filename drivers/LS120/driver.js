"use strict";

Homey.log("entering driver.js");

const http = require('http');
const util = require('util');
const ledring = require("../../ledring.js");
var devices = {};
var intervalId = {};

module.exports.init = function(devices_data, callback) {
    Homey.log("init in driver.js started");
    devices_data.forEach(initDevice);

    Homey.manager('flow').on('condition.offPeakLS120', function( callback, args ){
      Homey.log(args);
      let result = devices[args.enelogic.id].last_offPeak;
      Homey.log("condition flow requested, offPeak is: "+result);
      callback( null, result );
    });
    callback(null, true);
};

module.exports.pair = function(socket) {
    // Validate enelogic connection data
    socket.on('validate', function (server_data, callback){
      validateConnection(server_data, function(error, result) {
        if (!error) {
          Homey.log('Pairing successful');
          callback(null, result);
        }
        if (error) {
          Homey.log('Pairing unsuccessful');
          callback( error, null );
        }
      });
    });
};

// the `added` method is called is when pairing is done and a device has been added for firmware 8.33+
module.exports.added = function( device_data, callback ) {
    Homey.log("initializing device ");
    Homey.log(device_data);
    initDevice( device_data );
    callback( null, true );
}

module.exports.deleted = function(device_data, callback) {
    Homey.log('Deleting ' + device_data.id);
    clearInterval(intervalId[device_data.id]); //end polling of device for readings
    setTimeout(function() {         //wait for running poll to end
      delete devices[device_data.id];
    },5000);
    callback(null, true);
};

module.exports.renamed = function( device_data, new_name ) {
    Homey.log(devices[device_data.id].name + ' has been renamed to ' + new_name);
    devices[device_data.id].name = new_name;
//    Homey.log(devices[device_data.id].name);
  };

module.exports.settings = function(device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
	// run when the user has changed the device's settings in Homey.
  if (devices[device_data.id]==undefined){
    Homey.log("not ready with device init, ignoring change");
    callback( 'error: device does not exist (yet)', null ); //  settings must not be saved
    return
  };

  Homey.log(devices[device_data.id].name + ' has new settings for ' + changedKeysArr);
  Homey.log(device_data);
  Homey.log('old settings: ');
  Homey.log(oldSettingsObj);
  Homey.log('new settings: ')
  Homey.log(newSettingsObj);

  if ( parseInt(newSettingsObj.ledring_usage_limit) < 0 || !Number.isInteger(newSettingsObj.ledring_usage_limit) ||
       parseInt(newSettingsObj.ledring_production_limit) < 0 || !Number.isInteger(newSettingsObj.ledring_production_limit) ) {

    Homey.log('Ledring setting is invalid, ignoring new settings');
    callback( "Ledring settings must be a positive integer number", null ); //  settings must not be saved
    return
  };

  if (newSettingsObj.enelogicIp==oldSettingsObj.enelogicIp) {
    Homey.log('Storing new ledring settings');
    devices[device_data.id].ledring_usage_limit=newSettingsObj.ledring_usage_limit;
    devices[device_data.id].ledring_production_limit=newSettingsObj.ledring_production_limit;
    callback(null, true); 	// always fire the callback, or the settings won't change!
    return
  }
  else {
    validateConnection(newSettingsObj, function(error, result) {
      if (!error) {
        Homey.log('Storing new device settings');
        devices[device_data.id].enelogicIp=newSettingsObj.enelogicIp;
        devices[device_data.id].ledring_usage_limit=newSettingsObj.ledring_usage_limit;
        devices[device_data.id].ledring_production_limit=newSettingsObj.ledring_production_limit;

        callback(null, true); 	// always fire the callback, or the settings won't change!
      }
      if (error) {
        Homey.log('Connection is invalid, ignoring new settings');
        callback( error, null ); //  settings must not be saved
      }
    });
  }
};


module.exports.capabilities = {
  measure_power: {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        //callback(null, 0);
        return;
      };
      callback(null, device.last_measure_power);
    }
  },
  meter_offPeak: {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, false);
        return;
      };
      callback(null, device.last_offPeak);
    }
  },
  measure_gas: {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_measure_gas);
    }
  },
  meter_gas: {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_meter_gas);
    }
  },
  meter_power: {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_meter_power);
    }
  },
  "meter_power.peak": {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_meter_power_peak);
    }
  },
  "meter_power.offPeak": {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_meter_power_offpeak);
    }
  },
  "meter_power.producedPeak": {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_meter_power_peak_produced);
    }
  },
  "meter_power.producedOffPeak": {
    get: function(device_data, callback) {
      let device = devices[device_data.id];
      if (device==undefined){
        callback();//null, 0);
        return;
      };
      callback(null, device.last_meter_power_offpeak_produced);
    }
  }
};

function validateConnection(server_data, callback) {  // Validate enelogic connection data
    Homey.log('Validating', server_data);

    let options = {
        host: server_data.enelogicIp,
        port: 80,
        path: '/e',
        };

    http.get(options, function(res){
        let body = "";
        res.on('data', function(data) {
            body += data;
        });

        res.on('end', function() {
            Homey.log(body);
            let result = tryParseJSON(body)[0];
            Homey.log(util.inspect(result, false, 10, true));
            if (safeRead(result, 'tm') != undefined){   // check if json data exists
              Homey.log('Connecting successful!');
              callback(null, result);
              return;
            }
            Homey.log('Error during connecting');
            callback(res.statusCode, null);
        })
    }).on('error', function(err) {
          Homey.log("Got error: " + err.message);
          Homey.log('Error during connecting');
          callback(err, null);
        });
};   // end validate routine


function initDevice(device_data) {
  Homey.log("entering initDevice");
  //initDevice: retrieve device settings, buildDevice and start polling it
  Homey.log("getting settings");
  module.exports.getSettings( device_data, function( err, settings ){
    if (err) {
      Homey.log("error retrieving device settings");
    } else {    // after settings received build the new device object
      Homey.log("retrieved settings are:");
      Homey.log(util.inspect(settings, true, 10, true));
      buildDevice(device_data, settings);
      startPolling(device_data);
    }
  });
}//end of initDevice

function buildDevice (device_data, settings){
  devices[device_data.id] = {
    id         : device_data.id,
    name       : settings.name,
    enelogicIp    : settings.enelogicIp,
    ledring_usage_limit               : settings.ledring_usage_limit,
    ledring_production_limit          : settings.ledring_production_limit,
    last_measure_gas                  : 0,       //"measure_gas" (m3)
    last_meter_gas                    : null,    //"meter_gas" (m3)
    last_measure_power                : 0,       //"measure_power" (W)
    last_meter_power                  : null,    //"meter_power" (kWh)
    last_meter_power_peak             : null,    //"meter_power_peak" (kWh)
    last_meter_power_offpeak          : null,    //"meter_power_offpeak" (kWh)
    last_meter_power_peak_produced    : null,    //"meter_power_peak_produced" (kWh)
    last_meter_power_offpeak_produced : null,    //"meter_power_offpeak_produced" (kWh)
    last_meter_power_interval         : null,    // meter_power at last interval (kWh)
    last_meter_power_interval_tm        : null,    // timestamp
    last_offPeak                      : null,//"meter_power_offpeak" (true/false)
    readings                          : {},   //or settings.readings
    homey_device                      : device_data // device_data object from moment of pairing
  };
  Homey.log("init buildDevice is: " );
  Homey.log(devices[device_data.id] );
}

function startPolling(device_data){     //start polling device for readings every 10 seconds
  intervalId[device_data.id] = setInterval(function () {
    checkProduction(devices[device_data.id])
    }, 10000);
}

//function to safely get property without risk of "Cannot read property"
function safeRead (instance, path) {
  return path.split('.').reduce((p, c) => p ? p[c] : undefined,instance);
};

//function to prevent "Unexpected token" errors
function tryParseJSON (jsonString){
    try {
        var o = JSON.parse(jsonString);
        if (o && typeof o === "object" && o !== null) {
            //Homey.log("JSON past")
            return o;
        } else {
            Homey.log("Not a valid JSON")
        }
    }
    catch (e) {
        Homey.log("Not a valid JSON")
    }
    return false;
};

function checkProduction(device_data, callback) {
// Homey.log("checking e-meter for "+device_data)
  let options = {
      host: device_data.enelogicIp,
      port: 80,
      path: '/e',
      };

  http.get(options, function(res){
    let body = "";
    res.on('data', function(data) {
        body += data;
    });

    res.on('end', function() {
      //Homey.log(body);
      let result = tryParseJSON(body)[0];
      //app is initializing or data is corrupt
      if (safeRead(result, 'tm') != undefined){   // check if json data exists
        //Homey.log('New enelogic data received');
        module.exports.setAvailable(devices[device_data.id].homey_device);
        device_data.readings=result;
        handleNewReadings(device_data);
        return;
      }
      Homey.log('Error reading device');
      module.exports.setUnavailable(devices[device_data.id].homey_device, err );
    })

  }).on('error', function(err) {
      Homey.log("Got error: " + err.message);
      Homey.log('Error reading device');
      module.exports.setUnavailable(devices[device_data.id].homey_device, err.message);
    });
}


function handleNewReadings ( device_data ) {
  //Homey.log("storing new readings");
//  Homey.log(util.inspect(device_data, false, 10, true));

  //app is initializing or data is corrupt
  if (safeRead(device_data, 'readings') == undefined ){
    return
  };

// init all readings
  let electricity_point_meter_consumed;
  let electricity_point_meter_produced = -device_data.last_measure_power;
  let electricity_cumulative_meter_offpeak_produced = device_data.last_meter_power_offpeak_produced;
  let electricity_cumulative_meter_peak_produced = device_data.last_meter_power_peak_produced;
  let electricity_cumulative_meter_offpeak_consumed = device_data.last_meter_power_offpeak;
  let electricity_cumulative_meter_peak_consumed =  device_data.last_meter_power_peak;
  let last_meter_power_interval = device_data.last_meter_power_interval;
  let last_meter_power_timestamp = device_data.last_meter_power_interval_tm;
  let measure_gas = device_data.last_measure_gas;

// gas readings from device
  let meter_gas = Number(safeRead(device_data,'readings.gas')); //gas_cumulative_meter
  if (device_data.last_meter_gas != null) {
    measure_gas = Math.round((meter_gas-device_data.last_meter_gas) * 100) / 100; //gas_interval_meter (1h)
  };

// electricity readings from device
  //electricity_point_meter_produced = Number(safeRead(device_data,'readings.pwr')); //electricity_point_meter_produced
  electricity_point_meter_consumed = Number(safeRead(device_data,'readings.pwr')); //electricity_point_meter_consumed
  electricity_cumulative_meter_offpeak_produced = Number(safeRead(device_data,'readings.n1')) ; //electricity_cumulative_meter_offpeak_produced
  electricity_cumulative_meter_peak_produced = Number(safeRead(device_data,'readings.n2')) ; //electricity_cumulative_meter_peak_produced
  electricity_cumulative_meter_offpeak_consumed = Number(safeRead(device_data,'readings.p1')) ; //electricity_cumulative_meter_offpeak_consumed
  electricity_cumulative_meter_peak_consumed = Number(safeRead(device_data,'readings.p2')) ; //electricity_cumulative_meter_peak_consumed
  last_meter_power_timestamp = safeRead(device_data,'readings.tm');

//constructed readings
  let meter_power = (electricity_cumulative_meter_offpeak_consumed + electricity_cumulative_meter_peak_consumed - electricity_cumulative_meter_offpeak_produced - electricity_cumulative_meter_peak_produced);
  let measure_power = electricity_point_meter_consumed ; //- electricity_point_meter_produced;
  let measure_power_delta = (measure_power - device_data.last_measure_power);
  let offPeak = device_data.last_offPeak;
  if ( (electricity_cumulative_meter_offpeak_produced-device_data.last_meter_power_offpeak_produced+electricity_cumulative_meter_offpeak_consumed-device_data.last_meter_power_offpeak+
    electricity_cumulative_meter_peak_produced-device_data.last_meter_power_peak_produced+electricity_cumulative_meter_peak_consumed-device_data.last_meter_power_peak) != 0)
    {
      offPeak = ( (electricity_cumulative_meter_offpeak_produced-device_data.last_meter_power_offpeak_produced)>0 || (electricity_cumulative_meter_offpeak_consumed-device_data.last_meter_power_offpeak)>0 );
    };

  //measure_power_produced 2 minutes average
  if ( device_data.last_meter_power_interval_tm== null){
    device_data.last_meter_power_interval = meter_power;
    device_data.last_meter_power_interval_tm = last_meter_power_timestamp
  };
  if ( (last_meter_power_timestamp - device_data.last_meter_power_interval_tm) >= 120 && device_data.last_meter_power_interval_tm != null) {
    electricity_point_meter_produced = (3600000/120*(device_data.last_meter_power_interval - meter_power));
    device_data.last_meter_power_interval = meter_power;
    device_data.last_meter_power_interval_tm = last_meter_power_timestamp;
  };

 //correct measure_power with average measure_power_produced in case point_meter_produced is always zero
  if (measure_power == 0 && electricity_point_meter_produced > 0) {
    measure_power = 0 - electricity_point_meter_produced;
  };

  //Homey.log(device_data.last_offPeak);
  if (offPeak != device_data.last_offPeak) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_offPeak", offPeak);

    // Trigger flow for tariff_changed
    Homey.manager('flow').triggerDevice('tariff_changed', {
      tariff: offPeak
      },
      null,
      devices[device_data.id].homey_device
    );
  };

//  Homey.log(measure_power);
  if (measure_power != device_data.last_measure_power) {
    //Homey.log.log(measure_power_delta);
    module.exports.realtime(devices[device_data.id].homey_device, "measure_power", measure_power);
// Trigger flow for power_changed
    Homey.manager('flow').triggerDevice('power_changed', {
      power: measure_power,
      power_delta: measure_power_delta
    },
      null,
      devices[device_data.id].homey_device
    );
//adapt ledring to match
      ledring.change(devices[device_data.id], measure_power, function (returntext) {
        //reseved for callback;
      });
  };

//  Homey.log(meter_power);
  if (meter_power != device_data.last_meter_power) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_power", meter_power)
  };
  if (electricity_cumulative_meter_peak_consumed != device_data.last_meter_power_peak) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_power.peak", electricity_cumulative_meter_peak_consumed)
  };
  if (electricity_cumulative_meter_offpeak_consumed != device_data.last_meter_power_offpeak) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_power.offPeak", electricity_cumulative_meter_offpeak_consumed)
  };
  if (electricity_cumulative_meter_peak_produced != device_data.last_meter_power_peak_produced) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_power.producedPeak", electricity_cumulative_meter_peak_produced)
  };
  if (electricity_cumulative_meter_offpeak_produced != device_data.last_meter_power_offpeak_produced) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_power.producedOffPeak", electricity_cumulative_meter_offpeak_produced)
  };
//  Homey.log(meter_gas);
  if (meter_gas != device_data.last_meter_gas) {
    module.exports.realtime(devices[device_data.id].homey_device, "meter_gas", meter_gas);
    module.exports.realtime(devices[device_data.id].homey_device, "measure_gas", measure_gas);
  };

  device_data.last_meter_power_peak             = electricity_cumulative_meter_peak_consumed;
  device_data.last_meter_power_offpeak          = electricity_cumulative_meter_offpeak_consumed;
  device_data.last_meter_power_peak_produced    = electricity_cumulative_meter_peak_produced;
  device_data.last_meter_power_offpeak_produced = electricity_cumulative_meter_offpeak_produced;
  device_data.last_measure_power                = measure_power;
  device_data.last_meter_power                  = meter_power;
  device_data.last_measure_gas                  = measure_gas;
  device_data.last_meter_gas                    = meter_gas;
  device_data.last_offPeak                      = offPeak;

  //Homey.log(device_data);

}
