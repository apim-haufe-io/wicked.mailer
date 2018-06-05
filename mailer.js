'use strict';

const async = require('async');
const path = require('path');
const fs = require('fs');
const { debug, info, warn, error } = require('portal-env').Logger('portal-mailer:utils');
const mustache = require('mustache');

const utils = require('./utils');

const mailer = function () { };

mailer.smtpTransporter = null;

mailer.init = function (app, done) {
    debug('init()');
    const myUrl = app.get('my_url');

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
    const userId = event.data.userId;
    utils.apiGet(app, 'users/' + userId, function (err, userInfo) {
        if (err && err.status == 404) {
            // User has probably been deleted in the meantime.
            console.error('handleEvent() - Unknown user ID: ' + userId);
            // We'll treat this as a success, not much we can do here.
            return done(null);
        }
        if (err)
            return done(err);
        // Change for wicked 1.0: The verifications already contain the fully qualified link
        const verificationLink = event.data.link ? 
            mustache.render(event.data.link, { id: event.data.id }) :
            '';
        const approvalsLink =
            app.mailerGlobals.network.schema + '://' +
            app.mailerGlobals.network.portalHost +
            '/admin/approvals';

        const viewData = {
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

        const emailData = getEmailData(event);
        const templateName = emailData.template;

        utils.apiGet(app, 'templates/email/' + templateName, function (err, templateText) {
            if (err) {
                console.error('Getting the email template failed!');
                return done(err);
            }
            // Do da Mustache {{ }}
            const text = mustache.render(templateText, viewData);
            // Do da emailing thing
            const from = '"' + app.mailerGlobals.mailer.senderName + '" <' + app.mailerGlobals.mailer.senderEmail + '>';
            let to = '"' + userInfo.name + '" <' + userInfo.email + '>';
            if ("admin" == emailData.to)
                to = '"' + app.mailerGlobals.mailer.adminName + '" <' + app.mailerGlobals.mailer.adminEmail + '>';
            const subject = app.mailerGlobals.title + ' - ' + emailData.subject;

            const email = {
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