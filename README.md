# Enelogic #

Homey app to integrate Enelogic P1 and YouLess LS110/LS120 energy meters.
A direct connection over IP is used, so there is no dependency on the Enelogic
cloud service.

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

**Ledring screensaver:**
- See how much energy you are using or producing just by looking at your Homey!
- Is the wash-dryer ready? Am I now producing power to the grid?

The power is totalized for consumed and produced power, during off-peak and
peak hours. Production to the powergrid is displayed as negative watts.
Only changed values are logged.

### Experimental YouLess Watermeter ###
This experimental driver makes use of the optical sensor of the YouLess LS110
and LS120. It has successfully been tested on water meters from Vitens ([type 1]).
Place the optical sensor on the rotating mirror. Exact positioning is required.

The water meter driver provides logs and flow cards for the following data:
- Actual water flow (L/min, 60s average)
- Water meter (m3)

The water meter driver can be installed additionally to the power meter driver.
If you use the LS120 with P1 connection, you will get all electricity meters, the
gas meter and the water meter simultaneously from one YouLess device!
The water meter driver uses the raw reflectiveness of the optical sensor. It has
to poll the YouLess 3x per second, which puts significant load on your Homey and
your WiFi network, especially when water is being used (burst mode is then
switched on). I'm working with YouLess to get them to support water meters in
the firmware so that it takes off the load from Homey and the network, and also
increases accuracy of the meter. But this has no priority with them since they
believe there aren't enough users interested in water meter functionality.
**If you like the water meter, please help me convince YouLess by placing a
comment below or in the [forum].**

### Device setup in Homey ###
To setup go to "Devices", choose the correct driver. Use the LS120-P1 if you have
a P1 connection to your smart meter. Otherwise choose the LS110/120-E driver
Enter the fixed IP-address (preferred) or use the default url 'youless'.
If you want to use the water meter you can simply add this as a second device and
choose the LS110/120-W driver.

### Donate: ###
If you like the app you can show your appreciation by posting it in the [forum].
If you really like the app you can buy me a beer.

[![Paypal donate][pp-donate-image]][pp-donate-link]

<sup>btc: 14VR1QCpqWUWiSLa1sn3Dpzq3Wrp83zFfC</sup>

<sup>eth: 0xEcF4747203Eba214c071fDAa4825cD867B410d70</sup>

<sup>ltc: LfGJu1AdnPFMoBXwHvf2qG9sCV1onyXDvd</sup>

===============================================================================

Version changelog

```
v1.1.2	2017.12.10 fix gas usage for enelogic driver. Ignore invalid readings from youless P1
v1.1.1	2017.10.01 added S0 metering for youless fw 1.4.0, bug fixes, xml2js updated to v0.4.19
v1.0.7	2017.06.26 improved gas usage logging, bug fixes, added experimental water meter (using LS110/LS120 optical sensor)
v1.0.6  2017.05.28 small bug fix (error reading device). Code cleanup
v1.0.4  2017.04.19 Added polling interval setting
v1.0.3  2017.04.16 Compensate 0 production readings. JSON.parse bug fix
v1.0.2  2017.03.22 Added support for YouLess LS120 (P1)
v1.0.0  2017.02.18 Initial release
```
[type 1]: https://www.vitens.nl/meer-informatie/typen-watermeters
[forum]: https://forum.athom.com/discussion/2779
[pp-donate-link]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=FV7VNCQ6XBY6L
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif
