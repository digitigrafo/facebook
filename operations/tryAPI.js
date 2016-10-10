#!/usr/bin/env nodejs
var _ = require('lodash');
var Promise = require('bluebird');
var util = require('util');
var fs = Promise.promisifyAll(require('fs'));
var request = Promise.promisifyAll(require('request'));
var debug = require('debug')('tryAPI');
var nconf = require('nconf')

nconf.argv().env();

if ( _.isUndefined(nconf.get('DEBUG')) || 
     _.isUndefined(nconf.get('url')) ) {
    console.log("Set 'DEBUG' env variable and 'url' ");
    return -1;
}

var version = 2;
var url = nconf.get('url');
var postId = nconf.get('postId');
var userId = nconf.get('userId');
var kind = nconf.get('kind');
var pickedO = null;

/* this is the utilty for all the connection */
var apiR = function(base, api) {
    var urlsec = api.join('/');
    var URL = base + '/' + urlsec;
    debug("⇒ %s", URL);
    return request
        .getAsync({url: URL})
        .then(function(response) {
            return JSON.parse(response.body);
        })
        .tap(function(infos) {
            debug("Retrieved %s", URL);
            var toPrint = nconf.get('print');
            _.each(api, function(de) {
                if(de === toPrint)
                    console.log(JSON.stringify(infos, undefined, 2));
            });
        })
        .catch(function(error) {
            debug("!Error with %s: %s", URL, error);
        });
};

/* these three are the actual testing block */
var testByUser = function(alli) {
    var anUser = getInfo(alli, 'userId');
    return Promise.all([
        apiR(url,['user',version,'timeline',anUser, 0, 1, 1]),
        apiR(url,['user',version,'analysis','presence',6000,anUser,kind]),
        apiR(url,['user',version,'analysis','absolute',6000,anUser,kind])
    ]);
};

var testByPost= function(alli) {
    var aPost = getInfo(alli, 'postId');
    return Promise.all([
        apiR(url, ['post', 'top', version ]),
        apiR(url, ['post', 'reality', version, aPost])
    ]);
};

var testByUserPost = function(alli) {
    var aPost = getInfo(alli, 'postId');
    var anUser = getInfo(alli, 'userId');
    return apiR(url, ['post', 'perceived', version, aPost, anUser]);
};

var testNode = function(alli) {
    return Promise.all([
          apiR(url, ['node', 'activity', version, kind]),
          apiR(url, ['node', 'countries', version, kind]),
          apiR(url, ['node', 'country', version, 'IT', kind]),
    ]);
};

var getInfo = function(alli, kind) {

    if(!_.isNull(pickedO))
        return _.get(pickedO, kind);

    if( !_.isNull(userId) && !_.isNull(postId) ) {
        pickedO = {
            userId: userId,
            postId: postId
        };
        debug(" ♥ userId+postId set by nconf %j", pickedO);
        return _.get(pickedO, kind);
    }

    var cleaned = _.reject(alli.exported[1], {postId: null});

    if(!_.isUndefined(postId)) {
        pickedO = _.find(cleaned, {postId: _.parseInt(postId) });
    } else if(!_.isUndefined(userId)) {
        pickedO = _.find(cleaned, {userId: _.parseInt(userId) });
    } else {
        pickedO = _.sample(cleaned);
    }
    if(_.isUndefined(pickedO))
        pickedO = _.sample(cleaned);

    pickedO = _.pick(pickedO, ['userId', 'postId']);
    debug("ݷݷݷ for this test: %j", pickedO);
    return _.get(pickedO, kind);
};

/* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */

if(_.isUndefined(kind)) {
    debug("kind of output: JSON");
    kind = 'json';
}
else {
    debug("kind of output: c3 visualisation library");
    kind = 'c3';
}

/* This is the beginning of everything */
return apiR(url, ['node', 'info', version])
    .then(function(basicInfo) {
        return apiR(url, ['node', 'export', version, '0'])
            .tap(function(infos) {
                return Promise.all([
                    testByUser(infos),
                    testByPost(infos),
                    testByUserPost(infos),
                    testNode(infos) 
                ])
            });
    })
    .tap(function(x) {
        console.log("You reach the end!");
    });
