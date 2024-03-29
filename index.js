const express = require('express'),
	app = express(),
	cookieSession = require('cookie-session'),
	socketIO = require('socket.io'),
	helmet = require('helmet'),
	bodyparser = require('body-parser'),
	ip = require('ip'),
	chalk = require('chalk'),
	passport = require('passport'),
	_ = require('lodash'),

	appName = 'Firefiles',
	awsUtils = require('./tools/awsUtils'),
	dbUtils = require('./tools/dbUtils'),
	logger = require('./tools/logger'),
	socketUtils = require('./tools/socketUtils');
	
require('dotenv').config();
const env = process.env,
	session = cookieSession({
		name: appName,
		secret: env.SESSION_KEY,
		resave: true,
		saveUninitialized: false,
		sameSite: env.ENVIRONMENT === 'dev' ? 'lax' : 'none',
		maxAge: 1000 * 3600 * 24 * 30 * 2,		// 2 months (ms)
		secure: env.ENVIRONMENT !== 'dev'		// only false for `dev`, otherwise true
	});

app.enable('trust proxy');
app.use(helmet());
app.set('view engine', 'ejs');

app.use('/public', express.static('public'));
app.use('/lib', express.static('node_modules'));
app.use(bodyparser.json({ limit: '50mb' }));
app.use(bodyparser.urlencoded({ limit: '50mb', extended: true, parameterLimit:50000 }));

app.use(session);
app.use(passport.initialize());
app.use(passport.session());

// Cors configuration
app.use(function(req, res, next) {
	let allowOrigin = (env.ENVIRONMENT === 'dev') ? req.headers.origin : env.APP_URL;
	allowOrigin && res.setHeader('Access-Control-Allow-Origin', allowOrigin);
	res.setHeader('Access-Control-Allow-Credentials', true);
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	next();
});

dbUtils.initPassport(passport);

function isAuthenticated (req, res, next) {
	if (req.isAuthenticated()) return next();

	return res.status(403).send('Authentication is required to access this route');
}

app.post('/login', (req, res) => {
	if (!req.body.email || !req.body.password) {
		return res.status(400).send('Both email and password are required for login!'); 
	}

	passport.authenticate('local', function (err, user, info) {   
		if (user) {
			req.login(user, (err) => {
				if (err) return res.status(500).send('Apologies! Unexpected error occurred while creating account!');
				return res.status(200).send('Yayy! Successfully logged in!');
			});
		}
		else if (err) {
			logger.error('Unexpected error occurred while creating account', err);
			return res.status(500).send('Apologies! Unexpected error occurred while creating account!');
		}
		else if (info) {
			// User not found
			if (info.name === 'IncorrectUsernameError') {
				return res.status(404).send(info.message);
			}
			// Incorrect password
			else if (info.name === 'IncorrectPasswordError') {
				return res.status(403).send(info.message);
			}
		}
	})(req, res);
});

app.post('/signup', (req, res) => {
	let userData = {
		name: req.body.name,
		email: req.body.email,
		password: req.body.password
	};

	dbUtils.signup(userData, (err) => {
		if (err) {
			// User already exists
			if (err.name === 'UserExistsError') {
				return res.status(400).send(err.message);
			}
			// Missing email address
			else if (err.name === 'MissingUsernameError') {
				return res.status(422).send(err.message);
			}
			// Missing password
			else if (err.name === 'MissingPasswordError') {
				return res.status(422).send(err.message);
			}
			// Invalid email address
			else if (err.name === 'ValidationError') {
				return res.status(422).send(err.message);
			}
			// Invalid password
			else if (err.name === 'InvalidPasswordError') {
				return res.status(422).send(err.message);
			}

			logger.error('Unexpected error occurred while creating account', err);
			return res.status(500).send('Apologies! Unexpected error occurred while creating account!');
		}
		
		return res.status(201).send('Yayy! Successfully created your account!');
	});
});

app.post('/getUser', function(req, res) {
	if (req.user === undefined) {
		return res.status(204).json({});
	}
	return res.status(200).json(_.pick(req.user, ['email', 'name']));
});

app.post('/getSignedS3', isAuthenticated, (req, res) => {
	let file = {
		name: req.body.fileName,
		type: req.body.fileType
	};
	
	awsUtils.getSignedS3(file, req.user, (err, preSignedPost) => {
		if (err) {
			logger.error('Error occurred while generating aws s3 preSignedPost', err);
			return res.status(503);
		}

		return res.status(200).send(preSignedPost);
	});
});

app.get('/download/:fileKey', isAuthenticated, (req, res) => {
	let fileKey = req.user.id + '/' + req.params.fileKey;
	awsUtils.streamFile(fileKey, (headers, readStream) => {
		res.set('Content-Length', headers['content-length']);
		res.set('Content-Type', headers['content-type']);
		readStream.pipe(res);
	});
});

// app.get('/dashboard', isAuthenticated, (req, res) => {
// 	res.render('dashboard');
// });

// app.get('/login', (req, res) => {
// 	if (req.isAuthenticated()) {
// 		return res.redirect('/dashboard');
// 	}
// 	res.redirect('/#login');
// });

app.post('/logout', isAuthenticated, (req, res) => {
	req.logout();
	req.session = null;
	res.clearCookie(appName + '.sid');
	res.status('200').send('Successfully logged out');
});

// app.get('/', (req, res) => {
// 	return res.render('homepage');
// });

app.get('/*', (req, res) => {
	return res.send('Congratulation!!<br>You found a treasure, time to get the key');
});

let io = socketIO(app.listen(env.PORT || 8080, () => {
	logger.clear();
	logger.log(true, 'Starting Server');
	logger.log(false, 'Server is running at', 
		chalk.blue('http://' + (env.IP || ip.address() || 'localhost') + ':' + (env.PORT || '8080')));
	
	logger.log(true, 'Establishing Services');
	dbUtils.connectMongoDB(() => {
		socketUtils.initialize(io, session, passport.session());
	});
}));