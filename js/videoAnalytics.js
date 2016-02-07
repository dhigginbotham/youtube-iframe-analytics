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

// the way the iframe_api works is by replacing an element
// with an iframe, so we'll want to attach the video as 
// needed
priv.attachVideos = function() {
  if (priv.loaded) {
    var video;
    while(video = priv.queue.shift()) {
      video.player = new YT.Player(video.el, video.opts);
      video.player._id = video.opts.videoId;
    }
  }
};

// we'll run this on init, or on demand for latent loaded
// html fragments
priv.collectDom = function() {
  // we want to set debug state fairly early, so we'll do
  // it before we actually query for any videos to setup
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
  priv.attachVideos();
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
  var eventState = {
    currentTime: Math.floor(player.getCurrentTime()), 
    duration: Math.floor(player.getDuration()),
    event: key,
    id: id,
    title: priv.videos[id].opts.title,
    state: state,
    muted: player.isMuted(),
    ms: new Date().getTime()
  };
  // if we get at our videos externally, we will likely
  // want to know whatever the state of the current video
  // is in
  priv.videos[id].currentState = state;
  // title will fallback to the id, so we can detect when
  // we can call on the youtube api to get the video title
  // this will allow us to have human readable titles, 
  // without the overhead
  if (priv.videos[id].opts.title == id) {
    // we don't want to accept any undefined video titles,
    // so we'll gracefully fallback to our id, this really
    // only happens when we are in a video error state
    priv.videos[id].opts.title = player.getVideoData().title ? player.getVideoData().title : id;
  }
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
    
    // setup base events
    opts.events = priv.setupEvents();
    
    // build video object to store
    priv.videos[opts.videoId] = { opts: opts, el: el, events: {} };
    priv.queue.push(priv.videos[opts.videoId]);
  }
};

// setup videos events, all are available publically, more info can be 
// found at developers.google.com/youtube/iframe_api_reference#Events
priv.setupEvents = function() {
  var events = {};
  events.onReady = priv.events.ready;
  events.onStateChange = priv.events.stateChange;
  events.onError = priv.events.error;
  events.onPlaybackQualityChange = priv.events.playbackQualityChange;
  events.onPlaybackRateChange = priv.events.playbackRateChange;
  events.onApiChange = priv.events.apiChange;
  return events;
};

// the iframe_api allows us to attach dom style events to
// videos, we always fire these internally, but then we 
// also allow you to attach events to a video, by its id
// --------------------------------------------------------
//

priv.events.apiChange = function(e) {
  priv.processEvents('apiChange', e.target._id, 'apiChange', e);
};

// according to youtube docs these status codes
// represent the state string that is indicative
// of the error
priv.events.error = function(e) {
  var state = 'invalid videoId';
  if (e.data == 2 || e.data == 100) {
    // basically nothing, as these are defaults
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
  var state = 'unstarted';
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
  }
  priv.processEvents('stateChange', e.target._id, state, e);
};

// public on event, so you can externally attach to videos
videoAnalytics.on = function(event, id, fn) {
  var processor = function(next) {
    if (priv.videos[next]) {
      if (!(priv.videos[next].events[event] instanceof Array)) priv.videos[next].events[event] = [];
      priv.videos[next].events[event].push(fn);
    }
  };
  // accepts `*` as an identifier of a "global"
  // event that should be attached to all videos
  if (id === '*') {
    Object.keys(priv.videos).forEach(processor);
  } else {
    processor(id);
  }
  return videoAnalytics;
};

// public tracking event, so you attach videos after dom
// load, or with some latent/async requests
videoAnalytics.track = function() {
  priv.collectDom();
  if (priv.queue.length) {
    priv.injectScripts();
    priv.attachVideos();
  }
  return videoAnalytics;
};

