!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.videoAnalytics=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var helpers = _dereq_('./helpers');
var attr = helpers.attr, safeParse = helpers.safeParse, mon = helpers.mon;

// api objects
var videoAnalytics = {}, priv = {}, m;

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
  var elem = document.querySelector('[data-yt-debug]');
  bool = typeof bool != 'undefined' ? bool : null;
  if (elem) {
    var attrs = attr(elem);
    videoAnalytics.debug = bool ? bool : attrs('data-yt-debug') == 'true';
  }
  if (bool !== null) {
    videoAnalytics.debug = bool;
  }
  if (!m) {
    m = mon(videoAnalytics.debug);
  }
  m.debug = videoAnalytics.debug;
  videoAnalytics.logs = videoAnalytics.debug ? m.history : [];
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
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV8yZTAzNjg2NS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgYXR0ciA9IGhlbHBlcnMuYXR0ciwgc2FmZVBhcnNlID0gaGVscGVycy5zYWZlUGFyc2UsIG1vbiA9IGhlbHBlcnMubW9uO1xuXG4vLyBhcGkgb2JqZWN0c1xudmFyIHZpZGVvQW5hbHl0aWNzID0ge30sIHByaXYgPSB7fSwgbTtcblxuLy8gd2Ugd2FudCB0byBrZWVwIGNvbnRleHQgb2Ygb3VyIGRvbSwgc28gd2UgY2FuIGVhc2lseSByZWZcbi8vIHRoZSBub2RlcyBsYXRlciBvblxucHJpdi52aWRlb3MgPSB7fTtcblxuLy8gZWFjaCBkb20gbm9kZSB3aWxsIGhhdmUgZXZlbnRzIGF0dGFjaGVkIHNvIHdlIGNhbiBlYXNpbHlcbi8vIGludGVyYWN0IHdpdGggdGhlbSwgd2UnbGwgZG8gc29tZSBkYXRhLWJpbmRpbmcgdG8gY29sbGVjdFxuLy8gb3VyIG5vZGVzXG5wcml2LmV2ZW50cyA9IHt9O1xuICBcbi8vIHZpZGVvcyBxdWV1ZSwgYmVjYXVzZSB3ZSBsb2FkIGEgM3JkIHBhcnR5IGFzc2V0IHdlIHdhbnRcbi8vIHRvIG1pdGlnYXRlIHJhY2UgY29uZGl0aW9ucyBvZiBZVCBub3QgYmVpbmcgcmVhZHksIHNvXG4vLyB3ZSBrZWVwIGFsbCB1bnRyYWNrZWQgdmlkZW9zIGluIHRoaXMgcXVldWUgYW5kIHNoaWZ0IFxuLy8gdGhlbSBvdXQgYXMgd2UgZ2V0IHRvIHRoZW1cbnByaXYucXVldWUgPSBbXTtcblxuLy8ga2VlcCB0cmFjayBvZiB5b3V0dWJlIGNhbGxpbmcgb3VyIGZuXG5wcml2LmxvYWRlZCA9IGZhbHNlO1xuXG4vLyBpbml0IGZuIHRoYXQgaGFwcGVucyBvbiBET01Db250ZW50TG9hZGVkXG5wcml2LmluaXQgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG59O1xuXG4vLyB0aGUgd2F5IHRoZSBpZnJhbWVfYXBpIHdvcmtzIGlzIGJ5IHJlcGxhY2luZyBhbiBlbGVtZW50XG4vLyB3aXRoIGFuIGlmcmFtZSwgc28gd2UnbGwgd2FudCB0byBhdHRhY2ggdGhlIHZpZGVvIGFzIFxuLy8gbmVlZGVkXG5wcml2LmF0dGFjaFZpZGVvcyA9IGZ1bmN0aW9uKCkge1xuICBpZiAocHJpdi5sb2FkZWQpIHtcbiAgICB2YXIgdmlkZW87XG4gICAgd2hpbGUodmlkZW8gPSBwcml2LnF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgIHZpZGVvLnBsYXllciA9IG5ldyBZVC5QbGF5ZXIodmlkZW8uZWwsIHZpZGVvLm9wdHMpO1xuICAgICAgdmlkZW8ucGxheWVyLl9pZCA9IHZpZGVvLm9wdHMudmlkZW9JZDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIHdlJ2xsIHJ1biB0aGlzIG9uIGluaXQsIG9yIG9uIGRlbWFuZCBmb3IgbGF0ZW50IGxvYWRlZFxuLy8gaHRtbCBmcmFnbWVudHNcbnByaXYuY29sbGVjdERvbSA9IGZ1bmN0aW9uKCkge1xuICAvLyB3ZSB3YW50IHRvIHNldCBkZWJ1ZyBzdGF0ZSBmYWlybHkgZWFybHksIHNvIHdlJ2xsIGRvXG4gIC8vIGl0IGJlZm9yZSB3ZSBhY3R1YWxseSBxdWVyeSBmb3IgYW55IHZpZGVvcyB0byBzZXR1cFxuICB2aWRlb0FuYWx5dGljcy5zZXREZWJ1ZygpO1xuICB2YXIgZG9tID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEteXQtYW5hbHl0aWNzXScpO1xuICBmb3IodmFyIGk9MDtpPGRvbS5sZW5ndGg7KytpKSB7XG4gICAgcHJpdi5yZWZlcmVuY2VPYmplY3QoZG9tW2ldKTtcbiAgfVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBnZXRzIGZpcmVkIHdoZW4geW91dHViZSBqcyBpcyBpbml0aWFsaXplZFxuLy8gYWxzbywgdGhpcyBzYWZlbHkgYWxsb3dzIHVzIHRvIGV4dGVybmFsbHkgdXNlIC50cmFja1xuLy8gd2l0aG91dCByYWNlIGNvbmRpdGlvbnNcbnByaXYuZXh0ZXJuYWxBcGlSZWFkeSA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmxvYWRlZCA9IHRydWU7XG4gIHByaXYuYXR0YWNoVmlkZW9zKCk7XG59O1xuXG4vLyB3ZSBpbmNsdWRlIHlvdXR1YmVzIGpzIHNjcmlwdCBhc3luYywgYW5kIHdlJ2xsIG5lZWQgdG8gXG4vLyBrZWVwIHRyYWNrIG9mIHRoZSBzdGF0ZSBvZiB0aGF0IGluY2x1ZGVcbnByaXYuaW5qZWN0U2NyaXB0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIGlmICghcHJpdi5zY3JpcHRJbmNsdWRlKSB7XG4gICAgLy8gd2Ugb25seSB3YW50IHRvIGRvIHRoaXMgb25jZSwgYW5kIHRoaXMgaXMgdGhlIGJlc3RcbiAgICAvLyB0aW1lIHRvIGRvIHRoaXMgb25jZSwgdGhpcyBhbHNvIGtlZXBzIGFsbCBvZiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdHVmZiB0byBhIHNpbmdsZSBlbnRyeSwgc28gaXQgd29ya3NcbiAgICB3aW5kb3dbJ29uWW91VHViZUlmcmFtZUFQSVJlYWR5J10gPSBwcml2LmV4dGVybmFsQXBpUmVhZHk7XG5cbiAgICB2YXIgcGxhY2VtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdO1xuICAgIHByaXYuc2NyaXB0SW5jbHVkZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgIFxuICAgIC8vIGlmIGZuLCBsZXRzIHRyZWF0IGFzeW5jLCBvdGhlcndpc2Ugd2UnbGwgYmUgYmxvY2tpbmdcbiAgICBpZiAodHlwZW9mIGZuID09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ2FzeW5jJywgdHJ1ZSk7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGZuLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnc3JjJywgJy8vd3d3LnlvdXR1YmUuY29tL2lmcmFtZV9hcGknKTtcbiAgICBwbGFjZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUocHJpdi5zY3JpcHRJbmNsdWRlLCBwbGFjZW1lbnQpO1xuICB9XG59O1xuXG4vLyB3ZSB3YW50IHRvIHN0YW5kYXJkaXplIGhvdyB3ZSBoYW5kbGUgZXZlbnRzLCB0aGlzIGlzIHRoZVxuLy8gZm4gdGhhdCBoYW5kbGVzIHN1Y2ggdGhpbmdzXG5wcml2LnByb2Nlc3NFdmVudHMgPSBmdW5jdGlvbihrZXksIGlkLCBzdGF0ZSwgZSkge1xuICB2YXIgZXZlbnRzID0gcHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldLFxuICAgICAgcGxheWVyID0gcHJpdi52aWRlb3NbaWRdLnBsYXllcjtcbiAgdmFyIGV2ZW50U3RhdGUgPSB7XG4gICAgY3VycmVudFRpbWU6IE1hdGguZmxvb3IocGxheWVyLmdldEN1cnJlbnRUaW1lKCkpLCBcbiAgICBkdXJhdGlvbjogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0RHVyYXRpb24oKSksXG4gICAgZXZlbnQ6IGtleSxcbiAgICBpZDogaWQsXG4gICAgdGl0bGU6IHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlLFxuICAgIHN0YXRlOiBzdGF0ZSxcbiAgICBtdXRlZDogcGxheWVyLmlzTXV0ZWQoKSxcbiAgICBtczogbmV3IERhdGUoKS5nZXRUaW1lKClcbiAgfTtcbiAgLy8gaWYgd2UgZ2V0IGF0IG91ciB2aWRlb3MgZXh0ZXJuYWxseSwgd2Ugd2lsbCBsaWtlbHlcbiAgLy8gd2FudCB0byBrbm93IHdoYXRldmVyIHRoZSBzdGF0ZSBvZiB0aGUgY3VycmVudCB2aWRlb1xuICAvLyBpcyBpblxuICBwcml2LnZpZGVvc1tpZF0uY3VycmVudFN0YXRlID0gc3RhdGU7XG4gIC8vIHRpdGxlIHdpbGwgZmFsbGJhY2sgdG8gdGhlIGlkLCBzbyB3ZSBjYW4gZGV0ZWN0IHdoZW5cbiAgLy8gd2UgY2FuIGNhbGwgb24gdGhlIHlvdXR1YmUgYXBpIHRvIGdldCB0aGUgdmlkZW8gdGl0bGVcbiAgLy8gdGhpcyB3aWxsIGFsbG93IHVzIHRvIGhhdmUgaHVtYW4gcmVhZGFibGUgdGl0bGVzLCBcbiAgLy8gd2l0aG91dCB0aGUgb3ZlcmhlYWRcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID09IGlkKSB7XG4gICAgLy8gd2UgZG9uJ3Qgd2FudCB0byBhY2NlcHQgYW55IHVuZGVmaW5lZCB2aWRlbyB0aXRsZXMsXG4gICAgLy8gc28gd2UnbGwgZ3JhY2VmdWxseSBmYWxsYmFjayB0byBvdXIgaWQsIHRoaXMgcmVhbGx5XG4gICAgLy8gb25seSBoYXBwZW5zIHdoZW4gd2UgYXJlIGluIGEgdmlkZW8gZXJyb3Igc3RhdGVcbiAgICBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA/IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA6IGlkO1xuICB9XG4gIGlmIChwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0pIHtcbiAgICBmb3IodmFyIGk9MDtpPGV2ZW50cy5sZW5ndGg7KytpKSB7XG4gICAgICBldmVudHNbaV0oZSwgZXZlbnRTdGF0ZSk7XG4gICAgfVxuICB9XG4gIG0ubG9nKGV2ZW50U3RhdGUpO1xufTtcblxuLy8gc2V0cyB1cCBvdXIgZG9tIG9iamVjdCwgc28gd2UgaGF2ZSBhIHN0cmljdCBzY2hlbWEgdG8gXG4vLyBhZGhlcmUgdG8gbGF0ZXIgb24gaW4gdGhlIGFwaSBcbnByaXYucmVmZXJlbmNlT2JqZWN0ID0gZnVuY3Rpb24oZWwpIHtcbiAgdmFyIG9wdHMgPSB7fSwgYXR0cnMgPSBhdHRyKGVsKTtcbiAgb3B0cy52aWRlb0lkID0gYXR0cnMoJ2RhdGEteXQtYW5hbHl0aWNzJyk7XG4gIGlmIChhdHRycygnZGF0YS15dC10cmFja2VkJykgPT0gbnVsbCkge1xuICAgIGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnLCB0cnVlKTtcblxuICAgIC8vIGdldCBvcHRzIGZyb20gZGF0YSBhdHRyc1xuICAgIG9wdHMud2lkdGggPSBhdHRycygnZGF0YS15dC13aWR0aCcpID8gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA6IDY0MDtcbiAgICBvcHRzLmhlaWdodCA9IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpID8gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgOiAzOTA7XG4gICAgb3B0cy5wbGF5ZXJWYXJzID0gYXR0cnMoJ2RhdGEteXQtdmFycycpID8gc2FmZVBhcnNlKGF0dHJzKCdkYXRhLXl0LXZhcnMnKSkgOiBudWxsO1xuICAgIG9wdHMudGl0bGUgPSBhdHRycygnZGF0YS15dC10aXRsZScpID8gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA6IG9wdHMudmlkZW9JZDtcbiAgICBcbiAgICAvLyBzZXR1cCBiYXNlIGV2ZW50c1xuICAgIG9wdHMuZXZlbnRzID0gcHJpdi5zZXR1cEV2ZW50cygpO1xuICAgIFxuICAgIC8vIGJ1aWxkIHZpZGVvIG9iamVjdCB0byBzdG9yZVxuICAgIHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0gPSB7IG9wdHM6IG9wdHMsIGVsOiBlbCwgZXZlbnRzOiB7fSB9O1xuICAgIHByaXYucXVldWUucHVzaChwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdKTtcbiAgfVxufTtcblxuLy8gc2V0dXAgdmlkZW9zIGV2ZW50cywgYWxsIGFyZSBhdmFpbGFibGUgcHVibGljYWxseSwgbW9yZSBpbmZvIGNhbiBiZSBcbi8vIGZvdW5kIGF0IGRldmVsb3BlcnMuZ29vZ2xlLmNvbS95b3V0dWJlL2lmcmFtZV9hcGlfcmVmZXJlbmNlI0V2ZW50c1xucHJpdi5zZXR1cEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZXZlbnRzID0ge307XG4gIGV2ZW50cy5vblJlYWR5ID0gcHJpdi5ldmVudHMucmVhZHk7XG4gIGV2ZW50cy5vblN0YXRlQ2hhbmdlID0gcHJpdi5ldmVudHMuc3RhdGVDaGFuZ2U7XG4gIGV2ZW50cy5vbkVycm9yID0gcHJpdi5ldmVudHMuZXJyb3I7XG4gIGV2ZW50cy5vblBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IHByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZTtcbiAgZXZlbnRzLm9uUGxheWJhY2tSYXRlQ2hhbmdlID0gcHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlO1xuICBldmVudHMub25BcGlDaGFuZ2UgPSBwcml2LmV2ZW50cy5hcGlDaGFuZ2U7XG4gIHJldHVybiBldmVudHM7XG59O1xuXG4vLyB0aGUgaWZyYW1lX2FwaSBhbGxvd3MgdXMgdG8gYXR0YWNoIGRvbSBzdHlsZSBldmVudHMgdG9cbi8vIHZpZGVvcywgd2UgYWx3YXlzIGZpcmUgdGhlc2UgaW50ZXJuYWxseSwgYnV0IHRoZW4gd2UgXG4vLyBhbHNvIGFsbG93IHlvdSB0byBhdHRhY2ggZXZlbnRzIHRvIGEgdmlkZW8sIGJ5IGl0cyBpZFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vXG5cbnByaXYuZXZlbnRzLmFwaUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdhcGlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdhcGlDaGFuZ2UnLCBlKTtcbn07XG5cbi8vIGFjY29yZGluZyB0byB5b3V0dWJlIGRvY3MgdGhlc2Ugc3RhdHVzIGNvZGVzXG4vLyByZXByZXNlbnQgdGhlIHN0YXRlIHN0cmluZyB0aGF0IGlzIGluZGljYXRpdmVcbi8vIG9mIHRoZSBlcnJvclxucHJpdi5ldmVudHMuZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICdpbnZhbGlkIHZpZGVvSWQnO1xuICBpZiAoZS5kYXRhID09IDIgfHwgZS5kYXRhID09IDEwMCkge1xuICAgIC8vIGJhc2ljYWxseSBub3RoaW5nLCBhcyB0aGVzZSBhcmUgZGVmYXVsdHNcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gNSkge1xuICAgIHN0YXRlID0gJ2h0bWw1IHBsYXllciBlcnJvcic7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDEwMSB8fCBlLmRhdGEgPT0gMTUwKSB7XG4gICAgc3RhdGUgPSAnZW1iZWRkaW5nIGZvcmJpZGRlbic7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdlcnJvcicsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucmVhZHkgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncmVhZHknLCBlLnRhcmdldC5faWQsICdyZWFkeScsIGUpO1xufTtcblxuLy8gd2UgdHJhbnNmb3JtIHRoZSBjdXJyZW50IHN0YXRlIGBpZGAgdG8gYSBodW1hbiByZWFkYWJsZVxuLy8gc3RyaW5nIGJhc2VkIG9uIHRoZSB5b3V0dWJlIGFwaSBkb2NzXG5wcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ3Vuc3RhcnRlZCc7XG4gIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkJVRkZFUklORykge1xuICAgIHN0YXRlID0gJ2J1ZmZlcmluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5DVUVEKSB7XG4gICAgc3RhdGUgPSAnY3VlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5FTkRFRCkge1xuICAgIHN0YXRlID0gJ2VuZGVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBBVVNFRCkge1xuICAgIHN0YXRlID0gJ3BhdXNlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QTEFZSU5HKSB7XG4gICAgc3RhdGUgPSAncGxheWluZyc7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdzdGF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxuLy8gcHVibGljIG9uIGV2ZW50LCBzbyB5b3UgY2FuIGV4dGVybmFsbHkgYXR0YWNoIHRvIHZpZGVvc1xudmlkZW9BbmFseXRpY3Mub24gPSBmdW5jdGlvbihldmVudCwgaWQsIGZuKSB7XG4gIHZhciBwcm9jZXNzb3IgPSBmdW5jdGlvbihuZXh0KSB7XG4gICAgaWYgKHByaXYudmlkZW9zW25leHRdKSB7XG4gICAgICBpZiAoIShwcml2LnZpZGVvc1tuZXh0XS5ldmVudHNbZXZlbnRdIGluc3RhbmNlb2YgQXJyYXkpKSBwcml2LnZpZGVvc1tuZXh0XS5ldmVudHNbZXZlbnRdID0gW107XG4gICAgICBwcml2LnZpZGVvc1tuZXh0XS5ldmVudHNbZXZlbnRdLnB1c2goZm4pO1xuICAgIH1cbiAgfTtcbiAgLy8gYWNjZXB0cyBgKmAgYXMgYW4gaWRlbnRpZmllciBvZiBhIFwiZ2xvYmFsXCJcbiAgLy8gZXZlbnQgdGhhdCBzaG91bGQgYmUgYXR0YWNoZWQgdG8gYWxsIHZpZGVvc1xuICBpZiAoaWQgPT09ICcqJykge1xuICAgIE9iamVjdC5rZXlzKHByaXYudmlkZW9zKS5mb3JFYWNoKHByb2Nlc3Nvcik7XG4gIH0gZWxzZSB7XG4gICAgcHJvY2Vzc29yKGlkKTtcbiAgfVxuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBwdWJsaWMgdHJhY2tpbmcgZXZlbnQsIHNvIHlvdSBhdHRhY2ggdmlkZW9zIGFmdGVyIGRvbVxuLy8gbG9hZCwgb3Igd2l0aCBzb21lIGxhdGVudC9hc3luYyByZXF1ZXN0c1xudmlkZW9BbmFseXRpY3MudHJhY2sgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkge1xuICAgIHByaXYuaW5qZWN0U2NyaXB0cygpO1xuICAgIHByaXYuYXR0YWNoVmlkZW9zKCk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gZGVidWcgbW9kZSwgYWxsb3dzIHlvdSB0byBjYXB0dXJlIGRlYnVnIGRhdGEgc2ltcGx5XG52aWRlb0FuYWx5dGljcy5zZXREZWJ1ZyA9IGZ1bmN0aW9uKGJvb2wpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS15dC1kZWJ1Z10nKTtcbiAgYm9vbCA9IHR5cGVvZiBib29sICE9ICd1bmRlZmluZWQnID8gYm9vbCA6IG51bGw7XG4gIGlmIChlbGVtKSB7XG4gICAgdmFyIGF0dHJzID0gYXR0cihlbGVtKTtcbiAgICB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGJvb2wgPyBib29sIDogYXR0cnMoJ2RhdGEteXQtZGVidWcnKSA9PSAndHJ1ZSc7XG4gIH1cbiAgaWYgKGJvb2wgIT09IG51bGwpIHtcbiAgICB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGJvb2w7XG4gIH1cbiAgaWYgKCFtKSB7XG4gICAgbSA9IG1vbih2aWRlb0FuYWx5dGljcy5kZWJ1Zyk7XG4gIH1cbiAgbS5kZWJ1ZyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnO1xuICB2aWRlb0FuYWx5dGljcy5sb2dzID0gdmlkZW9BbmFseXRpY3MuZGVidWcgPyBtLmhpc3RvcnkgOiBbXTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gd2Ugd2FudCB0byBoYXZlIGV4dGVybmFsIGFjY2VzcyB0byB0aGUgdmlkZW9zIHdlJ3JlXG4vLyB0cmFja2luZyBmb3IgaW50ZXJhY3Rpb24gd2l0aCBvdGhlciBhcGlzXG52aWRlb0FuYWx5dGljcy52aWRlb3MgPSBwcml2LnZpZGVvcztcbiAgXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgcHJpdi5pbml0LCBmYWxzZSk7XG5cbm1vZHVsZS5leHBvcnRzID0gdmlkZW9BbmFseXRpY3M7IiwidmFyIGF0dHIgPSBmdW5jdGlvbihlbGVtKSB7XG4gIGlmICh0eXBlb2YgZWxlbSAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAkYXR0cihrZXksIHZhbCkge1xuICAgICAgaWYodHlwZW9mIHZhbCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSBpZiAodmFsID09ICdybScpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZWxlbS5zZXRBdHRyaWJ1dGUoa2V5LCB2YWwpO1xuICAgICAgfVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxudmFyIHNhZmVQYXJzZSA9IGZ1bmN0aW9uKHN0cikge1xuICB2YXIgb3V0cHV0ID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBvdXRwdXQgPSBKU09OLnBhcnNlKHN0cik7XG4gIH0gY2F0Y2ggKGV4KSB7fVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxudmFyIG1vbiA9IGZ1bmN0aW9uKGRlYnVnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBtb24pKSByZXR1cm4gbmV3IG1vbihkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxubW9uLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNwID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgdGhpcy5oaXN0b3J5LnB1c2goY3ApO1xuICBpZiAodGhpcy5kZWJ1Zykge1xuICAgIGlmKHR5cGVvZiB3aW5kb3dbJ2NvbnNvbGUnXSAhPSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLmxvZykge1xuICAgICAgaWYgKGNwLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY3BbMF0gPT0gJ29iamVjdCcpIGNwID0gSlNPTi5zdHJpbmdpZnkoY3BbMF0sbnVsbCwyKTtcbiAgICAgIGNvbnNvbGUubG9nKGNwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0cjogYXR0cixcbiAgbW9uOiBtb24sXG4gIHNhZmVQYXJzZTogc2FmZVBhcnNlXG59OyJdfQ==
(1)
});
