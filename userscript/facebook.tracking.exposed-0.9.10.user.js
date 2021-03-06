// ==UserScript==
// @name         facebook.tracking.exposed
// @namespace    https://facebook.tracking.exposed
// @version      0.9.10
// @description  Collection meta-data from Facebook's timeline, in order to analyze and look for potential informative manipulation (if you've never heard about Filter Bubble, and you're still young⌁inside™, start here https://en.wikipedia.org/wiki/Filter_bubble )
// @author       Claudio Agosti @_vecna
// @match        https://www.facebook.com/*
// @connect      facebook.tracking.exposed
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.13.0/moment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash-compat/3.10.2/lodash.min.js
// ==/UserScript==

GM_addStyle(`
.escvi--main-button {
  position: fixed;
  bottom: -1px;
  left: 25px;
  display: block;
  width: 50px;
  height: 50px;
  background-color: palegreen;
  color: black;
  font-size: 2em;
  font-weight: bold;
  line-height: 50px;
  text-align: center;
  border: 1px solid #888;
  opacity: 0.6;
  transition: opacity 0.3s ease-in-out;
}

.escvi--main-button:hover {
  text-decoration: none;
  opacity: 1;
}
`);

var d = true, /* debug */
    ee = false, /* explicit in the page */
    simple = true, /* small debug entry on the bottom of every post */
    autoScroll = false; /* every 4 seconds scroll a little for 80 times */

var uniqueLocation = { counter: -1, unique: -1 },
    lastLocation = null,
    toBeFlush = {'debug': [], 'timeline': [] },
    user = null,
    init = false,
    lastAnalyzedPost = null,
    STARTING_FRACTION = 300,
    url =  'https://facebook.tracking.exposed',
    version = '0.9.10',
    FLUSH_INTERVAL = 20000;

var renderMainButton = function() {
    var mainButton = $("<a />", {
        html: 'ઉ',
        "class": "escvi--main-button",
        href: url + "/realitycheck/" + user.id,
        target: "_blank"
    });
    $('body').append(mainButton);
};