// debug mode, allows you to capture debug data simply
videoAnalytics.setDebug = function(bool) {
  var elem = document.querySelector('[data-yt-debug]');
  bool = typeof bool != 'undefined' ? bool : null;
  if (elem) {
    var attrs = attr(elem);
    videoAnalytics.debug = attrs('data-yt-debug') == 'true';
  }
  if (bool !== null) videoAnalytics.debug = bool;
  mon.debug = videoAnalytics.debug;
  videoAnalytics.logs = videoAnalytics.debug ? mon.history : [];
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

var mon = function(debug) {
  if (!(this instanceof mon)) return new mon(debug);
  this.debug = debug;
  this.history = [];
  return this;
};

mon.prototype.log = function() {
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

module.exports = {
  attr: attr,
  mon: mon,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV82NTFhYWY1Zi5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBtb24gPSByZXF1aXJlKCcuL21vbicpKGZhbHNlKTtcbnZhciBhdHRyID0gaGVscGVycy5hdHRyLCBzYWZlUGFyc2UgPSBoZWxwZXJzLnNhZmVQYXJzZTtcblxuLy8gYXBpIG9iamVjdHNcbnZhciB2aWRlb0FuYWx5dGljcyA9IHt9LCBwcml2ID0ge307XG5cbi8vIHdlIHdhbnQgdG8ga2VlcCBjb250ZXh0IG9mIG91ciBkb20sIHNvIHdlIGNhbiBlYXNpbHkgcmVmXG4vLyB0aGUgbm9kZXMgbGF0ZXIgb25cbnByaXYudmlkZW9zID0ge307XG5cbi8vIGVhY2ggZG9tIG5vZGUgd2lsbCBoYXZlIGV2ZW50cyBhdHRhY2hlZCBzbyB3ZSBjYW4gZWFzaWx5XG4vLyBpbnRlcmFjdCB3aXRoIHRoZW0sIHdlJ2xsIGRvIHNvbWUgZGF0YS1iaW5kaW5nIHRvIGNvbGxlY3Rcbi8vIG91ciBub2Rlc1xucHJpdi5ldmVudHMgPSB7fTtcbiAgXG4vLyB2aWRlb3MgcXVldWUsIGJlY2F1c2Ugd2UgbG9hZCBhIDNyZCBwYXJ0eSBhc3NldCB3ZSB3YW50XG4vLyB0byBtaXRpZ2F0ZSByYWNlIGNvbmRpdGlvbnMgb2YgWVQgbm90IGJlaW5nIHJlYWR5LCBzb1xuLy8gd2Uga2VlcCBhbGwgdW50cmFja2VkIHZpZGVvcyBpbiB0aGlzIHF1ZXVlIGFuZCBzaGlmdCBcbi8vIHRoZW0gb3V0IGFzIHdlIGdldCB0byB0aGVtXG5wcml2LnF1ZXVlID0gW107XG5cbi8vIGtlZXAgdHJhY2sgb2YgeW91dHViZSBjYWxsaW5nIG91ciBmblxucHJpdi5sb2FkZWQgPSBmYWxzZTtcblxuLy8gaW5pdCBmbiB0aGF0IGhhcHBlbnMgb24gRE9NQ29udGVudExvYWRlZFxucHJpdi5pbml0ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHByaXYuaW5qZWN0U2NyaXB0cygpO1xufTtcblxuLy8gdGhlIHdheSB0aGUgaWZyYW1lX2FwaSB3b3JrcyBpcyBieSByZXBsYWNpbmcgYW4gZWxlbWVudFxuLy8gd2l0aCBhbiBpZnJhbWUsIHNvIHdlJ2xsIHdhbnQgdG8gYXR0YWNoIHRoZSB2aWRlbyBhcyBcbi8vIG5lZWRlZFxucHJpdi5hdHRhY2hWaWRlb3MgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHByaXYubG9hZGVkKSB7XG4gICAgdmFyIHZpZGVvO1xuICAgIHdoaWxlKHZpZGVvID0gcHJpdi5xdWV1ZS5zaGlmdCgpKSB7XG4gICAgICB2aWRlby5wbGF5ZXIgPSBuZXcgWVQuUGxheWVyKHZpZGVvLmVsLCB2aWRlby5vcHRzKTtcbiAgICAgIHZpZGVvLnBsYXllci5faWQgPSB2aWRlby5vcHRzLnZpZGVvSWQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyB3ZSdsbCBydW4gdGhpcyBvbiBpbml0LCBvciBvbiBkZW1hbmQgZm9yIGxhdGVudCBsb2FkZWRcbi8vIGh0bWwgZnJhZ21lbnRzXG5wcml2LmNvbGxlY3REb20gPSBmdW5jdGlvbigpIHtcbiAgLy8gd2Ugd2FudCB0byBzZXQgZGVidWcgc3RhdGUgZmFpcmx5IGVhcmx5LCBzbyB3ZSdsbCBkb1xuICAvLyBpdCBiZWZvcmUgd2UgYWN0dWFsbHkgcXVlcnkgZm9yIGFueSB2aWRlb3MgdG8gc2V0dXBcbiAgdmlkZW9BbmFseXRpY3Muc2V0RGVidWcoKTtcbiAgdmFyIGRvbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXl0LWFuYWx5dGljc10nKTtcbiAgZm9yKHZhciBpPTA7aTxkb20ubGVuZ3RoOysraSkge1xuICAgIHByaXYucmVmZXJlbmNlT2JqZWN0KGRvbVtpXSk7XG4gIH1cbn07XG5cbi8vIHRoaXMgZnVuY3Rpb24gZ2V0cyBmaXJlZCB3aGVuIHlvdXR1YmUganMgaXMgaW5pdGlhbGl6ZWRcbi8vIGFsc28sIHRoaXMgc2FmZWx5IGFsbG93cyB1cyB0byBleHRlcm5hbGx5IHVzZSAudHJhY2tcbi8vIHdpdGhvdXQgcmFjZSBjb25kaXRpb25zXG5wcml2LmV4dGVybmFsQXBpUmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5sb2FkZWQgPSB0cnVlO1xuICBwcml2LmF0dGFjaFZpZGVvcygpO1xufTtcblxuLy8gd2UgaW5jbHVkZSB5b3V0dWJlcyBqcyBzY3JpcHQgYXN5bmMsIGFuZCB3ZSdsbCBuZWVkIHRvIFxuLy8ga2VlcCB0cmFjayBvZiB0aGUgc3RhdGUgb2YgdGhhdCBpbmNsdWRlXG5wcml2LmluamVjdFNjcmlwdHMgPSBmdW5jdGlvbihmbikge1xuICBpZiAoIXByaXYuc2NyaXB0SW5jbHVkZSkge1xuICAgIC8vIHdlIG9ubHkgd2FudCB0byBkbyB0aGlzIG9uY2UsIGFuZCB0aGlzIGlzIHRoZSBiZXN0XG4gICAgLy8gdGltZSB0byBkbyB0aGlzIG9uY2UsIHRoaXMgYWxzbyBrZWVwcyBhbGwgb2YgdGhlXG4gICAgLy8gY29uZGl0aW9uYWwgc3R1ZmYgdG8gYSBzaW5nbGUgZW50cnksIHNvIGl0IHdvcmtzXG4gICAgd2luZG93WydvbllvdVR1YmVJZnJhbWVBUElSZWFkeSddID0gcHJpdi5leHRlcm5hbEFwaVJlYWR5O1xuXG4gICAgdmFyIHBsYWNlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXTtcbiAgICBwcml2LnNjcmlwdEluY2x1ZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICBcbiAgICAvLyBpZiBmbiwgbGV0cyB0cmVhdCBhc3luYywgb3RoZXJ3aXNlIHdlJ2xsIGJlIGJsb2NraW5nXG4gICAgaWYgKHR5cGVvZiBmbiA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdhc3luYycsIHRydWUpO1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmbiwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ3NyYycsICcvL3d3dy55b3V0dWJlLmNvbS9pZnJhbWVfYXBpJyk7XG4gICAgcGxhY2VtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHByaXYuc2NyaXB0SW5jbHVkZSwgcGxhY2VtZW50KTtcbiAgfVxufTtcblxuLy8gd2Ugd2FudCB0byBzdGFuZGFyZGl6ZSBob3cgd2UgaGFuZGxlIGV2ZW50cywgdGhpcyBpcyB0aGVcbi8vIGZuIHRoYXQgaGFuZGxlcyBzdWNoIHRoaW5nc1xucHJpdi5wcm9jZXNzRXZlbnRzID0gZnVuY3Rpb24oa2V5LCBpZCwgc3RhdGUsIGUpIHtcbiAgdmFyIGV2ZW50cyA9IHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSxcbiAgICAgIHBsYXllciA9IHByaXYudmlkZW9zW2lkXS5wbGF5ZXI7XG4gIHZhciBldmVudFN0YXRlID0ge1xuICAgIGN1cnJlbnRUaW1lOiBNYXRoLmZsb29yKHBsYXllci5nZXRDdXJyZW50VGltZSgpKSwgXG4gICAgZHVyYXRpb246IE1hdGguZmxvb3IocGxheWVyLmdldER1cmF0aW9uKCkpLFxuICAgIGV2ZW50OiBrZXksXG4gICAgaWQ6IGlkLFxuICAgIHRpdGxlOiBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSxcbiAgICBzdGF0ZTogc3RhdGUsXG4gICAgbXV0ZWQ6IHBsYXllci5pc011dGVkKCksXG4gICAgbXM6IG5ldyBEYXRlKCkuZ2V0VGltZSgpXG4gIH07XG4gIC8vIGlmIHdlIGdldCBhdCBvdXIgdmlkZW9zIGV4dGVybmFsbHksIHdlIHdpbGwgbGlrZWx5XG4gIC8vIHdhbnQgdG8ga25vdyB3aGF0ZXZlciB0aGUgc3RhdGUgb2YgdGhlIGN1cnJlbnQgdmlkZW9cbiAgLy8gaXMgaW5cbiAgcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAvLyB0aXRsZSB3aWxsIGZhbGxiYWNrIHRvIHRoZSBpZCwgc28gd2UgY2FuIGRldGVjdCB3aGVuXG4gIC8vIHdlIGNhbiBjYWxsIG9uIHRoZSB5b3V0dWJlIGFwaSB0byBnZXQgdGhlIHZpZGVvIHRpdGxlXG4gIC8vIHRoaXMgd2lsbCBhbGxvdyB1cyB0byBoYXZlIGh1bWFuIHJlYWRhYmxlIHRpdGxlcywgXG4gIC8vIHdpdGhvdXQgdGhlIG92ZXJoZWFkXG4gIGlmIChwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9PSBpZCkge1xuICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gYWNjZXB0IGFueSB1bmRlZmluZWQgdmlkZW8gdGl0bGVzLFxuICAgIC8vIHNvIHdlJ2xsIGdyYWNlZnVsbHkgZmFsbGJhY2sgdG8gb3VyIGlkLCB0aGlzIHJlYWxseVxuICAgIC8vIG9ubHkgaGFwcGVucyB3aGVuIHdlIGFyZSBpbiBhIHZpZGVvIGVycm9yIHN0YXRlXG4gICAgcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPSBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgPyBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgOiBpZDtcbiAgfVxuICBpZiAocHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldKSB7XG4gICAgZm9yKHZhciBpPTA7aTxldmVudHMubGVuZ3RoOysraSkge1xuICAgICAgZXZlbnRzW2ldKGUsIGV2ZW50U3RhdGUpO1xuICAgIH1cbiAgfVxuICBtb24ubG9nKGV2ZW50U3RhdGUpO1xufTtcblxuLy8gc2V0cyB1cCBvdXIgZG9tIG9iamVjdCwgc28gd2UgaGF2ZSBhIHN0cmljdCBzY2hlbWEgdG8gXG4vLyBhZGhlcmUgdG8gbGF0ZXIgb24gaW4gdGhlIGFwaSBcbnByaXYucmVmZXJlbmNlT2JqZWN0ID0gZnVuY3Rpb24oZWwpIHtcbiAgdmFyIG9wdHMgPSB7fSwgYXR0cnMgPSBhdHRyKGVsKTtcbiAgb3B0cy52aWRlb0lkID0gYXR0cnMoJ2RhdGEteXQtYW5hbHl0aWNzJyk7XG4gIGlmIChhdHRycygnZGF0YS15dC10cmFja2VkJykgPT0gbnVsbCkge1xuICAgIGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnLCB0cnVlKTtcblxuICAgIC8vIGdldCBvcHRzIGZyb20gZGF0YSBhdHRyc1xuICAgIG9wdHMud2lkdGggPSBhdHRycygnZGF0YS15dC13aWR0aCcpID8gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA6IDY0MDtcbiAgICBvcHRzLmhlaWdodCA9IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpID8gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgOiAzOTA7XG4gICAgb3B0cy5wbGF5ZXJWYXJzID0gYXR0cnMoJ2RhdGEteXQtdmFycycpID8gc2FmZVBhcnNlKGF0dHJzKCdkYXRhLXl0LXZhcnMnKSkgOiBudWxsO1xuICAgIG9wdHMudGl0bGUgPSBhdHRycygnZGF0YS15dC10aXRsZScpID8gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA6IG9wdHMudmlkZW9JZDtcbiAgICBcbiAgICAvLyBzZXR1cCBiYXNlIGV2ZW50c1xuICAgIG9wdHMuZXZlbnRzID0gcHJpdi5zZXR1cEV2ZW50cygpO1xuICAgIFxuICAgIC8vIGJ1aWxkIHZpZGVvIG9iamVjdCB0byBzdG9yZVxuICAgIHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0gPSB7IG9wdHM6IG9wdHMsIGVsOiBlbCwgZXZlbnRzOiB7fSB9O1xuICAgIHByaXYucXVldWUucHVzaChwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdKTtcbiAgfVxufTtcblxuLy8gc2V0dXAgdmlkZW9zIGV2ZW50cywgYWxsIGFyZSBhdmFpbGFibGUgcHVibGljYWxseSwgbW9yZSBpbmZvIGNhbiBiZSBcbi8vIGZvdW5kIGF0IGRldmVsb3BlcnMuZ29vZ2xlLmNvbS95b3V0dWJlL2lmcmFtZV9hcGlfcmVmZXJlbmNlI0V2ZW50c1xucHJpdi5zZXR1cEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZXZlbnRzID0ge307XG4gIGV2ZW50cy5vblJlYWR5ID0gcHJpdi5ldmVudHMucmVhZHk7XG4gIGV2ZW50cy5vblN0YXRlQ2hhbmdlID0gcHJpdi5ldmVudHMuc3RhdGVDaGFuZ2U7XG4gIGV2ZW50cy5vbkVycm9yID0gcHJpdi5ldmVudHMuZXJyb3I7XG4gIGV2ZW50cy5vblBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IHByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZTtcbiAgZXZlbnRzLm9uUGxheWJhY2tSYXRlQ2hhbmdlID0gcHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlO1xuICBldmVudHMub25BcGlDaGFuZ2UgPSBwcml2LmV2ZW50cy5hcGlDaGFuZ2U7XG4gIHJldHVybiBldmVudHM7XG59O1xuXG4vLyB0aGUgaWZyYW1lX2FwaSBhbGxvd3MgdXMgdG8gYXR0YWNoIGRvbSBzdHlsZSBldmVudHMgdG9cbi8vIHZpZGVvcywgd2UgYWx3YXlzIGZpcmUgdGhlc2UgaW50ZXJuYWxseSwgYnV0IHRoZW4gd2UgXG4vLyBhbHNvIGFsbG93IHlvdSB0byBhdHRhY2ggZXZlbnRzIHRvIGEgdmlkZW8sIGJ5IGl0cyBpZFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vXG5cbnByaXYuZXZlbnRzLmFwaUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdhcGlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdhcGlDaGFuZ2UnLCBlKTtcbn07XG5cbi8vIGFjY29yZGluZyB0byB5b3V0dWJlIGRvY3MgdGhlc2Ugc3RhdHVzIGNvZGVzXG4vLyByZXByZXNlbnQgdGhlIHN0YXRlIHN0cmluZyB0aGF0IGlzIGluZGljYXRpdmVcbi8vIG9mIHRoZSBlcnJvclxucHJpdi5ldmVudHMuZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICdpbnZhbGlkIHZpZGVvSWQnO1xuICBpZiAoZS5kYXRhID09IDIgfHwgZS5kYXRhID09IDEwMCkge1xuICAgIC8vIGJhc2ljYWxseSBub3RoaW5nLCBhcyB0aGVzZSBhcmUgZGVmYXVsdHNcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gNSkge1xuICAgIHN0YXRlID0gJ2h0bWw1IHBsYXllciBlcnJvcic7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDEwMSB8fCBlLmRhdGEgPT0gMTUwKSB7XG4gICAgc3RhdGUgPSAnZW1iZWRkaW5nIGZvcmJpZGRlbic7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdlcnJvcicsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucmVhZHkgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncmVhZHknLCBlLnRhcmdldC5faWQsICdyZWFkeScsIGUpO1xufTtcblxuLy8gd2UgdHJhbnNmb3JtIHRoZSBjdXJyZW50IHN0YXRlIGBpZGAgdG8gYSBodW1hbiByZWFkYWJsZVxuLy8gc3RyaW5nIGJhc2VkIG9uIHRoZSB5b3V0dWJlIGFwaSBkb2NzXG5wcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ3Vuc3RhcnRlZCc7XG4gIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkJVRkZFUklORykge1xuICAgIHN0YXRlID0gJ2J1ZmZlcmluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5DVUVEKSB7XG4gICAgc3RhdGUgPSAnY3VlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5FTkRFRCkge1xuICAgIHN0YXRlID0gJ2VuZGVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBBVVNFRCkge1xuICAgIHN0YXRlID0gJ3BhdXNlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QTEFZSU5HKSB7XG4gICAgc3RhdGUgPSAncGxheWluZyc7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdzdGF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxuLy8gcHVibGljIG9uIGV2ZW50LCBzbyB5b3UgY2FuIGV4dGVybmFsbHkgYXR0YWNoIHRvIHZpZGVvc1xudmlkZW9BbmFseXRpY3Mub24gPSBmdW5jdGlvbihldmVudCwgaWQsIGZuKSB7XG4gIHZhciBwcm9jZXNzb3IgPSBmdW5jdGlvbihuZXh0KSB7XG4gICAgaWYgKHByaXYudmlkZW9zW25leHRdKSB7XG4gICAgICBpZiAoIShwcml2LnZpZGVvc1tuZXh0XS5ldmVudHNbZXZlbnRdIGluc3RhbmNlb2YgQXJyYXkpKSBwcml2LnZpZGVvc1tuZXh0XS5ldmVudHNbZXZlbnRdID0gW107XG4gICAgICBwcml2LnZpZGVvc1tuZXh0XS5ldmVudHNbZXZlbnRdLnB1c2goZm4pO1xuICAgIH1cbiAgfTtcbiAgLy8gYWNjZXB0cyBgKmAgYXMgYW4gaWRlbnRpZmllciBvZiBhIFwiZ2xvYmFsXCJcbiAgLy8gZXZlbnQgdGhhdCBzaG91bGQgYmUgYXR0YWNoZWQgdG8gYWxsIHZpZGVvc1xuICBpZiAoaWQgPT09ICcqJykge1xuICAgIE9iamVjdC5rZXlzKHByaXYudmlkZW9zKS5mb3JFYWNoKHByb2Nlc3Nvcik7XG4gIH0gZWxzZSB7XG4gICAgcHJvY2Vzc29yKGlkKTtcbiAgfVxuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBwdWJsaWMgdHJhY2tpbmcgZXZlbnQsIHNvIHlvdSBhdHRhY2ggdmlkZW9zIGFmdGVyIGRvbVxuLy8gbG9hZCwgb3Igd2l0aCBzb21lIGxhdGVudC9hc3luYyByZXF1ZXN0c1xudmlkZW9BbmFseXRpY3MudHJhY2sgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkge1xuICAgIHByaXYuaW5qZWN0U2NyaXB0cygpO1xuICAgIHByaXYuYXR0YWNoVmlkZW9zKCk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gZGVidWcgbW9kZSwgYWxsb3dzIHlvdSB0byBjYXB0dXJlIGRlYnVnIGRhdGEgc2ltcGx5XG52aWRlb0FuYWx5dGljcy5zZXREZWJ1ZyA9IGZ1bmN0aW9uKGJvb2wpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS15dC1kZWJ1Z10nKTtcbiAgYm9vbCA9IHR5cGVvZiBib29sICE9ICd1bmRlZmluZWQnID8gYm9vbCA6IG51bGw7XG4gIGlmIChlbGVtKSB7XG4gICAgdmFyIGF0dHJzID0gYXR0cihlbGVtKTtcbiAgICB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGF0dHJzKCdkYXRhLXl0LWRlYnVnJykgPT0gJ3RydWUnO1xuICB9XG4gIGlmIChib29sICE9PSBudWxsKSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGJvb2w7XG4gIG1vbi5kZWJ1ZyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnO1xuICB2aWRlb0FuYWx5dGljcy5sb2dzID0gdmlkZW9BbmFseXRpY3MuZGVidWcgPyBtb24uaGlzdG9yeSA6IFtdO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyB3ZSB3YW50IHRvIGhhdmUgZXh0ZXJuYWwgYWNjZXNzIHRvIHRoZSB2aWRlb3Mgd2UncmVcbi8vIHRyYWNraW5nIGZvciBpbnRlcmFjdGlvbiB3aXRoIG90aGVyIGFwaXNcbnZpZGVvQW5hbHl0aWNzLnZpZGVvcyA9IHByaXYudmlkZW9zO1xuICBcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBwcml2LmluaXQsIGZhbHNlKTtcblxubW9kdWxlLmV4cG9ydHMgPSB2aWRlb0FuYWx5dGljczsiLCJ2YXIgYXR0ciA9IGZ1bmN0aW9uKGVsZW0pIHtcbiAgaWYgKHR5cGVvZiBlbGVtICE9ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICRhdHRyKGtleSwgdmFsKSB7XG4gICAgICBpZih0eXBlb2YgdmFsID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBlbGVtLmdldEF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIGlmICh2YWwgPT0gJ3JtJykge1xuICAgICAgICByZXR1cm4gZWxlbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBlbGVtLnNldEF0dHJpYnV0ZShrZXksIHZhbCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG52YXIgc2FmZVBhcnNlID0gZnVuY3Rpb24oc3RyKSB7XG4gIHZhciBvdXRwdXQgPSBudWxsO1xuICB0cnkge1xuICAgIG91dHB1dCA9IEpTT04ucGFyc2Uoc3RyKTtcbiAgfSBjYXRjaCAoZXgpIHt9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG52YXIgbW9uID0gZnVuY3Rpb24oZGVidWcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIG1vbikpIHJldHVybiBuZXcgbW9uKGRlYnVnKTtcbiAgdGhpcy5kZWJ1ZyA9IGRlYnVnO1xuICB0aGlzLmhpc3RvcnkgPSBbXTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb24ucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3AgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmhpc3RvcnkucHVzaChjcCk7XG4gIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgaWYodHlwZW9mIHdpbmRvd1snY29uc29sZSddICE9ICd1bmRlZmluZWQnICYmIGNvbnNvbGUubG9nKSB7XG4gICAgICBpZiAoY3AubGVuZ3RoID09PSAxICYmIHR5cGVvZiBjcFswXSA9PSAnb2JqZWN0JykgY3AgPSBKU09OLnN0cmluZ2lmeShjcFswXSxudWxsLDIpO1xuICAgICAgY29uc29sZS5sb2coY3ApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICBtb246IG1vbixcbiAgc2FmZVBhcnNlOiBzYWZlUGFyc2Vcbn07IiwidmFyIE1vbiA9IGZ1bmN0aW9uKGRlYnVnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBNb24pKSByZXR1cm4gbmV3IE1vbihkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxuTW9uLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNwID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgdGhpcy5oaXN0b3J5LnB1c2goY3ApO1xuICBpZiAodGhpcy5kZWJ1Zykge1xuICAgIGlmKHR5cGVvZiB3aW5kb3dbJ2NvbnNvbGUnXSAhPSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLmxvZykge1xuICAgICAgaWYgKGNwLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY3BbMF0gPT0gJ29iamVjdCcpIGNwID0gSlNPTi5zdHJpbmdpZnkoY3BbMF0sbnVsbCwyKTtcbiAgICAgIGNvbnNvbGUubG9nKGNwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vbjsiXX0=
(1)
});
