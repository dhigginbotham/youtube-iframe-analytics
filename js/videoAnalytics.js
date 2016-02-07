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
  // this will allow us to have human readable titles, 
  // without the overhead
  if (priv.videos[id].opts.title == id) {
    // we don't want to accept any undefined video titles,
    // so we'll gracefully fallback to our id, this really
    // only happens when we are in a video error state
    priv.videos[id].opts.title = player.getVideoData().title ? player.getVideoData().title : id;
  }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV82OTMzMWM0OS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBtb24gPSByZXF1aXJlKCcuL21vbicpKGZhbHNlKTtcbnZhciBhdHRyID0gaGVscGVycy5hdHRyLCBzYWZlUGFyc2UgPSBoZWxwZXJzLnNhZmVQYXJzZTtcblxuLy8gYXBpIG9iamVjdHNcbnZhciB2aWRlb0FuYWx5dGljcyA9IHt9LCBwcml2ID0ge307XG5cbi8vIHdlIHdhbnQgdG8ga2VlcCBjb250ZXh0IG9mIG91ciBkb20sIHNvIHdlIGNhbiBlYXNpbHkgcmVmXG4vLyB0aGUgbm9kZXMgbGF0ZXIgb25cbnByaXYudmlkZW9zID0ge307XG5cbi8vIGVhY2ggZG9tIG5vZGUgd2lsbCBoYXZlIGV2ZW50cyBhdHRhY2hlZCBzbyB3ZSBjYW4gZWFzaWx5XG4vLyBpbnRlcmFjdCB3aXRoIHRoZW0sIHdlJ2xsIGRvIHNvbWUgZGF0YS1iaW5kaW5nIHRvIGNvbGxlY3Rcbi8vIG91ciBub2Rlc1xucHJpdi5ldmVudHMgPSB7fTtcbiAgXG4vLyB2aWRlb3MgcXVldWUsIGJlY2F1c2Ugd2UgbG9hZCBhIDNyZCBwYXJ0eSBhc3NldCB3ZSB3YW50XG4vLyB0byBtaXRpZ2F0ZSByYWNlIGNvbmRpdGlvbnMgb2YgWVQgbm90IGJlaW5nIHJlYWR5LCBzb1xuLy8gd2Uga2VlcCBhbGwgdW50cmFja2VkIHZpZGVvcyBpbiB0aGlzIHF1ZXVlIGFuZCBzaGlmdCBcbi8vIHRoZW0gb3V0IGFzIHdlIGdldCB0byB0aGVtXG5wcml2LnF1ZXVlID0gW107XG5cbi8vIGtlZXAgdHJhY2sgb2YgeW91dHViZSBjYWxsaW5nIG91ciBmblxucHJpdi5sb2FkZWQgPSBmYWxzZTtcblxuLy8gaW5pdCBmbiB0aGF0IGhhcHBlbnMgb24gRE9NQ29udGVudExvYWRlZFxucHJpdi5pbml0ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHByaXYuaW5qZWN0U2NyaXB0cygpO1xufTtcblxuLy8gdGhlIHdheSB0aGUgaWZyYW1lX2FwaSB3b3JrcyBpcyBieSByZXBsYWNpbmcgYW4gZWxlbWVudFxuLy8gd2l0aCBhbiBpZnJhbWUsIHNvIHdlJ2xsIHdhbnQgdG8gYXR0YWNoIHRoZSB2aWRlbyBhcyBcbi8vIG5lZWRlZFxucHJpdi5hdHRhY2hWaWRlb3MgPSBmdW5jdGlvbihxdWV1ZSkge1xuICBpZiAocHJpdi5sb2FkZWQpIHtcbiAgICB2YXIgbmV4dDtcbiAgICB3aGlsZShuZXh0ID0gcXVldWUuc2hpZnQoKSkge1xuICAgICAgbmV4dC5wbGF5ZXIgPSBuZXcgWVQuUGxheWVyKG5leHQuZWwsIG5leHQub3B0cyk7XG4gICAgICBuZXh0LnBsYXllci5faWQgPSBuZXh0Lm9wdHMudmlkZW9JZDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIHdlJ2xsIHJ1biB0aGlzIG9uIGluaXQsIG9yIG9uIGRlbWFuZCBmb3IgbGF0ZW50IGxvYWRlZFxuLy8gaHRtbCBmcmFnbWVudHNcbnByaXYuY29sbGVjdERvbSA9IGZ1bmN0aW9uKCkge1xuICAvLyB3ZSB3YW50IHRvIHNldCBkZWJ1ZyBzdGF0ZSBmYWlybHkgZWFybHksIHNvIHdlJ2xsIGRvXG4gIC8vIGl0IGJlZm9yZSB3ZSBhY3R1YWxseSBxdWVyeSBmb3IgYW55IHZpZGVvcyB0byBzZXR1cFxuICB2aWRlb0FuYWx5dGljcy5zZXREZWJ1ZygpO1xuICB2YXIgZG9tID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEteXQtYW5hbHl0aWNzXScpO1xuICBmb3IodmFyIGk9MDtpPGRvbS5sZW5ndGg7KytpKSB7XG4gICAgcHJpdi5yZWZlcmVuY2VPYmplY3QoZG9tW2ldKTtcbiAgfVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBnZXRzIGZpcmVkIHdoZW4geW91dHViZSBqcyBpcyBpbml0aWFsaXplZFxuLy8gYWxzbywgdGhpcyBzYWZlbHkgYWxsb3dzIHVzIHRvIGV4dGVybmFsbHkgdXNlIC50cmFja1xuLy8gd2l0aG91dCByYWNlIGNvbmRpdGlvbnNcbnByaXYuZXh0ZXJuYWxBcGlSZWFkeSA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmxvYWRlZCA9IHRydWU7XG4gIHByaXYuYXR0YWNoVmlkZW9zKHByaXYucXVldWUpO1xufTtcblxuLy8gd2UgaW5jbHVkZSB5b3V0dWJlcyBqcyBzY3JpcHQgYXN5bmMsIGFuZCB3ZSdsbCBuZWVkIHRvIFxuLy8ga2VlcCB0cmFjayBvZiB0aGUgc3RhdGUgb2YgdGhhdCBpbmNsdWRlXG5wcml2LmluamVjdFNjcmlwdHMgPSBmdW5jdGlvbihmbikge1xuICBpZiAoIXByaXYuc2NyaXB0SW5jbHVkZSkge1xuICAgIC8vIHdlIG9ubHkgd2FudCB0byBkbyB0aGlzIG9uY2UsIGFuZCB0aGlzIGlzIHRoZSBiZXN0XG4gICAgLy8gdGltZSB0byBkbyB0aGlzIG9uY2UsIHRoaXMgYWxzbyBrZWVwcyBhbGwgb2YgdGhlXG4gICAgLy8gY29uZGl0aW9uYWwgc3R1ZmYgdG8gYSBzaW5nbGUgZW50cnksIHNvIGl0IHdvcmtzXG4gICAgd2luZG93WydvbllvdVR1YmVJZnJhbWVBUElSZWFkeSddID0gcHJpdi5leHRlcm5hbEFwaVJlYWR5O1xuXG4gICAgdmFyIHBsYWNlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXTtcbiAgICBwcml2LnNjcmlwdEluY2x1ZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICBcbiAgICAvLyBpZiBmbiwgbGV0cyB0cmVhdCBhc3luYywgb3RoZXJ3aXNlIHdlJ2xsIGJlIGJsb2NraW5nXG4gICAgaWYgKHR5cGVvZiBmbiA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdhc3luYycsIHRydWUpO1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmbiwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ3NyYycsICcvL3d3dy55b3V0dWJlLmNvbS9pZnJhbWVfYXBpJyk7XG4gICAgcGxhY2VtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHByaXYuc2NyaXB0SW5jbHVkZSwgcGxhY2VtZW50KTtcbiAgfVxufTtcblxuLy8gd2Ugd2FudCB0byBzdGFuZGFyZGl6ZSBob3cgd2UgaGFuZGxlIGV2ZW50cywgdGhpcyBpcyB0aGVcbi8vIGZuIHRoYXQgaGFuZGxlcyBzdWNoIHRoaW5nc1xucHJpdi5wcm9jZXNzRXZlbnRzID0gZnVuY3Rpb24oa2V5LCBpZCwgc3RhdGUsIGUpIHtcbiAgdmFyIGV2ZW50cyA9IHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSxcbiAgICAgIHBsYXllciA9IHByaXYudmlkZW9zW2lkXS5wbGF5ZXI7XG4gIC8vIGlmIHdlIGdldCBhdCBvdXIgdmlkZW9zIGV4dGVybmFsbHksIHdlIHdpbGwgbGlrZWx5XG4gIC8vIHdhbnQgdG8ga25vdyB3aGF0ZXZlciB0aGUgc3RhdGUgb2YgdGhlIGN1cnJlbnQgdmlkZW9cbiAgLy8gaXMgaW5cbiAgcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAvLyB0aXRsZSB3aWxsIGZhbGxiYWNrIHRvIHRoZSBpZCwgc28gd2UgY2FuIGRldGVjdCB3aGVuXG4gIC8vIHdlIGNhbiBjYWxsIG9uIHRoZSB5b3V0dWJlIGFwaSB0byBnZXQgdGhlIHZpZGVvIHRpdGxlXG4gIC8vIHRoaXMgd2lsbCBhbGxvdyB1cyB0byBoYXZlIGh1bWFuIHJlYWRhYmxlIHRpdGxlcywgXG4gIC8vIHdpdGhvdXQgdGhlIG92ZXJoZWFkXG4gIGlmIChwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9PSBpZCkge1xuICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gYWNjZXB0IGFueSB1bmRlZmluZWQgdmlkZW8gdGl0bGVzLFxuICAgIC8vIHNvIHdlJ2xsIGdyYWNlZnVsbHkgZmFsbGJhY2sgdG8gb3VyIGlkLCB0aGlzIHJlYWxseVxuICAgIC8vIG9ubHkgaGFwcGVucyB3aGVuIHdlIGFyZSBpbiBhIHZpZGVvIGVycm9yIHN0YXRlXG4gICAgcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPSBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgPyBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgOiBpZDtcbiAgfVxuICB2YXIgZXZlbnRTdGF0ZSA9IHtcbiAgICBjdXJyZW50VGltZTogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSksIFxuICAgIGR1cmF0aW9uOiBNYXRoLmZsb29yKHBsYXllci5nZXREdXJhdGlvbigpKSxcbiAgICBldmVudDoga2V5LFxuICAgIGlkOiBpZCxcbiAgICB0aXRsZTogcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUsXG4gICAgc3RhdGU6IHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUsXG4gICAgbXV0ZWQ6IHBsYXllci5pc011dGVkKCksXG4gICAgbXM6IG5ldyBEYXRlKCkuZ2V0VGltZSgpXG4gIH07XG4gIGlmIChwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0pIHtcbiAgICBmb3IodmFyIGk9MDtpPGV2ZW50cy5sZW5ndGg7KytpKSB7XG4gICAgICBldmVudHNbaV0oZSwgZXZlbnRTdGF0ZSk7XG4gICAgfVxuICB9XG4gIG1vbi5sb2coZXZlbnRTdGF0ZSk7XG59O1xuXG4vLyBzZXRzIHVwIG91ciBkb20gb2JqZWN0LCBzbyB3ZSBoYXZlIGEgc3RyaWN0IHNjaGVtYSB0byBcbi8vIGFkaGVyZSB0byBsYXRlciBvbiBpbiB0aGUgYXBpIFxucHJpdi5yZWZlcmVuY2VPYmplY3QgPSBmdW5jdGlvbihlbCkge1xuICB2YXIgb3B0cyA9IHt9LCBhdHRycyA9IGF0dHIoZWwpO1xuICBvcHRzLnZpZGVvSWQgPSBhdHRycygnZGF0YS15dC1hbmFseXRpY3MnKTtcbiAgaWYgKGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnKSA9PSBudWxsKSB7XG4gICAgYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcsIHRydWUpO1xuXG4gICAgLy8gZ2V0IG9wdHMgZnJvbSBkYXRhIGF0dHJzXG4gICAgb3B0cy53aWR0aCA9IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgPyBhdHRycygnZGF0YS15dC13aWR0aCcpIDogNjQwO1xuICAgIG9wdHMuaGVpZ2h0ID0gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgPyBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA6IDM5MDtcbiAgICBvcHRzLnBsYXllclZhcnMgPSBhdHRycygnZGF0YS15dC12YXJzJykgPyBzYWZlUGFyc2UoYXR0cnMoJ2RhdGEteXQtdmFycycpKSA6IG51bGw7XG4gICAgb3B0cy50aXRsZSA9IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgPyBhdHRycygnZGF0YS15dC10aXRsZScpIDogb3B0cy52aWRlb0lkO1xuICAgIFxuICAgIC8vIHNldHVwIGJhc2UgZXZlbnRzXG4gICAgb3B0cy5ldmVudHMgPSBwcml2LnNldHVwRXZlbnRzKCk7XG4gICAgXG4gICAgLy8gYnVpbGQgdmlkZW8gb2JqZWN0IHRvIHN0b3JlXG4gICAgcHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSA9IHsgb3B0czogb3B0cywgZWw6IGVsLCBldmVudHM6IHt9IH07XG4gICAgcHJpdi5xdWV1ZS5wdXNoKHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0pO1xuICB9XG59O1xuXG4vLyBzZXR1cCB2aWRlb3MgZXZlbnRzLCBhbGwgYXJlIGF2YWlsYWJsZSBwdWJsaWNhbGx5LCBtb3JlIGluZm8gY2FuIGJlIFxuLy8gZm91bmQgYXQgZGV2ZWxvcGVycy5nb29nbGUuY29tL3lvdXR1YmUvaWZyYW1lX2FwaV9yZWZlcmVuY2UjRXZlbnRzXG5wcml2LnNldHVwRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gIHZhciBldmVudHMgPSB7fTtcbiAgZXZlbnRzLm9uUmVhZHkgPSBwcml2LmV2ZW50cy5yZWFkeTtcbiAgZXZlbnRzLm9uU3RhdGVDaGFuZ2UgPSBwcml2LmV2ZW50cy5zdGF0ZUNoYW5nZTtcbiAgZXZlbnRzLm9uRXJyb3IgPSBwcml2LmV2ZW50cy5lcnJvcjtcbiAgZXZlbnRzLm9uUGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gcHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlO1xuICBldmVudHMub25QbGF5YmFja1JhdGVDaGFuZ2UgPSBwcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2U7XG4gIGV2ZW50cy5vbkFwaUNoYW5nZSA9IHByaXYuZXZlbnRzLmFwaUNoYW5nZTtcbiAgcmV0dXJuIGV2ZW50cztcbn07XG5cbi8vIHRoZSBpZnJhbWVfYXBpIGFsbG93cyB1cyB0byBhdHRhY2ggZG9tIHN0eWxlIGV2ZW50cyB0b1xuLy8gdmlkZW9zLCB3ZSBhbHdheXMgZmlyZSB0aGVzZSBpbnRlcm5hbGx5LCBidXQgdGhlbiB3ZSBcbi8vIGFsc28gYWxsb3cgeW91IHRvIGF0dGFjaCBldmVudHMgdG8gYSB2aWRlbywgYnkgaXRzIGlkXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy9cblxucHJpdi5ldmVudHMuYXBpQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ2FwaUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ2FwaUNoYW5nZScsIGUpO1xufTtcblxuLy8gYWNjb3JkaW5nIHRvIHlvdXR1YmUgZG9jcyB0aGVzZSBzdGF0dXMgY29kZXNcbi8vIHJlcHJlc2VudCB0aGUgc3RhdGUgc3RyaW5nIHRoYXQgaXMgaW5kaWNhdGl2ZVxuLy8gb2YgdGhlIGVycm9yXG5wcml2LmV2ZW50cy5lcnJvciA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ2ludmFsaWQgdmlkZW9JZCc7XG4gIGlmIChlLmRhdGEgPT0gMiB8fCBlLmRhdGEgPT0gMTAwKSB7XG4gICAgLy8gYmFzaWNhbGx5IG5vdGhpbmcsIGFzIHRoZXNlIGFyZSBkZWZhdWx0c1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSA1KSB7XG4gICAgc3RhdGUgPSAnaHRtbDUgcGxheWVyIGVycm9yJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gMTAxIHx8IGUuZGF0YSA9PSAxNTApIHtcbiAgICBzdGF0ZSA9ICdlbWJlZGRpbmcgZm9yYmlkZGVuJztcbiAgfVxuICBwcml2LnByb2Nlc3NFdmVudHMoJ2Vycm9yJywgZS50YXJnZXQuX2lkLCBzdGF0ZSwgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncGxheWJhY2tSYXRlQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAncGxheWJhY2tSYXRlQ2hhbmdlJywgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncGxheWJhY2tRdWFsaXR5Q2hhbmdlJywgZS50YXJnZXQuX2lkLCAncGxheWJhY2tRdWFsaXR5Q2hhbmdlJywgZSk7XG59O1xuXG5wcml2LmV2ZW50cy5yZWFkeSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdyZWFkeScsIGUudGFyZ2V0Ll9pZCwgJ3JlYWR5JywgZSk7XG59O1xuXG4vLyB3ZSB0cmFuc2Zvcm0gdGhlIGN1cnJlbnQgc3RhdGUgYGlkYCB0byBhIGh1bWFuIHJlYWRhYmxlXG4vLyBzdHJpbmcgYmFzZWQgb24gdGhlIHlvdXR1YmUgYXBpIGRvY3NcbnByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAndW5zdGFydGVkJztcbiAgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQlVGRkVSSU5HKSB7XG4gICAgc3RhdGUgPSAnYnVmZmVyaW5nJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkNVRUQpIHtcbiAgICBzdGF0ZSA9ICdjdWVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkVOREVEKSB7XG4gICAgc3RhdGUgPSAnZW5kZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUEFVU0VEKSB7XG4gICAgc3RhdGUgPSAncGF1c2VkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBMQVlJTkcpIHtcbiAgICBzdGF0ZSA9ICdwbGF5aW5nJztcbiAgfVxuICBwcml2LnByb2Nlc3NFdmVudHMoJ3N0YXRlQ2hhbmdlJywgZS50YXJnZXQuX2lkLCBzdGF0ZSwgZSk7XG59O1xuXG4vLyBwdWJsaWMgb24gZXZlbnQsIHNvIHlvdSBjYW4gZXh0ZXJuYWxseSBhdHRhY2ggdG8gdmlkZW9zXG52aWRlb0FuYWx5dGljcy5vbiA9IGZ1bmN0aW9uKGV2ZW50cywgaWQsIGZuKSB7XG4gIHZhciByZWN1cnNlID0gZmFsc2UsIGV2ZW50O1xuICBpZiAoZXZlbnRzIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZWN1cnNlID0gZXZlbnRzLmxlbmd0aCA/IHRydWUgOiBmYWxzZTtcbiAgICBldmVudCA9IGV2ZW50cy5zaGlmdCgpO1xuICB9IGVsc2Uge1xuICAgIGV2ZW50ID0gZXZlbnRzO1xuICB9XG4gIHZhciBwcm9jZXNzb3IgPSBmdW5jdGlvbihuZXh0LCBldikge1xuICAgIGlmIChwcml2LnZpZGVvc1tuZXh0XSkge1xuICAgICAgaWYgKCEocHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2XSBpbnN0YW5jZW9mIEFycmF5KSkgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2XSA9IFtdO1xuICAgICAgcHJpdi52aWRlb3NbbmV4dF0uZXZlbnRzW2V2XS5wdXNoKGZuKTtcbiAgICB9XG4gIH07XG4gIC8vIGFjY2VwdHMgYCpgIGFzIGFuIGlkZW50aWZpZXIgb2YgYSBcImdsb2JhbFwiXG4gIC8vIGV2ZW50IHRoYXQgc2hvdWxkIGJlIGF0dGFjaGVkIHRvIGFsbCB2aWRlb3NcbiAgaWYgKGlkID09PSAnKicpIHtcbiAgICB2YXIgdmlkcyA9IE9iamVjdC5rZXlzKHByaXYudmlkZW9zKTtcbiAgICBmb3IodmFyIGk9MDtpPHZpZHMubGVuZ3RoOysraSkge1xuICAgICAgcHJvY2Vzc29yKHZpZHNbaV0sIGV2ZW50KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcHJvY2Vzc29yKGlkKTtcbiAgfVxuICBpZiAocmVjdXJzZSkgcmV0dXJuIHZpZGVvQW5hbHl0aWNzLm9uKGV2ZW50cywgaWQsIGZuKTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gcHVibGljIHRyYWNraW5nIGV2ZW50LCBzbyB5b3UgYXR0YWNoIHZpZGVvcyBhZnRlciBkb21cbi8vIGxvYWQsIG9yIHdpdGggc29tZSBsYXRlbnQvYXN5bmMgcmVxdWVzdHNcbnZpZGVvQW5hbHl0aWNzLnRyYWNrID0gZnVuY3Rpb24oKSB7XG4gIHByaXYuY29sbGVjdERvbSgpO1xuICBpZiAocHJpdi5xdWV1ZS5sZW5ndGgpIHtcbiAgICBwcml2LmluamVjdFNjcmlwdHMoKTtcbiAgICBwcml2LmF0dGFjaFZpZGVvcyhwcml2LnF1ZXVlKTtcbiAgfVxuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBkZWJ1ZyBtb2RlLCBhbGxvd3MgeW91IHRvIGNhcHR1cmUgZGVidWcgZGF0YSBzaW1wbHlcbnZpZGVvQW5hbHl0aWNzLnNldERlYnVnID0gZnVuY3Rpb24oYm9vbCkge1xuICB2YXIgZWxlbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXl0LWRlYnVnXScpO1xuICBib29sID0gdHlwZW9mIGJvb2wgIT0gJ3VuZGVmaW5lZCcgPyBib29sIDogbnVsbDtcbiAgaWYgKGVsZW0pIHtcbiAgICB2YXIgYXR0cnMgPSBhdHRyKGVsZW0pO1xuICAgIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYXR0cnMoJ2RhdGEteXQtZGVidWcnKSA9PSAndHJ1ZSc7XG4gIH1cbiAgaWYgKGJvb2wgIT09IG51bGwpIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYm9vbDtcbiAgbW9uLmRlYnVnID0gdmlkZW9BbmFseXRpY3MuZGVidWc7XG4gIHZpZGVvQW5hbHl0aWNzLmxvZ3MgPSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA/IG1vbi5oaXN0b3J5IDogW107XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHdlIHdhbnQgdG8gaGF2ZSBleHRlcm5hbCBhY2Nlc3MgdG8gdGhlIHZpZGVvcyB3ZSdyZVxuLy8gdHJhY2tpbmcgZm9yIGludGVyYWN0aW9uIHdpdGggb3RoZXIgYXBpc1xudmlkZW9BbmFseXRpY3MudmlkZW9zID0gcHJpdi52aWRlb3M7XG4gIFxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIHByaXYuaW5pdCwgZmFsc2UpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHZpZGVvQW5hbHl0aWNzOyIsInZhciBhdHRyID0gZnVuY3Rpb24oZWxlbSkge1xuICBpZiAodHlwZW9mIGVsZW0gIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gJGF0dHIoa2V5LCB2YWwpIHtcbiAgICAgIGlmKHR5cGVvZiB2YWwgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0uZ2V0QXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2UgaWYgKHZhbCA9PSAncm0nKSB7XG4gICAgICAgIHJldHVybiBlbGVtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGVsZW0uc2V0QXR0cmlidXRlKGtleSwgdmFsKTtcbiAgICAgIH1cbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbnZhciBzYWZlUGFyc2UgPSBmdW5jdGlvbihzdHIpIHtcbiAgdmFyIG91dHB1dCA9IG51bGw7XG4gIHRyeSB7XG4gICAgb3V0cHV0ID0gSlNPTi5wYXJzZShzdHIpO1xuICB9IGNhdGNoIChleCkge31cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICBzYWZlUGFyc2U6IHNhZmVQYXJzZVxufTsiLCJ2YXIgTW9uID0gZnVuY3Rpb24oZGVidWcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1vbikpIHJldHVybiBuZXcgTW9uKGRlYnVnKTtcbiAgdGhpcy5kZWJ1ZyA9IGRlYnVnO1xuICB0aGlzLmhpc3RvcnkgPSBbXTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5Nb24ucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3AgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmhpc3RvcnkucHVzaChjcCk7XG4gIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgaWYodHlwZW9mIHdpbmRvd1snY29uc29sZSddICE9ICd1bmRlZmluZWQnICYmIGNvbnNvbGUubG9nKSB7XG4gICAgICBpZiAoY3AubGVuZ3RoID09PSAxICYmIHR5cGVvZiBjcFswXSA9PSAnb2JqZWN0JykgY3AgPSBKU09OLnN0cmluZ2lmeShjcFswXSxudWxsLDIpO1xuICAgICAgY29uc29sZS5sb2coY3ApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTW9uOyJdfQ==
(1)
});
