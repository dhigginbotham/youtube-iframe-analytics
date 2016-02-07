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
// this fn can be recursive, so you know, be smart with this
// try to avoid extremely large arrays, or doing async stuff
// inside of your events without the proper safety materials
videoAnalytics.on = function(events, id, fn) {
  var recurse = false, event = events;
  if (events instanceof Array) {
    recurse = events.length ? true : false;
    event = events.shift();
  }
  // accepts `*` wildcards as allowing attaching
  // a specific event to all videos
  if (id === '*') {
    var vids = Object.keys(priv.videos);
    for(var i=0;i<vids.length;++i) {
      priv.attachEvents(vids[i],event,fn);
    }
  } else {
    priv.attachEvents(id,event,fn);
  }
  if (recurse) return videoAnalytics.on(events,id,fn);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV9iMzNhYWUzZi5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBtb24gPSByZXF1aXJlKCcuL21vbicpKGZhbHNlKTtcbnZhciBhdHRyID0gaGVscGVycy5hdHRyLCBzYWZlUGFyc2UgPSBoZWxwZXJzLnNhZmVQYXJzZTtcblxuLy8gYXBpIG9iamVjdHNcbnZhciB2aWRlb0FuYWx5dGljcyA9IHt9LCBwcml2ID0ge307XG5cbi8vIHdlIHdhbnQgdG8ga2VlcCBjb250ZXh0IG9mIG91ciBkb20sIHNvIHdlIGNhbiBlYXNpbHkgcmVmXG4vLyB0aGUgbm9kZXMgbGF0ZXIgb25cbnByaXYudmlkZW9zID0ge307XG5cbi8vIGVhY2ggZG9tIG5vZGUgd2lsbCBoYXZlIGV2ZW50cyBhdHRhY2hlZCBzbyB3ZSBjYW4gZWFzaWx5XG4vLyBpbnRlcmFjdCB3aXRoIHRoZW0sIHdlJ2xsIGRvIHNvbWUgZGF0YS1iaW5kaW5nIHRvIGNvbGxlY3Rcbi8vIG91ciBub2Rlc1xucHJpdi5ldmVudHMgPSB7fTtcbiAgXG4vLyB2aWRlb3MgcXVldWUsIGJlY2F1c2Ugd2UgbG9hZCBhIDNyZCBwYXJ0eSBhc3NldCB3ZSB3YW50XG4vLyB0byBtaXRpZ2F0ZSByYWNlIGNvbmRpdGlvbnMgb2YgWVQgbm90IGJlaW5nIHJlYWR5LCBzb1xuLy8gd2Uga2VlcCBhbGwgdW50cmFja2VkIHZpZGVvcyBpbiB0aGlzIHF1ZXVlIGFuZCBzaGlmdCBcbi8vIHRoZW0gb3V0IGFzIHdlIGdldCB0byB0aGVtXG5wcml2LnF1ZXVlID0gW107XG5cbi8vIGtlZXAgdHJhY2sgb2YgeW91dHViZSBjYWxsaW5nIG91ciBmblxucHJpdi5sb2FkZWQgPSBmYWxzZTtcblxuLy8gaW5pdCBmbiB0aGF0IGhhcHBlbnMgb24gRE9NQ29udGVudExvYWRlZFxucHJpdi5pbml0ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHByaXYuaW5qZWN0U2NyaXB0cygpO1xufTtcblxuLy8gYXR0YWNoZXMgZXZlbnRzIHRvIHZpZGVvcyBzbyB0aGV5IGNhbiBiZSBwcm9jZXNzZWQgYnkgXG4vLyB0aGUgLm9uKCkgZm5cbnByaXYuYXR0YWNoRXZlbnRzID0gZnVuY3Rpb24oaWQsIGV2ZW50LCBmbikge1xuICBpZiAocHJpdi52aWRlb3NbaWRdKSB7XG4gICAgaWYgKCEocHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0gaW5zdGFuY2VvZiBBcnJheSkpIHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdID0gW107XG4gICAgcHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0ucHVzaChmbik7XG4gIH1cbn07XG5cbi8vIHRoZSB3YXkgdGhlIGlmcmFtZV9hcGkgd29ya3MgaXMgYnkgcmVwbGFjaW5nIGFuIGVsZW1lbnRcbi8vIHdpdGggYW4gaWZyYW1lLCBzbyB3ZSdsbCB3YW50IHRvIGF0dGFjaCB0aGUgdmlkZW8gYXMgXG4vLyBuZWVkZWRcbnByaXYuYXR0YWNoVmlkZW9zID0gZnVuY3Rpb24ocXVldWUpIHtcbiAgaWYgKHByaXYubG9hZGVkKSB7XG4gICAgdmFyIG5leHQ7XG4gICAgd2hpbGUobmV4dCA9IHF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgIG5leHQucGxheWVyID0gbmV3IFlULlBsYXllcihuZXh0LmVsLCBuZXh0Lm9wdHMpO1xuICAgICAgbmV4dC5wbGF5ZXIuX2lkID0gbmV4dC5vcHRzLnZpZGVvSWQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyB3ZSdsbCBydW4gdGhpcyBvbiBpbml0LCBvciBvbiBkZW1hbmQgZm9yIGxhdGVudCBsb2FkZWRcbi8vIGh0bWwgZnJhZ21lbnRzXG5wcml2LmNvbGxlY3REb20gPSBmdW5jdGlvbihmbikge1xuICAvLyB3ZSB3YW50IHRvIHNldCBkZWJ1ZyBzdGF0ZSBmYWlybHkgZWFybHksIHNvIHdlJ2xsIGRvXG4gIC8vIGl0IGJlZm9yZSB3ZSBhY3R1YWxseSBxdWVyeSBmb3IgYW55IHZpZGVvcyB0byBzZXR1cFxuICB2aWRlb0FuYWx5dGljcy5zZXREZWJ1ZygpO1xuICB2YXIgZG9tID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEteXQtYW5hbHl0aWNzXScpO1xuICBmb3IodmFyIGk9MDtpPGRvbS5sZW5ndGg7KytpKSB7XG4gICAgcHJpdi5yZWZlcmVuY2VPYmplY3QoZG9tW2ldKTtcbiAgfVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBnZXRzIGZpcmVkIHdoZW4geW91dHViZSBqcyBpcyBpbml0aWFsaXplZFxuLy8gYWxzbywgdGhpcyBzYWZlbHkgYWxsb3dzIHVzIHRvIGV4dGVybmFsbHkgdXNlIC50cmFja1xuLy8gd2l0aG91dCByYWNlIGNvbmRpdGlvbnNcbnByaXYuZXh0ZXJuYWxBcGlSZWFkeSA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmxvYWRlZCA9IHRydWU7XG4gIHByaXYuYXR0YWNoVmlkZW9zKHByaXYucXVldWUpO1xufTtcblxuLy8gd2UgaW5jbHVkZSB5b3V0dWJlcyBqcyBzY3JpcHQgYXN5bmMsIGFuZCB3ZSdsbCBuZWVkIHRvIFxuLy8ga2VlcCB0cmFjayBvZiB0aGUgc3RhdGUgb2YgdGhhdCBpbmNsdWRlXG5wcml2LmluamVjdFNjcmlwdHMgPSBmdW5jdGlvbihmbikge1xuICBpZiAoIXByaXYuc2NyaXB0SW5jbHVkZSkge1xuICAgIC8vIHdlIG9ubHkgd2FudCB0byBkbyB0aGlzIG9uY2UsIGFuZCB0aGlzIGlzIHRoZSBiZXN0XG4gICAgLy8gdGltZSB0byBkbyB0aGlzIG9uY2UsIHRoaXMgYWxzbyBrZWVwcyBhbGwgb2YgdGhlXG4gICAgLy8gY29uZGl0aW9uYWwgc3R1ZmYgdG8gYSBzaW5nbGUgZW50cnksIHNvIGl0IHdvcmtzXG4gICAgd2luZG93WydvbllvdVR1YmVJZnJhbWVBUElSZWFkeSddID0gcHJpdi5leHRlcm5hbEFwaVJlYWR5O1xuXG4gICAgdmFyIHBsYWNlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXTtcbiAgICBwcml2LnNjcmlwdEluY2x1ZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICBcbiAgICAvLyBpZiBmbiwgbGV0cyB0cmVhdCBhc3luYywgb3RoZXJ3aXNlIHdlJ2xsIGJlIGJsb2NraW5nXG4gICAgaWYgKHR5cGVvZiBmbiA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdhc3luYycsIHRydWUpO1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmbiwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ3NyYycsICcvL3d3dy55b3V0dWJlLmNvbS9pZnJhbWVfYXBpJyk7XG4gICAgcGxhY2VtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHByaXYuc2NyaXB0SW5jbHVkZSwgcGxhY2VtZW50KTtcbiAgfVxufTtcblxuLy8gd2Ugd2FudCB0byBzdGFuZGFyZGl6ZSBob3cgd2UgaGFuZGxlIGV2ZW50cywgdGhpcyBpcyB0aGVcbi8vIGZuIHRoYXQgaGFuZGxlcyBzdWNoIHRoaW5nc1xucHJpdi5wcm9jZXNzRXZlbnRzID0gZnVuY3Rpb24oa2V5LCBpZCwgc3RhdGUsIGUpIHtcbiAgdmFyIGV2ZW50cyA9IHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSxcbiAgICAgIHBsYXllciA9IHByaXYudmlkZW9zW2lkXS5wbGF5ZXI7XG4gIC8vIGlmIHdlIGdldCBhdCBvdXIgdmlkZW9zIGV4dGVybmFsbHksIHdlIHdpbGwgbGlrZWx5XG4gIC8vIHdhbnQgdG8ga25vdyB3aGF0ZXZlciB0aGUgc3RhdGUgb2YgdGhlIGN1cnJlbnQgdmlkZW9cbiAgLy8gaXMgaW5cbiAgcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAvLyB0aXRsZSB3aWxsIGZhbGxiYWNrIHRvIHRoZSBpZCwgc28gd2UgY2FuIGRldGVjdCB3aGVuXG4gIC8vIHdlIGNhbiBjYWxsIG9uIHRoZSB5b3V0dWJlIGFwaSB0byBnZXQgdGhlIHZpZGVvIHRpdGxlXG4gIC8vIHRoaXMgd2lsbCBhbGxvdyB1cyB0byBoYXZlIGh1bWFuIHJlYWRhYmxlIHRpdGxlc1xuICBpZiAocHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPT0gaWQpIHtcbiAgICAvLyB3ZSBkb24ndCB3YW50IHRvIGFjY2VwdCBhbnkgdW5kZWZpbmVkIHZpZGVvIHRpdGxlcyxcbiAgICAvLyBzbyB3ZSdsbCBncmFjZWZ1bGx5IGZhbGxiYWNrIHRvIG91ciBpZCwgdGhpcyByZWFsbHlcbiAgICAvLyBvbmx5IGhhcHBlbnMgd2hlbiB3ZSBhcmUgaW4gYSB2aWRlbyBlcnJvciBzdGF0ZXNcbiAgICBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA/IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA6IGlkO1xuICB9XG4gIC8vIFlvdVR1YmUgcmVjb3JkcyB2aWRlbyB0aW1lcyBhcyBhIGZsb2F0LCBpIGFtXG4gIC8vIGFzc3VtaW5nIHdlIHdvbid0IG5lZWQvd2FudCB0byBoYXZlIHN1Y2ggcHJlY2lzaW9uXG4gIC8vIGhlcmUgd2l0aCB0aGUgTWF0aC5mbG9vcigpIGNhbGxzXG4gIHZhciBldmVudFN0YXRlID0ge1xuICAgIGN1cnJlbnRUaW1lOiBNYXRoLmZsb29yKHBsYXllci5nZXRDdXJyZW50VGltZSgpKSwgXG4gICAgZHVyYXRpb246IE1hdGguZmxvb3IocGxheWVyLmdldER1cmF0aW9uKCkpLFxuICAgIGV2ZW50OiBrZXksXG4gICAgaWQ6IGlkLFxuICAgIHRpdGxlOiBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSxcbiAgICBzdGF0ZTogcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSxcbiAgICBtdXRlZDogcGxheWVyLmlzTXV0ZWQoKSxcbiAgICBtczogbmV3IERhdGUoKS5nZXRUaW1lKClcbiAgfTtcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSkge1xuICAgIGZvcih2YXIgaT0wO2k8ZXZlbnRzLmxlbmd0aDsrK2kpIHtcbiAgICAgIGV2ZW50c1tpXShlLCBldmVudFN0YXRlKTtcbiAgICB9XG4gIH1cbiAgbW9uLmxvZyhldmVudFN0YXRlKTtcbn07XG5cbi8vIHNldHMgdXAgb3VyIGRvbSBvYmplY3QsIHNvIHdlIGhhdmUgYSBzdHJpY3Qgc2NoZW1hIHRvIFxuLy8gYWRoZXJlIHRvIGxhdGVyIG9uIGluIHRoZSBhcGkgXG5wcml2LnJlZmVyZW5jZU9iamVjdCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBvcHRzID0ge30sIGF0dHJzID0gYXR0cihlbCk7XG4gIG9wdHMudmlkZW9JZCA9IGF0dHJzKCdkYXRhLXl0LWFuYWx5dGljcycpO1xuICBpZiAoYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcpID09IG51bGwpIHtcbiAgICBhdHRycygnZGF0YS15dC10cmFja2VkJywgdHJ1ZSk7XG5cbiAgICAvLyBnZXQgb3B0cyBmcm9tIGRhdGEgYXR0cnNcbiAgICBvcHRzLndpZHRoID0gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA/IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgOiA2NDA7XG4gICAgb3B0cy5oZWlnaHQgPSBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA/IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpIDogMzkwO1xuICAgIG9wdHMucGxheWVyVmFycyA9IGF0dHJzKCdkYXRhLXl0LXZhcnMnKSA/IHNhZmVQYXJzZShhdHRycygnZGF0YS15dC12YXJzJykpIDogbnVsbDtcbiAgICBvcHRzLnRpdGxlID0gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA/IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgOiBvcHRzLnZpZGVvSWQ7XG4gICAgXG4gICAgLy8gc2V0dXAgYmFzZSBldmVudHNcbiAgICBvcHRzLmV2ZW50cyA9IHByaXYuc2V0dXBFdmVudHMoKTtcbiAgICBcbiAgICAvLyBidWlsZCB2aWRlbyBvYmplY3QgdG8gc3RvcmVcbiAgICBwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdID0geyBvcHRzOiBvcHRzLCBlbDogZWwsIGV2ZW50czoge30gfTtcbiAgICBwcml2LnF1ZXVlLnB1c2gocHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSk7XG4gIH1cbn07XG5cbi8vIHNldHVwIHZpZGVvcyBldmVudHMsIGFsbCBhcmUgYXZhaWxhYmxlIHB1YmxpY2FsbHksIG1vcmUgaW5mbyBjYW4gYmUgXG4vLyBmb3VuZCBhdCBkZXZlbG9wZXJzLmdvb2dsZS5jb20veW91dHViZS9pZnJhbWVfYXBpX3JlZmVyZW5jZSNFdmVudHNcbnByaXYuc2V0dXBFdmVudHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGV2ZW50cyA9IHt9O1xuICBldmVudHMub25SZWFkeSA9IHByaXYuZXZlbnRzLnJlYWR5O1xuICBldmVudHMub25TdGF0ZUNoYW5nZSA9IHByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlO1xuICBldmVudHMub25FcnJvciA9IHByaXYuZXZlbnRzLmVycm9yO1xuICBldmVudHMub25QbGF5YmFja1F1YWxpdHlDaGFuZ2UgPSBwcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2U7XG4gIGV2ZW50cy5vblBsYXliYWNrUmF0ZUNoYW5nZSA9IHByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZTtcbiAgZXZlbnRzLm9uQXBpQ2hhbmdlID0gcHJpdi5ldmVudHMuYXBpQ2hhbmdlO1xuICByZXR1cm4gZXZlbnRzO1xufTtcblxuLy8gdGhlIGlmcmFtZV9hcGkgYWxsb3dzIHVzIHRvIGF0dGFjaCBkb20gc3R5bGUgZXZlbnRzIHRvXG4vLyB2aWRlb3MsIHdlIGFsd2F5cyBmaXJlIHRoZXNlIGludGVybmFsbHksIGJ1dCB0aGVuIHdlIFxuLy8gYWxzbyBhbGxvdyB5b3UgdG8gYXR0YWNoIGV2ZW50cyB0byBhIHZpZGVvLCBieSBpdHMgaWRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuXG5wcml2LmV2ZW50cy5hcGlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnYXBpQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAnYXBpQ2hhbmdlJywgZSk7XG59O1xuXG4vLyBhY2NvcmRpbmcgdG8geW91dHViZSBkb2NzIHRoZXNlIHN0YXR1cyBjb2Rlc1xuLy8gcmVwcmVzZW50IHRoZSBzdGF0ZSBzdHJpbmcgdGhhdCBpcyBpbmRpY2F0aXZlXG4vLyBvZiB0aGUgZXJyb3JcbnByaXYuZXZlbnRzLmVycm9yID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAnaW52YWxpZCB2aWRlb0lkJztcbiAgaWYgKGUuZGF0YSA9PSAyIHx8IGUuZGF0YSA9PSAxMDApIHtcbiAgICAvLyBiYXNpY2FsbHkgbm90aGluZywgYXMgdGhlc2UgYXJlIGRlZmF1bHRzXG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDUpIHtcbiAgICBzdGF0ZSA9ICdodG1sNSBwbGF5ZXIgZXJyb3InO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSAxMDEgfHwgZS5kYXRhID09IDE1MCkge1xuICAgIHN0YXRlID0gJ2VtYmVkZGluZyBmb3JiaWRkZW4nO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnZXJyb3InLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnJlYWR5ID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3JlYWR5JywgZS50YXJnZXQuX2lkLCAncmVhZHknLCBlKTtcbn07XG5cbi8vIHdlIHRyYW5zZm9ybSB0aGUgY3VycmVudCBzdGF0ZSBgaWRgIHRvIGEgaHVtYW4gcmVhZGFibGVcbi8vIHN0cmluZyBiYXNlZCBvbiB0aGUgeW91dHViZSBhcGkgZG9jc1xucHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICd1bnN0YXJ0ZWQnO1xuICBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5CVUZGRVJJTkcpIHtcbiAgICBzdGF0ZSA9ICdidWZmZXJpbmcnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQ1VFRCkge1xuICAgIHN0YXRlID0gJ2N1ZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuRU5ERUQpIHtcbiAgICBzdGF0ZSA9ICdlbmRlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QQVVTRUQpIHtcbiAgICBzdGF0ZSA9ICdwYXVzZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUExBWUlORykge1xuICAgIHN0YXRlID0gJ3BsYXlpbmcnO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnc3RhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbi8vIHB1YmxpYyBvbiBldmVudCwgc28geW91IGNhbiBleHRlcm5hbGx5IGF0dGFjaCB0byB2aWRlb3Ncbi8vIHRoaXMgZm4gY2FuIGJlIHJlY3Vyc2l2ZSwgc28geW91IGtub3csIGJlIHNtYXJ0IHdpdGggdGhpc1xuLy8gdHJ5IHRvIGF2b2lkIGV4dHJlbWVseSBsYXJnZSBhcnJheXMsIG9yIGRvaW5nIGFzeW5jIHN0dWZmXG4vLyBpbnNpZGUgb2YgeW91ciBldmVudHMgd2l0aG91dCB0aGUgcHJvcGVyIHNhZmV0eSBtYXRlcmlhbHNcbnZpZGVvQW5hbHl0aWNzLm9uID0gZnVuY3Rpb24oZXZlbnRzLCBpZCwgZm4pIHtcbiAgdmFyIHJlY3Vyc2UgPSBmYWxzZSwgZXZlbnQgPSBldmVudHM7XG4gIGlmIChldmVudHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJlY3Vyc2UgPSBldmVudHMubGVuZ3RoID8gdHJ1ZSA6IGZhbHNlO1xuICAgIGV2ZW50ID0gZXZlbnRzLnNoaWZ0KCk7XG4gIH1cbiAgLy8gYWNjZXB0cyBgKmAgd2lsZGNhcmRzIGFzIGFsbG93aW5nIGF0dGFjaGluZ1xuICAvLyBhIHNwZWNpZmljIGV2ZW50IHRvIGFsbCB2aWRlb3NcbiAgaWYgKGlkID09PSAnKicpIHtcbiAgICB2YXIgdmlkcyA9IE9iamVjdC5rZXlzKHByaXYudmlkZW9zKTtcbiAgICBmb3IodmFyIGk9MDtpPHZpZHMubGVuZ3RoOysraSkge1xuICAgICAgcHJpdi5hdHRhY2hFdmVudHModmlkc1tpXSxldmVudCxmbik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHByaXYuYXR0YWNoRXZlbnRzKGlkLGV2ZW50LGZuKTtcbiAgfVxuICBpZiAocmVjdXJzZSkgcmV0dXJuIHZpZGVvQW5hbHl0aWNzLm9uKGV2ZW50cyxpZCxmbik7XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHB1YmxpYyB0cmFja2luZyBldmVudCwgc28geW91IGF0dGFjaCB2aWRlb3MgYWZ0ZXIgZG9tXG4vLyBsb2FkLCBvciB3aXRoIHNvbWUgbGF0ZW50L2FzeW5jIHJlcXVlc3RzXG52aWRlb0FuYWx5dGljcy50cmFjayA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSB7XG4gICAgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG4gICAgcHJpdi5hdHRhY2hWaWRlb3MocHJpdi5xdWV1ZSk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gZGVidWcgbW9kZSwgYWxsb3dzIHlvdSB0byBjYXB0dXJlIGRlYnVnIGRhdGEgc2ltcGx5XG52aWRlb0FuYWx5dGljcy5zZXREZWJ1ZyA9IGZ1bmN0aW9uKGJvb2wpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS15dC1kZWJ1Z10nKTtcbiAgYm9vbCA9IHR5cGVvZiBib29sICE9ICd1bmRlZmluZWQnID8gYm9vbCA6IG51bGw7XG4gIGlmIChlbGVtKSB7XG4gICAgdmFyIGF0dHJzID0gYXR0cihlbGVtKTtcbiAgICB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGF0dHJzKCdkYXRhLXl0LWRlYnVnJykgPT0gJ3RydWUnO1xuICB9XG4gIGlmIChib29sICE9PSBudWxsKSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGJvb2w7XG4gIG1vbi5kZWJ1ZyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnO1xuICB2aWRlb0FuYWx5dGljcy5sb2dzID0gdmlkZW9BbmFseXRpY3MuZGVidWcgPyBtb24uaGlzdG9yeSA6IFtdO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyB3ZSB3YW50IHRvIGhhdmUgZXh0ZXJuYWwgYWNjZXNzIHRvIHRoZSB2aWRlb3Mgd2UncmVcbi8vIHRyYWNraW5nIGZvciBpbnRlcmFjdGlvbiB3aXRoIG90aGVyIGFwaXNcbnZpZGVvQW5hbHl0aWNzLnZpZGVvcyA9IHByaXYudmlkZW9zO1xuICBcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBwcml2LmluaXQsIGZhbHNlKTtcblxubW9kdWxlLmV4cG9ydHMgPSB2aWRlb0FuYWx5dGljczsiLCJ2YXIgYXR0ciA9IGZ1bmN0aW9uKGVsZW0pIHtcbiAgaWYgKHR5cGVvZiBlbGVtICE9ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICRhdHRyKGtleSwgdmFsKSB7XG4gICAgICBpZih0eXBlb2YgdmFsID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBlbGVtLmdldEF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIGlmICh2YWwgPT0gJ3JtJykge1xuICAgICAgICByZXR1cm4gZWxlbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBlbGVtLnNldEF0dHJpYnV0ZShrZXksIHZhbCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG52YXIgc2FmZVBhcnNlID0gZnVuY3Rpb24oc3RyKSB7XG4gIHZhciBvdXRwdXQgPSBudWxsO1xuICB0cnkge1xuICAgIG91dHB1dCA9IEpTT04ucGFyc2Uoc3RyKTtcbiAgfSBjYXRjaCAoZXgpIHt9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0cjogYXR0cixcbiAgc2FmZVBhcnNlOiBzYWZlUGFyc2Vcbn07IiwidmFyIE1vbiA9IGZ1bmN0aW9uKGRlYnVnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBNb24pKSByZXR1cm4gbmV3IE1vbihkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxuTW9uLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNwID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgdGhpcy5oaXN0b3J5LnB1c2goY3ApO1xuICBpZiAodGhpcy5kZWJ1Zykge1xuICAgIGlmKHR5cGVvZiB3aW5kb3dbJ2NvbnNvbGUnXSAhPSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLmxvZykge1xuICAgICAgaWYgKGNwLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY3BbMF0gPT0gJ29iamVjdCcpIGNwID0gSlNPTi5zdHJpbmdpZnkoY3BbMF0sbnVsbCwyKTtcbiAgICAgIGNvbnNvbGUubG9nKGNwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vbjsiXX0=
(1)
});
