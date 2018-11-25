/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017, 2018, Robin de Gruijter <gruijter@hotmail.com> */

// INSTRUCTIONS FOR TESTING FROM DESKTOP:
// install node (https://nodejs.org)
// install this package: > npm i youless
// run the test: > npm test [password]

/* eslint-disable no-console */

'use strict';

const _test = require('./_test.js');

console.log('Testing now. Hang on.....');

let password = process.argv[2];
let host = process.argv[3];
let port = process.argv[4];

if (password) {
	// eslint-disable-next-line quotes
	if (password === '' || password === "" || password === "''") {
		password = '';
	} else {
		password = password.replace(/'/g, '').replace(/"/g, '');
	}
}

if (host) {
	host = host.replace(/'/g, '').replace(/"/g, '');
}

if (port) {
	port = port.toString().replace(/'/g, '').replace(/"/g, '');
	port = Number(port);
}

_test.test(password, host, port)
	.then((log) => {
		for (let i = 0; i < (log.length); i += 1) {
			console.log(log[i]);
		}
	})
	.catch(error => console.log(error));
