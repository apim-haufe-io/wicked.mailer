'use strict';

var wicked = require('wicked-sdk');

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

utils.apiGet = function(app, url, callback) {
    wicked.apiGet(url, callback);
};

utils.apiPut = function(app, url, body, callback) {
    wicked.apiPut(url, body, callback);
};

utils.apiDelete = function(app, url, callback) {
    wicked.apiDelete(url, callback);
};

module.exports = utils;