var _ = require('lodash');
var moment = require('moment');
var Promise = require('bluebird');
var mongodb = Promise.promisifyAll(require('mongodb'));
var debug = require('debug')('mongo');
var nconf = require('nconf');

var dbConnection = function() {
    if(_.isUndefined(nconf.get('mongodb')))
        var url = 'mongodb://localhost/facebook';
    else
        var url = nconf.get('mongodb');
    return mongodb
        .MongoClient
        .connectAsync(url)
        .disposer(function(db) {
            return db.close();
        });
};

var writeOne = function(cName, dataObject) {
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .insert(dataObject)
            .then(function(results) {
                return true;
            })
            .catch(function(error) {
                debug("writeOne Error %s (%j)", cName, error);
                return false;
            });
    });
};

var updateOne = function(cName, selector, updated) {
    debug("updateOne in %s selector %j ", cName, selector);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .updateOne(selector, updated, { upsert: true})
            .then(function(result) {
                return true;
            })
            .catch(function(error) {
                debug("updateOne Error %s (%j)", cName, error);
                return false;
            });
    });
};

var writeMany = function(cName, dataObjects) {
    debug("writeMany in %s of %d objects", cName, _.size(dataObjects));
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .insertMany(dataObjects)
            .then(function(results) {
                return true;
            })
            .catch(function(error) {
                if(!_.size(dataObjects)) {
                    debug("Zero dataObject justify an error (%s)", error);
                    return true;
                }
                debug("writeMany Error %s (%j)", cName, error);
                return false;
            });
    });
};

var read = function(cName, selector, sorter) {
    if(_.isUndefined(sorter)) sorter = {};
    debug("read in %s by %j selector sort by %j", cName, selector, sorter);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .find(selector)
            .sort(sorter)
            .toArray();
    });
};

var readLimit = function(cName, selector, sorter, limitN, past) {
    if(_.isNaN(past)) past = 0;
    debug("readLimit in %s by %j sort %j max %d past %d", 
        cName, selector, sorter, limitN, past);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .find(selector)
            .sort(sorter)
            .limit(limitN + past)
            .toArray()
            .then(function(objList) {
                if(past)
                    return _.takeRight(objList, limitN);
                return objList;
            });
    });
};

var countByMatch = function(cName, selector) {
    debug("countByMatch in %s by %j", cName, selector);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .find(selector)
            .count();
    });
};

var readShard = function(cName, sorter, min, max) {
    debug("readShard in %s sort by %j, skip %d amount %d", 
        cName, sorter, min, max - min);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .find({})
            .sort(sorter)
            .skip(min)
            .limit(max - min)
            .toArray();
    });
};

var readTopPost = function(cName, min, max) {
    debug("readTopPost in %s, remembering that there are dirty data m%d M%d",
        cName, min, max);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .aggregate([
                {
                  $group: {
                    _id: { postID: "$postId" },
                    count: { $sum : 1 }
                  }
                },
                { $sort: { "count": -1 } }
            ])
            .skip(min)
            .limit(max - min)
            .toArray();
    });
};

var experimentalTP = function(cName) {
    debug("experimentalTP in %s", cName);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .aggregate([{
                $group: {
                    _id: { "postId": "$postId"},
                    users: { $addToSet: "$userId"}
                }
            }])
            .toArray();
    });
};

var countByDay = function(cName, timeVarName, filter) {
    debug("countByDay in %s, using time variable '%s' filter %j",
        cName, timeVarName, filter);

    if(!_.startsWith(timeVarName, '$'))
        throw new Error("developer please, MongoVar wants '$' ");

    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: { 
                            year: { $year: timeVarName },
                            month:{ $month: timeVarName },
                            day:  { $dayOfMonth: timeVarName }
                        },
                        count: { $sum: 1 }
                    }
                }
            ])
            .toArray()
            .catch(function(error) {
                debug("MongoQuery error: %s, from %s", error, cName);
                return [];
            });
    });
};

var usersByDay = function(cName) {
    debug("countActiveUsersByDay in %s", cName);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .aggregate([
                { $group: {
                    _id: {
                            year: { $year: "$displayTime" },
                            month:{ $month: "$displayTime" },
                            day:  { $dayOfMonth: "$displayTime" },
                            user: "$userId"
                        },
                        count: { $sum: 1 }
                    }
                }
            ])
            .toArray()
            .catch(function(error) {
                debug("MongoQuery error: %s, from %s", error, cName);
                return [];
            });
    });
};

var usersByDayByCountry = function(cName, geoipobj) {
    debug("usersByDayByCountry in %s by %j", cName, geoipobj);

    if(!_.startsWith(cName, 'refreshes'))
        throw new Error("Developer mistake? here is hardcoded refreshTime, only refreshes can be used. received " + cName);

    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .aggregate([
                { $match: geoipobj },
                {
                  $group: {
                    _id: {
                      day:    { $dayOfMonth: "$refreshTime" },
                      month:  { $month: "$refreshTime" },
                      year:   { $year: "$refreshTime" }
                    },
                    usersSeen: { $addToSet: "$userId" }
                  }
                }
            ])
            .toArray()
            .catch(function(error) {
                debug("MongoQuery %s country %j error: %s",
                    cName, geoipobj, error);
            });
    });
};

var countByObject = function(cName, idobj) {
    if(_.isUndefined(idobj)) idobj = {};
    debug("countByObject in %s by %j", cName, idobj);
    return Promise.using(dbConnection(), function(db) {
        return db
            .collection(cName)
            .aggregate([
                {
                  $group: {
                    _id: idobj,
                    count: { $sum: 1 }
                  }
                },
                { $sort: { count: -1 } }
            ])
            .toArray()
            .catch(function(error) {
                debug("MongoQuery %s error: %s", cName, error);
                return [];
            });
    });
};

var getRandomUser = function(cName) {
    return readLimit(cName, {}, {}, 50, 0)
        .then(function(users) {
            debug("getRandomUser: first user selected %j and last %j",
                _.first(users), _.last(users));
            return _.sample(users).userId;
        });
};

module.exports = {
    writeOne: writeOne,
    writeMany: writeMany,
    updateOne: updateOne,
    readLimit: readLimit,
    readShard: readShard,
    readTopPost: readTopPost,
    experimentalTP: experimentalTP,
    countByDay: countByDay,
    countByMatch: countByMatch,
    usersByDay: usersByDay,
    usersByDayByCountry: usersByDayByCountry,
    countByObject: countByObject,
    read: read,
    getRandomUser: getRandomUser
};
