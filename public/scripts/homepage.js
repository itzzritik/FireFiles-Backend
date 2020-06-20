let notyTheme = 'relax';

$('.overlayContainer').click(function () {
	$('#mainContainer').toggleClass('signUp');
});

$('#signIn').click(function () {
	const http = new XMLHttpRequest();
	http.open('POST', '/login');
	http.setRequestHeader('Content-type', 'application/json');
	http.onreadystatechange = function() {
		if (http.readyState == XMLHttpRequest.DONE) {
			new Noty({
				text: (http.status == 200) ? 'Yayy! Successfully logged in!' : http.responseText,
				type: (http.status == 200) ? 'success' : 'error',
				theme: notyTheme,
				layout: (screen.width <= 480) ? 'bottomCenter' : 'topRight',
				timeout: 5000
			}).show();

			if (http.status == 200) {
				setTimeout(function() {
					window.location = '/dashboard';
				}, 2000);
			}
			else if (http.status == 400) {
				// Incorrect password
			}
			else if (http.status == 404) {
				// User not found
			}
			else {
				// Error occurred
			}
		}
	};
	http.send(JSON.stringify({
		email: $('#emailLogin').val(),
		password: $('#passwordLogin').val()
	}));
});

$('#signUp').click(function () {
	const http = new XMLHttpRequest();
	http.open('POST', '/signup');
	http.setRequestHeader('Content-type', 'application/json');
	http.onreadystatechange = function() {
		if (http.readyState == XMLHttpRequest.DONE) {
			new Noty({
				text: http.responseText,
				type: (http.status == 201) ? 'success' : 'error',
				theme: notyTheme,
				layout: (screen.width <= 480) ? 'bottomCenter' : 'topRight',
				timeout: 5000
			}).show();

			if (http.status == 201 || http.status == 400) {
				$('#emailLogin').val($('#emailSignUp').val());
				$('#emailSignUp').val('');

				$('#passwordLogin').focus();
				$('#passwordSignUp').val('');
				$('.overlayContainer').click();
			}
		}
	};
	http.send(JSON.stringify({
		name: $('#nameSignUp').val(),
		email: $('#emailSignUp').val(),
		password: $('#passwordSignUp').val()
	}));
});

let hashChanged = function () {
	if (location.hash === '#login') {
		if (window.user) {
			window.location = '/dashboard';
		}
		else $('.loginPage').css('display', 'flex');
	}
	else {
		$('.loginPage').css('display', 'none');
	}
};
window.onhashchange = hashChanged;
window.onload = function () {
	window.user = null;
	$.post('/getUser', function(user, status) {
		if (status === 'success' && user) {
			window.user = user;
		}

		hashChanged();
	}, 'json');
};