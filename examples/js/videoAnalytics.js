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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV8xMGY3ZWJlZS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgbW9uID0gcmVxdWlyZSgnLi9tb24nKShmYWxzZSk7XG52YXIgYXR0ciA9IGhlbHBlcnMuYXR0ciwgc2FmZVBhcnNlID0gaGVscGVycy5zYWZlUGFyc2U7XG5cbi8vIGFwaSBvYmplY3RzXG52YXIgdmlkZW9BbmFseXRpY3MgPSB7fSwgcHJpdiA9IHt9O1xuXG4vLyB3ZSB3YW50IHRvIGtlZXAgY29udGV4dCBvZiBvdXIgZG9tLCBzbyB3ZSBjYW4gZWFzaWx5IHJlZlxuLy8gdGhlIG5vZGVzIGxhdGVyIG9uXG5wcml2LnZpZGVvcyA9IHt9O1xuXG4vLyBlYWNoIGRvbSBub2RlIHdpbGwgaGF2ZSBldmVudHMgYXR0YWNoZWQgc28gd2UgY2FuIGVhc2lseVxuLy8gaW50ZXJhY3Qgd2l0aCB0aGVtLCB3ZSdsbCBkbyBzb21lIGRhdGEtYmluZGluZyB0byBjb2xsZWN0XG4vLyBvdXIgbm9kZXNcbnByaXYuZXZlbnRzID0ge307XG4gIFxuLy8gdmlkZW9zIHF1ZXVlLCBiZWNhdXNlIHdlIGxvYWQgYSAzcmQgcGFydHkgYXNzZXQgd2Ugd2FudFxuLy8gdG8gbWl0aWdhdGUgcmFjZSBjb25kaXRpb25zIG9mIFlUIG5vdCBiZWluZyByZWFkeSwgc29cbi8vIHdlIGtlZXAgYWxsIHVudHJhY2tlZCB2aWRlb3MgaW4gdGhpcyBxdWV1ZSBhbmQgc2hpZnQgXG4vLyB0aGVtIG91dCBhcyB3ZSBnZXQgdG8gdGhlbVxucHJpdi5xdWV1ZSA9IFtdO1xuXG4vLyBrZWVwIHRyYWNrIG9mIHlvdXR1YmUgY2FsbGluZyBvdXIgZm5cbnByaXYubG9hZGVkID0gZmFsc2U7XG5cbi8vIGluaXQgZm4gdGhhdCBoYXBwZW5zIG9uIERPTUNvbnRlbnRMb2FkZWRcbnByaXYuaW5pdCA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSBwcml2LmluamVjdFNjcmlwdHMoKTtcbn07XG5cbi8vIGF0dGFjaGVzIGV2ZW50cyB0byB2aWRlb3Mgc28gdGhleSBjYW4gYmUgcHJvY2Vzc2VkIGJ5IFxuLy8gdGhlIC5vbigpIGZuXG5wcml2LmF0dGFjaEV2ZW50cyA9IGZ1bmN0aW9uKGlkLCBldmVudCwgZm4pIHtcbiAgaWYgKHByaXYudmlkZW9zW2lkXSkge1xuICAgIGlmICghKHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdIGluc3RhbmNlb2YgQXJyYXkpKSBwcml2LnZpZGVvc1tpZF0uZXZlbnRzW2V2ZW50XSA9IFtdO1xuICAgIHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdLnB1c2goZm4pO1xuICB9XG59O1xuXG4vLyB0aGUgd2F5IHRoZSBpZnJhbWVfYXBpIHdvcmtzIGlzIGJ5IHJlcGxhY2luZyBhbiBlbGVtZW50XG4vLyB3aXRoIGFuIGlmcmFtZSwgc28gd2UnbGwgd2FudCB0byBhdHRhY2ggdGhlIHZpZGVvIGFzIFxuLy8gbmVlZGVkXG5wcml2LmF0dGFjaFZpZGVvcyA9IGZ1bmN0aW9uKHF1ZXVlKSB7XG4gIGlmIChwcml2LmxvYWRlZCkge1xuICAgIHZhciBuZXh0O1xuICAgIHdoaWxlKG5leHQgPSBxdWV1ZS5zaGlmdCgpKSB7XG4gICAgICBuZXh0LnBsYXllciA9IG5ldyBZVC5QbGF5ZXIobmV4dC5lbCwgbmV4dC5vcHRzKTtcbiAgICAgIG5leHQucGxheWVyLl9pZCA9IG5leHQub3B0cy52aWRlb0lkO1xuICAgIH1cbiAgfVxufTtcblxuLy8gd2UnbGwgcnVuIHRoaXMgb24gaW5pdCwgb3Igb24gZGVtYW5kIGZvciBsYXRlbnQgbG9hZGVkXG4vLyBodG1sIGZyYWdtZW50c1xucHJpdi5jb2xsZWN0RG9tID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gd2Ugd2FudCB0byBzZXQgZGVidWcgc3RhdGUgYXNhcCwgc28gd2UgZG8gdGhhdCBiZWZvcmUgXG4gIC8vIHdlIGFjdHVhbGx5IGNvbGxlY3QgYW55IHZpZGVvIGVsZW1zXG4gIHZpZGVvQW5hbHl0aWNzLnNldERlYnVnKCk7XG4gIHZhciBkb20gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS15dC1hbmFseXRpY3NdJyk7XG4gIGZvcih2YXIgaT0wO2k8ZG9tLmxlbmd0aDsrK2kpIHtcbiAgICBwcml2LnJlZmVyZW5jZU9iamVjdChkb21baV0pO1xuICB9XG59O1xuXG4vLyB0aGlzIGZ1bmN0aW9uIGdldHMgZmlyZWQgd2hlbiB5b3V0dWJlIGpzIGlzIGluaXRpYWxpemVkXG4vLyBhbHNvLCB0aGlzIHNhZmVseSBhbGxvd3MgdXMgdG8gZXh0ZXJuYWxseSB1c2UgLnRyYWNrXG4vLyB3aXRob3V0IHJhY2UgY29uZGl0aW9uc1xucHJpdi5leHRlcm5hbEFwaVJlYWR5ID0gZnVuY3Rpb24oKSB7XG4gIHByaXYubG9hZGVkID0gdHJ1ZTtcbiAgcHJpdi5hdHRhY2hWaWRlb3MocHJpdi5xdWV1ZSk7XG59O1xuXG4vLyB3ZSBpbmNsdWRlIHlvdXR1YmVzIGpzIHNjcmlwdCBhc3luYywgYW5kIHdlJ2xsIG5lZWQgdG8gXG4vLyBrZWVwIHRyYWNrIG9mIHRoZSBzdGF0ZSBvZiB0aGF0IGluY2x1ZGVcbnByaXYuaW5qZWN0U2NyaXB0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIGlmICghcHJpdi5zY3JpcHRJbmNsdWRlKSB7XG4gICAgLy8gd2Ugb25seSB3YW50IHRvIGRvIHRoaXMgb25jZSwgYW5kIHRoaXMgaXMgdGhlIGJlc3RcbiAgICAvLyB0aW1lIHRvIGRvIHRoaXMgb25jZSwgdGhpcyBhbHNvIGtlZXBzIGFsbCBvZiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdHVmZiB0byBhIHNpbmdsZSBlbnRyeSwgc28gaXQgd29ya3NcbiAgICB3aW5kb3dbJ29uWW91VHViZUlmcmFtZUFQSVJlYWR5J10gPSBwcml2LmV4dGVybmFsQXBpUmVhZHk7XG5cbiAgICB2YXIgcGxhY2VtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdO1xuICAgIHByaXYuc2NyaXB0SW5jbHVkZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgIFxuICAgIC8vIGlmIGZuLCBsZXRzIHRyZWF0IGFzeW5jLCBvdGhlcndpc2Ugd2UnbGwgYmUgYmxvY2tpbmdcbiAgICBpZiAodHlwZW9mIGZuID09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ2FzeW5jJywgdHJ1ZSk7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGZuLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgcHJpdi5zY3JpcHRJbmNsdWRlLnNldEF0dHJpYnV0ZSgnc3JjJywgJy8vd3d3LnlvdXR1YmUuY29tL2lmcmFtZV9hcGknKTtcbiAgICBwbGFjZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUocHJpdi5zY3JpcHRJbmNsdWRlLCBwbGFjZW1lbnQpO1xuICB9XG59O1xuXG4vLyB3ZSB3YW50IHRvIHN0YW5kYXJkaXplIGhvdyB3ZSBoYW5kbGUgZXZlbnRzLCB0aGlzIGlzIHRoZVxuLy8gZm4gdGhhdCBoYW5kbGVzIHN1Y2ggdGhpbmdzXG5wcml2LnByb2Nlc3NFdmVudHMgPSBmdW5jdGlvbihrZXksIGlkLCBzdGF0ZSwgZSkge1xuICB2YXIgZXZlbnRzID0gcHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldLFxuICAgICAgcGxheWVyID0gcHJpdi52aWRlb3NbaWRdLnBsYXllcjtcbiAgLy8gaWYgd2UgZ2V0IGF0IG91ciB2aWRlb3MgZXh0ZXJuYWxseSwgd2Ugd2lsbCBsaWtlbHlcbiAgLy8gd2FudCB0byBrbm93IHdoYXRldmVyIHRoZSBzdGF0ZSBvZiB0aGUgY3VycmVudCB2aWRlb1xuICAvLyBpcyBpblxuICBwcml2LnZpZGVvc1tpZF0uY3VycmVudFN0YXRlID0gc3RhdGU7XG4gIC8vIHRpdGxlIHdpbGwgZmFsbGJhY2sgdG8gdGhlIGlkLCBzbyB3ZSBjYW4gZGV0ZWN0IHdoZW5cbiAgLy8gd2UgY2FuIGNhbGwgb24gdGhlIHlvdXR1YmUgYXBpIHRvIGdldCB0aGUgdmlkZW8gdGl0bGVcbiAgLy8gdGhpcyB3aWxsIGFsbG93IHVzIHRvIGhhdmUgaHVtYW4gcmVhZGFibGUgdGl0bGVzXG4gIGlmIChwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9PSBpZCkge1xuICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gYWNjZXB0IGFueSB1bmRlZmluZWQgdmlkZW8gdGl0bGVzLFxuICAgIC8vIHNvIHdlJ2xsIGdyYWNlZnVsbHkgZmFsbGJhY2sgdG8gb3VyIGlkLCB0aGlzIHJlYWxseVxuICAgIC8vIG9ubHkgaGFwcGVucyB3aGVuIHdlIGFyZSBpbiBhIHZpZGVvIGVycm9yIHN0YXRlc1xuICAgIHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlID0gcGxheWVyLmdldFZpZGVvRGF0YSgpLnRpdGxlID8gcGxheWVyLmdldFZpZGVvRGF0YSgpLnRpdGxlIDogaWQ7XG4gIH1cbiAgLy8gWW91VHViZSByZWNvcmRzIHZpZGVvIHRpbWVzIGFzIGEgZmxvYXQsIGkgYW1cbiAgLy8gYXNzdW1pbmcgd2Ugd29uJ3QgbmVlZC93YW50IHRvIGhhdmUgc3VjaCBwcmVjaXNpb25cbiAgLy8gaGVyZSB3aXRoIHRoZSBNYXRoLmZsb29yKCkgY2FsbHNcbiAgdmFyIGV2ZW50U3RhdGUgPSB7XG4gICAgY3VycmVudFRpbWU6IE1hdGguZmxvb3IocGxheWVyLmdldEN1cnJlbnRUaW1lKCkpLCBcbiAgICBkdXJhdGlvbjogTWF0aC5mbG9vcihwbGF5ZXIuZ2V0RHVyYXRpb24oKSksXG4gICAgZXZlbnQ6IGtleSxcbiAgICBpZDogaWQsXG4gICAgdGl0bGU6IHByaXYudmlkZW9zW2lkXS5vcHRzLnRpdGxlLFxuICAgIHN0YXRlOiBwcml2LnZpZGVvc1tpZF0uY3VycmVudFN0YXRlLFxuICAgIG11dGVkOiBwbGF5ZXIuaXNNdXRlZCgpLFxuICAgIG1zOiBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuICB9O1xuICBpZiAocHJpdi52aWRlb3NbaWRdLmV2ZW50c1trZXldKSB7XG4gICAgZm9yKHZhciBpPTA7aTxldmVudHMubGVuZ3RoOysraSkge1xuICAgICAgZXZlbnRzW2ldKGUsIGV2ZW50U3RhdGUpO1xuICAgIH1cbiAgfVxuICBtb24ubG9nKGV2ZW50U3RhdGUpO1xufTtcblxuLy8gc2V0cyB1cCBvdXIgZG9tIG9iamVjdCwgc28gd2UgaGF2ZSBhIHN0cmljdCBzY2hlbWEgdG8gXG4vLyBhZGhlcmUgdG8gbGF0ZXIgb24gaW4gdGhlIGFwaSBcbnByaXYucmVmZXJlbmNlT2JqZWN0ID0gZnVuY3Rpb24oZWwpIHtcbiAgdmFyIG9wdHMgPSB7fSwgYXR0cnMgPSBhdHRyKGVsKTtcbiAgb3B0cy52aWRlb0lkID0gYXR0cnMoJ2RhdGEteXQtYW5hbHl0aWNzJyk7XG4gIGlmIChhdHRycygnZGF0YS15dC10cmFja2VkJykgPT0gbnVsbCkge1xuICAgIGF0dHJzKCdkYXRhLXl0LXRyYWNrZWQnLCB0cnVlKTtcblxuICAgIC8vIGdldCBvcHRzIGZyb20gZGF0YSBhdHRyc1xuICAgIG9wdHMud2lkdGggPSBhdHRycygnZGF0YS15dC13aWR0aCcpID8gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA6IDY0MDtcbiAgICBvcHRzLmhlaWdodCA9IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpID8gYXR0cnMoJ2RhdGEteXQtaGVpZ2h0JykgOiAzOTA7XG4gICAgb3B0cy5wbGF5ZXJWYXJzID0gYXR0cnMoJ2RhdGEteXQtdmFycycpID8gc2FmZVBhcnNlKGF0dHJzKCdkYXRhLXl0LXZhcnMnKSkgOiBudWxsO1xuICAgIG9wdHMudGl0bGUgPSBhdHRycygnZGF0YS15dC10aXRsZScpID8gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA6IG9wdHMudmlkZW9JZDtcbiAgICBcbiAgICAvLyBzZXR1cCB2aWRlb3MgZXZlbnRzLCBhbGwgYXJlIGF2YWlsYWJsZSBwdWJsaWNhbGx5LCBtb3JlIGluZm8gY2FuIGJlIFxuICAgIC8vIGZvdW5kIGF0IGRldmVsb3BlcnMuZ29vZ2xlLmNvbS95b3V0dWJlL2lmcmFtZV9hcGlfcmVmZXJlbmNlI0V2ZW50c1xuICAgIG9wdHMuZXZlbnRzID0ge1xuICAgICAgb25SZWFkeTogcHJpdi5ldmVudHMucmVhZHksXG4gICAgICBvblN0YXRlQ2hhbmdlOiBwcml2LmV2ZW50cy5zdGF0ZUNoYW5nZSxcbiAgICAgIG9uRXJyb3I6IHByaXYuZXZlbnRzLmVycm9yLFxuICAgICAgb25QbGF5YmFja1F1YWxpdHlDaGFuZ2U6IHByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSxcbiAgICAgIG9uUGxheWJhY2tSYXRlQ2hhbmdlOiBwcml2LmV2ZW50cy5wbGF5YmFja1JhdGVDaGFuZ2UsXG4gICAgICBvbkFwaUNoYW5nZTogcHJpdi5ldmVudHMuYXBpQ2hhbmdlXG4gICAgfTtcbiAgICBcbiAgICAvLyBidWlsZCB2aWRlbyBvYmplY3QgdG8gc3RvcmVcbiAgICBwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdID0geyBvcHRzOiBvcHRzLCBlbDogZWwsIGV2ZW50czoge30gfTtcbiAgICBwcml2LnF1ZXVlLnB1c2gocHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXSk7XG4gIH1cbn07XG5cbi8vIHRoZSBpZnJhbWVfYXBpIGFsbG93cyB1cyB0byBhdHRhY2ggZG9tIHN0eWxlIGV2ZW50cyB0b1xuLy8gdmlkZW9zLCB3ZSBhbHdheXMgZmlyZSB0aGVzZSBpbnRlcm5hbGx5LCBidXQgdGhlbiB3ZSBcbi8vIGFsc28gYWxsb3cgeW91IHRvIGF0dGFjaCBldmVudHMgdG8gYSB2aWRlbywgYnkgaXRzIGlkXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5wcml2LmV2ZW50cy5hcGlDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnYXBpQ2hhbmdlJywgZS50YXJnZXQuX2lkLCAnYXBpQ2hhbmdlJywgZSk7XG59O1xuXG4vLyBhY2NvcmRpbmcgdG8geW91dHViZSBkb2NzIHRoZXNlIHN0YXR1cyBjb2Rlc1xuLy8gcmVwcmVzZW50IHRoZSBzdGF0ZSBzdHJpbmcgdGhhdCBpcyBpbmRpY2F0aXZlXG4vLyBvZiB0aGUgZXJyb3JcbnByaXYuZXZlbnRzLmVycm9yID0gZnVuY3Rpb24oZSkge1xuICB2YXIgc3RhdGUgPSAnaW52YWxpZCB2aWRlb0lkJztcbiAgaWYgKGUuZGF0YSA9PSAyIHx8IGUuZGF0YSA9PSAxMDApIHtcbiAgICAvLyBiYXNpY2FsbHkgbm90aGluZywgYXMgdGhlc2UgYXJlIGRlZmF1bHRzXG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDUpIHtcbiAgICBzdGF0ZSA9ICdodG1sNSBwbGF5ZXIgZXJyb3InO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSAxMDEgfHwgZS5kYXRhID09IDE1MCkge1xuICAgIHN0YXRlID0gJ2VtYmVkZGluZyBmb3JiaWRkZW4nO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnZXJyb3InLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnJlYWR5ID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3JlYWR5JywgZS50YXJnZXQuX2lkLCAncmVhZHknLCBlKTtcbn07XG5cbi8vIHdlIHRyYW5zZm9ybSB0aGUgY3VycmVudCBzdGF0ZSBgaWRgIHRvIGEgaHVtYW4gcmVhZGFibGVcbi8vIHN0cmluZyBiYXNlZCBvbiB0aGUgeW91dHViZSBhcGkgZG9jc1xucHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICd1bnN0YXJ0ZWQnO1xuICBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5CVUZGRVJJTkcpIHtcbiAgICBzdGF0ZSA9ICdidWZmZXJpbmcnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQ1VFRCkge1xuICAgIHN0YXRlID0gJ2N1ZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuRU5ERUQpIHtcbiAgICBzdGF0ZSA9ICdlbmRlZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09PSBZVC5QbGF5ZXJTdGF0ZS5QQVVTRUQpIHtcbiAgICBzdGF0ZSA9ICdwYXVzZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUExBWUlORykge1xuICAgIHN0YXRlID0gJ3BsYXlpbmcnO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnc3RhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbi8vIHB1YmxpYyBvbiBldmVudCwgc28geW91IGNhbiBleHRlcm5hbGx5IGF0dGFjaCB0byB2aWRlb3Ncbi8vIHRoaXMgZm4gY2FuIGJlIHJlY3Vyc2l2ZSwgc28geW91IGtub3csIGJlIHNtYXJ0IHdpdGggdGhpc1xuLy8gdHJ5IHRvIGF2b2lkIGV4dHJlbWVseSBsYXJnZSBhcnJheXMsIG9yIGRvaW5nIGFzeW5jIHN0dWZmXG4vLyBpbnNpZGUgb2YgeW91ciBldmVudHMgd2l0aG91dCB0aGUgcHJvcGVyIHNhZmV0eSBtYXRlcmlhbHNcbnZpZGVvQW5hbHl0aWNzLm9uID0gZnVuY3Rpb24oZXZlbnRzLCBpZCwgZm4pIHtcbiAgdmFyIHJlY3Vyc2UgPSBmYWxzZSwgZXZlbnQgPSBldmVudHM7XG4gIGlmIChldmVudHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJlY3Vyc2UgPSBldmVudHMubGVuZ3RoID8gdHJ1ZSA6IGZhbHNlO1xuICAgIGV2ZW50ID0gZXZlbnRzLnNoaWZ0KCk7XG4gIH1cbiAgLy8gYCpgIHdpbGRjYXJkIGFsbG93cyB5b3UgdG8gYXR0YWNoIGFuIGV2ZW50IHRvIGV2ZXJ5IHZpZFxuICBpZiAoaWQgPT09ICcqJykge1xuICAgIHZhciB2aWRzID0gT2JqZWN0LmtleXMocHJpdi52aWRlb3MpO1xuICAgIGZvcih2YXIgaT0wO2k8dmlkcy5sZW5ndGg7KytpKSB7XG4gICAgICBwcml2LmF0dGFjaEV2ZW50cyh2aWRzW2ldLGV2ZW50LGZuKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcHJpdi5hdHRhY2hFdmVudHMoaWQsZXZlbnQsZm4pO1xuICB9XG4gIGlmIChyZWN1cnNlKSByZXR1cm4gdmlkZW9BbmFseXRpY3Mub24oZXZlbnRzLGlkLGZuKTtcbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gZGVidWcgbW9kZSwgYWxsb3dzIHlvdSB0byBjYXB0dXJlIGRlYnVnIGRhdGEgc2ltcGx5XG52aWRlb0FuYWx5dGljcy5zZXREZWJ1ZyA9IGZ1bmN0aW9uKGJvb2wpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS15dC1kZWJ1Z10nKTtcbiAgYm9vbCA9IHR5cGVvZiBib29sID09PSAnYm9vbGVhbicgPyBib29sIDogbnVsbDtcbiAgaWYgKGVsZW0pIHtcbiAgICB2YXIgYXR0cnMgPSBhdHRyKGVsZW0pO1xuICAgIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYXR0cnMoJ2RhdGEteXQtZGVidWcnKSA9PSAndHJ1ZSc7XG4gIH1cbiAgaWYgKGJvb2wgIT09IG51bGwpIHZpZGVvQW5hbHl0aWNzLmRlYnVnID0gYm9vbDtcbiAgbW9uLmRlYnVnID0gdmlkZW9BbmFseXRpY3MuZGVidWc7XG4gIHZpZGVvQW5hbHl0aWNzLmxvZ3MgPSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA/IG1vbi5oaXN0b3J5IDogW107XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHB1YmxpYyB0cmFja2luZyBldmVudCwgc28geW91IGF0dGFjaCB2aWRlb3MgYWZ0ZXIgZG9tXG4vLyBsb2FkLCBvciB3aXRoIHNvbWUgbGF0ZW50L2FzeW5jIHJlcXVlc3RzXG52aWRlb0FuYWx5dGljcy50cmFjayA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSB7XG4gICAgcHJpdi5pbmplY3RTY3JpcHRzKCk7XG4gICAgcHJpdi5hdHRhY2hWaWRlb3MocHJpdi5xdWV1ZSk7XG4gIH1cbiAgcmV0dXJuIHZpZGVvQW5hbHl0aWNzO1xufTtcblxuLy8gd2Ugd2FudCB0byBoYXZlIGV4dGVybmFsIGFjY2VzcyB0byB0aGUgdmlkZW9zIHdlJ3JlXG4vLyB0cmFja2luZyBmb3IgaW50ZXJhY3Rpb24gd2l0aCBvdGhlciBhcGlzXG52aWRlb0FuYWx5dGljcy52aWRlb3MgPSBwcml2LnZpZGVvcztcbiAgXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgcHJpdi5pbml0LCBmYWxzZSk7XG5cbm1vZHVsZS5leHBvcnRzID0gdmlkZW9BbmFseXRpY3M7IiwidmFyIGF0dHIgPSBmdW5jdGlvbihlbGVtKSB7XG4gIGlmICh0eXBlb2YgZWxlbSAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAkYXR0cihrZXksIHZhbCkge1xuICAgICAgaWYodHlwZW9mIHZhbCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIH0gZWxzZSBpZiAodmFsID09ICdybScpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZWxlbS5zZXRBdHRyaWJ1dGUoa2V5LCB2YWwpO1xuICAgICAgfVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxudmFyIHNhZmVQYXJzZSA9IGZ1bmN0aW9uKHN0cikge1xuICB2YXIgb3V0cHV0ID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBvdXRwdXQgPSBKU09OLnBhcnNlKHN0cik7XG4gIH0gY2F0Y2ggKGV4KSB7fVxuICByZXR1cm4gb3V0cHV0O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dHI6IGF0dHIsXG4gIHNhZmVQYXJzZTogc2FmZVBhcnNlXG59OyIsInZhciBNb24gPSBmdW5jdGlvbihkZWJ1Zykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTW9uKSkgcmV0dXJuIG5ldyBNb24oZGVidWcpO1xuICB0aGlzLmRlYnVnID0gZGVidWc7XG4gIHRoaXMuaGlzdG9yeSA9IFtdO1xuICByZXR1cm4gdGhpcztcbn07XG5cbk1vbi5wcm90b3R5cGUubG9nID0gZnVuY3Rpb24oKSB7XG4gIHZhciBjcCA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gIHRoaXMuaGlzdG9yeS5wdXNoKGNwKTtcbiAgaWYgKHRoaXMuZGVidWcpIHtcbiAgICBpZih0eXBlb2Ygd2luZG93Wydjb25zb2xlJ10gIT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZS5sb2cpIHtcbiAgICAgIGlmIChjcC5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGNwWzBdID09ICdvYmplY3QnKSBjcCA9IEpTT04uc3RyaW5naWZ5KGNwWzBdLG51bGwsMik7XG4gICAgICBjb25zb2xlLmxvZyhjcCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb247Il19
(1)
});
