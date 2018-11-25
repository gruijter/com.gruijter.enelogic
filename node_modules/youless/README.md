## Nodejs package to communicate with Youless energy monitors LS110 and LS120.

### It allows you to:

#### get:
* device information, including firmware version
* live energy readings of analogue and digital meters
* live energy and gas readings of P1 smart meters (LS120 only)
* live readings of the S0 input (LS120 only)
* live readings of the optical sensor


#### set:
* meter type to Digital or Analogue
* power pulses per KwH value
* power counter value
* S0 pulses per KwH value
* S0 counter value


#### do:
* discover the device in a local network
* login with or without password
* synchronize the device time with the internet
* reboot the device


### Note:
This package has been developed and tested with the Enelogic (-EL) firmware.
Other firmware versions (-PO, -PO2 and -EO) might not be fully supported,
especially for the function getAdvancedStatus().

### Install:
If you don't have Node installed yet, get it from: [Nodejs.org](https://nodejs.org "Nodejs website").

To install the netgear package:
```
> npm i youless
```

### Test:
From the folder in which you installed the netgear package, just run below command. If you have no password set in the device, use `''` as password. If you do not know the ip address, use `''` to attempt autodiscovery.
```
> npm test devicePassword deviceIp
```


### Quickstart:

```
// create a youless session, login to device, fetch basic power info
	const Youless = require('youless');

	const youless = new Youless();

	async function getPower() {
		try {
			// fill in the password of the device. Use '' if no password is set in the device
			// fill in the ip address of the device, e.g. '192.168.1.50'
			// do not fill in an ip address if you want to autodiscover the device during login
			await youless.login('devicePassword', 'deviceIp');
			const powerInfo = await youless.getBasicInfo();
			console.log(powerInfo);
		} catch (error) {
			console.log(error);
		}
	}

	getPower();
```

## Detailed documentation:
[Detailed documentation](https://gruijter.github.io/youless.js/ "Youless.js documentation")

