'use strict';

var request = require('request');

var utils = function() {};

utils.getUtc = function () {
    return Math.floor((new Date()).getTime() / 1000);
};

utils.getJson = function(ob) {
    if (ob instanceof String || typeof ob === "string") {
        if (ob === "")
            return null;
        return JSON.parse(ob);
    }
    return ob;
};

utils.getText = function(ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
};

utils.getIndexBy = function(anArray, predicate) {
    for (var i=0; i<anArray.length; ++i) {
        if (predicate(anArray[i]))
            return i;
    }
    return -1;
};

utils.get = function(app, fullUrl, expectedStatusCode, callback) {
    request.get({
        url: fullUrl,
        headers: { 'X-UserId': '1' } 
    }, function(err, apiResponse, apiBody) {
        if (err)
            return callback(err);
        if (expectedStatusCode != apiResponse.statusCode) {
            var err2 = new Error('utils.get("' + fullUrl + '") return unexpected status ' + apiResponse.statusCode);
            err2.status = apiResponse.statusCode;
            return callback(err2);
        }
        if (apiResponse.headers['content-type'].toLowerCase().indexOf('json') >= 0)
            return callback(null, utils.getJson(apiBody));
        // return as-is
        return callback(null, apiBody);
    });
};

utils.apiGet = function(app, url, callback) {
    var apiUrl = app.get('api_url');
    utils.get(app, apiUrl + url, 200, callback);
};

function apiAction(app, method, url, body, expectedStatusCode, callback) {
    var apiUrl = app.get('api_url');
    var methodBody = {
        method: method,
        url: apiUrl + url,
        headers: { 'X-UserId': '1' }
    };
    if (method != 'DELETE') {
        methodBody.json = true;
        methodBody.body = body;
    }
    
    console.log(method + ' ' + methodBody.url);
    
    request(methodBody, function(err, apiResponse, apiBody) {
        if (err)
            return callback(err);
        if (expectedStatusCode != apiResponse.statusCode) {
            var err2 = new Error('apiAction ' + method + ' on ' + url + ' did not return the expected status code (got: ' + apiResponse.statusCode + ', expected: ' + expectedStatusCode + ').');
            err2.status = apiResponse.statusCode;
            return callback(err2);
        }
        return callback(null, utils.getJson(apiBody));
    });
}

utils.apiPut = function(app, url, body, callback) {
    apiAction(app, 'PUT', url, body, 200, callback);
};

utils.apiDelete = function(app, url, callback) {
    apiAction(app, 'DELETE', url, null, 204, callback);
};

module.exports = utils;