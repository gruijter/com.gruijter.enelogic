/* eslint-disable no-console */
/* eslint-disable prefer-destructuring */
/* This Source Code Form is subject to the terms of the Mozilla Public
	License, v. 2.0. If a copy of the MPL was not distributed with this
	file, You can obtain one at http://mozilla.org/MPL/2.0/.

	Copyright 2017 - 2023, Robin de Gruijter <gruijter@hotmail.com> */

// INSTRUCTIONS FOR TESTING FROM DESKTOP:
// install node (https://nodejs.org)
// install this package: > npm i youless
// run the test: > npm test [password=password] [host=IPaddress] [port=port] [reversed=false]

'use strict';

const _test = require('./_test');

console.log('Testing now. Hang on.....');

const getOptions = () => {
	const options = {};
	const args = process.argv.slice(2);
	Object.keys(args).forEach((arg) => {
		const info = args[arg].split(/=+/g);
		if (info.length === 2) {
			options[info[0]] = info[1].replace(/['"]+/g, '');
		}
	});

	if (Object.keys(options).length === 0) {
		options.password = process.argv[2];
		options.host = process.argv[3];
		options.port = process.argv[4];
	}

	if (options.port) {
		options.port = Number(options.port);
	}

	if (options.reversed && options.reversed !== 'false') options.reversed = true;
	return options;
};

const test = async () => {
	try {
		const options = getOptions();
		const log = await _test.test(options);
		for (let i = 0; i < (log.length); i += 1) {
			console.log(log[i]);
		}
	} catch (error) { console.log(error); }
};

test();
