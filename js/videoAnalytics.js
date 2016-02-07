!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.videoAnalytics=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var helpers = _dereq_('./helpers');
var mon = _dereq_('./mon')(false);
var attr = helpers.attr, safeParse = helpers.safeParse;

// api objects
var videoAnalytics = {}, priv = {};

// we want to keep context of our dom, so we can easily ref
// the nodes later on
priv.videos = {};

// each dom node will have events attached so we can easily
// interact with them, we'll do some data-binding to collect
// our nodes
priv.events = {};
  
// videos queue, because we load a 3rd party asset we want
// to mitigate race conditions of YT not being ready, so
// we keep all untracked videos in this queue and shift 
// them out as we get to them
priv.queue = [];

// keep track of youtube calling our fn
priv.loaded = false;

// init fn that happens on DOMContentLoaded
priv.init = function() {
  priv.collectDom();
  if (priv.queue.length) priv.injectScripts();
};

// attaches events to videos so they can be processed by 
// the .on() fn
priv.attachEvents = function(id, event, fn) {
  if (priv.videos[id]) {
    if (!(priv.videos[id].events[event] instanceof Array)) priv.videos[id].events[event] = [];
    priv.videos[id].events[event].push(fn);
  }
};

// the way the iframe_api works is by replacing an element
// with an iframe, so we'll want to attach the video as 
// needed
priv.attachVideos = function(queue) {
  if (priv.loaded) {
    var next;
    while(next = queue.shift()) {
      next.player = new YT.Player(next.el, next.opts);
      next.player._id = next.opts.videoId;
    }
  }
};

// we'll run this on init, or on demand for latent loaded
// html fragments
priv.collectDom = function(fn) {
  // we want to set debug state asap, so we do that before 
  // we actually collect any video elems
  videoAnalytics.setDebug();
  var dom = document.querySelectorAll('[data-yt-analytics]');
  for(var i=0;i<dom.length;++i) {
    priv.referenceObject(dom[i]);
  }
};

// this function gets fired when youtube js is initialized
// also, this safely allows us to externally use .track
// without race conditions
priv.externalApiReady = function() {
  priv.loaded = true;
  priv.attachVideos(priv.queue);
};

// we include youtubes js script async, and we'll need to 
// keep track of the state of that include
priv.injectScripts = function(fn) {
  if (!priv.scriptInclude) {
    // we only want to do this once, and this is the best
    // time to do this once, this also keeps all of the
    // conditional stuff to a single entry, so it works
    window['onYouTubeIframeAPIReady'] = priv.externalApiReady;

    var placement = document.getElementsByTagName('script')[0];
    priv.scriptInclude = document.createElement('script');
    
    // if fn, lets treat async, otherwise we'll be blocking
    if (typeof fn == 'function') {
      priv.scriptInclude.setAttribute('async', true);
      priv.scriptInclude.addEventListener('load', fn, false);
    }

    priv.scriptInclude.setAttribute('src', '//www.youtube.com/iframe_api');
    placement.parentNode.insertBefore(priv.scriptInclude, placement);
  }
};

// we want to standardize how we handle events, this is the
// fn that handles such things
priv.processEvents = function(key, id, state, e) {
  var events = priv.videos[id].events[key],
      player = priv.videos[id].player;
  // if we get at our videos externally, we will likely
  // want to know whatever the state of the current video
  // is in
  priv.videos[id].currentState = state;
  // title will fallback to the id, so we can detect when
  // we can call on the youtube api to get the video title
  // this will allow us to have human readable titles
  if (priv.videos[id].opts.title == id) {
    // we don't want to accept any undefined video titles,
    // so we'll gracefully fallback to our id, this really
    // only happens when we are in a video error states
    priv.videos[id].opts.title = player.getVideoData().title ? player.getVideoData().title : id;
  }
  // YouTube records video times as a float, i am
  // assuming we won't need/want to have such precision
  // here with the Math.floor() calls
  var eventState = {
    currentTime: Math.floor(player.getCurrentTime()), 
    duration: Math.floor(player.getDuration()),
    event: key,
    id: id,
    title: priv.videos[id].opts.title,
    state: priv.videos[id].currentState,
    muted: player.isMuted(),
    ms: new Date().getTime()
  };
  if (priv.videos[id].events[key]) {
    for(var i=0;i<events.length;++i) {
      events[i](e, eventState);
    }
  }
  mon.log(eventState);
};

