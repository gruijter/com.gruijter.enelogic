/* eslint-disable prefer-destructuring */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const homeyIsV2 = typeof Homey.showLoadingOverlay === 'function';
Homey.setTitle(__('pair.titleLs120S0'));

if (!homeyIsV2) {
	Homey.showLoadingOverlay = () => {
		$('#discover').prop('disabled', true);
		$('#runTest').prop('disabled', true);
	};
	Homey.hideLoadingOverlay = () => {
		$('#discover').prop('disabled', false);
		$('#runTest').prop('disabled', false);
	};
}

function discover() {
	Homey.showLoadingOverlay();
	Homey.emit('discover', {}, (error, result) => {
		if (error) {
			Homey.hideLoadingOverlay();
			return Homey.alert(error.message, 'error');
		}
		discovered = JSON.parse(result);
		Homey.hideLoadingOverlay();
		return $('#host').val(discovered[0].host);
	});
}

function testSettings() {
	// variables
	const host = $('#host').val();
	if (host !== '') {
		const data = {
			youLessIp: host,
			password: $('#password').val(),
			meterSelection: $('#meterSelection').val(),
		};
		// Continue to back-end, pass along data
		Homey.emit('validate', data, (error, result) => {
			if (error) {
				Homey.alert(error.message, 'error');
			} else {
				Homey.alert(`${__('pair.success')} ${result}`, 'info');
				const device = JSON.parse(result);
				Homey.addDevice(device, (err, res) => {
					if (err) { Homey.alert(err, 'error'); return; }
					setTimeout(() => {
						Homey.done();
					}, 5000);
				});
			}
		});
	} else {
		Homey.alert(__('pair.required'), 'error');
		// Homey.done();
	}
}
