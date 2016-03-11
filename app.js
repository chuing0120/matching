var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var passport = require('passport');

global.pool = require('./config/dbpool');
require('./config/passportconfig')(passport);

var auth = require('./routes/auth');
var member = require('./routes/member');
var post = require('./routes/post');
var photo = require('./routes/photo');
// router level middleware modules loading

var app = express();

app.set('env', 'production');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(session({
    "secret": process.env.FMS_DB_SESSION_KEY,
    "cookie": {"maxAge": 86400000},
    "resave": true,
    "saveUninitialized": true
}));
app.use(passport.initialize()); //이니셜라이즈
app.use(passport.session()); //세션 패스포트
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', auth);
app.use('/members', member);
app.use('/posts', post);
app.use('/photos', photo);

app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.json({
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.json({
        fail: err//.message,
        //error: {}
    });
});

module.exports = app;
