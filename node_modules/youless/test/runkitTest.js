// testing from runkit is not (yet) supported.
// please try testing from a desktop

// INSTRUCTIONS FOR TESTING FROM DESKTOP:
// install node (https://nodejs.org)
// install this package: > npm i youless
// run the test: > npm test [password]

const YoulessSession = require('youless');

const youless = new YoulessSession('password');	// 'password' can be passed optionally

youless.getInfo()
	.then(console.log)
	.catch(console.log);

youless.login()
	.then(() => {
		youless.getBasicStatus()
			.then(console.log)
			.catch(console.log);

		youless.getAdvancedStatus()
			.then(console.log)
			.catch(console.log);
	})
	.catch(console.log);