// sets up our dom object, so we have a strict schema to 
// adhere to later on in the api 
priv.referenceObject = function(el) {
  var opts = {}, attrs = attr(el);
  opts.videoId = attrs('data-yt-analytics');
  if (attrs('data-yt-tracked') == null) {
    attrs('data-yt-tracked', true);

    // get opts from data attrs
    opts.width = attrs('data-yt-width') ? attrs('data-yt-width') : 640;
    opts.height = attrs('data-yt-height') ? attrs('data-yt-height') : 390;
    opts.playerVars = attrs('data-yt-vars') ? safeParse(attrs('data-yt-vars')) : null;
    opts.title = attrs('data-yt-title') ? attrs('data-yt-title') : opts.videoId;
    
    // setup videos events, all are available publically, more info can be 
    // found at developers.google.com/youtube/iframe_api_reference#Events
    opts.events = {
      onReady: priv.events.ready,
      onStateChange: priv.events.stateChange,
      onError: priv.events.error,
      onPlaybackQualityChange: priv.events.playbackQualityChange,
      onPlaybackRateChange: priv.events.playbackRateChange,
      onApiChange: priv.events.apiChange
    };
    
    // build video object to store
    priv.videos[opts.videoId] = { opts: opts, el: el, events: {} };
    priv.queue.push(priv.videos[opts.videoId]);
  }
};

//
// EVENTS
// --------------------------------------------------------
// the iframe_api allows us to attach dom style events to
// videos, we always fire these internally, but then we 
// also allow you to attach events to a video, by its id
//

priv.events.apiChange = function(e) {
  priv.processEvents('apiChange', e.target._id, 'apiChange', e);
};

// according to youtube docs these status codes
// represent the state string that is indicative
// of the error
priv.events.error = function(e) {
  var state = 'unrecognized error';
  if (e.data == 2 || e.data == 100) {
    state = 'invalid videoId';
  } else if (e.data == 5) {
    state = 'html5 player error';
  } else if (e.data == 101 || e.data == 150) {
    state = 'embedding forbidden';
  }
  priv.processEvents('error', e.target._id, state, e);
};

priv.events.playbackRateChange = function(e) {
  priv.processEvents('playbackRateChange', e.target._id, 'playbackRateChange', e);
};

priv.events.playbackQualityChange = function(e) {
  priv.processEvents('playbackQualityChange', e.target._id, 'playbackQualityChange', e);
};

priv.events.ready = function(e) {
  priv.processEvents('ready', e.target._id, 'ready', e);
};

// we transform the current state `id` to a human readable
// string based on the youtube api docs
priv.events.stateChange = function(e) {
  var state = 'unknown';
  if (e.data === YT.PlayerState.BUFFERING) {
    state = 'buffering';
  } else if (e.data === YT.PlayerState.CUED) {
    state = 'cued';
  } else if (e.data === YT.PlayerState.ENDED) {
    state = 'ended';
  } else if (e.data === YT.PlayerState.PAUSED) {
    state = 'paused';
  } else if (e.data === YT.PlayerState.PLAYING) {
    state = 'playing';
  } else if (e.data === YT.PlayerState.UNSTARTED) {
    state = 'unstarted';
  }
  priv.processEvents('stateChange', e.target._id, state, e);
};

//
// PUBLIC API
// --------------------------------------------------------
//

// public on event, so you can externally attach to videos
// this fn can be recursive, so you know, be smart with this
// try to avoid extremely large arrays, or doing async stuff
// inside of your events without the proper safety materials
videoAnalytics.on = function(events, id, fn) {
  var recurse = false, ev = events;
  if (events instanceof Array) {
    recurse = events.length > 0;
    ev = events.shift();
  }
  // `*` wildcard allows you to attach an event to every vid
  if (id === '*') {
    var vids = Object.keys(priv.videos);
    for(var i=0;i<vids.length;++i) {
      priv.attachEvents(vids[i],ev,fn);
    }
  } else {
    priv.attachEvents(id,ev,fn);
  }
  if (recurse) return videoAnalytics.on(events,id,fn);
  return videoAnalytics;
};

// debug mode, allows you to capture debug data simply
videoAnalytics.setDebug = function(bool) {
  var elem = document.querySelector('[data-yt-debug]');
  bool = typeof bool === 'boolean' ? bool : null;
  if (elem) {
    var attrs = attr(elem);
    videoAnalytics.debug = attrs('data-yt-debug') == 'true';
  }
  if (bool !== null) videoAnalytics.debug = bool;
  mon.debug = videoAnalytics.debug;
  videoAnalytics.logs = videoAnalytics.debug ? mon.history : [];
  return videoAnalytics;
};

