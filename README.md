# Enelogic and YouLess - Reduce your CO2 footprint #

Know and act realtime on your power usage, power production, gas usage and water usage.

This Homey app integrates Enelogic P1 and YouLess LS110/LS120 energy meters. A direct connection over IP is used, so there is no dependency on the Enelogic cloud service.

![image][energy-insights-image]

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/2X/2/299dded923fcf0a98eb259837ba3aaf8776dd3f1.png" alt="flow" width="300"/>

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/2X/b/bcb4324be5981edf83ad4617a11b2b45a64f0668.png" alt="flow" width="250"/>


### Analogue Energy meter ###
The LS110/LS120 driver provides logs and flow cards for the following data:
- Actual power usage/production (W, 10s interval)
- Totalized power meter (kWh, 10s updates)

### S0 Energy meter ###
The LS120 S0 driver provides logs and flow cards for the following data:
- Actual power usage/production (W, 10s interval)
- Totalized power meter (kWh, 10s updates)

### P1 Energy and Gas meter ###
With the P1 connection on the LS120 or Enelogic you get the following extra's:
- All individual power meters (kWh, 10s updates)
- Recent gas usage (m3, of the previous hour)
- Gas meter (m3, 1 hour updates)
- Tariff change (off-peak, true or false)

### S0 Water meter ###
The LS120 S0 driver can be used with a pulse water meter.
It provides logs and flow cards for the following data:
- Actual water flow (L/min)
- Water meter (m3)
The required pulse meter depends on your type of water meter. See for more info here: [pulse meters]

**Ledring screensaver:**
- See how much energy you are using or producing just by looking at your Homey!
- Is the wash-dryer ready? Am I now producing power to the grid?

The power is totalized for consumed and produced power, during off-peak and peak hours. Production to the powergrid is displayed as negative watts. Only changed values are logged.


### Free optical Watermeter ###
<img src="https://forum.athom.com/uploads/editor/wb/kkyxklvl0jqc.jpg" alt="water meter" width="300"/>

This **experimental** driver makes use of the optical sensor of the YouLess LS110 and LS120. It has successfully been tested on water meters from Vitens ([type 1]). Place the optical sensor on the rotating mirror. Exact positioning is required. See the detailed [installation manual] for further instructions.

![image][water-insights-image]

The water meter driver provides logs and flow cards for the following data:
- Actual water flow (L/min, 60s average)
- Water meter (m3)

![image][water-mobile-card-image]

The water meter driver can be installed additionally to the power meter driver. If you use the LS120 with P1 connection, you will get all electricity meters, the gas meter and the water meter simultaneously from one YouLess device! The water meter driver uses the raw reflectiveness of the optical sensor. It has to poll the YouLess 3x per second, which puts significant load on your Homey and your WiFi network, especially when water is being used (burst mode is then switched on). I'm working with YouLess to get them to support water meters in the firmware so that it takes off the load from Homey and the network, and also increases accuracy of the meter. But this has no priority with them since they believe there aren't enough users interested in water meter functionality.
**If you like the free water meter, please help me convince YouLess by placing a comment in the [forum].**

### Device setup in Homey ###

To setup, go to "Devices" and choose the correct driver. Homey will try to discover the Youless device, and fills in the IP-address. Note: this must be a fixed address.

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/2X/7/7ab6df64224bb168feb4040646e4527ae1980499.jpeg" alt="device selection" width="300"/>

**Analogue Energy meter**: choose the LS110/120-E driver.

**P1 Energy and Gas smart meter**: Use the LS120-P1 if you have a P1 connection to your smart meter. In the next screen select which P1 meters you want to include in Homey. The totalized power meter is always included.

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/2X/6/66edb77ec4f82b4818916068ba4eb114334f3b4b.png" alt="meter selection" width="300"/>

**S0 Energy meter**: choose the LS120-S0 driver, and select 'power' as meter type.

**S0 Water meter**: choose the LS120-S0 driver, and select 'water' as meter type. 

**Optical Water meter**: if you want to use the experimental optical watermeter, choose the LS110/120-W driver.



### Donate: ###
If you like the app you can show your appreciation by posting it in the [forum].
If you really like the app you can buy me a beer.

[![Paypal donate][pp-donate-image]][pp-donate-link]


===============================================================================

Version changelog: [changelog.txt]

[type 1]: https://www.vitens.nl/service/watermeter
[pulse meters]: http://hw.homewizard.net/nl/support/solutions/articles/19000081111-het-watergebruik-meten-met-de-energylink
[forum]: https://community.athom.com/t/4235
[installation manual]: https://forum.athom.com/discussion/comment/61126/#Comment_61126
[pp-donate-link]: https://paypal.me/gruijter
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif
[energy-device-image]: https://aws1.discourse-cdn.com/business4/uploads/athom/original/2X/7/7ab6df64224bb168feb4040646e4527ae1980499.jpeg
[energy-insights-image]: https://aws1.discourse-cdn.com/business4/uploads/athom/original/2X/b/b9d85ac81450ad9ad18a2fb66b04d6a2d338f123.png
[water-mobile-card-image]: https://discourse-cdn-sjc1.com/business4/uploads/athom/original/2X/b/bf55a4ea7d276e559436363ef6e0797528f90814.png
[water-insights-image]: https://discourse-cdn-sjc1.com/business4/uploads/athom/original/2X/5/53ff080e7e55cdc13911a761c384683fd6612b46.png
[water-meter-image]: https://forum.athom.com/uploads/editor/wb/kkyxklvl0jqc.jpg
[devices-image]: https://sjc1.discourse-cdn.com/business4/uploads/athom/original/2X/7/7ab6df64224bb168feb4040646e4527ae1980499.jpeg
[changelog.txt]: https://github.com/gruijter/com.gruijter.enelogic/blob/master/changelog.txt
