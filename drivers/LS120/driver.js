/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-destructuring */
/*
Copyright 2017 - 2024, Robin de Gruijter (gruijter@hotmail.com)

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
const Youless = require('youless');
const Ledring = require('../../ledring');

class LS120Driver extends Homey.Driver {

  onInit() {
    this.log('entering LS120 driver');
    this.ledring = new Ledring({ screensaver: 'youless_p1', homey: this.homey });
  }

  async onPair(session) {
    session.setHandler('discover', async () => {
      this.log('device discovery started');
      const youless = new Youless(); // password, host, [port]
      const discovered = await youless.discover();
      return JSON.stringify(discovered); // report success to frontend
    });
    session.setHandler('validate', async (data) => {
      try {
        this.log('save button pressed in frontend');
        const options = {
          password: data.password,
          host: data.youLessIp,
          port: data.port,
        };
        const youless = new Youless(options); // password, host, [port]
        await youless.login();
        const info = await youless.getInfo();
        if (info.model !== 'LS120') {
          throw Error('Incorrect youless model found');
        }
        const device = {
          name: `${info.model}P1_${info.host}`,
          data: { id: `LS120P1_${info.mac}` },
          settings: {
            youLessIp: options.host,
            port: options.port,
            password: options.password,
            model: info.model,
            mac: info.mac,
            ledring_usage_limit: 3000,
            ledring_production_limit: 3000,
            include_off_peak: data.includeOffPeak,
            include_production: data.includeProduction,
            include_gas: data.includeGas,
            include3phase: data.include3phase,
            includeWater: data.includeWater,
          },
          capabilities: [],
          // 'measure_gas',
          // 'meter_offPeak',
          // 'measure_power', // total power
          // 'measure_power.l1',
          // 'measure_power.l2',
          // 'measure_power.l3',
          // 'measure_current.l1',
          // 'measure_current.l2',
          // 'measure_current.l3',
          // 'measure_voltage.l1',
          // 'measure_voltage.l2',
          // 'measure_voltage.l3',
          // 'meter_power.peak',
          // 'meter_power.offPeak',
          // 'meter_power.producedPeak',
          // 'meter_power.producedOffPeak',
          // 'meter_power', // total energy
          // 'meter_gas',
          // 'meter_water',
          // 'measure_water'
          // ],
        };

        const settings = device.settings;
        const p1Status = await youless.getP1Status().catch(this.error);
        // set capability(order)
        const correctCaps = [];
        if (settings.include_off_peak) {
          correctCaps.push('meter_offPeak');
        }
        correctCaps.push('measure_power'); // always include measure_power
        if (p1Status && p1Status.l1) { //  has current and power per phase
          correctCaps.push('measure_power.l1');
          if (settings.include3phase) {
            correctCaps.push('measure_power.l2');
            correctCaps.push('measure_power.l3');
          }
          correctCaps.push('measure_current.l1');
          if (settings.include3phase) {
            correctCaps.push('measure_current.l2');
            correctCaps.push('measure_current.l3');
          }
        }
        if (p1Status && p1Status.v1) { // has voltage per phase
          correctCaps.push('measure_voltage.l1');
          if (settings.include3phase) {
            correctCaps.push('measure_voltage.l2');
            correctCaps.push('measure_voltage.l3');
          }
        }
        if (settings.include_off_peak) {
          correctCaps.push('meter_power.peak');
          correctCaps.push('meter_power.offPeak');
        }
        if (settings.include_production) {
          correctCaps.push('meter_power.producedPeak');
        }
        if (settings.include_production && settings.include_off_peak) {
          correctCaps.push('meter_power.producedOffPeak');
        }
        correctCaps.push('meter_power'); // always include meter_power
        correctCaps.push('meter_power.imported'); // always include meter_power.imported
        correctCaps.push('meter_power.exported'); // always include meter_power.exported
        if (settings.include_gas) {
          correctCaps.push('measure_gas');
          correctCaps.push('meter_gas');
        }
        if (settings.includeWater) {
          correctCaps.push('measure_water');
          correctCaps.push('meter_water');
        }
        device.capabilities = correctCaps;
        return JSON.stringify(device); // report success to frontend
      } catch (error) {
        this.error('Pair error', error);
        if (error.code === 'EHOSTUNREACH') {
          throw Error('Incorrect IP address');
        } else throw error;
      }
    });
  }

}

module.exports = LS120Driver;
