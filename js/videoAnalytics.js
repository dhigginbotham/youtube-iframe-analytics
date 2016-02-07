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

// the iframe_api allows us to attach dom style events to
// videos, we always fire these internally, but then we 
// also allow you to attach events to a video, by its id
// --------------------------------------------------------

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
  var state = 'initializing';
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
  // `*` wildcard allows you to attach an event to every vid
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV9mY2RlNDljZC5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xudmFyIG1vbiA9IHJlcXVpcmUoJy4vbW9uJykoZmFsc2UpO1xudmFyIGF0dHIgPSBoZWxwZXJzLmF0dHIsIHNhZmVQYXJzZSA9IGhlbHBlcnMuc2FmZVBhcnNlO1xuXG4vLyBhcGkgb2JqZWN0c1xudmFyIHZpZGVvQW5hbHl0aWNzID0ge30sIHByaXYgPSB7fTtcblxuLy8gd2Ugd2FudCB0byBrZWVwIGNvbnRleHQgb2Ygb3VyIGRvbSwgc28gd2UgY2FuIGVhc2lseSByZWZcbi8vIHRoZSBub2RlcyBsYXRlciBvblxucHJpdi52aWRlb3MgPSB7fTtcblxuLy8gZWFjaCBkb20gbm9kZSB3aWxsIGhhdmUgZXZlbnRzIGF0dGFjaGVkIHNvIHdlIGNhbiBlYXNpbHlcbi8vIGludGVyYWN0IHdpdGggdGhlbSwgd2UnbGwgZG8gc29tZSBkYXRhLWJpbmRpbmcgdG8gY29sbGVjdFxuLy8gb3VyIG5vZGVzXG5wcml2LmV2ZW50cyA9IHt9O1xuICBcbi8vIHZpZGVvcyBxdWV1ZSwgYmVjYXVzZSB3ZSBsb2FkIGEgM3JkIHBhcnR5IGFzc2V0IHdlIHdhbnRcbi8vIHRvIG1pdGlnYXRlIHJhY2UgY29uZGl0aW9ucyBvZiBZVCBub3QgYmVpbmcgcmVhZHksIHNvXG4vLyB3ZSBrZWVwIGFsbCB1bnRyYWNrZWQgdmlkZW9zIGluIHRoaXMgcXVldWUgYW5kIHNoaWZ0IFxuLy8gdGhlbSBvdXQgYXMgd2UgZ2V0IHRvIHRoZW1cbnByaXYucXVldWUgPSBbXTtcblxuLy8ga2VlcCB0cmFjayBvZiB5b3V0dWJlIGNhbGxpbmcgb3VyIGZuXG5wcml2LmxvYWRlZCA9IGZhbHNlO1xuXG4vLyBpbml0IGZuIHRoYXQgaGFwcGVucyBvbiBET01Db250ZW50TG9hZGVkXG5wcml2LmluaXQgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG59O1xuXG4vLyBhdHRhY2hlcyBldmVudHMgdG8gdmlkZW9zIHNvIHRoZXkgY2FuIGJlIHByb2Nlc3NlZCBieSBcbi8vIHRoZSAub24oKSBmblxucHJpdi5hdHRhY2hFdmVudHMgPSBmdW5jdGlvbihpZCwgZXZlbnQsIGZuKSB7XG4gIGlmIChwcml2LnZpZGVvc1tpZF0pIHtcbiAgICBpZiAoIShwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2V2ZW50XSBpbnN0YW5jZW9mIEFycmF5KSkgcHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0gPSBbXTtcbiAgICBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2V2ZW50XS5wdXNoKGZuKTtcbiAgfVxufTtcblxuLy8gdGhlIHdheSB0aGUgaWZyYW1lX2FwaSB3b3JrcyBpcyBieSByZXBsYWNpbmcgYW4gZWxlbWVudFxuLy8gd2l0aCBhbiBpZnJhbWUsIHNvIHdlJ2xsIHdhbnQgdG8gYXR0YWNoIHRoZSB2aWRlbyBhcyBcbi8vIG5lZWRlZFxucHJpdi5hdHRhY2hWaWRlb3MgPSBmdW5jdGlvbihxdWV1ZSkge1xuICBpZiAocHJpdi5sb2FkZWQpIHtcbiAgICB2YXIgbmV4dDtcbiAgICB3aGlsZShuZXh0ID0gcXVldWUuc2hpZnQoKSkge1xuICAgICAgbmV4dC5wbGF5ZXIgPSBuZXcgWVQuUGxheWVyKG5leHQuZWwsIG5leHQub3B0cyk7XG4gICAgICBuZXh0LnBsYXllci5faWQgPSBuZXh0Lm9wdHMudmlkZW9JZDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIHdlJ2xsIHJ1biB0aGlzIG9uIGluaXQsIG9yIG9uIGRlbWFuZCBmb3IgbGF0ZW50IGxvYWRlZFxuLy8gaHRtbCBmcmFnbWVudHNcbnByaXYuY29sbGVjdERvbSA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIHdlIHdhbnQgdG8gc2V0IGRlYnVnIHN0YXRlIGFzYXAsIHNvIHdlIGRvIHRoYXQgYmVmb3JlIFxuICAvLyB3ZSBhY3R1YWxseSBjb2xsZWN0IGFueSB2aWRlbyBlbGVtc1xuICB2aWRlb0FuYWx5dGljcy5zZXREZWJ1ZygpO1xuICB2YXIgZG9tID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEteXQtYW5hbHl0aWNzXScpO1xuICBmb3IodmFyIGk9MDtpPGRvbS5sZW5ndGg7KytpKSB7XG4gICAgcHJpdi5yZWZlcmVuY2VPYmplY3QoZG9tW2ldKTtcbiAgfVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBnZXRzIGZpcmVkIHdoZW4geW91dHViZSBqcyBpcyBpbml0aWFsaXplZFxuLy8gYWxzbywgdGhpcyBzYWZlbHkgYWxsb3dzIHVzIHRvIGV4dGVybmFsbHkgdXNlIC50cmFja1xuLy8gd2l0aG91dCByYWNlIGNvbmRpdGlvbnNcbnByaXYuZXh0ZXJuYWxBcGlSZWFkeSA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmxvYWRlZCA9IHRydWU7XG4gIHByaXYuYXR0YWNoVmlkZW9zKHByaXYucXVldWUpO1xufTtcblxuLy8gd2UgaW5jbHVkZSB5b3V0dWJlcyBqcyBzY3JpcHQgYXN5bmMsIGFuZCB3ZSdsbCBuZWVkIHRvIFxuLy8ga2VlcCB0cmFjayBvZiB0aGUgc3RhdGUgb2YgdGhhdCBpbmNsdWRlXG5wcml2LmluamVjdFNjcmlwdHMgPSBmdW5jdGlvbihmbikge1xuICBpZiAoIXByaXYuc2NyaXB0SW5jbHVkZSkge1xuICAgIC8vIHdlIG9ubHkgd2FudCB0byBkbyB0aGlzIG9uY2UsIGFuZCB0aGlzIGlzIHRoZSBiZXN0XG4gICAgLy8gdGltZSB0byBkbyB0aGlzIG9uY2UsIHRoaXMgYWxzbyBrZWVwcyBhbGwgb2YgdGhlXG4gICAgLy8gY29uZGl0aW9uYWwgc3R1ZmYgdG8gYSBzaW5nbGUgZW50cnksIHNvIGl0IHdvcmtzXG4gICAgd2luZG93WydvbllvdVR1YmVJZnJhbWVBUElSZWFkeSddID0gcHJpdi5leHRlcm5hbEFwaVJlYWR5O1xuXG4gICAgdmFyIHBsYWNlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXTtcbiAgICBwcml2LnNjcmlwdEluY2x1ZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICBcbiAgICAvLyBpZiBmbiwgbGV0cyB0cmVhdCBhc3luYywgb3RoZXJ3aXNlIHdlJ2xsIGJlIGJsb2NraW5nXG4gICAgaWYgKHR5cGVvZiBmbiA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdhc3luYycsIHRydWUpO1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmbiwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ3NyYycsICcvL3d3dy55b3V0dWJlLmNvbS9pZnJhbWVfYXBpJyk7XG4gICAgcGxhY2VtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHByaXYuc2NyaXB0SW5jbHVkZSwgcGxhY2VtZW50KTtcbiAgfVxufTtcblxuLy8gd2Ugd2FudCB0byBzdGFuZGFyZGl6ZSBob3cgd2UgaGFuZGxlIGV2ZW50cywgdGhpcyBpcyB0aGVcbi8vIGZuIHRoYXQgaGFuZGxlcyBzdWNoIHRoaW5nc1xucHJpdi5wcm9jZXNzRXZlbnRzID0gZnVuY3Rpb24oa2V5LCBpZCwgc3RhdGUsIGUpIHtcbiAgdmFyIGV2ZW50cyA9IHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSxcbiAgICAgIHBsYXllciA9IHByaXYudmlkZW9zW2lkXS5wbGF5ZXI7XG4gIC8vIGlmIHdlIGdldCBhdCBvdXIgdmlkZW9zIGV4dGVybmFsbHksIHdlIHdpbGwgbGlrZWx5XG4gIC8vIHdhbnQgdG8ga25vdyB3aGF0ZXZlciB0aGUgc3RhdGUgb2YgdGhlIGN1cnJlbnQgdmlkZW9cbiAgLy8gaXMgaW5cbiAgcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAvLyB0aXRsZSB3aWxsIGZhbGxiYWNrIHRvIHRoZSBpZCwgc28gd2UgY2FuIGRldGVjdCB3aGVuXG4gIC8vIHdlIGNhbiBjYWxsIG9uIHRoZSB5b3V0dWJlIGFwaSB0byBnZXQgdGhlIHZpZGVvIHRpdGxlXG4gIC8vIHRoaXMgd2lsbCBhbGxvdyB1cyB0byBoYXZlIGh1bWFuIHJlYWRhYmxlIHRpdGxlc1xuICBpZiAocHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPT0gaWQpIHtcbiAgICAvLyB3ZSBkb24ndCB3YW50IHRvIGFjY2VwdCBhbnkgdW5kZWZpbmVkIHZpZGVvIHRpdGxlcyxcbiAgICAvLyBzbyB3ZSdsbCBncmFjZWZ1bGx5IGZhbGxiYWNrIHRvIG91ciBpZCwgdGhpcyByZWFsbHlcbiAgICAvLyBvbmx5IGhhcHBlbnMgd2hlbiB3ZSBhcmUgaW4gYSB2aWRlbyBlcnJvciBzdGF0ZXNcbiAgICBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA/IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA6IGlkO1xuICB9XG4gIC8vIFlvdVR1YmUgcmVjb3JkcyB2aWRlbyB0aW1lcyBhcyBhIGZsb2F0LCBpIGFtXG4gIC8vIGFzc3VtaW5nIHdlIHdvbid0IG5lZWQvd2FudCB0byBoYXZlIHN1Y2ggcHJlY2lzaW9uXG4gIC8vIGhlcmUgd2l0aCB0aGUgTWF0aC5mbG9vcigpIGNhbGxzXG4gIHZhciBldmVudFN0YXRlID0ge1xuICAgIGN1cnJlbnRUaW1lOiBNYXRoLmZsb29yKHBsYXllci5nZXRDdXJyZW50VGltZSgpKSwgXG4gICAgZHVyYXRpb246IE1hdGguZmxvb3IocGxheWVyLmdldER1cmF0aW9uKCkpLFxuICAgIGV2ZW50OiBrZXksXG4gICAgaWQ6IGlkLFxuICAgIHRpdGxlOiBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSxcbiAgICBzdGF0ZTogcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSxcbiAgICBtdXRlZDogcGxheWVyLmlzTXV0ZWQoKSxcbiAgICBtczogbmV3IERhdGUoKS5nZXRUaW1lKClcbiAgfTtcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSkge1xuICAgIGZvcih2YXIgaT0wO2k8ZXZlbnRzLmxlbmd0aDsrK2kpIHtcbiAgICAgIGV2ZW50c1tpXShlLCBldmVudFN0YXRlKTtcbiAgICB9XG4gIH1cbiAgbW9uLmxvZyhldmVudFN0YXRlKTtcbn07XG5cbi8vIHNldHMgdXAgb3VyIGRvbSBvYmplY3QsIHNvIHdlIGhhdmUgYSBzdHJpY3Qgc2NoZW1hIHRvIFxuLy8gYWRoZXJlIHRvIGxhdGVyIG9uIGluIHRoZSBhcGkgXG5wcml2LnJlZmVyZW5jZU9iamVjdCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBvcHRzID0ge30sIGF0dHJzID0gYXR0cihlbCk7XG4gIG9wdHMudmlkZW9JZCA9IGF0dHJzKCdkYXRhLXl0LWFuYWx5dGljcycpO1xuICBpZiAoYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcpID09IG51bGwpIHtcbiAgICBhdHRycygnZGF0YS15dC10cmFja2VkJywgdHJ1ZSk7XG5cbiAgICAvLyBnZXQgb3B0cyBmcm9tIGRhdGEgYXR0cnNcbiAgICBvcHRzLndpZHRoID0gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA/IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgOiA2NDA7XG4gICAgb3B0cy5oZWlnaHQgPSBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA/IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpIDogMzkwO1xuICAgIG9wdHMucGxheWVyVmFycyA9IGF0dHJzKCdkYXRhLXl0LXZhcnMnKSA/IHNhZmVQYXJzZShhdHRycygnZGF0YS15dC12YXJzJykpIDogbnVsbDtcbiAgICBvcHRzLnRpdGxlID0gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA/IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgOiBvcHRzLnZpZGVvSWQ7XG4gICAgXG4gICAgLy8gc2V0dXAgdmlkZW9zIGV2ZW50cywgYWxsIGFyZSBhdmFpbGFibGUgcHVibGljYWxseSwgbW9yZSBpbmZvIGNhbiBiZSBcbiAgICAvLyBmb3VuZCBhdCBkZXZlbG9wZXJzLmdvb2dsZS5jb20veW91dHViZS9pZnJhbWVfYXBpX3JlZmVyZW5jZSNFdmVudHNcbiAgICBvcHRzLmV2ZW50cyA9IHtcbiAgICAgIG9uUmVhZHk6IHByaXYuZXZlbnRzLnJlYWR5LFxuICAgICAgb25TdGF0ZUNoYW5nZTogcHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UsXG4gICAgICBvbkVycm9yOiBwcml2LmV2ZW50cy5lcnJvcixcbiAgICAgIG9uUGxheWJhY2tRdWFsaXR5Q2hhbmdlOiBwcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2UsXG4gICAgICBvblBsYXliYWNrUmF0ZUNoYW5nZTogcHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlLFxuICAgICAgb25BcGlDaGFuZ2U6IHByaXYuZXZlbnRzLmFwaUNoYW5nZVxuICAgIH07XG4gICAgXG4gICAgLy8gYnVpbGQgdmlkZW8gb2JqZWN0IHRvIHN0b3JlXG4gICAgcHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSA9IHsgb3B0czogb3B0cywgZWw6IGVsLCBldmVudHM6IHt9IH07XG4gICAgcHJpdi5xdWV1ZS5wdXNoKHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0pO1xuICB9XG59O1xuXG4vLyB0aGUgaWZyYW1lX2FwaSBhbGxvd3MgdXMgdG8gYXR0YWNoIGRvbSBzdHlsZSBldmVudHMgdG9cbi8vIHZpZGVvcywgd2UgYWx3YXlzIGZpcmUgdGhlc2UgaW50ZXJuYWxseSwgYnV0IHRoZW4gd2UgXG4vLyBhbHNvIGFsbG93IHlvdSB0byBhdHRhY2ggZXZlbnRzIHRvIGEgdmlkZW8sIGJ5IGl0cyBpZFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxucHJpdi5ldmVudHMuYXBpQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ2FwaUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ2FwaUNoYW5nZScsIGUpO1xufTtcblxuLy8gYWNjb3JkaW5nIHRvIHlvdXR1YmUgZG9jcyB0aGVzZSBzdGF0dXMgY29kZXNcbi8vIHJlcHJlc2VudCB0aGUgc3RhdGUgc3RyaW5nIHRoYXQgaXMgaW5kaWNhdGl2ZVxuLy8gb2YgdGhlIGVycm9yXG5wcml2LmV2ZW50cy5lcnJvciA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ3VucmVjb2duaXplZCBlcnJvcic7XG4gIGlmIChlLmRhdGEgPT0gMiB8fCBlLmRhdGEgPT0gMTAwKSB7XG4gICAgc3RhdGUgPSAnaW52YWxpZCB2aWRlb0lkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gNSkge1xuICAgIHN0YXRlID0gJ2h0bWw1IHBsYXllciBlcnJvcic7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDEwMSB8fCBlLmRhdGEgPT0gMTUwKSB7XG4gICAgc3RhdGUgPSAnZW1iZWRkaW5nIGZvcmJpZGRlbic7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdlcnJvcicsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucmVhZHkgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncmVhZHknLCBlLnRhcmdldC5faWQsICdyZWFkeScsIGUpO1xufTtcblxuLy8gd2UgdHJhbnNmb3JtIHRoZSBjdXJyZW50IHN0YXRlIGBpZGAgdG8gYSBodW1hbiByZWFkYWJsZVxuLy8gc3RyaW5nIGJhc2VkIG9uIHRoZSB5b3V0dWJlIGFwaSBkb2NzXG5wcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ2luaXRpYWxpemluZyc7XG4gIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkJVRkZFUklORykge1xuICAgIHN0YXRlID0gJ2J1ZmZlcmluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5DVUVEKSB7XG4gICAgc3RhdGUgPSAnY3VlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5FTkRFRCkge1xuICAgIHN0YXRlID0gJ2VuZGVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBBVVNFRCkge1xuICAgIHN0YXRlID0gJ3BhdXNlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QTEFZSU5HKSB7XG4gICAgc3RhdGUgPSAncGxheWluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5VTlNUQVJURUQpIHtcbiAgICBzdGF0ZSA9ICd1bnN0YXJ0ZWQnO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnc3RhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbi8vIHB1YmxpYyBvbiBldmVudCwgc28geW91IGNhbiBleHRlcm5hbGx5IGF0dGFjaCB0byB2aWRlb3Ncbi8vIHRoaXMgZm4gY2FuIGJlIHJlY3Vyc2l2ZSwgc28geW91IGtub3csIGJlIHNtYXJ0IHdpdGggdGhpc1xuLy8gdHJ5IHRvIGF2b2lkIGV4dHJlbWVseSBsYXJnZSBhcnJheXMsIG9yIGRvaW5nIGFzeW5jIHN0dWZmXG4vLyBpbnNpZGUgb2YgeW91ciBldmVudHMgd2l0aG91dCB0aGUgcHJvcGVyIHNhZmV0eSBtYXRlcmlhbHNcbnZpZGVvQW5hbHl0aWNzLm9uID0gZnVuY3Rpb24oZXZlbnRzLCBpZCwgZm4pIHtcbiAgdmFyIHJlY3Vyc2UgPSBmYWxzZSwgZXZlbnQgPSBldmVudHM7XG4gIGlmIChldmVudHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJlY3Vyc2UgPSBldmVudHMubGVuZ3RoID8gdHJ1ZSA6IGZhbHNlO1xuICAgIGV2ZW50ID0gZXZlbnRzLnNoaWZ0KCk7XG4gIH1cbiAgLy8gYCpgIHdpbGRjYXJkIGFsbG93cyB5b3UgdG8gYXR0YWNoIGFuIGV2ZW50IHRvIGV2ZXJ5IHZpZFxuICBpZiAoaWQgPT09ICcqJykge1xuICAgIHZhciB2aWRzID0gT2JqZWN0LmtleXMocHJpdi52aWRlb3MpO1xuICAgIGZvcih2YXIgaT0wO2k8dmlkcy5sZW5ndGg7KytpKSB7XG4gICAgICBwcml2LmF0dGFjaEV2ZW50cyh2aWRzW2ldLGV2ZW50LGZuKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcHJpdi5hdHRhY2hFdmVudHMoaWQsZXZlbnQsZm4pO1xuICB9XG4gIGlmIChyZWN1cnNlKSByZXR1cm4gdmlkZW9BbmFseXRpY3Mub24oZXZlbnRzLGlkLGZuKTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gZGVidWcgbW9kZSwgYWxsb3dzIHlvdSB0byBjYXB0dXJlIGRlYnVnIGRhdGEgc2ltcGx5XG52aWRlb0FuYWx5dGljcy5zZXREZWJ1ZyA9IGZ1bmN0aW9uKGJvb2wpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS15dC1kZWJ1Z10nKTtcbiAgYm9vbCA9IHR5cGVvZiBib29sID09PSAnYm9vbGVhbicgPyBib29sIDogbnVsbDtcbiAgaWYgKGVsZW0pIHtcbiAgICB2YXIgYXR0cnMgPSBhdHRyKGVsZW0pO1xuICAgIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYXR0cnMoJ2RhdGEteXQtZGVidWcnKSA9PSAndHJ1ZSc7XG4gIH1cbiAgaWYgKGJvb2wgIT09IG51bGwpIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYm9vbDtcbiAgbW9uLmRlYnVnID0gdmlkZW9BbmFseXRpY3MuZGVidWc7XG4gIHZpZGVvQW5hbHl0aWNzLmxvZ3MgPSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA/IG1vbi5oaXN0b3J5IDogW107XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHB1YmxpYyB0cmFja2luZyBldmVudCwgc28geW91IGF0dGFjaCB2aWRlb3MgYWZ0ZXIgZG9tXG4vLyBsb2FkLCBvciB3aXRoIHNvbWUgbGF0ZW50L2FzeW5jIHJlcXVlc3RzXG52aWRlb0FuYWx5dGljcy50cmFjayA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSB7XG4gICAgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG4gICAgcHJpdi5hdHRhY2hWaWRlb3MocHJpdi5xdWV1ZSk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gd2Ugd2FudCB0byBoYXZlIGV4dGVybmFsIGFjY2VzcyB0byB0aGUgdmlkZW9zIHdlJ3JlXG4vLyB0cmFja2luZyBmb3IgaW50ZXJhY3Rpb24gd2l0aCBvdGhlciBhcGlzXG52aWRlb0FuYWx5dGljcy52aWRlb3MgPSBwcml2LnZpZGVvcztcbiAgXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgcHJpdi5pbml0LCBmYWxzZSk7XG5cbm1vZHVsZS5leHBvcnRzID0gdmlkZW9BbmFseXRpY3M7IiwidmFyIGF0dHIgPSBmdW5jdGlvbihlbGVtKSB7XG4gIGlmICh0eXBlb2YgZWxlbSAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAkYXR0cihrZXksIHZhbCkge1xuICAgICAgaWYodHlwZW9mIHZhbCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSBpZiAodmFsID09ICdybScpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZWxlbS5zZXRBdHRyaWJ1dGUoa2V5LCB2YWwpO1xuICAgICAgfVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxudmFyIHNhZmVQYXJzZSA9IGZ1bmN0aW9uKHN0cikge1xuICB2YXIgb3V0cHV0ID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBvdXRwdXQgPSBKU09OLnBhcnNlKHN0cik7XG4gIH0gY2F0Y2ggKGV4KSB7fVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dHI6IGF0dHIsXG4gIHNhZmVQYXJzZTogc2FmZVBhcnNlXG59OyIsInZhciBNb24gPSBmdW5jdGlvbihkZWJ1Zykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTW9uKSkgcmV0dXJuIG5ldyBNb24oZGVidWcpO1xuICB0aGlzLmRlYnVnID0gZGVidWc7XG4gIHRoaXMuaGlzdG9yeSA9IFtdO1xuICByZXR1cm4gdGhpcztcbn07XG5cbk1vbi5wcm90b3R5cGUubG9nID0gZnVuY3Rpb24oKSB7XG4gIHZhciBjcCA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gIHRoaXMuaGlzdG9yeS5wdXNoKGNwKTtcbiAgaWYgKHRoaXMuZGVidWcpIHtcbiAgICBpZih0eXBlb2Ygd2luZG93Wydjb25zb2xlJ10gIT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZS5sb2cpIHtcbiAgICAgIGlmIChjcC5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGNwWzBdID09ICdvYmplY3QnKSBjcCA9IEpTT04uc3RyaW5naWZ5KGNwWzBdLG51bGwsMik7XG4gICAgICBjb25zb2xlLmxvZyhjcCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb247Il19
(1)
});
