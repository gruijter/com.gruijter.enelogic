## Nodejs package to communicate with Youless energy monitors LS110 and LS120.

### It allows you to:

#### get:
* device information, including firmware version
* live energy readings of analogue and digital meters
* live energy and gas readings of P1 smart meters (LS120 only)
* live readings of the S0 input (LS120 only)
* live readings of the optical sensor
* raw P1 data (Experimental and unstable!)
* historic logs of power
* historic log of gas (LS120 only)
* historic log of S0 (LS120 only)


#### set:
* meter type to Digital or Analogue
* power pulses per KwH value
* power counter value
* S0 pulses per KwH value (LS120 only)
* S0 counter value (LS120 only)
* optical sensor luminance


#### do:
* discover the device in a local network
* login with or without password (password LS120 only)
* synchronize the device time with the internet
* reboot the device (LS120 only)


### Note:
This package has been developed and tested with the Enelogic (-EL) firmware and PVOutput (-PO) firmware ^1.4.4.
Other firmware versions (-EO, and -PO below 1.4.4) might not be fully supported, especially for the function getAdvancedStatus().

### Install:
If you don't have Node installed yet, get it from: [Nodejs.org](https://nodejs.org "Nodejs website").

To install the youless package:
```
> npm i youless
```

### Test:
From the folder in which you installed the youless package, just run below command. If you have no password set in the device you can leave out that part. You can optionally provide the IP and port by adding `host=deviceIP port=devicePort`. For Belgian P1 meters you need to add `reversed=true`
```
> npm test password=devicePassword
```


### Quickstart:

```
// create a youless session, login to device, fetch basic power info
const Youless = require('youless');

const youless = new Youless();

async function getPower() {
	try {
		// Leave out password if no password is set in the device
		// Leave out host if you want to autodiscover the device during login
		await youless.login({ password = 'secretPassword', host = '192.168.1.50' });
		const powerInfo = await youless.getBasicInfo();
		console.log(powerInfo);
	} catch (error) {
		console.log(error);
}
```

## Detailed documentation:
[Detailed documentation](https://gruijter.github.io/youless.js/ "Youless.js documentation")

