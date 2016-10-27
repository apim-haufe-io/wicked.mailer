'use strict';

var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var async = require('async');
var debug = require('debug')('portal-mailer:app');
var correlationIdHandler = require('wicked-sdk').correlationIdHandler();

var mailer = require('./mailer');
var utils = require('./utils');

var app = express();
app.initialized = false;
app.lastErr = false;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Correlation ID
app.use(correlationIdHandler);

logger.token('correlation-id', function (req, res) {
    return req.correlationId;
});
app.use(logger('{"date":":date[clf]","method":":method","url":":url","remote-addr":":remote-addr","version":":http-version","status":":status","content-length":":res[content-length]","referrer":":referrer","response-time":":response-time","correlation-id":":correlation-id"}'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//app.use('/', routes);
//app.use('/users', users);
app.post('/', function (req, res, next) {
    debug('POST /');
    if (!app.initialized)
        return res.status(503).json({ message: 'Initializing.' });
    if (req.app.processingWebhooks) {
        debug('Still processing last webhook load.');
        // Don't reset lastErr here!
        return res.json({ message: 'OK' });
    }

    req.app.processingWebhooks = true;
    processWebhooks(app, req.body, function (err) {
        req.app.processingWebhooks = false;
        if (err) {
            console.error(err);
            console.error(err.stack);
            app.lastErr = err;
            return res.status(500).json(err);
        }
        app.lastErr = null;
        return res.json({ message: 'OK' });
    });
});

app._startupSeconds = utils.getUtc();
app.get('/ping', function (req, res, next) {
    debug('/ping');
    var health = {
        name: 'mailer',
        message: 'Up and running',
        uptime: (utils.getUtc() - app._startupSeconds),
        healthy: true,
        pingUrl: app.get('my_url') + 'ping',
        version: utils.getVersion(),
        gitLastCommit: utils.getGitLastCommit(),
        gitBranch: utils.getGitBranch(),
        buildDate: utils.getBuildDate()
    }; 
    if (!app.initialized) {
        health.healthy = 2;
        health.message = 'Initializing - Waiting for API';
        res.status(503);
    } else if (app.lastErr) {
        health.healthy = 0;
        health.message = app.lastErr.message;
        health.error = JSON.stringify(app.lastErr, null, 2);
        res.status(500);
    }
    res.json(health);
});

function processWebhooks(app, webhooks, callback) {
    debug('processWebhooks()');

    async.eachSeries(webhooks, function(event, done) {
        debug('- process event ' + event);
        // Brainfucking callback and closure orgy
        var acknowledgeEvent = function(ackErr) {
            debug('- acknowledgeEvent()');
            if (ackErr) 
                return done(ackErr);
            utils.apiDelete(app, 'webhooks/events/mailer/' + event.id, done);
        };
        if (app.mailerGlobals.mailer.useMailer &&
            mailer.isEventInteresting(event)) {
            mailer.handleEvent(app, event, acknowledgeEvent);
        } else {
            acknowledgeEvent(null);  
        }
    }, function(err) {
        if (err)
            return callback(err);
        return callback(null);
    });
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    debug('404');
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
        res.jsonp({
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.jsonp({
        message: err.message,
        error: {}
    });
});


module.exports = app;
