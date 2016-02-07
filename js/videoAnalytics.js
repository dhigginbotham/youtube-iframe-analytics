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
  if (!priv.videos[id]) priv.videos[id] = {};
  if (!priv.videos[id].events) priv.videos[id].events = {};
  if (!(priv.videos[id].events[event] instanceof Array)) priv.videos[id].events[event] = [];
  priv.videos[id].events[event].push(fn);
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
    
    // build video object to store if we need to
    if (!priv.videos.hasOwnProperty(opts.videoId)) {
      priv.videos[opts.videoId] = {};
    }
    
    priv.videos[opts.videoId].opts = opts;
    priv.videos[opts.videoId].el = el;
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
    if (!vids.length) return videoAnalytics;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV9mMWI3OGE5YS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBtb24gPSByZXF1aXJlKCcuL21vbicpKGZhbHNlKTtcbnZhciBhdHRyID0gaGVscGVycy5hdHRyLCBzYWZlUGFyc2UgPSBoZWxwZXJzLnNhZmVQYXJzZTtcblxuLy8gYXBpIG9iamVjdHNcbnZhciB2aWRlb0FuYWx5dGljcyA9IHt9LCBwcml2ID0ge307XG5cbi8vIHdlIHdhbnQgdG8ga2VlcCBjb250ZXh0IG9mIG91ciBkb20sIHNvIHdlIGNhbiBlYXNpbHkgcmVmXG4vLyB0aGUgbm9kZXMgbGF0ZXIgb25cbnByaXYudmlkZW9zID0ge307XG5cbi8vIGVhY2ggZG9tIG5vZGUgd2lsbCBoYXZlIGV2ZW50cyBhdHRhY2hlZCBzbyB3ZSBjYW4gZWFzaWx5XG4vLyBpbnRlcmFjdCB3aXRoIHRoZW0sIHdlJ2xsIGRvIHNvbWUgZGF0YS1iaW5kaW5nIHRvIGNvbGxlY3Rcbi8vIG91ciBub2Rlc1xucHJpdi5ldmVudHMgPSB7fTtcbiAgXG4vLyB2aWRlb3MgcXVldWUsIGJlY2F1c2Ugd2UgbG9hZCBhIDNyZCBwYXJ0eSBhc3NldCB3ZSB3YW50XG4vLyB0byBtaXRpZ2F0ZSByYWNlIGNvbmRpdGlvbnMgb2YgWVQgbm90IGJlaW5nIHJlYWR5LCBzb1xuLy8gd2Uga2VlcCBhbGwgdW50cmFja2VkIHZpZGVvcyBpbiB0aGlzIHF1ZXVlIGFuZCBzaGlmdCBcbi8vIHRoZW0gb3V0IGFzIHdlIGdldCB0byB0aGVtXG5wcml2LnF1ZXVlID0gW107XG5cbi8vIGtlZXAgdHJhY2sgb2YgeW91dHViZSBjYWxsaW5nIG91ciBmblxucHJpdi5sb2FkZWQgPSBmYWxzZTtcblxuLy8gaW5pdCBmbiB0aGF0IGhhcHBlbnMgb24gRE9NQ29udGVudExvYWRlZFxucHJpdi5pbml0ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHByaXYuaW5qZWN0U2NyaXB0cygpO1xufTtcblxuLy8gYXR0YWNoZXMgZXZlbnRzIHRvIHZpZGVvcyBzbyB0aGV5IGNhbiBiZSBwcm9jZXNzZWQgYnkgXG4vLyB0aGUgLm9uKCkgZm5cbnByaXYuYXR0YWNoRXZlbnRzID0gZnVuY3Rpb24oaWQsIGV2ZW50LCBmbikge1xuICBpZiAoIXByaXYudmlkZW9zW2lkXSkgcHJpdi52aWRlb3NbaWRdID0ge307XG4gIGlmICghcHJpdi52aWRlb3NbaWRdLmV2ZW50cykgcHJpdi52aWRlb3NbaWRdLmV2ZW50cyA9IHt9O1xuICBpZiAoIShwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2V2ZW50XSBpbnN0YW5jZW9mIEFycmF5KSkgcHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0gPSBbXTtcbiAgcHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0ucHVzaChmbik7XG59O1xuXG4vLyB0aGUgd2F5IHRoZSBpZnJhbWVfYXBpIHdvcmtzIGlzIGJ5IHJlcGxhY2luZyBhbiBlbGVtZW50XG4vLyB3aXRoIGFuIGlmcmFtZSwgc28gd2UnbGwgd2FudCB0byBhdHRhY2ggdGhlIHZpZGVvIGFzIFxuLy8gbmVlZGVkXG5wcml2LmF0dGFjaFZpZGVvcyA9IGZ1bmN0aW9uKHF1ZXVlKSB7XG4gIGlmIChwcml2LmxvYWRlZCkge1xuICAgIHZhciBuZXh0O1xuICAgIHdoaWxlKG5leHQgPSBxdWV1ZS5zaGlmdCgpKSB7XG4gICAgICBuZXh0LnBsYXllciA9IG5ldyBZVC5QbGF5ZXIobmV4dC5lbCwgbmV4dC5vcHRzKTtcbiAgICAgIG5leHQucGxheWVyLl9pZCA9IG5leHQub3B0cy52aWRlb0lkO1xuICAgIH1cbiAgfVxufTtcblxuLy8gd2UnbGwgcnVuIHRoaXMgb24gaW5pdCwgb3Igb24gZGVtYW5kIGZvciBsYXRlbnQgbG9hZGVkXG4vLyBodG1sIGZyYWdtZW50c1xucHJpdi5jb2xsZWN0RG9tID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gd2Ugd2FudCB0byBzZXQgZGVidWcgc3RhdGUgYXNhcCwgc28gd2UgZG8gdGhhdCBiZWZvcmUgXG4gIC8vIHdlIGFjdHVhbGx5IGNvbGxlY3QgYW55IHZpZGVvIGVsZW1zXG4gIHZpZGVvQW5hbHl0aWNzLnNldERlYnVnKCk7XG4gIHZhciBkb20gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS15dC1hbmFseXRpY3NdJyk7XG4gIGZvcih2YXIgaT0wO2k8ZG9tLmxlbmd0aDsrK2kpIHtcbiAgICBwcml2LnJlZmVyZW5jZU9iamVjdChkb21baV0pO1xuICB9XG59O1xuXG4vLyB0aGlzIGZ1bmN0aW9uIGdldHMgZmlyZWQgd2hlbiB5b3V0dWJlIGpzIGlzIGluaXRpYWxpemVkXG4vLyBhbHNvLCB0aGlzIHNhZmVseSBhbGxvd3MgdXMgdG8gZXh0ZXJuYWxseSB1c2UgLnRyYWNrXG4vLyB3aXRob3V0IHJhY2UgY29uZGl0aW9uc1xucHJpdi5leHRlcm5hbEFwaVJlYWR5ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYubG9hZGVkID0gdHJ1ZTtcbiAgcHJpdi5hdHRhY2hWaWRlb3MocHJpdi5xdWV1ZSk7XG59O1xuXG4vLyB3ZSBpbmNsdWRlIHlvdXR1YmVzIGpzIHNjcmlwdCBhc3luYywgYW5kIHdlJ2xsIG5lZWQgdG8gXG4vLyBrZWVwIHRyYWNrIG9mIHRoZSBzdGF0ZSBvZiB0aGF0IGluY2x1ZGVcbnByaXYuaW5qZWN0U2NyaXB0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIGlmICghcHJpdi5zY3JpcHRJbmNsdWRlKSB7XG4gICAgLy8gd2Ugb25seSB3YW50IHRvIGRvIHRoaXMgb25jZSwgYW5kIHRoaXMgaXMgdGhlIGJlc3RcbiAgICAvLyB0aW1lIHRvIGRvIHRoaXMgb25jZSwgdGhpcyBhbHNvIGtlZXBzIGFsbCBvZiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdHVmZiB0byBhIHNpbmdsZSBlbnRyeSwgc28gaXQgd29ya3NcbiAgICB3aW5kb3dbJ29uWW91VHViZUlmcmFtZUFQSVJlYWR5J10gPSBwcml2LmV4dGVybmFsQXBpUmVhZHk7XG5cbiAgICB2YXIgcGxhY2VtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdO1xuICAgIHByaXYuc2NyaXB0SW5jbHVkZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgIFxuICAgIC8vIGlmIGZuLCBsZXRzIHRyZWF0IGFzeW5jLCBvdGhlcndpc2Ugd2UnbGwgYmUgYmxvY2tpbmdcbiAgICBpZiAodHlwZW9mIGZuID09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ2FzeW5jJywgdHJ1ZSk7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGZuLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnc3JjJywgJy8vd3d3LnlvdXR1YmUuY29tL2lmcmFtZV9hcGknKTtcbiAgICBwbGFjZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUocHJpdi5zY3JpcHRJbmNsdWRlLCBwbGFjZW1lbnQpO1xuICB9XG59O1xuXG4vLyB3ZSB3YW50IHRvIHN0YW5kYXJkaXplIGhvdyB3ZSBoYW5kbGUgZXZlbnRzLCB0aGlzIGlzIHRoZVxuLy8gZm4gdGhhdCBoYW5kbGVzIHN1Y2ggdGhpbmdzXG5wcml2LnByb2Nlc3NFdmVudHMgPSBmdW5jdGlvbihrZXksIGlkLCBzdGF0ZSwgZSkge1xuICB2YXIgZXZlbnRzID0gcHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldLFxuICAgICAgcGxheWVyID0gcHJpdi52aWRlb3NbaWRdLnBsYXllcjtcbiAgLy8gaWYgd2UgZ2V0IGF0IG91ciB2aWRlb3MgZXh0ZXJuYWxseSwgd2Ugd2lsbCBsaWtlbHlcbiAgLy8gd2FudCB0byBrbm93IHdoYXRldmVyIHRoZSBzdGF0ZSBvZiB0aGUgY3VycmVudCB2aWRlb1xuICAvLyBpcyBpblxuICBwcml2LnZpZGVvc1tpZF0uY3VycmVudFN0YXRlID0gc3RhdGU7XG4gIC8vIHRpdGxlIHdpbGwgZmFsbGJhY2sgdG8gdGhlIGlkLCBzbyB3ZSBjYW4gZGV0ZWN0IHdoZW5cbiAgLy8gd2UgY2FuIGNhbGwgb24gdGhlIHlvdXR1YmUgYXBpIHRvIGdldCB0aGUgdmlkZW8gdGl0bGVcbiAgLy8gdGhpcyB3aWxsIGFsbG93IHVzIHRvIGhhdmUgaHVtYW4gcmVhZGFibGUgdGl0bGVzXG4gIGlmIChwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9PSBpZCkge1xuICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gYWNjZXB0IGFueSB1bmRlZmluZWQgdmlkZW8gdGl0bGVzLFxuICAgIC8vIHNvIHdlJ2xsIGdyYWNlZnVsbHkgZmFsbGJhY2sgdG8gb3VyIGlkLCB0aGlzIHJlYWxseVxuICAgIC8vIG9ubHkgaGFwcGVucyB3aGVuIHdlIGFyZSBpbiBhIHZpZGVvIGVycm9yIHN0YXRlc1xuICAgIHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID0gcGxheWVyLmdldFZpZGVvRGF0YSgpLnRpdGxlID8gcGxheWVyLmdldFZpZGVvRGF0YSgpLnRpdGxlIDogaWQ7XG4gIH1cbiAgLy8gWW91VHViZSByZWNvcmRzIHZpZGVvIHRpbWVzIGFzIGEgZmxvYXQsIGkgYW1cbiAgLy8gYXNzdW1pbmcgd2Ugd29uJ3QgbmVlZC93YW50IHRvIGhhdmUgc3VjaCBwcmVjaXNpb25cbiAgLy8gaGVyZSB3aXRoIHRoZSBNYXRoLmZsb29yKCkgY2FsbHNcbiAgdmFyIGV2ZW50U3RhdGUgPSB7XG4gICAgY3VycmVudFRpbWU6IE1hdGguZmxvb3IocGxheWVyLmdldEN1cnJlbnRUaW1lKCkpLCBcbiAgICBkdXJhdGlvbjogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0RHVyYXRpb24oKSksXG4gICAgZXZlbnQ6IGtleSxcbiAgICBpZDogaWQsXG4gICAgdGl0bGU6IHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlLFxuICAgIHN0YXRlOiBwcml2LnZpZGVvc1tpZF0uY3VycmVudFN0YXRlLFxuICAgIG11dGVkOiBwbGF5ZXIuaXNNdXRlZCgpLFxuICAgIG1zOiBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuICB9O1xuICBpZiAocHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldKSB7XG4gICAgZm9yKHZhciBpPTA7aTxldmVudHMubGVuZ3RoOysraSkge1xuICAgICAgZXZlbnRzW2ldKGUsIGV2ZW50U3RhdGUpO1xuICAgIH1cbiAgfVxuICBtb24ubG9nKGV2ZW50U3RhdGUpO1xufTtcblxuLy8gc2V0cyB1cCBvdXIgZG9tIG9iamVjdCwgc28gd2UgaGF2ZSBhIHN0cmljdCBzY2hlbWEgdG8gXG4vLyBhZGhlcmUgdG8gbGF0ZXIgb24gaW4gdGhlIGFwaSBcbnByaXYucmVmZXJlbmNlT2JqZWN0ID0gZnVuY3Rpb24oZWwpIHtcbiAgdmFyIG9wdHMgPSB7fSwgYXR0cnMgPSBhdHRyKGVsKTtcbiAgb3B0cy52aWRlb0lkID0gYXR0cnMoJ2RhdGEteXQtYW5hbHl0aWNzJyk7XG4gIGlmIChhdHRycygnZGF0YS15dC10cmFja2VkJykgPT0gbnVsbCkge1xuICAgIGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnLCB0cnVlKTtcblxuICAgIC8vIGdldCBvcHRzIGZyb20gZGF0YSBhdHRyc1xuICAgIG9wdHMud2lkdGggPSBhdHRycygnZGF0YS15dC13aWR0aCcpID8gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA6IDY0MDtcbiAgICBvcHRzLmhlaWdodCA9IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpID8gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgOiAzOTA7XG4gICAgb3B0cy5wbGF5ZXJWYXJzID0gYXR0cnMoJ2RhdGEteXQtdmFycycpID8gc2FmZVBhcnNlKGF0dHJzKCdkYXRhLXl0LXZhcnMnKSkgOiBudWxsO1xuICAgIG9wdHMudGl0bGUgPSBhdHRycygnZGF0YS15dC10aXRsZScpID8gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA6IG9wdHMudmlkZW9JZDtcbiAgICBcbiAgICAvLyBzZXR1cCB2aWRlb3MgZXZlbnRzLCBhbGwgYXJlIGF2YWlsYWJsZSBwdWJsaWNhbGx5LCBtb3JlIGluZm8gY2FuIGJlIFxuICAgIC8vIGZvdW5kIGF0IGRldmVsb3BlcnMuZ29vZ2xlLmNvbS95b3V0dWJlL2lmcmFtZV9hcGlfcmVmZXJlbmNlI0V2ZW50c1xuICAgIG9wdHMuZXZlbnRzID0ge1xuICAgICAgb25SZWFkeTogcHJpdi5ldmVudHMucmVhZHksXG4gICAgICBvblN0YXRlQ2hhbmdlOiBwcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSxcbiAgICAgIG9uRXJyb3I6IHByaXYuZXZlbnRzLmVycm9yLFxuICAgICAgb25QbGF5YmFja1F1YWxpdHlDaGFuZ2U6IHByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSxcbiAgICAgIG9uUGxheWJhY2tSYXRlQ2hhbmdlOiBwcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2UsXG4gICAgICBvbkFwaUNoYW5nZTogcHJpdi5ldmVudHMuYXBpQ2hhbmdlXG4gICAgfTtcbiAgICBcbiAgICAvLyBidWlsZCB2aWRlbyBvYmplY3QgdG8gc3RvcmUgaWYgd2UgbmVlZCB0b1xuICAgIGlmICghcHJpdi52aWRlb3MuaGFzT3duUHJvcGVydHkob3B0cy52aWRlb0lkKSkge1xuICAgICAgcHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSA9IHt9O1xuICAgIH1cbiAgICBcbiAgICBwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdLm9wdHMgPSBvcHRzO1xuICAgIHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0uZWwgPSBlbDtcbiAgICBwcml2LnF1ZXVlLnB1c2gocHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSk7XG4gIH1cbn07XG5cbi8vXG4vLyBFVkVOVFNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyB0aGUgaWZyYW1lX2FwaSBhbGxvd3MgdXMgdG8gYXR0YWNoIGRvbSBzdHlsZSBldmVudHMgdG9cbi8vIHZpZGVvcywgd2UgYWx3YXlzIGZpcmUgdGhlc2UgaW50ZXJuYWxseSwgYnV0IHRoZW4gd2UgXG4vLyBhbHNvIGFsbG93IHlvdSB0byBhdHRhY2ggZXZlbnRzIHRvIGEgdmlkZW8sIGJ5IGl0cyBpZFxuLy9cblxucHJpdi5ldmVudHMuYXBpQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ2FwaUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ2FwaUNoYW5nZScsIGUpO1xufTtcblxuLy8gYWNjb3JkaW5nIHRvIHlvdXR1YmUgZG9jcyB0aGVzZSBzdGF0dXMgY29kZXNcbi8vIHJlcHJlc2VudCB0aGUgc3RhdGUgc3RyaW5nIHRoYXQgaXMgaW5kaWNhdGl2ZVxuLy8gb2YgdGhlIGVycm9yXG5wcml2LmV2ZW50cy5lcnJvciA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ3VucmVjb2duaXplZCBlcnJvcic7XG4gIGlmIChlLmRhdGEgPT0gMiB8fCBlLmRhdGEgPT0gMTAwKSB7XG4gICAgc3RhdGUgPSAnaW52YWxpZCB2aWRlb0lkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gNSkge1xuICAgIHN0YXRlID0gJ2h0bWw1IHBsYXllciBlcnJvcic7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDEwMSB8fCBlLmRhdGEgPT0gMTUwKSB7XG4gICAgc3RhdGUgPSAnZW1iZWRkaW5nIGZvcmJpZGRlbic7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdlcnJvcicsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucmVhZHkgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncmVhZHknLCBlLnRhcmdldC5faWQsICdyZWFkeScsIGUpO1xufTtcblxuLy8gd2UgdHJhbnNmb3JtIHRoZSBjdXJyZW50IHN0YXRlIGBpZGAgdG8gYSBodW1hbiByZWFkYWJsZVxuLy8gc3RyaW5nIGJhc2VkIG9uIHRoZSB5b3V0dWJlIGFwaSBkb2NzXG5wcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ3Vua25vd24nO1xuICBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5CVUZGRVJJTkcpIHtcbiAgICBzdGF0ZSA9ICdidWZmZXJpbmcnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQ1VFRCkge1xuICAgIHN0YXRlID0gJ2N1ZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuRU5ERUQpIHtcbiAgICBzdGF0ZSA9ICdlbmRlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QQVVTRUQpIHtcbiAgICBzdGF0ZSA9ICdwYXVzZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUExBWUlORykge1xuICAgIHN0YXRlID0gJ3BsYXlpbmcnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuVU5TVEFSVEVEKSB7XG4gICAgc3RhdGUgPSAndW5zdGFydGVkJztcbiAgfVxuICBwcml2LnByb2Nlc3NFdmVudHMoJ3N0YXRlQ2hhbmdlJywgZS50YXJnZXQuX2lkLCBzdGF0ZSwgZSk7XG59O1xuXG4vL1xuLy8gUFVCTElDIEFQSVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vXG5cbi8vIHB1YmxpYyBvbiBldmVudCwgc28geW91IGNhbiBleHRlcm5hbGx5IGF0dGFjaCB0byB2aWRlb3Ncbi8vIHRoaXMgZm4gY2FuIGJlIHJlY3Vyc2l2ZSwgc28geW91IGtub3csIGJlIHNtYXJ0IHdpdGggdGhpc1xuLy8gdHJ5IHRvIGF2b2lkIGV4dHJlbWVseSBsYXJnZSBhcnJheXMsIG9yIGRvaW5nIGFzeW5jIHN0dWZmXG4vLyBpbnNpZGUgb2YgeW91ciBldmVudHMgd2l0aG91dCB0aGUgcHJvcGVyIHNhZmV0eSBtYXRlcmlhbHNcbnZpZGVvQW5hbHl0aWNzLm9uID0gZnVuY3Rpb24oZXZlbnRzLCBpZCwgZm4pIHtcbiAgdmFyIHJlY3Vyc2UgPSBmYWxzZSwgZXYgPSBldmVudHM7XG4gIGlmIChldmVudHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJlY3Vyc2UgPSBldmVudHMubGVuZ3RoID4gMDtcbiAgICBldiA9IGV2ZW50cy5zaGlmdCgpO1xuICB9XG4gIC8vIGAqYCB3aWxkY2FyZCBhbGxvd3MgeW91IHRvIGF0dGFjaCBhbiBldmVudCB0byBldmVyeSB2aWRcbiAgaWYgKGlkID09PSAnKicpIHtcbiAgICB2YXIgdmlkcyA9IE9iamVjdC5rZXlzKHByaXYudmlkZW9zKTtcbiAgICBpZiAoIXZpZHMubGVuZ3RoKSByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG4gICAgZm9yKHZhciBpPTA7aTx2aWRzLmxlbmd0aDsrK2kpIHtcbiAgICAgIHByaXYuYXR0YWNoRXZlbnRzKHZpZHNbaV0sZXYsZm4pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwcml2LmF0dGFjaEV2ZW50cyhpZCxldixmbik7XG4gIH1cbiAgaWYgKHJlY3Vyc2UpIHJldHVybiB2aWRlb0FuYWx5dGljcy5vbihldmVudHMsaWQsZm4pO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBkZWJ1ZyBtb2RlLCBhbGxvd3MgeW91IHRvIGNhcHR1cmUgZGVidWcgZGF0YSBzaW1wbHlcbnZpZGVvQW5hbHl0aWNzLnNldERlYnVnID0gZnVuY3Rpb24oYm9vbCkge1xuICB2YXIgZWxlbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXl0LWRlYnVnXScpO1xuICBib29sID0gdHlwZW9mIGJvb2wgPT09ICdib29sZWFuJyA/IGJvb2wgOiBudWxsO1xuICBpZiAoZWxlbSkge1xuICAgIHZhciBhdHRycyA9IGF0dHIoZWxlbSk7XG4gICAgdmlkZW9BbmFseXRpY3MuZGVidWcgPSBhdHRycygnZGF0YS15dC1kZWJ1ZycpID09ICd0cnVlJztcbiAgfVxuICBpZiAoYm9vbCAhPT0gbnVsbCkgdmlkZW9BbmFseXRpY3MuZGVidWcgPSBib29sO1xuICBtb24uZGVidWcgPSB2aWRlb0FuYWx5dGljcy5kZWJ1ZztcbiAgdmlkZW9BbmFseXRpY3MubG9ncyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnID8gbW9uLmhpc3RvcnkgOiBbXTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gcHVibGljIHRyYWNraW5nIGV2ZW50LCBzbyB5b3UgYXR0YWNoIHZpZGVvcyBhZnRlciBkb21cbi8vIGxvYWQsIG9yIHdpdGggc29tZSBsYXRlbnQvYXN5bmMgcmVxdWVzdHNcbnZpZGVvQW5hbHl0aWNzLnRyYWNrID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHtcbiAgICBwcml2LmluamVjdFNjcmlwdHMoKTtcbiAgICBwcml2LmF0dGFjaFZpZGVvcyhwcml2LnF1ZXVlKTtcbiAgfVxuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyB3ZSB3YW50IHRvIGhhdmUgZXh0ZXJuYWwgYWNjZXNzIHRvIHRoZSB2aWRlb3Mgd2UncmVcbi8vIHRyYWNraW5nIGZvciBpbnRlcmFjdGlvbiB3aXRoIG90aGVyIGFwaXNcbnZpZGVvQW5hbHl0aWNzLnZpZGVvcyA9IHByaXYudmlkZW9zO1xuICBcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBwcml2LmluaXQsIGZhbHNlKTtcblxubW9kdWxlLmV4cG9ydHMgPSB2aWRlb0FuYWx5dGljczsiLCJ2YXIgYXR0ciA9IGZ1bmN0aW9uKGVsZW0pIHtcbiAgaWYgKHR5cGVvZiBlbGVtICE9ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICRhdHRyKGtleSwgdmFsKSB7XG4gICAgICBpZih0eXBlb2YgdmFsID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBlbGVtLmdldEF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIGlmICh2YWwgPT0gJ3JtJykge1xuICAgICAgICByZXR1cm4gZWxlbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBlbGVtLnNldEF0dHJpYnV0ZShrZXksIHZhbCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG52YXIgc2FmZVBhcnNlID0gZnVuY3Rpb24oc3RyKSB7XG4gIHZhciBvdXRwdXQgPSBudWxsO1xuICB0cnkge1xuICAgIG91dHB1dCA9IEpTT04ucGFyc2Uoc3RyKTtcbiAgfSBjYXRjaCAoZXgpIHt9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0cjogYXR0cixcbiAgc2FmZVBhcnNlOiBzYWZlUGFyc2Vcbn07IiwidmFyIE1vbiA9IGZ1bmN0aW9uKGRlYnVnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBNb24pKSByZXR1cm4gbmV3IE1vbihkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxuTW9uLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNwID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgdGhpcy5oaXN0b3J5LnB1c2goY3ApO1xuICBpZiAodGhpcy5kZWJ1Zykge1xuICAgIGlmKHR5cGVvZiB3aW5kb3dbJ2NvbnNvbGUnXSAhPSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLmxvZykge1xuICAgICAgaWYgKGNwLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY3BbMF0gPT0gJ29iamVjdCcpIGNwID0gSlNPTi5zdHJpbmdpZnkoY3BbMF0sbnVsbCwyKTtcbiAgICAgIGNvbnNvbGUubG9nKGNwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vbjsiXX0=
(1)
});
