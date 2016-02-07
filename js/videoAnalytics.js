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
    videoAnalytics.debug = bool ? bool : attrs('data-yt-debug') == 'true';
  }
  if (bool !== null) {
    videoAnalytics.debug = bool;
  }
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

module.exports = mon;
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV8yNmU2M2Y5ZS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgbW9uID0gcmVxdWlyZSgnLi9tb24nKShmYWxzZSk7XG52YXIgYXR0ciA9IGhlbHBlcnMuYXR0ciwgc2FmZVBhcnNlID0gaGVscGVycy5zYWZlUGFyc2U7XG5cbi8vIGFwaSBvYmplY3RzXG52YXIgdmlkZW9BbmFseXRpY3MgPSB7fSwgcHJpdiA9IHt9O1xuXG4vLyB3ZSB3YW50IHRvIGtlZXAgY29udGV4dCBvZiBvdXIgZG9tLCBzbyB3ZSBjYW4gZWFzaWx5IHJlZlxuLy8gdGhlIG5vZGVzIGxhdGVyIG9uXG5wcml2LnZpZGVvcyA9IHt9O1xuXG4vLyBlYWNoIGRvbSBub2RlIHdpbGwgaGF2ZSBldmVudHMgYXR0YWNoZWQgc28gd2UgY2FuIGVhc2lseVxuLy8gaW50ZXJhY3Qgd2l0aCB0aGVtLCB3ZSdsbCBkbyBzb21lIGRhdGEtYmluZGluZyB0byBjb2xsZWN0XG4vLyBvdXIgbm9kZXNcbnByaXYuZXZlbnRzID0ge307XG4gIFxuLy8gdmlkZW9zIHF1ZXVlLCBiZWNhdXNlIHdlIGxvYWQgYSAzcmQgcGFydHkgYXNzZXQgd2Ugd2FudFxuLy8gdG8gbWl0aWdhdGUgcmFjZSBjb25kaXRpb25zIG9mIFlUIG5vdCBiZWluZyByZWFkeSwgc29cbi8vIHdlIGtlZXAgYWxsIHVudHJhY2tlZCB2aWRlb3MgaW4gdGhpcyBxdWV1ZSBhbmQgc2hpZnQgXG4vLyB0aGVtIG91dCBhcyB3ZSBnZXQgdG8gdGhlbVxucHJpdi5xdWV1ZSA9IFtdO1xuXG4vLyBrZWVwIHRyYWNrIG9mIHlvdXR1YmUgY2FsbGluZyBvdXIgZm5cbnByaXYubG9hZGVkID0gZmFsc2U7XG5cbi8vIGluaXQgZm4gdGhhdCBoYXBwZW5zIG9uIERPTUNvbnRlbnRMb2FkZWRcbnByaXYuaW5pdCA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSBwcml2LmluamVjdFNjcmlwdHMoKTtcbn07XG5cbi8vIHRoZSB3YXkgdGhlIGlmcmFtZV9hcGkgd29ya3MgaXMgYnkgcmVwbGFjaW5nIGFuIGVsZW1lbnRcbi8vIHdpdGggYW4gaWZyYW1lLCBzbyB3ZSdsbCB3YW50IHRvIGF0dGFjaCB0aGUgdmlkZW8gYXMgXG4vLyBuZWVkZWRcbnByaXYuYXR0YWNoVmlkZW9zID0gZnVuY3Rpb24oKSB7XG4gIGlmIChwcml2LmxvYWRlZCkge1xuICAgIHZhciB2aWRlbztcbiAgICB3aGlsZSh2aWRlbyA9IHByaXYucXVldWUuc2hpZnQoKSkge1xuICAgICAgdmlkZW8ucGxheWVyID0gbmV3IFlULlBsYXllcih2aWRlby5lbCwgdmlkZW8ub3B0cyk7XG4gICAgICB2aWRlby5wbGF5ZXIuX2lkID0gdmlkZW8ub3B0cy52aWRlb0lkO1xuICAgIH1cbiAgfVxufTtcblxuLy8gd2UnbGwgcnVuIHRoaXMgb24gaW5pdCwgb3Igb24gZGVtYW5kIGZvciBsYXRlbnQgbG9hZGVkXG4vLyBodG1sIGZyYWdtZW50c1xucHJpdi5jb2xsZWN0RG9tID0gZnVuY3Rpb24oKSB7XG4gIC8vIHdlIHdhbnQgdG8gc2V0IGRlYnVnIHN0YXRlIGZhaXJseSBlYXJseSwgc28gd2UnbGwgZG9cbiAgLy8gaXQgYmVmb3JlIHdlIGFjdHVhbGx5IHF1ZXJ5IGZvciBhbnkgdmlkZW9zIHRvIHNldHVwXG4gIHZpZGVvQW5hbHl0aWNzLnNldERlYnVnKCk7XG4gIHZhciBkb20gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS15dC1hbmFseXRpY3NdJyk7XG4gIGZvcih2YXIgaT0wO2k8ZG9tLmxlbmd0aDsrK2kpIHtcbiAgICBwcml2LnJlZmVyZW5jZU9iamVjdChkb21baV0pO1xuICB9XG59O1xuXG4vLyB0aGlzIGZ1bmN0aW9uIGdldHMgZmlyZWQgd2hlbiB5b3V0dWJlIGpzIGlzIGluaXRpYWxpemVkXG4vLyBhbHNvLCB0aGlzIHNhZmVseSBhbGxvd3MgdXMgdG8gZXh0ZXJuYWxseSB1c2UgLnRyYWNrXG4vLyB3aXRob3V0IHJhY2UgY29uZGl0aW9uc1xucHJpdi5leHRlcm5hbEFwaVJlYWR5ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYubG9hZGVkID0gdHJ1ZTtcbiAgcHJpdi5hdHRhY2hWaWRlb3MoKTtcbn07XG5cbi8vIHdlIGluY2x1ZGUgeW91dHViZXMganMgc2NyaXB0IGFzeW5jLCBhbmQgd2UnbGwgbmVlZCB0byBcbi8vIGtlZXAgdHJhY2sgb2YgdGhlIHN0YXRlIG9mIHRoYXQgaW5jbHVkZVxucHJpdi5pbmplY3RTY3JpcHRzID0gZnVuY3Rpb24oZm4pIHtcbiAgaWYgKCFwcml2LnNjcmlwdEluY2x1ZGUpIHtcbiAgICAvLyB3ZSBvbmx5IHdhbnQgdG8gZG8gdGhpcyBvbmNlLCBhbmQgdGhpcyBpcyB0aGUgYmVzdFxuICAgIC8vIHRpbWUgdG8gZG8gdGhpcyBvbmNlLCB0aGlzIGFsc28ga2VlcHMgYWxsIG9mIHRoZVxuICAgIC8vIGNvbmRpdGlvbmFsIHN0dWZmIHRvIGEgc2luZ2xlIGVudHJ5LCBzbyBpdCB3b3Jrc1xuICAgIHdpbmRvd1snb25Zb3VUdWJlSWZyYW1lQVBJUmVhZHknXSA9IHByaXYuZXh0ZXJuYWxBcGlSZWFkeTtcblxuICAgIHZhciBwbGFjZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylbMF07XG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgXG4gICAgLy8gaWYgZm4sIGxldHMgdHJlYXQgYXN5bmMsIG90aGVyd2lzZSB3ZSdsbCBiZSBibG9ja2luZ1xuICAgIGlmICh0eXBlb2YgZm4gPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnYXN5bmMnLCB0cnVlKTtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZm4sIGZhbHNlKTtcbiAgICB9XG5cbiAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdzcmMnLCAnLy93d3cueW91dHViZS5jb20vaWZyYW1lX2FwaScpO1xuICAgIHBsYWNlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShwcml2LnNjcmlwdEluY2x1ZGUsIHBsYWNlbWVudCk7XG4gIH1cbn07XG5cbi8vIHdlIHdhbnQgdG8gc3RhbmRhcmRpemUgaG93IHdlIGhhbmRsZSBldmVudHMsIHRoaXMgaXMgdGhlXG4vLyBmbiB0aGF0IGhhbmRsZXMgc3VjaCB0aGluZ3NcbnByaXYucHJvY2Vzc0V2ZW50cyA9IGZ1bmN0aW9uKGtleSwgaWQsIHN0YXRlLCBlKSB7XG4gIHZhciBldmVudHMgPSBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0sXG4gICAgICBwbGF5ZXIgPSBwcml2LnZpZGVvc1tpZF0ucGxheWVyO1xuICB2YXIgZXZlbnRTdGF0ZSA9IHtcbiAgICBjdXJyZW50VGltZTogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSksIFxuICAgIGR1cmF0aW9uOiBNYXRoLmZsb29yKHBsYXllci5nZXREdXJhdGlvbigpKSxcbiAgICBldmVudDoga2V5LFxuICAgIGlkOiBpZCxcbiAgICB0aXRsZTogcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUsXG4gICAgc3RhdGU6IHN0YXRlLFxuICAgIG11dGVkOiBwbGF5ZXIuaXNNdXRlZCgpLFxuICAgIG1zOiBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuICB9O1xuICAvLyBpZiB3ZSBnZXQgYXQgb3VyIHZpZGVvcyBleHRlcm5hbGx5LCB3ZSB3aWxsIGxpa2VseVxuICAvLyB3YW50IHRvIGtub3cgd2hhdGV2ZXIgdGhlIHN0YXRlIG9mIHRoZSBjdXJyZW50IHZpZGVvXG4gIC8vIGlzIGluXG4gIHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgLy8gdGl0bGUgd2lsbCBmYWxsYmFjayB0byB0aGUgaWQsIHNvIHdlIGNhbiBkZXRlY3Qgd2hlblxuICAvLyB3ZSBjYW4gY2FsbCBvbiB0aGUgeW91dHViZSBhcGkgdG8gZ2V0IHRoZSB2aWRlbyB0aXRsZVxuICAvLyB0aGlzIHdpbGwgYWxsb3cgdXMgdG8gaGF2ZSBodW1hbiByZWFkYWJsZSB0aXRsZXMsIFxuICAvLyB3aXRob3V0IHRoZSBvdmVyaGVhZFxuICBpZiAocHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPT0gaWQpIHtcbiAgICAvLyB3ZSBkb24ndCB3YW50IHRvIGFjY2VwdCBhbnkgdW5kZWZpbmVkIHZpZGVvIHRpdGxlcyxcbiAgICAvLyBzbyB3ZSdsbCBncmFjZWZ1bGx5IGZhbGxiYWNrIHRvIG91ciBpZCwgdGhpcyByZWFsbHlcbiAgICAvLyBvbmx5IGhhcHBlbnMgd2hlbiB3ZSBhcmUgaW4gYSB2aWRlbyBlcnJvciBzdGF0ZVxuICAgIHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID0gcGxheWVyLmdldFZpZGVvRGF0YSgpLnRpdGxlID8gcGxheWVyLmdldFZpZGVvRGF0YSgpLnRpdGxlIDogaWQ7XG4gIH1cbiAgaWYgKHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSkge1xuICAgIGZvcih2YXIgaT0wO2k8ZXZlbnRzLmxlbmd0aDsrK2kpIHtcbiAgICAgIGV2ZW50c1tpXShlLCBldmVudFN0YXRlKTtcbiAgICB9XG4gIH1cbiAgbW9uLmxvZyhldmVudFN0YXRlKTtcbn07XG5cbi8vIHNldHMgdXAgb3VyIGRvbSBvYmplY3QsIHNvIHdlIGhhdmUgYSBzdHJpY3Qgc2NoZW1hIHRvIFxuLy8gYWRoZXJlIHRvIGxhdGVyIG9uIGluIHRoZSBhcGkgXG5wcml2LnJlZmVyZW5jZU9iamVjdCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBvcHRzID0ge30sIGF0dHJzID0gYXR0cihlbCk7XG4gIG9wdHMudmlkZW9JZCA9IGF0dHJzKCdkYXRhLXl0LWFuYWx5dGljcycpO1xuICBpZiAoYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcpID09IG51bGwpIHtcbiAgICBhdHRycygnZGF0YS15dC10cmFja2VkJywgdHJ1ZSk7XG5cbiAgICAvLyBnZXQgb3B0cyBmcm9tIGRhdGEgYXR0cnNcbiAgICBvcHRzLndpZHRoID0gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA/IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgOiA2NDA7XG4gICAgb3B0cy5oZWlnaHQgPSBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA/IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpIDogMzkwO1xuICAgIG9wdHMucGxheWVyVmFycyA9IGF0dHJzKCdkYXRhLXl0LXZhcnMnKSA/IHNhZmVQYXJzZShhdHRycygnZGF0YS15dC12YXJzJykpIDogbnVsbDtcbiAgICBvcHRzLnRpdGxlID0gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA/IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgOiBvcHRzLnZpZGVvSWQ7XG4gICAgXG4gICAgLy8gc2V0dXAgYmFzZSBldmVudHNcbiAgICBvcHRzLmV2ZW50cyA9IHByaXYuc2V0dXBFdmVudHMoKTtcbiAgICBcbiAgICAvLyBidWlsZCB2aWRlbyBvYmplY3QgdG8gc3RvcmVcbiAgICBwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdID0geyBvcHRzOiBvcHRzLCBlbDogZWwsIGV2ZW50czoge30gfTtcbiAgICBwcml2LnF1ZXVlLnB1c2gocHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSk7XG4gIH1cbn07XG5cbi8vIHNldHVwIHZpZGVvcyBldmVudHMsIGFsbCBhcmUgYXZhaWxhYmxlIHB1YmxpY2FsbHksIG1vcmUgaW5mbyBjYW4gYmUgXG4vLyBmb3VuZCBhdCBkZXZlbG9wZXJzLmdvb2dsZS5jb20veW91dHViZS9pZnJhbWVfYXBpX3JlZmVyZW5jZSNFdmVudHNcbnByaXYuc2V0dXBFdmVudHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGV2ZW50cyA9IHt9O1xuICBldmVudHMub25SZWFkeSA9IHByaXYuZXZlbnRzLnJlYWR5O1xuICBldmVudHMub25TdGF0ZUNoYW5nZSA9IHByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlO1xuICBldmVudHMub25FcnJvciA9IHByaXYuZXZlbnRzLmVycm9yO1xuICBldmVudHMub25QbGF5YmFja1F1YWxpdHlDaGFuZ2UgPSBwcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2U7XG4gIGV2ZW50cy5vblBsYXliYWNrUmF0ZUNoYW5nZSA9IHByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZTtcbiAgZXZlbnRzLm9uQXBpQ2hhbmdlID0gcHJpdi5ldmVudHMuYXBpQ2hhbmdlO1xuICByZXR1cm4gZXZlbnRzO1xufTtcblxuLy8gdGhlIGlmcmFtZV9hcGkgYWxsb3dzIHVzIHRvIGF0dGFjaCBkb20gc3R5bGUgZXZlbnRzIHRvXG4vLyB2aWRlb3MsIHdlIGFsd2F5cyBmaXJlIHRoZXNlIGludGVybmFsbHksIGJ1dCB0aGVuIHdlIFxuLy8gYWxzbyBhbGxvdyB5b3UgdG8gYXR0YWNoIGV2ZW50cyB0byBhIHZpZGVvLCBieSBpdHMgaWRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuXG5wcml2LmV2ZW50cy5hcGlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnYXBpQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAnYXBpQ2hhbmdlJywgZSk7XG59O1xuXG4vLyBhY2NvcmRpbmcgdG8geW91dHViZSBkb2NzIHRoZXNlIHN0YXR1cyBjb2Rlc1xuLy8gcmVwcmVzZW50IHRoZSBzdGF0ZSBzdHJpbmcgdGhhdCBpcyBpbmRpY2F0aXZlXG4vLyBvZiB0aGUgZXJyb3JcbnByaXYuZXZlbnRzLmVycm9yID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAnaW52YWxpZCB2aWRlb0lkJztcbiAgaWYgKGUuZGF0YSA9PSAyIHx8IGUuZGF0YSA9PSAxMDApIHtcbiAgICAvLyBiYXNpY2FsbHkgbm90aGluZywgYXMgdGhlc2UgYXJlIGRlZmF1bHRzXG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDUpIHtcbiAgICBzdGF0ZSA9ICdodG1sNSBwbGF5ZXIgZXJyb3InO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSAxMDEgfHwgZS5kYXRhID09IDE1MCkge1xuICAgIHN0YXRlID0gJ2VtYmVkZGluZyBmb3JiaWRkZW4nO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnZXJyb3InLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnJlYWR5ID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3JlYWR5JywgZS50YXJnZXQuX2lkLCAncmVhZHknLCBlKTtcbn07XG5cbi8vIHdlIHRyYW5zZm9ybSB0aGUgY3VycmVudCBzdGF0ZSBgaWRgIHRvIGEgaHVtYW4gcmVhZGFibGVcbi8vIHN0cmluZyBiYXNlZCBvbiB0aGUgeW91dHViZSBhcGkgZG9jc1xucHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICd1bnN0YXJ0ZWQnO1xuICBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5CVUZGRVJJTkcpIHtcbiAgICBzdGF0ZSA9ICdidWZmZXJpbmcnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQ1VFRCkge1xuICAgIHN0YXRlID0gJ2N1ZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuRU5ERUQpIHtcbiAgICBzdGF0ZSA9ICdlbmRlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QQVVTRUQpIHtcbiAgICBzdGF0ZSA9ICdwYXVzZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUExBWUlORykge1xuICAgIHN0YXRlID0gJ3BsYXlpbmcnO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnc3RhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbi8vIHB1YmxpYyBvbiBldmVudCwgc28geW91IGNhbiBleHRlcm5hbGx5IGF0dGFjaCB0byB2aWRlb3NcbnZpZGVvQW5hbHl0aWNzLm9uID0gZnVuY3Rpb24oZXZlbnQsIGlkLCBmbikge1xuICB2YXIgcHJvY2Vzc29yID0gZnVuY3Rpb24obmV4dCkge1xuICAgIGlmIChwcml2LnZpZGVvc1tuZXh0XSkge1xuICAgICAgaWYgKCEocHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2ZW50XSBpbnN0YW5jZW9mIEFycmF5KSkgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2ZW50XSA9IFtdO1xuICAgICAgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2ZW50XS5wdXNoKGZuKTtcbiAgICB9XG4gIH07XG4gIC8vIGFjY2VwdHMgYCpgIGFzIGFuIGlkZW50aWZpZXIgb2YgYSBcImdsb2JhbFwiXG4gIC8vIGV2ZW50IHRoYXQgc2hvdWxkIGJlIGF0dGFjaGVkIHRvIGFsbCB2aWRlb3NcbiAgaWYgKGlkID09PSAnKicpIHtcbiAgICBPYmplY3Qua2V5cyhwcml2LnZpZGVvcykuZm9yRWFjaChwcm9jZXNzb3IpO1xuICB9IGVsc2Uge1xuICAgIHByb2Nlc3NvcihpZCk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gcHVibGljIHRyYWNraW5nIGV2ZW50LCBzbyB5b3UgYXR0YWNoIHZpZGVvcyBhZnRlciBkb21cbi8vIGxvYWQsIG9yIHdpdGggc29tZSBsYXRlbnQvYXN5bmMgcmVxdWVzdHNcbnZpZGVvQW5hbHl0aWNzLnRyYWNrID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHtcbiAgICBwcml2LmluamVjdFNjcmlwdHMoKTtcbiAgICBwcml2LmF0dGFjaFZpZGVvcygpO1xuICB9XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIGRlYnVnIG1vZGUsIGFsbG93cyB5b3UgdG8gY2FwdHVyZSBkZWJ1ZyBkYXRhIHNpbXBseVxudmlkZW9BbmFseXRpY3Muc2V0RGVidWcgPSBmdW5jdGlvbihib29sKSB7XG4gIHZhciBlbGVtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEteXQtZGVidWddJyk7XG4gIGJvb2wgPSB0eXBlb2YgYm9vbCAhPSAndW5kZWZpbmVkJyA/IGJvb2wgOiBudWxsO1xuICBpZiAoZWxlbSkge1xuICAgIHZhciBhdHRycyA9IGF0dHIoZWxlbSk7XG4gICAgdmlkZW9BbmFseXRpY3MuZGVidWcgPSBib29sID8gYm9vbCA6IGF0dHJzKCdkYXRhLXl0LWRlYnVnJykgPT0gJ3RydWUnO1xuICB9XG4gIGlmIChib29sICE9PSBudWxsKSB7XG4gICAgdmlkZW9BbmFseXRpY3MuZGVidWcgPSBib29sO1xuICB9XG4gIG1vbi5kZWJ1ZyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnO1xuICB2aWRlb0FuYWx5dGljcy5sb2dzID0gdmlkZW9BbmFseXRpY3MuZGVidWcgPyBtb24uaGlzdG9yeSA6IFtdO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyB3ZSB3YW50IHRvIGhhdmUgZXh0ZXJuYWwgYWNjZXNzIHRvIHRoZSB2aWRlb3Mgd2UncmVcbi8vIHRyYWNraW5nIGZvciBpbnRlcmFjdGlvbiB3aXRoIG90aGVyIGFwaXNcbnZpZGVvQW5hbHl0aWNzLnZpZGVvcyA9IHByaXYudmlkZW9zO1xuICBcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBwcml2LmluaXQsIGZhbHNlKTtcblxubW9kdWxlLmV4cG9ydHMgPSB2aWRlb0FuYWx5dGljczsiLCJ2YXIgYXR0ciA9IGZ1bmN0aW9uKGVsZW0pIHtcbiAgaWYgKHR5cGVvZiBlbGVtICE9ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICRhdHRyKGtleSwgdmFsKSB7XG4gICAgICBpZih0eXBlb2YgdmFsID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBlbGVtLmdldEF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIGlmICh2YWwgPT0gJ3JtJykge1xuICAgICAgICByZXR1cm4gZWxlbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBlbGVtLnNldEF0dHJpYnV0ZShrZXksIHZhbCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG52YXIgc2FmZVBhcnNlID0gZnVuY3Rpb24oc3RyKSB7XG4gIHZhciBvdXRwdXQgPSBudWxsO1xuICB0cnkge1xuICAgIG91dHB1dCA9IEpTT04ucGFyc2Uoc3RyKTtcbiAgfSBjYXRjaCAoZXgpIHt9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG52YXIgbW9uID0gZnVuY3Rpb24oZGVidWcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIG1vbikpIHJldHVybiBuZXcgbW9uKGRlYnVnKTtcbiAgdGhpcy5kZWJ1ZyA9IGRlYnVnO1xuICB0aGlzLmhpc3RvcnkgPSBbXTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb24ucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3AgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmhpc3RvcnkucHVzaChjcCk7XG4gIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgaWYodHlwZW9mIHdpbmRvd1snY29uc29sZSddICE9ICd1bmRlZmluZWQnICYmIGNvbnNvbGUubG9nKSB7XG4gICAgICBpZiAoY3AubGVuZ3RoID09PSAxICYmIHR5cGVvZiBjcFswXSA9PSAnb2JqZWN0JykgY3AgPSBKU09OLnN0cmluZ2lmeShjcFswXSxudWxsLDIpO1xuICAgICAgY29uc29sZS5sb2coY3ApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICBtb246IG1vbixcbiAgc2FmZVBhcnNlOiBzYWZlUGFyc2Vcbn07IiwidmFyIG1vbiA9IGZ1bmN0aW9uKGRlYnVnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBtb24pKSByZXR1cm4gbmV3IG1vbihkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxubW9uLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNwID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgdGhpcy5oaXN0b3J5LnB1c2goY3ApO1xuICBpZiAodGhpcy5kZWJ1Zykge1xuICAgIGlmKHR5cGVvZiB3aW5kb3dbJ2NvbnNvbGUnXSAhPSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLmxvZykge1xuICAgICAgaWYgKGNwLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY3BbMF0gPT0gJ29iamVjdCcpIGNwID0gSlNPTi5zdHJpbmdpZnkoY3BbMF0sbnVsbCwyKTtcbiAgICAgIGNvbnNvbGUubG9nKGNwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1vbjsiXX0=
(1)
});
