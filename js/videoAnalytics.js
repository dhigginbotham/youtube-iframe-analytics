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
videoAnalytics.on = function(events, id, fn) {
  var recurse = false, event;
  if (events instanceof Array) {
    recurse = events.length ? true : false;
    event = events.shift();
  } else {
    event = events;
  }
  var processor = function(next, ev) {
    if (priv.videos[next]) {
      if (!(priv.videos[next].events[ev] instanceof Array)) priv.videos[next].events[ev] = [];
      priv.videos[next].events[ev].push(fn);
    }
  };
  // accepts `*` as an identifier of a "global"
  // event that should be attached to all videos
  if (id === '*') {
    var vids = Object.keys(priv.videos);
    for(var i=0;i<vids.length;++i) {
      processor(vids[i], event);
    }
  } else {
    processor(id);
  }
  if (recurse) return videoAnalytics.on(events, id, fn);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV9lNWM1ZTBjMy5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgbW9uID0gcmVxdWlyZSgnLi9tb24nKShmYWxzZSk7XG52YXIgYXR0ciA9IGhlbHBlcnMuYXR0ciwgc2FmZVBhcnNlID0gaGVscGVycy5zYWZlUGFyc2U7XG5cbi8vIGFwaSBvYmplY3RzXG52YXIgdmlkZW9BbmFseXRpY3MgPSB7fSwgcHJpdiA9IHt9O1xuXG4vLyB3ZSB3YW50IHRvIGtlZXAgY29udGV4dCBvZiBvdXIgZG9tLCBzbyB3ZSBjYW4gZWFzaWx5IHJlZlxuLy8gdGhlIG5vZGVzIGxhdGVyIG9uXG5wcml2LnZpZGVvcyA9IHt9O1xuXG4vLyBlYWNoIGRvbSBub2RlIHdpbGwgaGF2ZSBldmVudHMgYXR0YWNoZWQgc28gd2UgY2FuIGVhc2lseVxuLy8gaW50ZXJhY3Qgd2l0aCB0aGVtLCB3ZSdsbCBkbyBzb21lIGRhdGEtYmluZGluZyB0byBjb2xsZWN0XG4vLyBvdXIgbm9kZXNcbnByaXYuZXZlbnRzID0ge307XG4gIFxuLy8gdmlkZW9zIHF1ZXVlLCBiZWNhdXNlIHdlIGxvYWQgYSAzcmQgcGFydHkgYXNzZXQgd2Ugd2FudFxuLy8gdG8gbWl0aWdhdGUgcmFjZSBjb25kaXRpb25zIG9mIFlUIG5vdCBiZWluZyByZWFkeSwgc29cbi8vIHdlIGtlZXAgYWxsIHVudHJhY2tlZCB2aWRlb3MgaW4gdGhpcyBxdWV1ZSBhbmQgc2hpZnQgXG4vLyB0aGVtIG91dCBhcyB3ZSBnZXQgdG8gdGhlbVxucHJpdi5xdWV1ZSA9IFtdO1xuXG4vLyBrZWVwIHRyYWNrIG9mIHlvdXR1YmUgY2FsbGluZyBvdXIgZm5cbnByaXYubG9hZGVkID0gZmFsc2U7XG5cbi8vIGluaXQgZm4gdGhhdCBoYXBwZW5zIG9uIERPTUNvbnRlbnRMb2FkZWRcbnByaXYuaW5pdCA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSBwcml2LmluamVjdFNjcmlwdHMoKTtcbn07XG5cbi8vIHRoZSB3YXkgdGhlIGlmcmFtZV9hcGkgd29ya3MgaXMgYnkgcmVwbGFjaW5nIGFuIGVsZW1lbnRcbi8vIHdpdGggYW4gaWZyYW1lLCBzbyB3ZSdsbCB3YW50IHRvIGF0dGFjaCB0aGUgdmlkZW8gYXMgXG4vLyBuZWVkZWRcbnByaXYuYXR0YWNoVmlkZW9zID0gZnVuY3Rpb24ocXVldWUpIHtcbiAgaWYgKHByaXYubG9hZGVkKSB7XG4gICAgdmFyIG5leHQ7XG4gICAgd2hpbGUobmV4dCA9IHF1ZXVlLnNoaWZ0KCkpIHtcbiAgICAgIG5leHQucGxheWVyID0gbmV3IFlULlBsYXllcihuZXh0LmVsLCBuZXh0Lm9wdHMpO1xuICAgICAgbmV4dC5wbGF5ZXIuX2lkID0gbmV4dC5vcHRzLnZpZGVvSWQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyB3ZSdsbCBydW4gdGhpcyBvbiBpbml0LCBvciBvbiBkZW1hbmQgZm9yIGxhdGVudCBsb2FkZWRcbi8vIGh0bWwgZnJhZ21lbnRzXG5wcml2LmNvbGxlY3REb20gPSBmdW5jdGlvbigpIHtcbiAgLy8gd2Ugd2FudCB0byBzZXQgZGVidWcgc3RhdGUgZmFpcmx5IGVhcmx5LCBzbyB3ZSdsbCBkb1xuICAvLyBpdCBiZWZvcmUgd2UgYWN0dWFsbHkgcXVlcnkgZm9yIGFueSB2aWRlb3MgdG8gc2V0dXBcbiAgdmlkZW9BbmFseXRpY3Muc2V0RGVidWcoKTtcbiAgdmFyIGRvbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXl0LWFuYWx5dGljc10nKTtcbiAgZm9yKHZhciBpPTA7aTxkb20ubGVuZ3RoOysraSkge1xuICAgIHByaXYucmVmZXJlbmNlT2JqZWN0KGRvbVtpXSk7XG4gIH1cbn07XG5cbi8vIHRoaXMgZnVuY3Rpb24gZ2V0cyBmaXJlZCB3aGVuIHlvdXR1YmUganMgaXMgaW5pdGlhbGl6ZWRcbi8vIGFsc28sIHRoaXMgc2FmZWx5IGFsbG93cyB1cyB0byBleHRlcm5hbGx5IHVzZSAudHJhY2tcbi8vIHdpdGhvdXQgcmFjZSBjb25kaXRpb25zXG5wcml2LmV4dGVybmFsQXBpUmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5sb2FkZWQgPSB0cnVlO1xuICBwcml2LmF0dGFjaFZpZGVvcyhwcml2LnF1ZXVlKTtcbn07XG5cbi8vIHdlIGluY2x1ZGUgeW91dHViZXMganMgc2NyaXB0IGFzeW5jLCBhbmQgd2UnbGwgbmVlZCB0byBcbi8vIGtlZXAgdHJhY2sgb2YgdGhlIHN0YXRlIG9mIHRoYXQgaW5jbHVkZVxucHJpdi5pbmplY3RTY3JpcHRzID0gZnVuY3Rpb24oZm4pIHtcbiAgaWYgKCFwcml2LnNjcmlwdEluY2x1ZGUpIHtcbiAgICAvLyB3ZSBvbmx5IHdhbnQgdG8gZG8gdGhpcyBvbmNlLCBhbmQgdGhpcyBpcyB0aGUgYmVzdFxuICAgIC8vIHRpbWUgdG8gZG8gdGhpcyBvbmNlLCB0aGlzIGFsc28ga2VlcHMgYWxsIG9mIHRoZVxuICAgIC8vIGNvbmRpdGlvbmFsIHN0dWZmIHRvIGEgc2luZ2xlIGVudHJ5LCBzbyBpdCB3b3Jrc1xuICAgIHdpbmRvd1snb25Zb3VUdWJlSWZyYW1lQVBJUmVhZHknXSA9IHByaXYuZXh0ZXJuYWxBcGlSZWFkeTtcblxuICAgIHZhciBwbGFjZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylbMF07XG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgXG4gICAgLy8gaWYgZm4sIGxldHMgdHJlYXQgYXN5bmMsIG90aGVyd2lzZSB3ZSdsbCBiZSBibG9ja2luZ1xuICAgIGlmICh0eXBlb2YgZm4gPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnYXN5bmMnLCB0cnVlKTtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZm4sIGZhbHNlKTtcbiAgICB9XG5cbiAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdzcmMnLCAnLy93d3cueW91dHViZS5jb20vaWZyYW1lX2FwaScpO1xuICAgIHBsYWNlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShwcml2LnNjcmlwdEluY2x1ZGUsIHBsYWNlbWVudCk7XG4gIH1cbn07XG5cbi8vIHdlIHdhbnQgdG8gc3RhbmRhcmRpemUgaG93IHdlIGhhbmRsZSBldmVudHMsIHRoaXMgaXMgdGhlXG4vLyBmbiB0aGF0IGhhbmRsZXMgc3VjaCB0aGluZ3NcbnByaXYucHJvY2Vzc0V2ZW50cyA9IGZ1bmN0aW9uKGtleSwgaWQsIHN0YXRlLCBlKSB7XG4gIHZhciBldmVudHMgPSBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0sXG4gICAgICBwbGF5ZXIgPSBwcml2LnZpZGVvc1tpZF0ucGxheWVyO1xuICAvLyBpZiB3ZSBnZXQgYXQgb3VyIHZpZGVvcyBleHRlcm5hbGx5LCB3ZSB3aWxsIGxpa2VseVxuICAvLyB3YW50IHRvIGtub3cgd2hhdGV2ZXIgdGhlIHN0YXRlIG9mIHRoZSBjdXJyZW50IHZpZGVvXG4gIC8vIGlzIGluXG4gIHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgLy8gdGl0bGUgd2lsbCBmYWxsYmFjayB0byB0aGUgaWQsIHNvIHdlIGNhbiBkZXRlY3Qgd2hlblxuICAvLyB3ZSBjYW4gY2FsbCBvbiB0aGUgeW91dHViZSBhcGkgdG8gZ2V0IHRoZSB2aWRlbyB0aXRsZVxuICAvLyB0aGlzIHdpbGwgYWxsb3cgdXMgdG8gaGF2ZSBodW1hbiByZWFkYWJsZSB0aXRsZXNcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID09IGlkKSB7XG4gICAgLy8gd2UgZG9uJ3Qgd2FudCB0byBhY2NlcHQgYW55IHVuZGVmaW5lZCB2aWRlbyB0aXRsZXMsXG4gICAgLy8gc28gd2UnbGwgZ3JhY2VmdWxseSBmYWxsYmFjayB0byBvdXIgaWQsIHRoaXMgcmVhbGx5XG4gICAgLy8gb25seSBoYXBwZW5zIHdoZW4gd2UgYXJlIGluIGEgdmlkZW8gZXJyb3Igc3RhdGVzXG4gICAgcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPSBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgPyBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgOiBpZDtcbiAgfVxuICAvLyBZb3VUdWJlIHJlY29yZHMgdmlkZW8gdGltZXMgYXMgYSBmbG9hdCwgaSBhbVxuICAvLyBhc3N1bWluZyB3ZSB3b24ndCBuZWVkL3dhbnQgdG8gaGF2ZSBzdWNoIHByZWNpc2lvblxuICAvLyBoZXJlIHdpdGggdGhlIE1hdGguZmxvb3IoKSBjYWxsc1xuICB2YXIgZXZlbnRTdGF0ZSA9IHtcbiAgICBjdXJyZW50VGltZTogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSksIFxuICAgIGR1cmF0aW9uOiBNYXRoLmZsb29yKHBsYXllci5nZXREdXJhdGlvbigpKSxcbiAgICBldmVudDoga2V5LFxuICAgIGlkOiBpZCxcbiAgICB0aXRsZTogcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUsXG4gICAgc3RhdGU6IHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUsXG4gICAgbXV0ZWQ6IHBsYXllci5pc011dGVkKCksXG4gICAgbXM6IG5ldyBEYXRlKCkuZ2V0VGltZSgpXG4gIH07XG4gIGlmIChwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0pIHtcbiAgICBmb3IodmFyIGk9MDtpPGV2ZW50cy5sZW5ndGg7KytpKSB7XG4gICAgICBldmVudHNbaV0oZSwgZXZlbnRTdGF0ZSk7XG4gICAgfVxuICB9XG4gIG1vbi5sb2coZXZlbnRTdGF0ZSk7XG59O1xuXG4vLyBzZXRzIHVwIG91ciBkb20gb2JqZWN0LCBzbyB3ZSBoYXZlIGEgc3RyaWN0IHNjaGVtYSB0byBcbi8vIGFkaGVyZSB0byBsYXRlciBvbiBpbiB0aGUgYXBpIFxucHJpdi5yZWZlcmVuY2VPYmplY3QgPSBmdW5jdGlvbihlbCkge1xuICB2YXIgb3B0cyA9IHt9LCBhdHRycyA9IGF0dHIoZWwpO1xuICBvcHRzLnZpZGVvSWQgPSBhdHRycygnZGF0YS15dC1hbmFseXRpY3MnKTtcbiAgaWYgKGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnKSA9PSBudWxsKSB7XG4gICAgYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcsIHRydWUpO1xuXG4gICAgLy8gZ2V0IG9wdHMgZnJvbSBkYXRhIGF0dHJzXG4gICAgb3B0cy53aWR0aCA9IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgPyBhdHRycygnZGF0YS15dC13aWR0aCcpIDogNjQwO1xuICAgIG9wdHMuaGVpZ2h0ID0gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgPyBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA6IDM5MDtcbiAgICBvcHRzLnBsYXllclZhcnMgPSBhdHRycygnZGF0YS15dC12YXJzJykgPyBzYWZlUGFyc2UoYXR0cnMoJ2RhdGEteXQtdmFycycpKSA6IG51bGw7XG4gICAgb3B0cy50aXRsZSA9IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgPyBhdHRycygnZGF0YS15dC10aXRsZScpIDogb3B0cy52aWRlb0lkO1xuICAgIFxuICAgIC8vIHNldHVwIGJhc2UgZXZlbnRzXG4gICAgb3B0cy5ldmVudHMgPSBwcml2LnNldHVwRXZlbnRzKCk7XG4gICAgXG4gICAgLy8gYnVpbGQgdmlkZW8gb2JqZWN0IHRvIHN0b3JlXG4gICAgcHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSA9IHsgb3B0czogb3B0cywgZWw6IGVsLCBldmVudHM6IHt9IH07XG4gICAgcHJpdi5xdWV1ZS5wdXNoKHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0pO1xuICB9XG59O1xuXG4vLyBzZXR1cCB2aWRlb3MgZXZlbnRzLCBhbGwgYXJlIGF2YWlsYWJsZSBwdWJsaWNhbGx5LCBtb3JlIGluZm8gY2FuIGJlIFxuLy8gZm91bmQgYXQgZGV2ZWxvcGVycy5nb29nbGUuY29tL3lvdXR1YmUvaWZyYW1lX2FwaV9yZWZlcmVuY2UjRXZlbnRzXG5wcml2LnNldHVwRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gIHZhciBldmVudHMgPSB7fTtcbiAgZXZlbnRzLm9uUmVhZHkgPSBwcml2LmV2ZW50cy5yZWFkeTtcbiAgZXZlbnRzLm9uU3RhdGVDaGFuZ2UgPSBwcml2LmV2ZW50cy5zdGF0ZUNoYW5nZTtcbiAgZXZlbnRzLm9uRXJyb3IgPSBwcml2LmV2ZW50cy5lcnJvcjtcbiAgZXZlbnRzLm9uUGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gcHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlO1xuICBldmVudHMub25QbGF5YmFja1JhdGVDaGFuZ2UgPSBwcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2U7XG4gIGV2ZW50cy5vbkFwaUNoYW5nZSA9IHByaXYuZXZlbnRzLmFwaUNoYW5nZTtcbiAgcmV0dXJuIGV2ZW50cztcbn07XG5cbi8vIHRoZSBpZnJhbWVfYXBpIGFsbG93cyB1cyB0byBhdHRhY2ggZG9tIHN0eWxlIGV2ZW50cyB0b1xuLy8gdmlkZW9zLCB3ZSBhbHdheXMgZmlyZSB0aGVzZSBpbnRlcm5hbGx5LCBidXQgdGhlbiB3ZSBcbi8vIGFsc28gYWxsb3cgeW91IHRvIGF0dGFjaCBldmVudHMgdG8gYSB2aWRlbywgYnkgaXRzIGlkXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy9cblxucHJpdi5ldmVudHMuYXBpQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ2FwaUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ2FwaUNoYW5nZScsIGUpO1xufTtcblxuLy8gYWNjb3JkaW5nIHRvIHlvdXR1YmUgZG9jcyB0aGVzZSBzdGF0dXMgY29kZXNcbi8vIHJlcHJlc2VudCB0aGUgc3RhdGUgc3RyaW5nIHRoYXQgaXMgaW5kaWNhdGl2ZVxuLy8gb2YgdGhlIGVycm9yXG5wcml2LmV2ZW50cy5lcnJvciA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ2ludmFsaWQgdmlkZW9JZCc7XG4gIGlmIChlLmRhdGEgPT0gMiB8fCBlLmRhdGEgPT0gMTAwKSB7XG4gICAgLy8gYmFzaWNhbGx5IG5vdGhpbmcsIGFzIHRoZXNlIGFyZSBkZWZhdWx0c1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSA1KSB7XG4gICAgc3RhdGUgPSAnaHRtbDUgcGxheWVyIGVycm9yJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gMTAxIHx8IGUuZGF0YSA9PSAxNTApIHtcbiAgICBzdGF0ZSA9ICdlbWJlZGRpbmcgZm9yYmlkZGVuJztcbiAgfVxuICBwcml2LnByb2Nlc3NFdmVudHMoJ2Vycm9yJywgZS50YXJnZXQuX2lkLCBzdGF0ZSwgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncGxheWJhY2tSYXRlQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAncGxheWJhY2tSYXRlQ2hhbmdlJywgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncGxheWJhY2tRdWFsaXR5Q2hhbmdlJywgZS50YXJnZXQuX2lkLCAncGxheWJhY2tRdWFsaXR5Q2hhbmdlJywgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5yZWFkeSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdyZWFkeScsIGUudGFyZ2V0Ll9pZCwgJ3JlYWR5JywgZSk7XG59O1xuXG4vLyB3ZSB0cmFuc2Zvcm0gdGhlIGN1cnJlbnQgc3RhdGUgYGlkYCB0byBhIGh1bWFuIHJlYWRhYmxlXG4vLyBzdHJpbmcgYmFzZWQgb24gdGhlIHlvdXR1YmUgYXBpIGRvY3NcbnByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAndW5zdGFydGVkJztcbiAgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQlVGRkVSSU5HKSB7XG4gICAgc3RhdGUgPSAnYnVmZmVyaW5nJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkNVRUQpIHtcbiAgICBzdGF0ZSA9ICdjdWVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkVOREVEKSB7XG4gICAgc3RhdGUgPSAnZW5kZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUEFVU0VEKSB7XG4gICAgc3RhdGUgPSAncGF1c2VkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBMQVlJTkcpIHtcbiAgICBzdGF0ZSA9ICdwbGF5aW5nJztcbiAgfVxuICBwcml2LnByb2Nlc3NFdmVudHMoJ3N0YXRlQ2hhbmdlJywgZS50YXJnZXQuX2lkLCBzdGF0ZSwgZSk7XG59O1xuXG4vLyBwdWJsaWMgb24gZXZlbnQsIHNvIHlvdSBjYW4gZXh0ZXJuYWxseSBhdHRhY2ggdG8gdmlkZW9zXG52aWRlb0FuYWx5dGljcy5vbiA9IGZ1bmN0aW9uKGV2ZW50cywgaWQsIGZuKSB7XG4gIHZhciByZWN1cnNlID0gZmFsc2UsIGV2ZW50O1xuICBpZiAoZXZlbnRzIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZWN1cnNlID0gZXZlbnRzLmxlbmd0aCA/IHRydWUgOiBmYWxzZTtcbiAgICBldmVudCA9IGV2ZW50cy5zaGlmdCgpO1xuICB9IGVsc2Uge1xuICAgIGV2ZW50ID0gZXZlbnRzO1xuICB9XG4gIHZhciBwcm9jZXNzb3IgPSBmdW5jdGlvbihuZXh0LCBldikge1xuICAgIGlmIChwcml2LnZpZGVvc1tuZXh0XSkge1xuICAgICAgaWYgKCEocHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2XSBpbnN0YW5jZW9mIEFycmF5KSkgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2XSA9IFtdO1xuICAgICAgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2XS5wdXNoKGZuKTtcbiAgICB9XG4gIH07XG4gIC8vIGFjY2VwdHMgYCpgIGFzIGFuIGlkZW50aWZpZXIgb2YgYSBcImdsb2JhbFwiXG4gIC8vIGV2ZW50IHRoYXQgc2hvdWxkIGJlIGF0dGFjaGVkIHRvIGFsbCB2aWRlb3NcbiAgaWYgKGlkID09PSAnKicpIHtcbiAgICB2YXIgdmlkcyA9IE9iamVjdC5rZXlzKHByaXYudmlkZW9zKTtcbiAgICBmb3IodmFyIGk9MDtpPHZpZHMubGVuZ3RoOysraSkge1xuICAgICAgcHJvY2Vzc29yKHZpZHNbaV0sIGV2ZW50KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcHJvY2Vzc29yKGlkKTtcbiAgfVxuICBpZiAocmVjdXJzZSkgcmV0dXJuIHZpZGVvQW5hbHl0aWNzLm9uKGV2ZW50cywgaWQsIGZuKTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gcHVibGljIHRyYWNraW5nIGV2ZW50LCBzbyB5b3UgYXR0YWNoIHZpZGVvcyBhZnRlciBkb21cbi8vIGxvYWQsIG9yIHdpdGggc29tZSBsYXRlbnQvYXN5bmMgcmVxdWVzdHNcbnZpZGVvQW5hbHl0aWNzLnRyYWNrID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHtcbiAgICBwcml2LmluamVjdFNjcmlwdHMoKTtcbiAgICBwcml2LmF0dGFjaFZpZGVvcyhwcml2LnF1ZXVlKTtcbiAgfVxuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBkZWJ1ZyBtb2RlLCBhbGxvd3MgeW91IHRvIGNhcHR1cmUgZGVidWcgZGF0YSBzaW1wbHlcbnZpZGVvQW5hbHl0aWNzLnNldERlYnVnID0gZnVuY3Rpb24oYm9vbCkge1xuICB2YXIgZWxlbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXl0LWRlYnVnXScpO1xuICBib29sID0gdHlwZW9mIGJvb2wgIT0gJ3VuZGVmaW5lZCcgPyBib29sIDogbnVsbDtcbiAgaWYgKGVsZW0pIHtcbiAgICB2YXIgYXR0cnMgPSBhdHRyKGVsZW0pO1xuICAgIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYXR0cnMoJ2RhdGEteXQtZGVidWcnKSA9PSAndHJ1ZSc7XG4gIH1cbiAgaWYgKGJvb2wgIT09IG51bGwpIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYm9vbDtcbiAgbW9uLmRlYnVnID0gdmlkZW9BbmFseXRpY3MuZGVidWc7XG4gIHZpZGVvQW5hbHl0aWNzLmxvZ3MgPSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA/IG1vbi5oaXN0b3J5IDogW107XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHdlIHdhbnQgdG8gaGF2ZSBleHRlcm5hbCBhY2Nlc3MgdG8gdGhlIHZpZGVvcyB3ZSdyZVxuLy8gdHJhY2tpbmcgZm9yIGludGVyYWN0aW9uIHdpdGggb3RoZXIgYXBpc1xudmlkZW9BbmFseXRpY3MudmlkZW9zID0gcHJpdi52aWRlb3M7XG4gIFxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIHByaXYuaW5pdCwgZmFsc2UpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHZpZGVvQW5hbHl0aWNzOyIsInZhciBhdHRyID0gZnVuY3Rpb24oZWxlbSkge1xuICBpZiAodHlwZW9mIGVsZW0gIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gJGF0dHIoa2V5LCB2YWwpIHtcbiAgICAgIGlmKHR5cGVvZiB2YWwgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0uZ2V0QXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2UgaWYgKHZhbCA9PSAncm0nKSB7XG4gICAgICAgIHJldHVybiBlbGVtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGVsZW0uc2V0QXR0cmlidXRlKGtleSwgdmFsKTtcbiAgICAgIH1cbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbnZhciBzYWZlUGFyc2UgPSBmdW5jdGlvbihzdHIpIHtcbiAgdmFyIG91dHB1dCA9IG51bGw7XG4gIHRyeSB7XG4gICAgb3V0cHV0ID0gSlNPTi5wYXJzZShzdHIpO1xuICB9IGNhdGNoIChleCkge31cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICBzYWZlUGFyc2U6IHNhZmVQYXJzZVxufTsiLCJ2YXIgTW9uID0gZnVuY3Rpb24oZGVidWcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1vbikpIHJldHVybiBuZXcgTW9uKGRlYnVnKTtcbiAgdGhpcy5kZWJ1ZyA9IGRlYnVnO1xuICB0aGlzLmhpc3RvcnkgPSBbXTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5Nb24ucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3AgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmhpc3RvcnkucHVzaChjcCk7XG4gIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgaWYodHlwZW9mIHdpbmRvd1snY29uc29sZSddICE9ICd1bmRlZmluZWQnICYmIGNvbnNvbGUubG9nKSB7XG4gICAgICBpZiAoY3AubGVuZ3RoID09PSAxICYmIHR5cGVvZiBjcFswXSA9PSAnb2JqZWN0JykgY3AgPSBKU09OLnN0cmluZ2lmeShjcFswXSxudWxsLDIpO1xuICAgICAgY29uc29sZS5sb2coY3ApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTW9uOyJdfQ==
(1)
});
