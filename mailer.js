'use strict';

var async = require('async');
var path = require('path');
var fs = require('fs');
var debug = require('debug')('portal-mailer:mailer');
var mustache = require('mustache');

var utils = require('./utils');

var mailer = function () { };

mailer.smtpTransporter = null;

mailer.init = function (app, done) {
    debug('init()');
    var apiUrl = app.get('api_url');
    var myUrl = app.get('my_url');

    async.parallel({
        registerWebhook: function (callback) {
            const putPayload = {
                id: 'mailer',
                url: myUrl
            };
            utils.apiPut(app, 'webhooks/listeners/mailer', putPayload, callback);
        },
        getGlobals: function (callback) {
            utils.apiGet(app, 'globals', function (err, mailerGlobals) {
                if (err)
                    return callback(err);
                return callback(null, mailerGlobals);
            });
        }
    }, function (err, results) {
        if (err)
            return done(err);

        app.mailerGlobals = results.getGlobals;

        return done(null);
    });
};

mailer.deinit = function (app, done) {
    debug('deinit()');
    utils.apiDelete(app, 'webhooks/listeners/mailer', done);
};

mailer.isEventInteresting = function (event) {
    debug('isEventInteresting()');
    debug(event);
    if (event.entity == "verification_lostpassword" ||
        event.entity == "verification_email")
        return true;
    if (event.entity == "approval" &&
        event.action == "add")
        return true;
    return false;
};

function getEmailData(event) {
    debug('getEmailData()');
    if (event.entity == "verification_email")
        return {
            template: "verify_email",
            subject: "Email validation",
            to: "user"
        };
    if (event.entity == "verification_lostpassword")
        return {
            template: "lost_password",
            subject: "Lost Password Recovery",
            to: "user"
        };
    if (event.entity == "approval" &&
        event.action == "add")
        return {
            template: "pending_approval",
            subject: "Pending Approval",
            to: "admin"
        };
    throw new Error("Mailer: getEmailData - event meta information invalid.");
}

mailer.handleEvent = function (app, event, done) {
    debug('handleEvent()');
    debug(event);
    var userId = event.data.userId;
    utils.apiGet(app, 'users/' + userId, function (err, userInfo) {
        if (err && err.status == 404) {
            // User has probably been deleted in the meantime.
            console.error('handleEvent() - Unknown user ID: ' + userId);
            // We'll treat this as a success, not much we can do here.
            return done(null);
        }
        if (err)
            return done(err);
        var verificationLink =
            app.mailerGlobals.network.schema + '://' +
            app.mailerGlobals.network.portalHost +
            '/verification/' + event.data.id;
        var approvalsLink =
            app.mailerGlobals.network.schema + '://' +
            app.mailerGlobals.network.portalHost +
            '/admin/approvals';

        var viewData = {
            title: app.mailerGlobals.title,
            user: {
                id: userInfo.id,
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                name: userInfo.name,
                email: userInfo.email,
            },
            verificationLink: verificationLink,
            approvalsLink: approvalsLink,
            portalEmail: app.mailerGlobals.mailer.senderEmail
        };
        debug(viewData);

        var emailData = getEmailData(event);
        var templateName = emailData.template;

        utils.apiGet(app, 'templates/email/' + templateName, function (err, templateText) {
            if (err) {
                console.error('Getting the email template failed!');
                return done(err);
            }
            // Do da Mustache {{ }}
            var text = mustache.render(templateText, viewData);
            // Do da emailing thing
            var from = '"' + app.mailerGlobals.mailer.senderName + '" <' + app.mailerGlobals.mailer.senderEmail + '>';
            var to = '"' + userInfo.name + '" <' + userInfo.email + '>';
            if ("admin" == emailData.to)
                to = '"' + app.mailerGlobals.mailer.adminName + '" <' + app.mailerGlobals.mailer.adminEmail + '>';
            var subject = app.mailerGlobals.title + ' - ' + emailData.subject;

            var email = {
                from: from,
                to: to,
                subject: subject,
                text: text
            };
            debug(email);

            mailer.smtpTransporter.sendMail(email, function (emailErr, emailResponse) {
                if (emailErr)
                    return done(emailErr);
                debug('Sent email to ' + to + '.');
                console.log("Sent email to " + to + ".");
                done(null, emailResponse);
            });
        });
    });
};

module.exports = mailer;