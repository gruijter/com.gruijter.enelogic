Javascript / Nodejs Module to communicate with Youless energy monitors LS110 and LS120

# How to use:

```
const YoulessSession = require(youless.js');

// if no password is set in the youless device, use ''. [port] is optional and defaults to 80.
const youless = new YoulessSession(password, host, [port]);

async function test() {
	try {
		// get the model name and mac address (no need to login first)
		const info = await youless.getInfo();
		console.log(info);

		// if a password is set you need to login. Optional use of host and port will override previous settings
		await youless.login('password', [host], [port])
		console.log(youless);

		// get basic power readings
		const basicStatus = await youless.getBasicStatus();
		console.log(basicStatus);

		// get analogue and P1 power, S0 and gas meter readings (not available in LS110)
		const advancedStatus = await youless.getAdvancedStatus();
		console.log(advancedStatus);

		// synchronize the device time
		await youless.syncTime();

		// set the meter type to D(igital) or A(nalogue)
		await youless.setMeterType('a');

		// set the S0 counter value (in KwH)
		await youless.setS0Counter(12345);

		// set the S0 pulses per KwH value NOTE: also resets powerPulses to 1000
		await youless.setS0Pulses(1000);

		// set the Power counter value (in KwH) NOTE: also resets powerPulses to 1000
		await youless.setPowerCounter(12345);

		// set the Power pulses per KwH value
		// NOTE: must be performed AFTER setPowerCounter and setS0Pulses
		// NOTE: will be automatically overwritten by P1 net value
		await youless.setPowerPulses(1000);

		// reboot the youless device
		await youless.reboot();

	}	catch (error) {
		console.log(error);
	}
}

test();

```

Response examples

info response:
{"model":"LS120","mac":"72:b8:ad:12:16:2d'"}

basicStatus response:
{ cnt: ' 16844,321',
  pwr: 3030,
  lvl: 73,
  dev: '(&plusmn;0%)',
  det: '',
  con: 'OK',
  sts: '(23)',
  ps0: 0,
  raw: 732 }

cnt: counter in kWh
pwr: Pwer consumption in Watt
lvl: moving average level (intensity of reflected light on analog meters)
dev: deviation of reflection
con: connection status
sts: Time until next status update with online monitoring
raw: raw 10-bit light reflection level (without averaging)


advancedStatus response:
{ tm: 1514472671,
    net: 16844.321,
    pwr: 3030,
    ts0: 1514470438,
    cs0: 0,
    ps0: 0,
    p1: 13192.24,
    p2: 8453.663,
    n1: 1303.886,
    n2: 3497.696,
    gas: 5469.084,
    gts: 1712282000
    gtm: 1514487600 }

"tm": unix-time-format (1489333828 => Sun, 12 Mar 2017 15:50:28 GMT)
"net": Netto counter, as displayed in the web-interface of the LS-120. It seems equal to: p1 + p2 - n1 - n2 Perhaps also includes some user set offset.
"pwr": Actual power use in Watt (can be negative)
"p1": P1 consumption counter (low tariff)
"p2": P2 consumption counter (high tariff)
"n1": N1 production counter (low tariff)
"n2": N2 production counter (high tariff)
"Gas": counter gas-meter (in m^3)

additional  response for ^1.4 version firmware:
ts0: S0: Unix timestamp of the last S0 measurement.
cs0: S0: kWh counter of S0 input
ps0: S0: Computed power
gts: Last timestamp created by the 'smart meter'. "1711032100" = 2017/11/03 21:00 (yyMMddhhmm) Can be used to see if P1 communication fails.
gtm: gts timestamp converted to unix-time-format
