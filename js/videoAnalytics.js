!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.videoAnalytics=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var helpers = _dereq_('./helpers');
var attr = helpers.attr, safeParse = helpers.safeParse, mon = helpers.cl, m;

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
  m.log(eventState);
  
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
  var elem = document.querySelector('[data-yt-analytics-debug]');
  bool = typeof bool != 'undefined' ? bool : null;
  videoAnalytics.isDebug = bool;
  if (elem) {
    var attrs = attr(elem);
    videoAnalytics.isDebug = bool ? bool : attrs('data-yt-analytics-debug') == 'true';
    m = mon(videoAnalytics.isDebug);
  }
  if (videoAnalytics.isDebug) videoAnalytics.logs = m.history;
  return videoAnalytics;
};

// we want to have external access to the videos we're
// tracking for interaction with other apis
videoAnalytics.videos = priv.videos;
  
document.addEventListener('DOMContentLoaded', priv.init, false);

module.exports = videoAnalytics;
},{"./helpers":2}],2:[function(_dereq_,module,exports){
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

var cl = function(debug) {
  if (!(this instanceof cl)) return new cl(debug);
  this.debug = debug;
  this.history = [];
  return this;
};

cl.prototype.log = function() {
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
  cl: cl,
  safeParse: safeParse
};
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV80ZTU5MjIxNS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xudmFyIGF0dHIgPSBoZWxwZXJzLmF0dHIsIHNhZmVQYXJzZSA9IGhlbHBlcnMuc2FmZVBhcnNlLCBtb24gPSBoZWxwZXJzLmNsLCBtO1xuXG4vLyBhcGkgb2JqZWN0c1xudmFyIHZpZGVvQW5hbHl0aWNzID0ge30sIHByaXYgPSB7fTtcblxuLy8gd2Ugd2FudCB0byBrZWVwIGNvbnRleHQgb2Ygb3VyIGRvbSwgc28gd2UgY2FuIGVhc2lseSByZWZcbi8vIHRoZSBub2RlcyBsYXRlciBvblxucHJpdi52aWRlb3MgPSB7fTtcblxuLy8gZWFjaCBkb20gbm9kZSB3aWxsIGhhdmUgZXZlbnRzIGF0dGFjaGVkIHNvIHdlIGNhbiBlYXNpbHlcbi8vIGludGVyYWN0IHdpdGggdGhlbSwgd2UnbGwgZG8gc29tZSBkYXRhLWJpbmRpbmcgdG8gY29sbGVjdFxuLy8gb3VyIG5vZGVzXG5wcml2LmV2ZW50cyA9IHt9O1xuICBcbi8vIHZpZGVvcyBxdWV1ZSwgYmVjYXVzZSB3ZSBsb2FkIGEgM3JkIHBhcnR5IGFzc2V0IHdlIHdhbnRcbi8vIHRvIG1pdGlnYXRlIHJhY2UgY29uZGl0aW9ucyBvZiBZVCBub3QgYmVpbmcgcmVhZHksIHNvXG4vLyB3ZSBrZWVwIGFsbCB1bnRyYWNrZWQgdmlkZW9zIGluIHRoaXMgcXVldWUgYW5kIHNoaWZ0IFxuLy8gdGhlbSBvdXQgYXMgd2UgZ2V0IHRvIHRoZW1cbnByaXYucXVldWUgPSBbXTtcblxuLy8ga2VlcCB0cmFjayBvZiB5b3V0dWJlIGNhbGxpbmcgb3VyIGZuXG5wcml2LmxvYWRlZCA9IGZhbHNlO1xuXG4vLyBpbml0IGZuIHRoYXQgaGFwcGVucyBvbiBET01Db250ZW50TG9hZGVkXG5wcml2LmluaXQgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG59O1xuXG4vLyB0aGUgd2F5IHRoZSBpZnJhbWVfYXBpIHdvcmtzIGlzIGJ5IHJlcGxhY2luZyBhbiBlbGVtZW50XG4vLyB3aXRoIGFuIGlmcmFtZSwgc28gd2UnbGwgd2FudCB0byBhdHRhY2ggdGhlIHZpZGVvIGFzIFxuLy8gbmVlZGVkXG5wcml2LmF0dGFjaFZpZGVvcyA9IGZ1bmN0aW9uKCkge1xuICBpZiAocHJpdi5sb2FkZWQpIHtcbiAgICB2YXIgdmlkZW87XG4gICAgd2hpbGUodmlkZW8gPSBwcml2LnF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgIHZpZGVvLnBsYXllciA9IG5ldyBZVC5QbGF5ZXIodmlkZW8uZWwsIHZpZGVvLm9wdHMpO1xuICAgICAgdmlkZW8ucGxheWVyLl9pZCA9IHZpZGVvLm9wdHMudmlkZW9JZDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIHdlJ2xsIHJ1biB0aGlzIG9uIGluaXQsIG9yIG9uIGRlbWFuZCBmb3IgbGF0ZW50IGxvYWRlZFxuLy8gaHRtbCBmcmFnbWVudHNcbnByaXYuY29sbGVjdERvbSA9IGZ1bmN0aW9uKCkge1xuICAvLyB3ZSB3YW50IHRvIHNldCBkZWJ1ZyBzdGF0ZSBmYWlybHkgZWFybHksIHNvIHdlJ2xsIGRvXG4gIC8vIGl0IGJlZm9yZSB3ZSBhY3R1YWxseSBxdWVyeSBmb3IgYW55IHZpZGVvcyB0byBzZXR1cFxuICB2aWRlb0FuYWx5dGljcy5zZXREZWJ1ZygpO1xuICB2YXIgZG9tID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEteXQtYW5hbHl0aWNzXScpO1xuICBmb3IodmFyIGk9MDtpPGRvbS5sZW5ndGg7KytpKSB7XG4gICAgcHJpdi5yZWZlcmVuY2VPYmplY3QoZG9tW2ldKTtcbiAgfVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBnZXRzIGZpcmVkIHdoZW4geW91dHViZSBqcyBpcyBpbml0aWFsaXplZFxuLy8gYWxzbywgdGhpcyBzYWZlbHkgYWxsb3dzIHVzIHRvIGV4dGVybmFsbHkgdXNlIC50cmFja1xuLy8gd2l0aG91dCByYWNlIGNvbmRpdGlvbnNcbnByaXYuZXh0ZXJuYWxBcGlSZWFkeSA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmxvYWRlZCA9IHRydWU7XG4gIHByaXYuYXR0YWNoVmlkZW9zKCk7XG59O1xuXG4vLyB3ZSBpbmNsdWRlIHlvdXR1YmVzIGpzIHNjcmlwdCBhc3luYywgYW5kIHdlJ2xsIG5lZWQgdG8gXG4vLyBrZWVwIHRyYWNrIG9mIHRoZSBzdGF0ZSBvZiB0aGF0IGluY2x1ZGVcbnByaXYuaW5qZWN0U2NyaXB0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIGlmICghcHJpdi5zY3JpcHRJbmNsdWRlKSB7XG4gICAgLy8gd2Ugb25seSB3YW50IHRvIGRvIHRoaXMgb25jZSwgYW5kIHRoaXMgaXMgdGhlIGJlc3RcbiAgICAvLyB0aW1lIHRvIGRvIHRoaXMgb25jZSwgdGhpcyBhbHNvIGtlZXBzIGFsbCBvZiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdHVmZiB0byBhIHNpbmdsZSBlbnRyeSwgc28gaXQgd29ya3NcbiAgICB3aW5kb3dbJ29uWW91VHViZUlmcmFtZUFQSVJlYWR5J10gPSBwcml2LmV4dGVybmFsQXBpUmVhZHk7XG5cbiAgICB2YXIgcGxhY2VtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdO1xuICAgIHByaXYuc2NyaXB0SW5jbHVkZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgIFxuICAgIC8vIGlmIGZuLCBsZXRzIHRyZWF0IGFzeW5jLCBvdGhlcndpc2Ugd2UnbGwgYmUgYmxvY2tpbmdcbiAgICBpZiAodHlwZW9mIGZuID09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ2FzeW5jJywgdHJ1ZSk7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGZuLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnc3JjJywgJy8vd3d3LnlvdXR1YmUuY29tL2lmcmFtZV9hcGknKTtcbiAgICBwbGFjZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUocHJpdi5zY3JpcHRJbmNsdWRlLCBwbGFjZW1lbnQpO1xuICB9XG59O1xuXG4vLyB3ZSB3YW50IHRvIHN0YW5kYXJkaXplIGhvdyB3ZSBoYW5kbGUgZXZlbnRzLCB0aGlzIGlzIHRoZVxuLy8gZm4gdGhhdCBoYW5kbGVzIHN1Y2ggdGhpbmdzXG5wcml2LnByb2Nlc3NFdmVudHMgPSBmdW5jdGlvbihrZXksIGlkLCBzdGF0ZSwgZSkge1xuICB2YXIgZXZlbnRzID0gcHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldLFxuICAgICAgcGxheWVyID0gcHJpdi52aWRlb3NbaWRdLnBsYXllcjtcbiAgdmFyIGV2ZW50U3RhdGUgPSB7XG4gICAgY3VycmVudFRpbWU6IE1hdGguZmxvb3IocGxheWVyLmdldEN1cnJlbnRUaW1lKCkpLCBcbiAgICBkdXJhdGlvbjogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0RHVyYXRpb24oKSksXG4gICAgZXZlbnQ6IGtleSxcbiAgICBpZDogaWQsXG4gICAgdGl0bGU6IHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlLFxuICAgIHN0YXRlOiBzdGF0ZSxcbiAgICBtdXRlZDogcGxheWVyLmlzTXV0ZWQoKSxcbiAgICBtczogbmV3IERhdGUoKS5nZXRUaW1lKClcbiAgfTtcbiAgLy8gaWYgd2UgZ2V0IGF0IG91ciB2aWRlb3MgZXh0ZXJuYWxseSwgd2Ugd2lsbCBsaWtlbHlcbiAgLy8gd2FudCB0byBrbm93IHdoYXRldmVyIHRoZSBzdGF0ZSBvZiB0aGUgY3VycmVudCB2aWRlb1xuICAvLyBpcyBpblxuICBwcml2LnZpZGVvc1tpZF0uY3VycmVudFN0YXRlID0gc3RhdGU7XG4gIC8vIHRpdGxlIHdpbGwgZmFsbGJhY2sgdG8gdGhlIGlkLCBzbyB3ZSBjYW4gZGV0ZWN0IHdoZW5cbiAgLy8gd2UgY2FuIGNhbGwgb24gdGhlIHlvdXR1YmUgYXBpIHRvIGdldCB0aGUgdmlkZW8gdGl0bGVcbiAgLy8gdGhpcyB3aWxsIGFsbG93IHVzIHRvIGhhdmUgaHVtYW4gcmVhZGFibGUgdGl0bGVzLCBcbiAgLy8gd2l0aG91dCB0aGUgb3ZlcmhlYWRcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID09IGlkKSB7XG4gICAgLy8gd2UgZG9uJ3Qgd2FudCB0byBhY2NlcHQgYW55IHVuZGVmaW5lZCB2aWRlbyB0aXRsZXMsXG4gICAgLy8gc28gd2UnbGwgZ3JhY2VmdWxseSBmYWxsYmFjayB0byBvdXIgaWQsIHRoaXMgcmVhbGx5XG4gICAgLy8gb25seSBoYXBwZW5zIHdoZW4gd2UgYXJlIGluIGEgdmlkZW8gZXJyb3Igc3RhdGVcbiAgICBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA/IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA6IGlkO1xuICB9XG4gIGlmIChwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0pIHtcbiAgICBmb3IodmFyIGk9MDtpPGV2ZW50cy5sZW5ndGg7KytpKSB7XG4gICAgICBldmVudHNbaV0oZSwgZXZlbnRTdGF0ZSk7XG4gICAgfVxuICB9XG4gIG0ubG9nKGV2ZW50U3RhdGUpO1xuICBcbn07XG5cbi8vIHNldHMgdXAgb3VyIGRvbSBvYmplY3QsIHNvIHdlIGhhdmUgYSBzdHJpY3Qgc2NoZW1hIHRvIFxuLy8gYWRoZXJlIHRvIGxhdGVyIG9uIGluIHRoZSBhcGkgXG5wcml2LnJlZmVyZW5jZU9iamVjdCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBvcHRzID0ge30sIGF0dHJzID0gYXR0cihlbCk7XG4gIG9wdHMudmlkZW9JZCA9IGF0dHJzKCdkYXRhLXl0LWFuYWx5dGljcycpO1xuICBpZiAoYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcpID09IG51bGwpIHtcbiAgICBhdHRycygnZGF0YS15dC10cmFja2VkJywgdHJ1ZSk7XG5cbiAgICAvLyBnZXQgb3B0cyBmcm9tIGRhdGEgYXR0cnNcbiAgICBvcHRzLndpZHRoID0gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA/IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgOiA2NDA7XG4gICAgb3B0cy5oZWlnaHQgPSBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA/IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpIDogMzkwO1xuICAgIG9wdHMucGxheWVyVmFycyA9IGF0dHJzKCdkYXRhLXl0LXZhcnMnKSA/IHNhZmVQYXJzZShhdHRycygnZGF0YS15dC12YXJzJykpIDogbnVsbDtcbiAgICBvcHRzLnRpdGxlID0gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA/IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgOiBvcHRzLnZpZGVvSWQ7XG4gICAgXG4gICAgLy8gc2V0dXAgYmFzZSBldmVudHNcbiAgICBvcHRzLmV2ZW50cyA9IHByaXYuc2V0dXBFdmVudHMoKTtcbiAgICBcbiAgICAvLyBidWlsZCB2aWRlbyBvYmplY3QgdG8gc3RvcmVcbiAgICBwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdID0geyBvcHRzOiBvcHRzLCBlbDogZWwsIGV2ZW50czoge30gfTtcbiAgICBwcml2LnF1ZXVlLnB1c2gocHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSk7XG4gIH1cbn07XG5cbi8vIHNldHVwIHZpZGVvcyBldmVudHMsIGFsbCBhcmUgYXZhaWxhYmxlIHB1YmxpY2FsbHksIG1vcmUgaW5mbyBjYW4gYmUgXG4vLyBmb3VuZCBhdCBkZXZlbG9wZXJzLmdvb2dsZS5jb20veW91dHViZS9pZnJhbWVfYXBpX3JlZmVyZW5jZSNFdmVudHNcbnByaXYuc2V0dXBFdmVudHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGV2ZW50cyA9IHt9O1xuICBldmVudHMub25SZWFkeSA9IHByaXYuZXZlbnRzLnJlYWR5O1xuICBldmVudHMub25TdGF0ZUNoYW5nZSA9IHByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlO1xuICBldmVudHMub25FcnJvciA9IHByaXYuZXZlbnRzLmVycm9yO1xuICBldmVudHMub25QbGF5YmFja1F1YWxpdHlDaGFuZ2UgPSBwcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2U7XG4gIGV2ZW50cy5vblBsYXliYWNrUmF0ZUNoYW5nZSA9IHByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZTtcbiAgZXZlbnRzLm9uQXBpQ2hhbmdlID0gcHJpdi5ldmVudHMuYXBpQ2hhbmdlO1xuICByZXR1cm4gZXZlbnRzO1xufTtcblxuLy8gdGhlIGlmcmFtZV9hcGkgYWxsb3dzIHVzIHRvIGF0dGFjaCBkb20gc3R5bGUgZXZlbnRzIHRvXG4vLyB2aWRlb3MsIHdlIGFsd2F5cyBmaXJlIHRoZXNlIGludGVybmFsbHksIGJ1dCB0aGVuIHdlIFxuLy8gYWxzbyBhbGxvdyB5b3UgdG8gYXR0YWNoIGV2ZW50cyB0byBhIHZpZGVvLCBieSBpdHMgaWRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuXG5wcml2LmV2ZW50cy5hcGlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnYXBpQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAnYXBpQ2hhbmdlJywgZSk7XG59O1xuXG4vLyBhY2NvcmRpbmcgdG8geW91dHViZSBkb2NzIHRoZXNlIHN0YXR1cyBjb2Rlc1xuLy8gcmVwcmVzZW50IHRoZSBzdGF0ZSBzdHJpbmcgdGhhdCBpcyBpbmRpY2F0aXZlXG4vLyBvZiB0aGUgZXJyb3JcbnByaXYuZXZlbnRzLmVycm9yID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAnaW52YWxpZCB2aWRlb0lkJztcbiAgaWYgKGUuZGF0YSA9PSAyIHx8IGUuZGF0YSA9PSAxMDApIHtcbiAgICAvLyBiYXNpY2FsbHkgbm90aGluZywgYXMgdGhlc2UgYXJlIGRlZmF1bHRzXG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDUpIHtcbiAgICBzdGF0ZSA9ICdodG1sNSBwbGF5ZXIgZXJyb3InO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSAxMDEgfHwgZS5kYXRhID09IDE1MCkge1xuICAgIHN0YXRlID0gJ2VtYmVkZGluZyBmb3JiaWRkZW4nO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnZXJyb3InLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnJlYWR5ID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3JlYWR5JywgZS50YXJnZXQuX2lkLCAncmVhZHknLCBlKTtcbn07XG5cbi8vIHdlIHRyYW5zZm9ybSB0aGUgY3VycmVudCBzdGF0ZSBgaWRgIHRvIGEgaHVtYW4gcmVhZGFibGVcbi8vIHN0cmluZyBiYXNlZCBvbiB0aGUgeW91dHViZSBhcGkgZG9jc1xucHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICd1bnN0YXJ0ZWQnO1xuICBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5CVUZGRVJJTkcpIHtcbiAgICBzdGF0ZSA9ICdidWZmZXJpbmcnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQ1VFRCkge1xuICAgIHN0YXRlID0gJ2N1ZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuRU5ERUQpIHtcbiAgICBzdGF0ZSA9ICdlbmRlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QQVVTRUQpIHtcbiAgICBzdGF0ZSA9ICdwYXVzZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUExBWUlORykge1xuICAgIHN0YXRlID0gJ3BsYXlpbmcnO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnc3RhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbi8vIHB1YmxpYyBvbiBldmVudCwgc28geW91IGNhbiBleHRlcm5hbGx5IGF0dGFjaCB0byB2aWRlb3NcbnZpZGVvQW5hbHl0aWNzLm9uID0gZnVuY3Rpb24oZXZlbnQsIGlkLCBmbikge1xuICB2YXIgcHJvY2Vzc29yID0gZnVuY3Rpb24obmV4dCkge1xuICAgIGlmIChwcml2LnZpZGVvc1tuZXh0XSkge1xuICAgICAgaWYgKCEocHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2ZW50XSBpbnN0YW5jZW9mIEFycmF5KSkgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2ZW50XSA9IFtdO1xuICAgICAgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2ZW50XS5wdXNoKGZuKTtcbiAgICB9XG4gIH07XG4gIC8vIGFjY2VwdHMgYCpgIGFzIGFuIGlkZW50aWZpZXIgb2YgYSBcImdsb2JhbFwiXG4gIC8vIGV2ZW50IHRoYXQgc2hvdWxkIGJlIGF0dGFjaGVkIHRvIGFsbCB2aWRlb3NcbiAgaWYgKGlkID09PSAnKicpIHtcbiAgICBPYmplY3Qua2V5cyhwcml2LnZpZGVvcykuZm9yRWFjaChwcm9jZXNzb3IpO1xuICB9IGVsc2Uge1xuICAgIHByb2Nlc3NvcihpZCk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gcHVibGljIHRyYWNraW5nIGV2ZW50LCBzbyB5b3UgYXR0YWNoIHZpZGVvcyBhZnRlciBkb21cbi8vIGxvYWQsIG9yIHdpdGggc29tZSBsYXRlbnQvYXN5bmMgcmVxdWVzdHNcbnZpZGVvQW5hbHl0aWNzLnRyYWNrID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHtcbiAgICBwcml2LmluamVjdFNjcmlwdHMoKTtcbiAgICBwcml2LmF0dGFjaFZpZGVvcygpO1xuICB9XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIGRlYnVnIG1vZGUsIGFsbG93cyB5b3UgdG8gY2FwdHVyZSBkZWJ1ZyBkYXRhIHNpbXBseVxudmlkZW9BbmFseXRpY3Muc2V0RGVidWcgPSBmdW5jdGlvbihib29sKSB7XG4gIHZhciBlbGVtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEteXQtYW5hbHl0aWNzLWRlYnVnXScpO1xuICBib29sID0gdHlwZW9mIGJvb2wgIT0gJ3VuZGVmaW5lZCcgPyBib29sIDogbnVsbDtcbiAgdmlkZW9BbmFseXRpY3MuaXNEZWJ1ZyA9IGJvb2w7XG4gIGlmIChlbGVtKSB7XG4gICAgdmFyIGF0dHJzID0gYXR0cihlbGVtKTtcbiAgICB2aWRlb0FuYWx5dGljcy5pc0RlYnVnID0gYm9vbCA/IGJvb2wgOiBhdHRycygnZGF0YS15dC1hbmFseXRpY3MtZGVidWcnKSA9PSAndHJ1ZSc7XG4gICAgbSA9IG1vbih2aWRlb0FuYWx5dGljcy5pc0RlYnVnKTtcbiAgfVxuICBpZiAodmlkZW9BbmFseXRpY3MuaXNEZWJ1ZykgdmlkZW9BbmFseXRpY3MubG9ncyA9IG0uaGlzdG9yeTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gd2Ugd2FudCB0byBoYXZlIGV4dGVybmFsIGFjY2VzcyB0byB0aGUgdmlkZW9zIHdlJ3JlXG4vLyB0cmFja2luZyBmb3IgaW50ZXJhY3Rpb24gd2l0aCBvdGhlciBhcGlzXG52aWRlb0FuYWx5dGljcy52aWRlb3MgPSBwcml2LnZpZGVvcztcbiAgXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgcHJpdi5pbml0LCBmYWxzZSk7XG5cbm1vZHVsZS5leHBvcnRzID0gdmlkZW9BbmFseXRpY3M7IiwidmFyIGF0dHIgPSBmdW5jdGlvbihlbGVtKSB7XG4gIGlmICh0eXBlb2YgZWxlbSAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAkYXR0cihrZXksIHZhbCkge1xuICAgICAgaWYodHlwZW9mIHZhbCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSBpZiAodmFsID09ICdybScpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZWxlbS5zZXRBdHRyaWJ1dGUoa2V5LCB2YWwpO1xuICAgICAgfVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxudmFyIHNhZmVQYXJzZSA9IGZ1bmN0aW9uKHN0cikge1xuICB2YXIgb3V0cHV0ID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBvdXRwdXQgPSBKU09OLnBhcnNlKHN0cik7XG4gIH0gY2F0Y2ggKGV4KSB7fVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxudmFyIGNsID0gZnVuY3Rpb24oZGVidWcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIGNsKSkgcmV0dXJuIG5ldyBjbChkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxuY2wucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3AgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmhpc3RvcnkucHVzaChjcCk7XG4gIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgaWYodHlwZW9mIHdpbmRvd1snY29uc29sZSddICE9ICd1bmRlZmluZWQnICYmIGNvbnNvbGUubG9nKSB7XG4gICAgICBpZiAoY3AubGVuZ3RoID09PSAxICYmIHR5cGVvZiBjcFswXSA9PSAnb2JqZWN0JykgY3AgPSBKU09OLnN0cmluZ2lmeShjcFswXSxudWxsLDIpO1xuICAgICAgY29uc29sZS5sb2coY3ApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICBjbDogY2wsXG4gIHNhZmVQYXJzZTogc2FmZVBhcnNlXG59OyJdfQ==
(1)
});
