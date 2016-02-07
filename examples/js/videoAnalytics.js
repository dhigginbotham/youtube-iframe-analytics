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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV80ODhjZDUzMy5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgbW9uID0gcmVxdWlyZSgnLi9tb24nKShmYWxzZSk7XG52YXIgYXR0ciA9IGhlbHBlcnMuYXR0ciwgc2FmZVBhcnNlID0gaGVscGVycy5zYWZlUGFyc2U7XG5cbi8vIGFwaSBvYmplY3RzXG52YXIgdmlkZW9BbmFseXRpY3MgPSB7fSwgcHJpdiA9IHt9O1xuXG4vLyB3ZSB3YW50IHRvIGtlZXAgY29udGV4dCBvZiBvdXIgZG9tLCBzbyB3ZSBjYW4gZWFzaWx5IHJlZlxuLy8gdGhlIG5vZGVzIGxhdGVyIG9uXG5wcml2LnZpZGVvcyA9IHt9O1xuXG4vLyBlYWNoIGRvbSBub2RlIHdpbGwgaGF2ZSBldmVudHMgYXR0YWNoZWQgc28gd2UgY2FuIGVhc2lseVxuLy8gaW50ZXJhY3Qgd2l0aCB0aGVtLCB3ZSdsbCBkbyBzb21lIGRhdGEtYmluZGluZyB0byBjb2xsZWN0XG4vLyBvdXIgbm9kZXNcbnByaXYuZXZlbnRzID0ge307XG4gIFxuLy8gdmlkZW9zIHF1ZXVlLCBiZWNhdXNlIHdlIGxvYWQgYSAzcmQgcGFydHkgYXNzZXQgd2Ugd2FudFxuLy8gdG8gbWl0aWdhdGUgcmFjZSBjb25kaXRpb25zIG9mIFlUIG5vdCBiZWluZyByZWFkeSwgc29cbi8vIHdlIGtlZXAgYWxsIHVudHJhY2tlZCB2aWRlb3MgaW4gdGhpcyBxdWV1ZSBhbmQgc2hpZnQgXG4vLyB0aGVtIG91dCBhcyB3ZSBnZXQgdG8gdGhlbVxucHJpdi5xdWV1ZSA9IFtdO1xuXG4vLyBrZWVwIHRyYWNrIG9mIHlvdXR1YmUgY2FsbGluZyBvdXIgZm5cbnByaXYubG9hZGVkID0gZmFsc2U7XG5cbi8vIGluaXQgZm4gdGhhdCBoYXBwZW5zIG9uIERPTUNvbnRlbnRMb2FkZWRcbnByaXYuaW5pdCA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSBwcml2LmluamVjdFNjcmlwdHMoKTtcbn07XG5cbi8vIGF0dGFjaGVzIGV2ZW50cyB0byB2aWRlb3Mgc28gdGhleSBjYW4gYmUgcHJvY2Vzc2VkIGJ5IFxuLy8gdGhlIC5vbigpIGZuXG5wcml2LmF0dGFjaEV2ZW50cyA9IGZ1bmN0aW9uKGlkLCBldmVudCwgZm4pIHtcbiAgaWYgKHByaXYudmlkZW9zW2lkXSkge1xuICAgIGlmICghKHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdIGluc3RhbmNlb2YgQXJyYXkpKSBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2V2ZW50XSA9IFtdO1xuICAgIHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdLnB1c2goZm4pO1xuICB9XG59O1xuXG4vLyB0aGUgd2F5IHRoZSBpZnJhbWVfYXBpIHdvcmtzIGlzIGJ5IHJlcGxhY2luZyBhbiBlbGVtZW50XG4vLyB3aXRoIGFuIGlmcmFtZSwgc28gd2UnbGwgd2FudCB0byBhdHRhY2ggdGhlIHZpZGVvIGFzIFxuLy8gbmVlZGVkXG5wcml2LmF0dGFjaFZpZGVvcyA9IGZ1bmN0aW9uKHF1ZXVlKSB7XG4gIGlmIChwcml2LmxvYWRlZCkge1xuICAgIHZhciBuZXh0O1xuICAgIHdoaWxlKG5leHQgPSBxdWV1ZS5zaGlmdCgpKSB7XG4gICAgICBuZXh0LnBsYXllciA9IG5ldyBZVC5QbGF5ZXIobmV4dC5lbCwgbmV4dC5vcHRzKTtcbiAgICAgIG5leHQucGxheWVyLl9pZCA9IG5leHQub3B0cy52aWRlb0lkO1xuICAgIH1cbiAgfVxufTtcblxuLy8gd2UnbGwgcnVuIHRoaXMgb24gaW5pdCwgb3Igb24gZGVtYW5kIGZvciBsYXRlbnQgbG9hZGVkXG4vLyBodG1sIGZyYWdtZW50c1xucHJpdi5jb2xsZWN0RG9tID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gd2Ugd2FudCB0byBzZXQgZGVidWcgc3RhdGUgZmFpcmx5IGVhcmx5LCBzbyB3ZSdsbCBkb1xuICAvLyBpdCBiZWZvcmUgd2UgYWN0dWFsbHkgcXVlcnkgZm9yIGFueSB2aWRlb3MgdG8gc2V0dXBcbiAgdmlkZW9BbmFseXRpY3Muc2V0RGVidWcoKTtcbiAgdmFyIGRvbSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXl0LWFuYWx5dGljc10nKTtcbiAgZm9yKHZhciBpPTA7aTxkb20ubGVuZ3RoOysraSkge1xuICAgIHByaXYucmVmZXJlbmNlT2JqZWN0KGRvbVtpXSk7XG4gIH1cbn07XG5cbi8vIHRoaXMgZnVuY3Rpb24gZ2V0cyBmaXJlZCB3aGVuIHlvdXR1YmUganMgaXMgaW5pdGlhbGl6ZWRcbi8vIGFsc28sIHRoaXMgc2FmZWx5IGFsbG93cyB1cyB0byBleHRlcm5hbGx5IHVzZSAudHJhY2tcbi8vIHdpdGhvdXQgcmFjZSBjb25kaXRpb25zXG5wcml2LmV4dGVybmFsQXBpUmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5sb2FkZWQgPSB0cnVlO1xuICBwcml2LmF0dGFjaFZpZGVvcyhwcml2LnF1ZXVlKTtcbn07XG5cbi8vIHdlIGluY2x1ZGUgeW91dHViZXMganMgc2NyaXB0IGFzeW5jLCBhbmQgd2UnbGwgbmVlZCB0byBcbi8vIGtlZXAgdHJhY2sgb2YgdGhlIHN0YXRlIG9mIHRoYXQgaW5jbHVkZVxucHJpdi5pbmplY3RTY3JpcHRzID0gZnVuY3Rpb24oZm4pIHtcbiAgaWYgKCFwcml2LnNjcmlwdEluY2x1ZGUpIHtcbiAgICAvLyB3ZSBvbmx5IHdhbnQgdG8gZG8gdGhpcyBvbmNlLCBhbmQgdGhpcyBpcyB0aGUgYmVzdFxuICAgIC8vIHRpbWUgdG8gZG8gdGhpcyBvbmNlLCB0aGlzIGFsc28ga2VlcHMgYWxsIG9mIHRoZVxuICAgIC8vIGNvbmRpdGlvbmFsIHN0dWZmIHRvIGEgc2luZ2xlIGVudHJ5LCBzbyBpdCB3b3Jrc1xuICAgIHdpbmRvd1snb25Zb3VUdWJlSWZyYW1lQVBJUmVhZHknXSA9IHByaXYuZXh0ZXJuYWxBcGlSZWFkeTtcblxuICAgIHZhciBwbGFjZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylbMF07XG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgXG4gICAgLy8gaWYgZm4sIGxldHMgdHJlYXQgYXN5bmMsIG90aGVyd2lzZSB3ZSdsbCBiZSBibG9ja2luZ1xuICAgIGlmICh0eXBlb2YgZm4gPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnYXN5bmMnLCB0cnVlKTtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZm4sIGZhbHNlKTtcbiAgICB9XG5cbiAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdzcmMnLCAnLy93d3cueW91dHViZS5jb20vaWZyYW1lX2FwaScpO1xuICAgIHBsYWNlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShwcml2LnNjcmlwdEluY2x1ZGUsIHBsYWNlbWVudCk7XG4gIH1cbn07XG5cbi8vIHdlIHdhbnQgdG8gc3RhbmRhcmRpemUgaG93IHdlIGhhbmRsZSBldmVudHMsIHRoaXMgaXMgdGhlXG4vLyBmbiB0aGF0IGhhbmRsZXMgc3VjaCB0aGluZ3NcbnByaXYucHJvY2Vzc0V2ZW50cyA9IGZ1bmN0aW9uKGtleSwgaWQsIHN0YXRlLCBlKSB7XG4gIHZhciBldmVudHMgPSBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0sXG4gICAgICBwbGF5ZXIgPSBwcml2LnZpZGVvc1tpZF0ucGxheWVyO1xuICAvLyBpZiB3ZSBnZXQgYXQgb3VyIHZpZGVvcyBleHRlcm5hbGx5LCB3ZSB3aWxsIGxpa2VseVxuICAvLyB3YW50IHRvIGtub3cgd2hhdGV2ZXIgdGhlIHN0YXRlIG9mIHRoZSBjdXJyZW50IHZpZGVvXG4gIC8vIGlzIGluXG4gIHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgLy8gdGl0bGUgd2lsbCBmYWxsYmFjayB0byB0aGUgaWQsIHNvIHdlIGNhbiBkZXRlY3Qgd2hlblxuICAvLyB3ZSBjYW4gY2FsbCBvbiB0aGUgeW91dHViZSBhcGkgdG8gZ2V0IHRoZSB2aWRlbyB0aXRsZVxuICAvLyB0aGlzIHdpbGwgYWxsb3cgdXMgdG8gaGF2ZSBodW1hbiByZWFkYWJsZSB0aXRsZXNcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID09IGlkKSB7XG4gICAgLy8gd2UgZG9uJ3Qgd2FudCB0byBhY2NlcHQgYW55IHVuZGVmaW5lZCB2aWRlbyB0aXRsZXMsXG4gICAgLy8gc28gd2UnbGwgZ3JhY2VmdWxseSBmYWxsYmFjayB0byBvdXIgaWQsIHRoaXMgcmVhbGx5XG4gICAgLy8gb25seSBoYXBwZW5zIHdoZW4gd2UgYXJlIGluIGEgdmlkZW8gZXJyb3Igc3RhdGVzXG4gICAgcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPSBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgPyBwbGF5ZXIuZ2V0VmlkZW9EYXRhKCkudGl0bGUgOiBpZDtcbiAgfVxuICAvLyBZb3VUdWJlIHJlY29yZHMgdmlkZW8gdGltZXMgYXMgYSBmbG9hdCwgaSBhbVxuICAvLyBhc3N1bWluZyB3ZSB3b24ndCBuZWVkL3dhbnQgdG8gaGF2ZSBzdWNoIHByZWNpc2lvblxuICAvLyBoZXJlIHdpdGggdGhlIE1hdGguZmxvb3IoKSBjYWxsc1xuICB2YXIgZXZlbnRTdGF0ZSA9IHtcbiAgICBjdXJyZW50VGltZTogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSksIFxuICAgIGR1cmF0aW9uOiBNYXRoLmZsb29yKHBsYXllci5nZXREdXJhdGlvbigpKSxcbiAgICBldmVudDoga2V5LFxuICAgIGlkOiBpZCxcbiAgICB0aXRsZTogcHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUsXG4gICAgc3RhdGU6IHByaXYudmlkZW9zW2lkXS5jdXJyZW50U3RhdGUsXG4gICAgbXV0ZWQ6IHBsYXllci5pc011dGVkKCksXG4gICAgbXM6IG5ldyBEYXRlKCkuZ2V0VGltZSgpXG4gIH07XG4gIGlmIChwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2tleV0pIHtcbiAgICBmb3IodmFyIGk9MDtpPGV2ZW50cy5sZW5ndGg7KytpKSB7XG4gICAgICBldmVudHNbaV0oZSwgZXZlbnRTdGF0ZSk7XG4gICAgfVxuICB9XG4gIG1vbi5sb2coZXZlbnRTdGF0ZSk7XG59O1xuXG4vLyBzZXRzIHVwIG91ciBkb20gb2JqZWN0LCBzbyB3ZSBoYXZlIGEgc3RyaWN0IHNjaGVtYSB0byBcbi8vIGFkaGVyZSB0byBsYXRlciBvbiBpbiB0aGUgYXBpIFxucHJpdi5yZWZlcmVuY2VPYmplY3QgPSBmdW5jdGlvbihlbCkge1xuICB2YXIgb3B0cyA9IHt9LCBhdHRycyA9IGF0dHIoZWwpO1xuICBvcHRzLnZpZGVvSWQgPSBhdHRycygnZGF0YS15dC1hbmFseXRpY3MnKTtcbiAgaWYgKGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnKSA9PSBudWxsKSB7XG4gICAgYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcsIHRydWUpO1xuXG4gICAgLy8gZ2V0IG9wdHMgZnJvbSBkYXRhIGF0dHJzXG4gICAgb3B0cy53aWR0aCA9IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgPyBhdHRycygnZGF0YS15dC13aWR0aCcpIDogNjQwO1xuICAgIG9wdHMuaGVpZ2h0ID0gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgPyBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA6IDM5MDtcbiAgICBvcHRzLnBsYXllclZhcnMgPSBhdHRycygnZGF0YS15dC12YXJzJykgPyBzYWZlUGFyc2UoYXR0cnMoJ2RhdGEteXQtdmFycycpKSA6IG51bGw7XG4gICAgb3B0cy50aXRsZSA9IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgPyBhdHRycygnZGF0YS15dC10aXRsZScpIDogb3B0cy52aWRlb0lkO1xuICAgIFxuICAgIC8vIHNldHVwIHZpZGVvcyBldmVudHMsIGFsbCBhcmUgYXZhaWxhYmxlIHB1YmxpY2FsbHksIG1vcmUgaW5mbyBjYW4gYmUgXG4gICAgLy8gZm91bmQgYXQgZGV2ZWxvcGVycy5nb29nbGUuY29tL3lvdXR1YmUvaWZyYW1lX2FwaV9yZWZlcmVuY2UjRXZlbnRzXG4gICAgb3B0cy5ldmVudHMgPSB7XG4gICAgICBvblJlYWR5OiBwcml2LmV2ZW50cy5yZWFkeSxcbiAgICAgIG9uU3RhdGVDaGFuZ2U6IHByaXYuZXZlbnRzLnN0YXRlQ2hhbmdlLFxuICAgICAgb25FcnJvcjogcHJpdi5ldmVudHMuZXJyb3IsXG4gICAgICBvblBsYXliYWNrUXVhbGl0eUNoYW5nZTogcHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlLFxuICAgICAgb25QbGF5YmFja1JhdGVDaGFuZ2U6IHByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSxcbiAgICAgIG9uQXBpQ2hhbmdlOiBwcml2LmV2ZW50cy5hcGlDaGFuZ2VcbiAgICB9O1xuICAgIFxuICAgIC8vIGJ1aWxkIHZpZGVvIG9iamVjdCB0byBzdG9yZVxuICAgIHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0gPSB7IG9wdHM6IG9wdHMsIGVsOiBlbCwgZXZlbnRzOiB7fSB9O1xuICAgIHByaXYucXVldWUucHVzaChwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdKTtcbiAgfVxufTtcblxuLy8gdGhlIGlmcmFtZV9hcGkgYWxsb3dzIHVzIHRvIGF0dGFjaCBkb20gc3R5bGUgZXZlbnRzIHRvXG4vLyB2aWRlb3MsIHdlIGFsd2F5cyBmaXJlIHRoZXNlIGludGVybmFsbHksIGJ1dCB0aGVuIHdlIFxuLy8gYWxzbyBhbGxvdyB5b3UgdG8gYXR0YWNoIGV2ZW50cyB0byBhIHZpZGVvLCBieSBpdHMgaWRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnByaXYuZXZlbnRzLmFwaUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdhcGlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdhcGlDaGFuZ2UnLCBlKTtcbn07XG5cbi8vIGFjY29yZGluZyB0byB5b3V0dWJlIGRvY3MgdGhlc2Ugc3RhdHVzIGNvZGVzXG4vLyByZXByZXNlbnQgdGhlIHN0YXRlIHN0cmluZyB0aGF0IGlzIGluZGljYXRpdmVcbi8vIG9mIHRoZSBlcnJvclxucHJpdi5ldmVudHMuZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICdpbnZhbGlkIHZpZGVvSWQnO1xuICBpZiAoZS5kYXRhID09IDIgfHwgZS5kYXRhID09IDEwMCkge1xuICAgIC8vIGJhc2ljYWxseSBub3RoaW5nLCBhcyB0aGVzZSBhcmUgZGVmYXVsdHNcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT0gNSkge1xuICAgIHN0YXRlID0gJ2h0bWw1IHBsYXllciBlcnJvcic7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDEwMSB8fCBlLmRhdGEgPT0gMTUwKSB7XG4gICAgc3RhdGUgPSAnZW1iZWRkaW5nIGZvcmJpZGRlbic7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdlcnJvcicsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUmF0ZUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucGxheWJhY2tRdWFsaXR5Q2hhbmdlID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgJ3BsYXliYWNrUXVhbGl0eUNoYW5nZScsIGUpO1xufTtcblxucHJpdi5ldmVudHMucmVhZHkgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygncmVhZHknLCBlLnRhcmdldC5faWQsICdyZWFkeScsIGUpO1xufTtcblxuLy8gd2UgdHJhbnNmb3JtIHRoZSBjdXJyZW50IHN0YXRlIGBpZGAgdG8gYSBodW1hbiByZWFkYWJsZVxuLy8gc3RyaW5nIGJhc2VkIG9uIHRoZSB5b3V0dWJlIGFwaSBkb2NzXG5wcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgdmFyIHN0YXRlID0gJ3Vuc3RhcnRlZCc7XG4gIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkJVRkZFUklORykge1xuICAgIHN0YXRlID0gJ2J1ZmZlcmluZyc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5DVUVEKSB7XG4gICAgc3RhdGUgPSAnY3VlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5FTkRFRCkge1xuICAgIHN0YXRlID0gJ2VuZGVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBBVVNFRCkge1xuICAgIHN0YXRlID0gJ3BhdXNlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QTEFZSU5HKSB7XG4gICAgc3RhdGUgPSAncGxheWluZyc7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdzdGF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxuLy8gcHVibGljIG9uIGV2ZW50LCBzbyB5b3UgY2FuIGV4dGVybmFsbHkgYXR0YWNoIHRvIHZpZGVvc1xuLy8gdGhpcyBmbiBjYW4gYmUgcmVjdXJzaXZlLCBzbyB5b3Uga25vdywgYmUgc21hcnQgd2l0aCB0aGlzXG4vLyB0cnkgdG8gYXZvaWQgZXh0cmVtZWx5IGxhcmdlIGFycmF5cywgb3IgZG9pbmcgYXN5bmMgc3R1ZmZcbi8vIGluc2lkZSBvZiB5b3VyIGV2ZW50cyB3aXRob3V0IHRoZSBwcm9wZXIgc2FmZXR5IG1hdGVyaWFsc1xudmlkZW9BbmFseXRpY3Mub24gPSBmdW5jdGlvbihldmVudHMsIGlkLCBmbikge1xuICB2YXIgcmVjdXJzZSA9IGZhbHNlLCBldmVudCA9IGV2ZW50cztcbiAgaWYgKGV2ZW50cyBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmVjdXJzZSA9IGV2ZW50cy5sZW5ndGggPyB0cnVlIDogZmFsc2U7XG4gICAgZXZlbnQgPSBldmVudHMuc2hpZnQoKTtcbiAgfVxuICAvLyBgKmAgd2lsZGNhcmQgYWxsb3dzIHlvdSB0byBhdHRhY2ggYW4gZXZlbnQgdG8gZXZlcnkgdmlkXG4gIGlmIChpZCA9PT0gJyonKSB7XG4gICAgdmFyIHZpZHMgPSBPYmplY3Qua2V5cyhwcml2LnZpZGVvcyk7XG4gICAgZm9yKHZhciBpPTA7aTx2aWRzLmxlbmd0aDsrK2kpIHtcbiAgICAgIHByaXYuYXR0YWNoRXZlbnRzKHZpZHNbaV0sZXZlbnQsZm4pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwcml2LmF0dGFjaEV2ZW50cyhpZCxldmVudCxmbik7XG4gIH1cbiAgaWYgKHJlY3Vyc2UpIHJldHVybiB2aWRlb0FuYWx5dGljcy5vbihldmVudHMsaWQsZm4pO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBwdWJsaWMgdHJhY2tpbmcgZXZlbnQsIHNvIHlvdSBhdHRhY2ggdmlkZW9zIGFmdGVyIGRvbVxuLy8gbG9hZCwgb3Igd2l0aCBzb21lIGxhdGVudC9hc3luYyByZXF1ZXN0c1xudmlkZW9BbmFseXRpY3MudHJhY2sgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkge1xuICAgIHByaXYuaW5qZWN0U2NyaXB0cygpO1xuICAgIHByaXYuYXR0YWNoVmlkZW9zKHByaXYucXVldWUpO1xuICB9XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIGRlYnVnIG1vZGUsIGFsbG93cyB5b3UgdG8gY2FwdHVyZSBkZWJ1ZyBkYXRhIHNpbXBseVxudmlkZW9BbmFseXRpY3Muc2V0RGVidWcgPSBmdW5jdGlvbihib29sKSB7XG4gIHZhciBlbGVtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEteXQtZGVidWddJyk7XG4gIGJvb2wgPSB0eXBlb2YgYm9vbCA9PT0gJ2Jvb2xlYW4nID8gYm9vbCA6IG51bGw7XG4gIGlmIChlbGVtKSB7XG4gICAgdmFyIGF0dHJzID0gYXR0cihlbGVtKTtcbiAgICB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGF0dHJzKCdkYXRhLXl0LWRlYnVnJykgPT0gJ3RydWUnO1xuICB9XG4gIGlmIChib29sICE9PSBudWxsKSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGJvb2w7XG4gIG1vbi5kZWJ1ZyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnO1xuICB2aWRlb0FuYWx5dGljcy5sb2dzID0gdmlkZW9BbmFseXRpY3MuZGVidWcgPyBtb24uaGlzdG9yeSA6IFtdO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyB3ZSB3YW50IHRvIGhhdmUgZXh0ZXJuYWwgYWNjZXNzIHRvIHRoZSB2aWRlb3Mgd2UncmVcbi8vIHRyYWNraW5nIGZvciBpbnRlcmFjdGlvbiB3aXRoIG90aGVyIGFwaXNcbnZpZGVvQW5hbHl0aWNzLnZpZGVvcyA9IHByaXYudmlkZW9zO1xuICBcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBwcml2LmluaXQsIGZhbHNlKTtcblxubW9kdWxlLmV4cG9ydHMgPSB2aWRlb0FuYWx5dGljczsiLCJ2YXIgYXR0ciA9IGZ1bmN0aW9uKGVsZW0pIHtcbiAgaWYgKHR5cGVvZiBlbGVtICE9ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICRhdHRyKGtleSwgdmFsKSB7XG4gICAgICBpZih0eXBlb2YgdmFsID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBlbGVtLmdldEF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIGlmICh2YWwgPT0gJ3JtJykge1xuICAgICAgICByZXR1cm4gZWxlbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBlbGVtLnNldEF0dHJpYnV0ZShrZXksIHZhbCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG52YXIgc2FmZVBhcnNlID0gZnVuY3Rpb24oc3RyKSB7XG4gIHZhciBvdXRwdXQgPSBudWxsO1xuICB0cnkge1xuICAgIG91dHB1dCA9IEpTT04ucGFyc2Uoc3RyKTtcbiAgfSBjYXRjaCAoZXgpIHt9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0cjogYXR0cixcbiAgc2FmZVBhcnNlOiBzYWZlUGFyc2Vcbn07IiwidmFyIE1vbiA9IGZ1bmN0aW9uKGRlYnVnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBNb24pKSByZXR1cm4gbmV3IE1vbihkZWJ1Zyk7XG4gIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgdGhpcy5oaXN0b3J5ID0gW107XG4gIHJldHVybiB0aGlzO1xufTtcblxuTW9uLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNwID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgdGhpcy5oaXN0b3J5LnB1c2goY3ApO1xuICBpZiAodGhpcy5kZWJ1Zykge1xuICAgIGlmKHR5cGVvZiB3aW5kb3dbJ2NvbnNvbGUnXSAhPSAndW5kZWZpbmVkJyAmJiBjb25zb2xlLmxvZykge1xuICAgICAgaWYgKGNwLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY3BbMF0gPT0gJ29iamVjdCcpIGNwID0gSlNPTi5zdHJpbmdpZnkoY3BbMF0sbnVsbCwyKTtcbiAgICAgIGNvbnNvbGUubG9nKGNwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vbjsiXX0=
(1)
});