// public tracking event, so you attach videos after dom
// load, or with some latent/async requests
videoAnalytics.track = function() {
  priv.collectDom();
  if (priv.queue.length) {
    priv.injectScripts();
    priv.attachVideos(priv.queue);
  }
  return videoAnalytics;
};

// we want to have external access to the videos we're
// tracking for interaction with other apis
videoAnalytics.videos = priv.videos;
  
document.addEventListener('DOMContentLoaded', priv.init, false);

module.exports = videoAnalytics;
},{"./helpers":2,"./mon":3}],2:[function(_dereq_,module,exports){
var attr = function(elem) {
  if (typeof elem != 'undefined') {
    return function $attr(key, val) {
      if(typeof val == 'undefined') {
        return elem.getAttribute(key);
      } else if (val == 'rm') {
        return elem.removeAttribute(key);
      } else {
        return elem.setAttribute(key, val);
      }
    };
  } else {
    return null;
  }
}

var safeParse = function(str) {
  var output = null;
  try {
    output = JSON.parse(str);
  } catch (ex) {}
  return output;
};

module.exports = {
  attr: attr,
  safeParse: safeParse
};
},{}],3:[function(_dereq_,module,exports){
var Mon = function(debug) {
  if (!(this instanceof Mon)) return new Mon(debug);
  this.debug = debug;
  this.history = [];
  return this;
};

Mon.prototype.log = function() {
  var cp = Array.prototype.slice.call(arguments);
  this.history.push(cp);
  if (this.debug) {
    if(typeof window['console'] != 'undefined' && console.log) {
      if (cp.length === 1 && typeof cp[0] == 'object') cp = JSON.stringify(cp[0],null,2);
      console.log(cp);
    }
  }
  return this;
};

module.exports = Mon;
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV9mOWE4MWE0MS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBtb24gPSByZXF1aXJlKCcuL21vbicpKGZhbHNlKTtcbnZhciBhdHRyID0gaGVscGVycy5hdHRyLCBzYWZlUGFyc2UgPSBoZWxwZXJzLnNhZmVQYXJzZTtcblxuLy8gYXBpIG9iamVjdHNcbnZhciB2aWRlb0FuYWx5dGljcyA9IHt9LCBwcml2ID0ge307XG5cbi8vIHdlIHdhbnQgdG8ga2VlcCBjb250ZXh0IG9mIG91ciBkb20sIHNvIHdlIGNhbiBlYXNpbHkgcmVmXG4vLyB0aGUgbm9kZXMgbGF0ZXIgb25cbnByaXYudmlkZW9zID0ge307XG5cbi8vIGVhY2ggZG9tIG5vZGUgd2lsbCBoYXZlIGV2ZW50cyBhdHRhY2hlZCBzbyB3ZSBjYW4gZWFzaWx5XG4vLyBpbnRlcmFjdCB3aXRoIHRoZW0sIHdlJ2xsIGRvIHNvbWUgZGF0YS1iaW5kaW5nIHRvIGNvbGxlY3Rcbi8vIG91ciBub2Rlc1xucHJpdi5ldmVudHMgPSB7fTtcbiAgXG4vLyB2aWRlb3MgcXVldWUsIGJlY2F1c2Ugd2UgbG9hZCBhIDNyZCBwYXJ0eSBhc3NldCB3ZSB3YW50XG4vLyB0byBtaXRpZ2F0ZSByYWNlIGNvbmRpdGlvbnMgb2YgWVQgbm90IGJlaW5nIHJlYWR5LCBzb1xuLy8gd2Uga2VlcCBhbGwgdW50cmFja2VkIHZpZGVvcyBpbiB0aGlzIHF1ZXVlIGFuZCBzaGlmdCBcbi8vIHRoZW0gb3V0IGFzIHdlIGdldCB0byB0aGVtXG5wcml2LnF1ZXVlID0gW107XG5cbi8vIGtlZXAgdHJhY2sgb2YgeW91dHViZSBjYWxsaW5nIG91ciBmblxucHJpdi5sb2FkZWQgPSBmYWxzZTtcblxuLy8gaW5pdCBmbiB0aGF0IGhhcHBlbnMgb24gRE9NQ29udGVudExvYWRlZFxucHJpdi5pbml0ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHByaXYuaW5qZWN0U2NyaXB0cygpO1xufTtcblxuLy8gYXR0YWNoZXMgZXZlbnRzIHRvIHZpZGVvcyBzbyB0aGV5IGNhbiBiZSBwcm9jZXNzZWQgYnkgXG4vLyB0aGUgLm9uKCkgZm5cbnByaXYuYXR0YWNoRXZlbnRzID0gZnVuY3Rpb24oaWQsIGV2ZW50LCBmbikge1xuICBpZiAocHJpdi52aWRlb3NbaWRdKSB7XG4gICAgaWYgKCEocHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0gaW5zdGFuY2VvZiBBcnJheSkpIHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdID0gW107XG4gICAgcHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0ucHVzaChmbik7XG4gIH1cbn07XG5cbi8vIHRoZSB3YXkgdGhlIGlmcmFtZV9hcGkgd29ya3MgaXMgYnkgcmVwbGFjaW5nIGFuIGVsZW1lbnRcbi8vIHdpdGggYW4gaWZyYW1lLCBzbyB3ZSdsbCB3YW50IHRvIGF0dGFjaCB0aGUgdmlkZW8gYXMgXG4vLyBuZWVkZWRcbnByaXYuYXR0YWNoVmlkZW9zID0gZnVuY3Rpb24ocXVldWUpIHtcbiAgaWYgKHByaXYubG9hZGVkKSB7XG4gICAgdmFyIG5leHQ7XG4gICAgd2hpbGUobmV4dCA9IHF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgIG5leHQucGxheWVyID0gbmV3IFlULlBsYXllcihuZXh0LmVsLCBuZXh0Lm9wdHMpO1xuICAgICAgbmV4dC5wbGF5ZXIuX2lkID0gbmV4dC5vcHRzLnZpZGVvSWQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyB3ZSdsbCBydW4gdGhpcyBvbiBpbml0LCBvciBvbiBkZW1hbmQgZm9yIGxhdGVudCBsb2FkZWRcbi8vIGh0bWwgZnJhZ21lbnRzXG5wcml2LmNvbGxlY3REb20gPSBmdW5jdGlvbihmbikge1xuICAvLyB3ZSB3YW50IHRvIHNldCBkZWJ1ZyBzdGF0ZSBhc2FwLCBzbyB3ZSBkbyB0aGF0IGJlZm9yZSBcbiAgLy8gd2UgYWN0dWFsbHkgY29sbGVjdCBhbnkgdmlkZW8gZWxlbXNcbiAgdmlkZW9BbmFseXRpY3Muc2V0RGVidWcoKTtcbiAgdmFyIGRvbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXl0LWFuYWx5dGljc10nKTtcbiAgZm9yKHZhciBpPTA7aTxkb20ubGVuZ3RoOysraSkge1xuICAgIHByaXYucmVmZXJlbmNlT2JqZWN0KGRvbVtpXSk7XG4gIH1cbn07XG5cbi8vIHRoaXMgZnVuY3Rpb24gZ2V0cyBmaXJlZCB3aGVuIHlvdXR1YmUganMgaXMgaW5pdGlhbGl6ZWRcbi8vIGFsc28sIHRoaXMgc2FmZWx5IGFsbG93cyB1cyB0byBleHRlcm5hbGx5IHVzZSAudHJhY2tcbi8vIHdpdGhvdXQgcmFjZSBjb25kaXRpb25zXG5wcml2LmV4dGVybmFsQXBpUmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5sb2FkZWQgPSB0cnVlO1xuICBwcml2LmF0dGFjaFZpZGVvcyhwcml2LnF1ZXVlKTtcbn07XG5cbi8vIHdlIGluY2x1ZGUgeW91dHViZXMganMgc2NyaXB0IGFzeW5jLCBhbmQgd2UnbGwgbmVlZCB0byBcbi8vIGtlZXAgdHJhY2sgb2YgdGhlIHN0YXRlIG9mIHRoYXQgaW5jbHVkZVxucHJpdi5pbmplY3RTY3JpcHRzID0gZnVuY3Rpb24oZm4pIHtcbiAgaWYgKCFwcml2LnNjcmlwdEluY2x1ZGUpIHtcbiAgICAvLyB3ZSBvbmx5IHdhbnQgdG8gZG8gdGhpcyBvbmNlLCBhbmQgdGhpcyBpcyB0aGUgYmVzdFxuICAgIC8vIHRpbWUgdG8gZG8gdGhpcyBvbmNlLCB0aGlzIGFsc28ga2VlcHMgYWxsIG9mIHRoZVxuICAgIC8vIGNvbmRpdGlvbmFsIHN0dWZmIHRvIGEgc2luZ2xlIGVudHJ5LCBzbyBpdCB3b3Jrc1xuICAgIHdpbmRvd1snb25Zb3VUdWJlSWZyYW1lQVBJUmVhZHknXSA9IHByaXYuZXh0ZXJuYWxBcGlSZWFkeTtcblxuICAgIHZhciBwbGFjZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylbMF07XG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgXG4gICAgLy8gaWYgZm4sIGxldHMgdHJlYXQgYXN5bmMsIG90aGVyd2lzZSB3ZSdsbCBiZSBibG9ja2luZ1xuICAgIGlmICh0eXBlb2YgZm4gPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnYXN5bmMnLCB0cnVlKTtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZm4sIGZhbHNlKTtcbiAgICB9XG5cbiAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdzcmMnLCAnLy93d3cueW91dHViZS5jb20vaWZyYW1lX2FwaScpO1xuICAgIHBsYWNlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShwcml2LnNjcmlwdEluY2x1ZGUsIHBsYWNlbWVudCk7XG4gIH1cbn07XG5cbi8vIHdlIHdhbnQgdG8gc3RhbmRhcmRpemUgaG93IHdlIGhhbmRsZSBldmVudHMsIHRoaXMgaXMgdGhlXG4vLyBmbiB0aGF0IGhhbmRsZXMgc3VjaCB0aGluZ3NcbnByaXYucHJvY2Vzc0V2ZW50cyA9IGZ1bmN0aW9uKGtleSwgaWQsIHN0YXRlLCBlKSB7XG4gIHZhciBldmVudHMgPSBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0sXG4gICAgICBwbGF5ZXIgPSBwcml2LnZpZGVvc1tpZF0ucGxheWVyO1xuICAvLyBpZiB3ZSBnZXQgYXQgb3VyIHZpZGVvcyBleHRlcm5hbGx5LCB3ZSB3aWxsIGxpa2VseVxuICAvLyB3YW50IHRvIGtub3cgd2hhdGV2ZXIgdGhlIHN0YXRlIG9mIHRoZSBjdXJyZW50IHZpZGVvXG4gIC8vIGlzIGluXG4gIHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgLy8gdGl0bGUgd2lsbCBmYWxsYmFjayB0byB0aGUgaWQsIHNvIHdlIGNhbiBkZXRlY3Qgd2hlblxuICAvLyB3ZSBjYW4gY2FsbCBvbiB0aGUgeW91dHViZSBhcGkgdG8gZ2V0IHRoZSB2aWRlbyB0aXRsZVxuICAvLyB0aGlzIHdpbGwgYWxsb3cgdXMgdG8gaGF2ZSBodW1hbiByZWFkYWJsZSB0aXRsZXNcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID09IGlkKSB7XG4gICAgLy8gd2UgZG9uJ3Qgd2FudCB0byBhY2NlcHQgYW55IHVuZGVmaW5lZCB2aWRlbyB0aXRsZXMsXG4gICAgLy8gc28gd2UnbGwgZ3JhY2VmdWxseSBmYWxsYmFjayB0byBvdXIgaWQsIHRoaXMgcmVhbGx5XG4gICAgLy8gb25seSBoYXBwZW5zIHdoZW4gd2UgYXJlIGluIGEgdmlkZW8gZXJyb3Igc3RhdGVzXG4gICAgcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPSBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgPyBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgOiBpZDtcbiAgfVxuICAvLyBZb3VUdWJlIHJlY29yZHMgdmlkZW8gdGltZXMgYXMgYSBmbG9hdCwgaSBhbVxuICAvLyBhc3N1bWluZyB3ZSB3b24ndCBuZWVkL3dhbnQgdG8gaGF2ZSBzdWNoIHByZWNpc2lvblxuICAvLyBoZXJlIHdpdGggdGhlIE1hdGguZmxvb3IoKSBjYWxsc1xuICB2YXIgZXZlbnRTdGF0ZSA9IHtcbiAgICBjdXJyZW50VGltZTogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSksIFxuICAgIGR1cmF0aW9uOiBNYXRoLmZsb29yKHBsYXllci5nZXREdXJhdGlvbigpKSxcbiAgICBldmVudDoga2V5LFxuICAgIGlkOiBpZCxcbiAgICB0aXRsZTogcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUsXG4gICAgc3RhdGU6IHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUsXG4gICAgbXV0ZWQ6IHBsYXllci5pc011dGVkKCksXG4gICAgbXM6IG5ldyBEYXRlKCkuZ2V0VGltZSgpXG4gIH07XG4gIGlmIChwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0pIHtcbiAgICBmb3IodmFyIGk9MDtpPGV2ZW50cy5sZW5ndGg7KytpKSB7XG4gICAgICBldmVudHNbaV0oZSwgZXZlbnRTdGF0ZSk7XG4gICAgfVxuICB9XG4gIG1vbi5sb2coZXZlbnRTdGF0ZSk7XG59O1xuXG4vLyBzZXRzIHVwIG91ciBkb20gb2JqZWN0LCBzbyB3ZSBoYXZlIGEgc3RyaWN0IHNjaGVtYSB0byBcbi8vIGFkaGVyZSB0byBsYXRlciBvbiBpbiB0aGUgYXBpIFxucHJpdi5yZWZlcmVuY2VPYmplY3QgPSBmdW5jdGlvbihlbCkge1xuICB2YXIgb3B0cyA9IHt9LCBhdHRycyA9IGF0dHIoZWwpO1xuICBvcHRzLnZpZGVvSWQgPSBhdHRycygnZGF0YS15dC1hbmFseXRpY3MnKTtcbiAgaWYgKGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnKSA9PSBudWxsKSB7XG4gICAgYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcsIHRydWUpO1xuXG4gICAgLy8gZ2V0IG9wdHMgZnJvbSBkYXRhIGF0dHJzXG4gICAgb3B0cy53aWR0aCA9IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgPyBhdHRycygnZGF0YS15dC13aWR0aCcpIDogNjQwO1xuICAgIG9wdHMuaGVpZ2h0ID0gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgPyBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA6IDM5MDtcbiAgICBvcHRzLnBsYXllclZhcnMgPSBhdHRycygnZGF0YS15dC12YXJzJykgPyBzYWZlUGFyc2UoYXR0cnMoJ2RhdGEteXQtdmFycycpKSA6IG51bGw7XG4gICAgb3B0cy50aXRsZSA9IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgPyBhdHRycygnZGF0YS15dC10aXRsZScpIDogb3B0cy52aWRlb0lkO1xuICAgIFxuICAgIC8vIHNldHVwIHZpZGVvcyBldmVudHMsIGFsbCBhcmUgYXZhaWxhYmxlIHB1YmxpY2FsbHksIG1vcmUgaW5mbyBjYW4gYmUgXG4gICAgLy8gZm91bmQgYXQgZGV2ZWxvcGVycy5nb29nbGUuY29tL3lvdXR1YmUvaWZyYW1lX2FwaV9yZWZlcmVuY2UjRXZlbnRzXG4gICAgb3B0cy5ldmVudHMgPSB7XG4gICAgICBvblJlYWR5OiBwcml2LmV2ZW50cy5yZWFkeSxcbiAgICAgIG9uU3RhdGVDaGFuZ2U6IHByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlLFxuICAgICAgb25FcnJvcjogcHJpdi5ldmVudHMuZXJyb3IsXG4gICAgICBvblBsYXliYWNrUXVhbGl0eUNoYW5nZTogcHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlLFxuICAgICAgb25QbGF5YmFja1JhdGVDaGFuZ2U6IHByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSxcbiAgICAgIG9uQXBpQ2hhbmdlOiBwcml2LmV2ZW50cy5hcGlDaGFuZ2VcbiAgICB9O1xuICAgIFxuICAgIC8vIGJ1aWxkIHZpZGVvIG9iamVjdCB0byBzdG9yZVxuICAgIHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0gPSB7IG9wdHM6IG9wdHMsIGVsOiBlbCwgZXZlbnRzOiB7fSB9O1xuICAgIHByaXYucXVldWUucHVzaChwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdKTtcbiAgfVxufTtcblxuLy9cbi8vIEVWRU5UU1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIHRoZSBpZnJhbWVfYXBpIGFsbG93cyB1cyB0byBhdHRhY2ggZG9tIHN0eWxlIGV2ZW50cyB0b1xuLy8gdmlkZW9zLCB3ZSBhbHdheXMgZmlyZSB0aGVzZSBpbnRlcm5hbGx5LCBidXQgdGhlbiB3ZSBcbi8vIGFsc28gYWxsb3cgeW91IHRvIGF0dGFjaCBldmVudHMgdG8gYSB2aWRlbywgYnkgaXRzIGlkXG4vL1xuXG5wcml2LmV2ZW50cy5hcGlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnYXBpQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAnYXBpQ2hhbmdlJywgZSk7XG59O1xuXG4vLyBhY2NvcmRpbmcgdG8geW91dHViZSBkb2NzIHRoZXNlIHN0YXR1cyBjb2Rlc1xuLy8gcmVwcmVzZW50IHRoZSBzdGF0ZSBzdHJpbmcgdGhhdCBpcyBpbmRpY2F0aXZlXG4vLyBvZiB0aGUgZXJyb3JcbnByaXYuZXZlbnRzLmVycm9yID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAndW5yZWNvZ25pemVkIGVycm9yJztcbiAgaWYgKGUuZGF0YSA9PSAyIHx8IGUuZGF0YSA9PSAxMDApIHtcbiAgICBzdGF0ZSA9ICdpbnZhbGlkIHZpZGVvSWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSA1KSB7XG4gICAgc3RhdGUgPSAnaHRtbDUgcGxheWVyIGVycm9yJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gMTAxIHx8IGUuZGF0YSA9PSAxNTApIHtcbiAgICBzdGF0ZSA9ICdlbWJlZGRpbmcgZm9yYmlkZGVuJztcbiAgfVxuICBwcml2LnByb2Nlc3NFdmVudHMoJ2Vycm9yJywgZS50YXJnZXQuX2lkLCBzdGF0ZSwgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncGxheWJhY2tSYXRlQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAncGxheWJhY2tSYXRlQ2hhbmdlJywgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncGxheWJhY2tRdWFsaXR5Q2hhbmdlJywgZS50YXJnZXQuX2lkLCAncGxheWJhY2tRdWFsaXR5Q2hhbmdlJywgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5yZWFkeSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdyZWFkeScsIGUudGFyZ2V0Ll9pZCwgJ3JlYWR5JywgZSk7XG59O1xuXG4vLyB3ZSB0cmFuc2Zvcm0gdGhlIGN1cnJlbnQgc3RhdGUgYGlkYCB0byBhIGh1bWFuIHJlYWRhYmxlXG4vLyBzdHJpbmcgYmFzZWQgb24gdGhlIHlvdXR1YmUgYXBpIGRvY3NcbnByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAndW5rbm93bic7XG4gIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkJVRkZFUklORykge1xuICAgIHN0YXRlID0gJ2J1ZmZlcmluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5DVUVEKSB7XG4gICAgc3RhdGUgPSAnY3VlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5FTkRFRCkge1xuICAgIHN0YXRlID0gJ2VuZGVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBBVVNFRCkge1xuICAgIHN0YXRlID0gJ3BhdXNlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QTEFZSU5HKSB7XG4gICAgc3RhdGUgPSAncGxheWluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5VTlNUQVJURUQpIHtcbiAgICBzdGF0ZSA9ICd1bnN0YXJ0ZWQnO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnc3RhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbi8vXG4vLyBQVUJMSUMgQVBJXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy9cblxuLy8gcHVibGljIG9uIGV2ZW50LCBzbyB5b3UgY2FuIGV4dGVybmFsbHkgYXR0YWNoIHRvIHZpZGVvc1xuLy8gdGhpcyBmbiBjYW4gYmUgcmVjdXJzaXZlLCBzbyB5b3Uga25vdywgYmUgc21hcnQgd2l0aCB0aGlzXG4vLyB0cnkgdG8gYXZvaWQgZXh0cmVtZWx5IGxhcmdlIGFycmF5cywgb3IgZG9pbmcgYXN5bmMgc3R1ZmZcbi8vIGluc2lkZSBvZiB5b3VyIGV2ZW50cyB3aXRob3V0IHRoZSBwcm9wZXIgc2FmZXR5IG1hdGVyaWFsc1xudmlkZW9BbmFseXRpY3Mub24gPSBmdW5jdGlvbihldmVudHMsIGlkLCBmbikge1xuICB2YXIgcmVjdXJzZSA9IGZhbHNlLCBldiA9IGV2ZW50cztcbiAgaWYgKGV2ZW50cyBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmVjdXJzZSA9IGV2ZW50cy5sZW5ndGggPiAwO1xuICAgIGV2ID0gZXZlbnRzLnNoaWZ0KCk7XG4gIH1cbiAgLy8gYCpgIHdpbGRjYXJkIGFsbG93cyB5b3UgdG8gYXR0YWNoIGFuIGV2ZW50IHRvIGV2ZXJ5IHZpZFxuICBpZiAoaWQgPT09ICcqJykge1xuICAgIHZhciB2aWRzID0gT2JqZWN0LmtleXMocHJpdi52aWRlb3MpO1xuICAgIGZvcih2YXIgaT0wO2k8dmlkcy5sZW5ndGg7KytpKSB7XG4gICAgICBwcml2LmF0dGFjaEV2ZW50cyh2aWRzW2ldLGV2LGZuKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcHJpdi5hdHRhY2hFdmVudHMoaWQsZXYsZm4pO1xuICB9XG4gIGlmIChyZWN1cnNlKSByZXR1cm4gdmlkZW9BbmFseXRpY3Mub24oZXZlbnRzLGlkLGZuKTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gZGVidWcgbW9kZSwgYWxsb3dzIHlvdSB0byBjYXB0dXJlIGRlYnVnIGRhdGEgc2ltcGx5XG52aWRlb0FuYWx5dGljcy5zZXREZWJ1ZyA9IGZ1bmN0aW9uKGJvb2wpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS15dC1kZWJ1Z10nKTtcbiAgYm9vbCA9IHR5cGVvZiBib29sID09PSAnYm9vbGVhbicgPyBib29sIDogbnVsbDtcbiAgaWYgKGVsZW0pIHtcbiAgICB2YXIgYXR0cnMgPSBhdHRyKGVsZW0pO1xuICAgIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYXR0cnMoJ2RhdGEteXQtZGVidWcnKSA9PSAndHJ1ZSc7XG4gIH1cbiAgaWYgKGJvb2wgIT09IG51bGwpIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYm9vbDtcbiAgbW9uLmRlYnVnID0gdmlkZW9BbmFseXRpY3MuZGVidWc7XG4gIHZpZGVvQW5hbHl0aWNzLmxvZ3MgPSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA/IG1vbi5oaXN0b3J5IDogW107XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHB1YmxpYyB0cmFja2luZyBldmVudCwgc28geW91IGF0dGFjaCB2aWRlb3MgYWZ0ZXIgZG9tXG4vLyBsb2FkLCBvciB3aXRoIHNvbWUgbGF0ZW50L2FzeW5jIHJlcXVlc3RzXG52aWRlb0FuYWx5dGljcy50cmFjayA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSB7XG4gICAgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG4gICAgcHJpdi5hdHRhY2hWaWRlb3MocHJpdi5xdWV1ZSk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gd2Ugd2FudCB0byBoYXZlIGV4dGVybmFsIGFjY2VzcyB0byB0aGUgdmlkZW9zIHdlJ3JlXG4vLyB0cmFja2luZyBmb3IgaW50ZXJhY3Rpb24gd2l0aCBvdGhlciBhcGlzXG52aWRlb0FuYWx5dGljcy52aWRlb3MgPSBwcml2LnZpZGVvcztcbiAgXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgcHJpdi5pbml0LCBmYWxzZSk7XG5cbm1vZHVsZS5leHBvcnRzID0gdmlkZW9BbmFseXRpY3M7IiwidmFyIGF0dHIgPSBmdW5jdGlvbihlbGVtKSB7XG4gIGlmICh0eXBlb2YgZWxlbSAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAkYXR0cihrZXksIHZhbCkge1xuICAgICAgaWYodHlwZW9mIHZhbCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSBpZiAodmFsID09ICdybScpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZWxlbS5zZXRBdHRyaWJ1dGUoa2V5LCB2YWwpO1xuICAgICAgfVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxudmFyIHNhZmVQYXJzZSA9IGZ1bmN0aW9uKHN0cikge1xuICB2YXIgb3V0cHV0ID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBvdXRwdXQgPSBKU09OLnBhcnNlKHN0cik7XG4gIH0gY2F0Y2ggKGV4KSB7fVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dHI6IGF0dHIsXG4gIHNhZmVQYXJzZTogc2FmZVBhcnNlXG59OyIsInZhciBNb24gPSBmdW5jdGlvbihkZWJ1Zykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTW9uKSkgcmV0dXJuIG5ldyBNb24oZGVidWcpO1xuICB0aGlzLmRlYnVnID0gZGVidWc7XG4gIHRoaXMuaGlzdG9yeSA9IFtdO1xuICByZXR1cm4gdGhpcztcbn07XG5cbk1vbi5wcm90b3R5cGUubG9nID0gZnVuY3Rpb24oKSB7XG4gIHZhciBjcCA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gIHRoaXMuaGlzdG9yeS5wdXNoKGNwKTtcbiAgaWYgKHRoaXMuZGVidWcpIHtcbiAgICBpZih0eXBlb2Ygd2luZG93Wydjb25zb2xlJ10gIT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZS5sb2cpIHtcbiAgICAgIGlmIChjcC5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGNwWzBdID09ICdvYmplY3QnKSBjcCA9IEpTT04uc3RyaW5naWZ5KGNwWzBdLG51bGwsMik7XG4gICAgICBjb25zb2xlLmxvZyhjcCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb247Il19
(1)
});