var extractInfoPromoted = function(nodehtml, postType) {

    var startHref = nodehtml.search(/href="https:\/\/www.facebook.com\//),
        hrefP = nodehtml.substring(startHref + 6).replace(/" .*/, '').replace(/"> .*/, '');

    return {
        href: hrefP,
        additionalInfo: null,
        publicationTime: null,
        type: postType,
        child: _.size($(nodehtml)[0].childNodes)
    };
};

var extractInfoFromFeed = function(nodehtml, postType) {

    if (_.size(nodehtml) < 300) {
        if (d) console.log("node.innerHTML (expected a) " + postType + " skipped: the size is less than 300 (" + _.size(nodehtml) + ")");
        reportError({error: "debugging", reason: "small", content: nodehtml });
        return null;
    }

    for (var fraction = STARTING_FRACTION; fraction <= 550; fraction += 50) {

        var profileS = nodehtml.search(/profileLink/),
            profileDU = nodehtml.substring(profileS + 19, profileS + 100),
            profileHref = profileDU.replace(/".*/, '');

        var t = nodehtml.search(/timestampContent/),
            block = nodehtml.substring(t - fraction, t),
            hrefP = block.match(/href=".* /),
            utimeP = block.match(/data-utime=".*/);

        if (_.isNull(hrefP) || _.isNull(utimeP) )
            continue;

        var href = hrefP[0].replace(/" .*/, '').substr(6),
            utime = utimeP[0].replace(/"\ .*/, '').substr(12);

        if( href === '' || utime === '' )
            continue;

        return {
            /* href_stats: [ block.search(/href="/), fraction ],
               child: _.size($(nodehtml)[0].childNodes),
               parsedUtime: utime */
            href: href,
            additionalInfo: (profileS !== -1) ? profileHref : null,
            publicationTime: moment(_.parseInt(utime) * 1000).toISOString(),
            type: postType
        };
    }
    reportError({error: "debugging", reason: "failure", content: nodehtml });
    return null;
};

var extractPostType = function(nodehtml) {
    var childNodes = _.size($(nodehtml)[0].childNodes);
    switch(childNodes) {
        case 5:
            return('feed');
        case 3:
            return('related');
    }
    reportError({error: "debugging", reason: "child", number: childNodes, content: nodehtml });
    if(d) console.log("return promoted, spotted: " + childNodes + " childNodes");
    return('promoted');
};

var verboseEntry  = function(node, post, whichPost) {
    if (simple) {
       var smallhtml = ['<small>', 'ઉ ' + uniqueLocation.counter, '</small>' ];
       $(node).append(smallhtml.join(" "));
    }
    if (!ee) return;
    var html = [ '<small>', '<pre> Now at[', whichPost, ']#', JSON.stringify(uniqueLocation, undefined, 2),
             post, 'is', JSON.stringify(post, undefined, 2), '</pre>', '</div></small>'];
    $(node).append(html.join(" "));
};

var basicSetup = function() {

    var x = $("div > a");

    _.each(x, function(aElem, cnt) {
        var img = _.get($(aElem)[0], 'firstChild');
        if(!_.isUndefined($(img)[0])) {
            var profile_id = _.get($(img)[0], 'id');
            var pattern = 'profile_pic_header_';
            if (_.startsWith(profile_id, pattern)) {
                user = {
                    id: profile_id.substring(_.size(pattern), _.size(profile_id)),
                    href: aElem.href
                };
            }
        }
    });

    if(_.isNull(user) || _.isUndefined(_.get(user, 'id'))) {
        if(d) console.log("Impossible parse the user from " + _.size(x) + " html elements!?");
    } else {
        init = true;
        /* paintLogo */
        console.log("facebook.tracking.exposed initialization: rendering main button, detected user: " + JSON.stringify(user) );
        /* find someone able to implement properly the issue #1 */
        renderMainButton();
    }
};

var newUserContent = function(jNode) {
    var node = jNode[0],
        pathname = document.location.pathname;

    if(!init)
        basicSetup();

    /* clean pathname if has an ?something */
    pathname = pathname.replace(/\?.*/, '');

    /* this fit new location or locantion changes */
    if (pathname !== lastLocation && pathname === '/') {
        refreshIsHappen();
    }
    lastLocation = pathname;

    if(pathname !== "/") {
        uniqueLocation.unique = -1;
        uniqueLocation.when = undefined;
        uniqueLocation.counter = -1;
        return;
    }
    /* this wrap all the analysis/parsing functions, operate with
     * the global variables 'lastAnalyzedPost' and 'toBeFlush' */
    userContentParsing(node);
};

var userContentParsing = function(htmlNode) {

    if (_.get(htmlNode, 'attributes[2].nodeName') !== 'aria-label')
        return;

    var feedEntry = {
        'when' : moment().toISOString(),
        'refreshUnique': uniqueLocation.unique
    };

    var postType = extractPostType(htmlNode.innerHTML);

    if ( postType === 'feed' ) {
        feedPost = extractInfoFromFeed(htmlNode.innerHTML, postType);
        verboseEntry(htmlNode, lastAnalyzedPost, "previous", "Feed");
        appendLog(lastAnalyzedPost);
        feedEntry.order = uniqueLocation.counter = (uniqueLocation.counter + 1);
        feedEntry.content = [ feedPost ];
        lastAnalyzedPost = feedEntry;
        verboseEntry(htmlNode, lastAnalyzedPost, "recorded Feed", "Feed");
    } else if ( postType === 'promoted' ) {
        promotedPost = extractInfoPromoted(htmlNode.innerHTML, postType);
        verboseEntry(htmlNode, lastAnalyzedPost, "previous", "Promoted");
        appendLog(lastAnalyzedPost);
        if(!_.isNull(promotedPost)) {
            feedEntry.order = uniqueLocation.counter = (uniqueLocation.counter + 1);
            feedEntry.content = [ promotedPost ];
            lastAnalyzedPost = feedEntry;
            verboseEntry(htmlNode, lastAnalyzedPost, "recorder Promoted", "Promoted");
        } else {
            verboseEntry(htmlNode, null, "_.isNull this!", "Promoted");
            lastAnalyzedPost = null;
        }
    } else if ( postType === 'related') {
        postInfo = extractInfoFromFeed(htmlNode.innerHTML, postType);
        if (!_.isNull(lastAnalyzedPost) && !_.isNull(lastAnalyzedPost.content[0]) ) {
            verboseEntry(htmlNode, lastAnalyzedPost, "previous", "Related");
            lastAnalyzedPost.content[0].type = 'friendlink';
            lastAnalyzedPost.content[1] = postInfo;
        } else {
            verboseEntry(htmlNode, null, "previous isNull?", "Related/Broken");
            feedEntry.order = uniqueLocation.counter = (uniqueLocation.counter + 1);
            feedEntry.content = [ postInfo ];
            feedEntry.content.type = 'broken';
            lastAnalyzedPost = feedEntry;
        }
        verboseEntry(htmlNode, lastAnalyzedPost, "committing this", "Related (friend)");
        appendLog(lastAnalyzedPost);
        lastAnalyzedPost = null;
    } else {
        if (d) console.log("Parsing of this node didn't success, counter is: " + uniqueLocation.counter);
        reportError({error: "a node impossible to be parsed correctly", node: htmlNode.innerHTML});
        verboseEntry(htmlNode, lastAnayzedPost, "Previous", postType);
        appendLog(lastAnalyzedPost);
        lastAnalyzedPost = null;
    }
};

var appendLog = function(entryDict) {
    if(!_.isNull(entryDict)) {
        toBeFlush.timeline.push(entryDict);
    }
};

var reportError = function(errorDict) {
    toBeFlush.debug.push(_.extend(errorDict, {
        version: version,
        when: moment().toISOString()
    }));
};

/* this function just send the data, and is called for timeline and for parsing error report */
var flushData = function(apiUrl, stringData) {
    if(d) console.log("POST in " + apiUrl + " size " + _.size(stringData));
    GM_xmlhttpRequest({
        method: "POST",
        url: url + apiUrl,
        headers: { "Content-Type": "application/json" },
        data: stringData,
        onload: function(response) {
            if (d) console.log("Received response of XHR: " + response.response);
        }
    });
};

var checkToFlush = function() {
    if (d) console.log("After " + FLUSH_INTERVAL + "ms, at: " + moment().toISOString() + ", " +
                       toBeFlush.timeline.length + " info to be sent, with " +
                       toBeFlush.debug.length + " errors");
    if( _.size(toBeFlush.timeline) ) {
        var envelope = { timeline: toBeFlush.timeline, from: user, version: version };
        if (d) console.log(envelope);
        flushData('/F/2', JSON.stringify(envelope));
    }
    _.map(toBeFlush.debug, function(unparsedHTMLnode) {
        flushData('/D/2', JSON.stringify(unparsedHTMLnode) );
    });
    toBeFlush = { 'debug': [], 'timeline': [] };
    setTimeout (checkToFlush, FLUSH_INTERVAL);
};

var scrollDelay = 4000,
    whereScroll = 0,
    refreshTimes = 1,
    height = window.innerHeight !== undefined ? window.innerHeight : document.documentElement.offsetHeight,
    maxScrollTimes = 80;

var scrollDown = function() {
    whereScroll += _.random(400, height) + (height * refreshTimes);

    if(refreshTimes >=  maxScrollTimes ) {
        reportError({info: "auto_scroll " + refreshTimes });
        location.reload();
        // implicit, reinit the variables with the .reload()
    } else {
        refreshTimes += 1;
        if (d) console.log("scroll to " + whereScroll + " next scroll in: " + scrollDelay);
        scrollTo(0, whereScroll);
        setTimeout(scrollDown, scrollDelay);
    }
};

var resetLocation = function() {
    uniqueLocation.unique = _.random(0x10000000, 0xffffffff);
    uniqueLocation.when = moment();
    uniqueLocation.counter = 0;
    var refreshInfo = { 'what': 'refresh',
                        'when': uniqueLocation.when.toISOString(),
                        'unique': uniqueLocation.unique };
    appendLog(refreshInfo);
    if(d) console.log(refreshInfo);
};

var refreshIsHappen = function() {
    /* this function is called more then once
     * due to the different hooks used inside of the facebook page.
     * if is called in less than 4 second window, is duplication */
    if(_.isUndefined(uniqueLocation.when)) {
        if(d) console.log("uniqueLocation.when initialized now");
        resetLocation();
    } else {
        if ( moment(moment() - uniqueLocation.when).isAfter(4, 's') ) {
            if(d) console.log("4 seconds passed, so, refresh. before: " +
                  uniqueLocation.when.toISOString() + " now " +
                  moment().toISOString());
            resetLocation();
        }
        else {
            if(d) console.log("refresh is NOT after 4 seconds of " +
                  uniqueLocation.when.toISOString() + " compared to now " +
                  moment().toISOString() );
        }
    }
};

(function() {
    'use strict';
    waitForKeyElements ("div .composerAudienceWrapper", refreshIsHappen);
    waitForKeyElements (".uiTextareaAutogrow", refreshIsHappen);
    waitForKeyElements ("div .userContentWrapper", newUserContent);
    setTimeout (checkToFlush, FLUSH_INTERVAL);
    if(autoScroll)
        setTimeout (scrollDown, scrollDelay);
})();

/* this code is copied from https://gist.githubusercontent.com/raw/2625891/waitForKeyElements.js found via stackoverflow */

/*--- waitForKeyElements():  A utility function, for Greasemonkey scripts,
    that detects and handles AJAXed content.

    Usage example:

        waitForKeyElements (
            "div.comments"
            , commentCallbackFunction
        );

        //--- Page-specific function to do what we want when the node is found.
        function commentCallbackFunction (jNode) {
            jNode.text ("This comment changed by waitForKeyElements().");
        }

    IMPORTANT: This function requires your script to have loaded jQuery.
*/
function waitForKeyElements (
    selectorTxt,    /* Required: The jQuery selector string that
                        specifies the desired element(s).
                    */
    actionFunction, /* Required: The code to run when elements are
                        found. It is passed a jNode to the matched
                        element.
                    */
    bWaitOnce,      /* Optional: If false, will continue to scan for
                        new elements even after the first match is
                        found.
                    */
    iframeSelector  /* Optional: If set, identifies the iframe to
                        search.
                    */
) {
    var targetNodes, btargetsFound;

    if (typeof iframeSelector == "undefined")
        targetNodes     = $(selectorTxt);
    else
        targetNodes     = $(iframeSelector).contents ()
                                           .find (selectorTxt);

    if (targetNodes  &&  targetNodes.length > 0) {
        btargetsFound   = true;
        /*--- Found target node(s).  Go through each and act if they
            are new.
        */
        targetNodes.each ( function () {
            var jThis        = $(this);
            var alreadyFound = jThis.data ('alreadyFound')  ||  false;

            if (!alreadyFound) {
                //--- Call the payload function.
                var cancelFound     = actionFunction (jThis);
                if (cancelFound)
                    btargetsFound   = false;
                else
                    jThis.data ('alreadyFound', true);
            }
        } );
    }
    else {
        btargetsFound   = false;
    }

    //--- Get the timer-control variable for this selector.
    var controlObj      = waitForKeyElements.controlObj  ||  {};
    var controlKey      = selectorTxt.replace (/[^\w]/g, "_");
    var timeControl     = controlObj [controlKey];

    //--- Now set or clear the timer as appropriate.
    if (btargetsFound  &&  bWaitOnce  &&  timeControl) {
        //--- The only condition where we need to clear the timer.
        clearInterval (timeControl);
        delete controlObj [controlKey];
    }
    else {
        //--- Set a timer, if needed.
        if ( ! timeControl) {
            timeControl = setInterval ( function () {
                    waitForKeyElements (    selectorTxt,
                                            actionFunction,
                                            bWaitOnce,
                                            iframeSelector
                                        );
                },
                300
            );
            controlObj [controlKey] = timeControl;
        }
    }
    waitForKeyElements.controlObj   = controlObj;
}
