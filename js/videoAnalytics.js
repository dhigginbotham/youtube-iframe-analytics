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
  if (!priv.videos[id]) priv.videos[id] = {};
  if (!priv.videos[id].events) priv.videos[id].events = {};
  if (!(priv.videos[id].events[event] instanceof Array)) priv.videos[id].events[event] = [];
  priv.videos[id].events[event].push(fn);
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
    
    // build video object to store if we need to
    if (!priv.videos.hasOwnProperty(opts.videoId)) {
      priv.videos[opts.videoId] = {};
    }
    
    priv.videos[opts.videoId].opts = opts;
    priv.videos[opts.videoId].el = el;
    priv.queue.push(priv.videos[opts.videoId]);
  }
};

//
// EVENTS
// --------------------------------------------------------
// the iframe_api allows us to attach dom style events to
// videos, we always fire these internally, but then we 
// also allow you to attach events to a video, by its id
//

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
  var state = 'unknown';
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

//
// PUBLIC API
// --------------------------------------------------------
//

// public on event, so you can externally attach to videos
// this fn can be recursive, so you know, be smart with this
// try to avoid extremely large arrays, or doing async stuff
// inside of your events without the proper safety materials
videoAnalytics.on = function(events, id, fn) {
  var recurse = false, ev = events;
  if (events instanceof Array) {
    recurse = events.length > 0, ev = events.shift();
  }
  // `*` wildcard allows you to attach an event to every vid
  if (id === '*') {
    var vids = Object.keys(priv.videos);
    if (!vids.length) return videoAnalytics;
    for(var i=0;i<vids.length;++i) {
      priv.attachEvents(vids[i],ev,fn);
    }
  } else {
    priv.attachEvents(id,ev,fn);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9oaWdnYW11ZmZpbi9jb2RlL3lvdXR1YmUtaWZyYW1lLWFuYWx5dGljcy9zcmMvZmFrZV9iMGE4MjMzNS5qcyIsIi9ob21lL2hpZ2dhbXVmZmluL2NvZGUveW91dHViZS1pZnJhbWUtYW5hbHl0aWNzL3NyYy9oZWxwZXJzLmpzIiwiL2hvbWUvaGlnZ2FtdWZmaW4vY29kZS95b3V0dWJlLWlmcmFtZS1hbmFseXRpY3Mvc3JjL21vbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgbW9uID0gcmVxdWlyZSgnLi9tb24nKShmYWxzZSk7XG52YXIgYXR0ciA9IGhlbHBlcnMuYXR0ciwgc2FmZVBhcnNlID0gaGVscGVycy5zYWZlUGFyc2U7XG5cbi8vIGFwaSBvYmplY3RzXG52YXIgdmlkZW9BbmFseXRpY3MgPSB7fSwgcHJpdiA9IHt9O1xuXG4vLyB3ZSB3YW50IHRvIGtlZXAgY29udGV4dCBvZiBvdXIgZG9tLCBzbyB3ZSBjYW4gZWFzaWx5IHJlZlxuLy8gdGhlIG5vZGVzIGxhdGVyIG9uXG5wcml2LnZpZGVvcyA9IHt9O1xuXG4vLyBlYWNoIGRvbSBub2RlIHdpbGwgaGF2ZSBldmVudHMgYXR0YWNoZWQgc28gd2UgY2FuIGVhc2lseVxuLy8gaW50ZXJhY3Qgd2l0aCB0aGVtLCB3ZSdsbCBkbyBzb21lIGRhdGEtYmluZGluZyB0byBjb2xsZWN0XG4vLyBvdXIgbm9kZXNcbnByaXYuZXZlbnRzID0ge307XG4gIFxuLy8gdmlkZW9zIHF1ZXVlLCBiZWNhdXNlIHdlIGxvYWQgYSAzcmQgcGFydHkgYXNzZXQgd2Ugd2FudFxuLy8gdG8gbWl0aWdhdGUgcmFjZSBjb25kaXRpb25zIG9mIFlUIG5vdCBiZWluZyByZWFkeSwgc29cbi8vIHdlIGtlZXAgYWxsIHVudHJhY2tlZCB2aWRlb3MgaW4gdGhpcyBxdWV1ZSBhbmQgc2hpZnQgXG4vLyB0aGVtIG91dCBhcyB3ZSBnZXQgdG8gdGhlbVxucHJpdi5xdWV1ZSA9IFtdO1xuXG4vLyBrZWVwIHRyYWNrIG9mIHlvdXR1YmUgY2FsbGluZyBvdXIgZm5cbnByaXYubG9hZGVkID0gZmFsc2U7XG5cbi8vIGluaXQgZm4gdGhhdCBoYXBwZW5zIG9uIERPTUNvbnRlbnRMb2FkZWRcbnByaXYuaW5pdCA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmNvbGxlY3REb20oKTtcbiAgaWYgKHByaXYucXVldWUubGVuZ3RoKSBwcml2LmluamVjdFNjcmlwdHMoKTtcbn07XG5cbi8vIGF0dGFjaGVzIGV2ZW50cyB0byB2aWRlb3Mgc28gdGhleSBjYW4gYmUgcHJvY2Vzc2VkIGJ5IFxuLy8gdGhlIC5vbigpIGZuXG5wcml2LmF0dGFjaEV2ZW50cyA9IGZ1bmN0aW9uKGlkLCBldmVudCwgZm4pIHtcbiAgaWYgKCFwcml2LnZpZGVvc1tpZF0pIHByaXYudmlkZW9zW2lkXSA9IHt9O1xuICBpZiAoIXByaXYudmlkZW9zW2lkXS5ldmVudHMpIHByaXYudmlkZW9zW2lkXS5ldmVudHMgPSB7fTtcbiAgaWYgKCEocHJpdi52aWRlb3NbaWRdLmV2ZW50c1tldmVudF0gaW5zdGFuY2VvZiBBcnJheSkpIHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdID0gW107XG4gIHByaXYudmlkZW9zW2lkXS5ldmVudHNbZXZlbnRdLnB1c2goZm4pO1xufTtcblxuLy8gdGhlIHdheSB0aGUgaWZyYW1lX2FwaSB3b3JrcyBpcyBieSByZXBsYWNpbmcgYW4gZWxlbWVudFxuLy8gd2l0aCBhbiBpZnJhbWUsIHNvIHdlJ2xsIHdhbnQgdG8gYXR0YWNoIHRoZSB2aWRlbyBhcyBcbi8vIG5lZWRlZFxucHJpdi5hdHRhY2hWaWRlb3MgPSBmdW5jdGlvbihxdWV1ZSkge1xuICBpZiAocHJpdi5sb2FkZWQpIHtcbiAgICB2YXIgbmV4dDtcbiAgICB3aGlsZShuZXh0ID0gcXVldWUuc2hpZnQoKSkge1xuICAgICAgbmV4dC5wbGF5ZXIgPSBuZXcgWVQuUGxheWVyKG5leHQuZWwsIG5leHQub3B0cyk7XG4gICAgICBuZXh0LnBsYXllci5faWQgPSBuZXh0Lm9wdHMudmlkZW9JZDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIHdlJ2xsIHJ1biB0aGlzIG9uIGluaXQsIG9yIG9uIGRlbWFuZCBmb3IgbGF0ZW50IGxvYWRlZFxuLy8gaHRtbCBmcmFnbWVudHNcbnByaXYuY29sbGVjdERvbSA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIHdlIHdhbnQgdG8gc2V0IGRlYnVnIHN0YXRlIGFzYXAsIHNvIHdlIGRvIHRoYXQgYmVmb3JlIFxuICAvLyB3ZSBhY3R1YWxseSBjb2xsZWN0IGFueSB2aWRlbyBlbGVtc1xuICB2aWRlb0FuYWx5dGljcy5zZXREZWJ1ZygpO1xuICB2YXIgZG9tID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEteXQtYW5hbHl0aWNzXScpO1xuICBmb3IodmFyIGk9MDtpPGRvbS5sZW5ndGg7KytpKSB7XG4gICAgcHJpdi5yZWZlcmVuY2VPYmplY3QoZG9tW2ldKTtcbiAgfVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBnZXRzIGZpcmVkIHdoZW4geW91dHViZSBqcyBpcyBpbml0aWFsaXplZFxuLy8gYWxzbywgdGhpcyBzYWZlbHkgYWxsb3dzIHVzIHRvIGV4dGVybmFsbHkgdXNlIC50cmFja1xuLy8gd2l0aG91dCByYWNlIGNvbmRpdGlvbnNcbnByaXYuZXh0ZXJuYWxBcGlSZWFkeSA9IGZ1bmN0aW9uKCkge1xuICBwcml2LmxvYWRlZCA9IHRydWU7XG4gIHByaXYuYXR0YWNoVmlkZW9zKHByaXYucXVldWUpO1xufTtcblxuLy8gd2UgaW5jbHVkZSB5b3V0dWJlcyBqcyBzY3JpcHQgYXN5bmMsIGFuZCB3ZSdsbCBuZWVkIHRvIFxuLy8ga2VlcCB0cmFjayBvZiB0aGUgc3RhdGUgb2YgdGhhdCBpbmNsdWRlXG5wcml2LmluamVjdFNjcmlwdHMgPSBmdW5jdGlvbihmbikge1xuICBpZiAoIXByaXYuc2NyaXB0SW5jbHVkZSkge1xuICAgIC8vIHdlIG9ubHkgd2FudCB0byBkbyB0aGlzIG9uY2UsIGFuZCB0aGlzIGlzIHRoZSBiZXN0XG4gICAgLy8gdGltZSB0byBkbyB0aGlzIG9uY2UsIHRoaXMgYWxzbyBrZWVwcyBhbGwgb2YgdGhlXG4gICAgLy8gY29uZGl0aW9uYWwgc3R1ZmYgdG8gYSBzaW5nbGUgZW50cnksIHNvIGl0IHdvcmtzXG4gICAgd2luZG93WydvbllvdVR1YmVJZnJhbWVBUElSZWFkeSddID0gcHJpdi5leHRlcm5hbEFwaVJlYWR5O1xuXG4gICAgdmFyIHBsYWNlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXTtcbiAgICBwcml2LnNjcmlwdEluY2x1ZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICBcbiAgICAvLyBpZiBmbiwgbGV0cyB0cmVhdCBhc3luYywgb3RoZXJ3aXNlIHdlJ2xsIGJlIGJsb2NraW5nXG4gICAgaWYgKHR5cGVvZiBmbiA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcml2LnNjcmlwdEluY2x1ZGUuc2V0QXR0cmlidXRlKCdhc3luYycsIHRydWUpO1xuICAgICAgcHJpdi5zY3JpcHRJbmNsdWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmbiwgZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXYuc2NyaXB0SW5jbHVkZS5zZXRBdHRyaWJ1dGUoJ3NyYycsICcvL3d3dy55b3V0dWJlLmNvbS9pZnJhbWVfYXBpJyk7XG4gICAgcGxhY2VtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHByaXYuc2NyaXB0SW5jbHVkZSwgcGxhY2VtZW50KTtcbiAgfVxufTtcblxuLy8gd2Ugd2FudCB0byBzdGFuZGFyZGl6ZSBob3cgd2UgaGFuZGxlIGV2ZW50cywgdGhpcyBpcyB0aGVcbi8vIGZuIHRoYXQgaGFuZGxlcyBzdWNoIHRoaW5nc1xucHJpdi5wcm9jZXNzRXZlbnRzID0gZnVuY3Rpb24oa2V5LCBpZCwgc3RhdGUsIGUpIHtcbiAgdmFyIGV2ZW50cyA9IHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSxcbiAgICAgIHBsYXllciA9IHByaXYudmlkZW9zW2lkXS5wbGF5ZXI7XG4gIC8vIGlmIHdlIGdldCBhdCBvdXIgdmlkZW9zIGV4dGVybmFsbHksIHdlIHdpbGwgbGlrZWx5XG4gIC8vIHdhbnQgdG8ga25vdyB3aGF0ZXZlciB0aGUgc3RhdGUgb2YgdGhlIGN1cnJlbnQgdmlkZW9cbiAgLy8gaXMgaW5cbiAgcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAvLyB0aXRsZSB3aWxsIGZhbGxiYWNrIHRvIHRoZSBpZCwgc28gd2UgY2FuIGRldGVjdCB3aGVuXG4gIC8vIHdlIGNhbiBjYWxsIG9uIHRoZSB5b3V0dWJlIGFwaSB0byBnZXQgdGhlIHZpZGVvIHRpdGxlXG4gIC8vIHRoaXMgd2lsbCBhbGxvdyB1cyB0byBoYXZlIGh1bWFuIHJlYWRhYmxlIHRpdGxlc1xuICBpZiAocHJpdi52aWRlb3NbaWRdLm9wdHMudGl0bGUgPT0gaWQpIHtcbiAgICAvLyB3ZSBkb24ndCB3YW50IHRvIGFjY2VwdCBhbnkgdW5kZWZpbmVkIHZpZGVvIHRpdGxlcyxcbiAgICAvLyBzbyB3ZSdsbCBncmFjZWZ1bGx5IGZhbGxiYWNrIHRvIG91ciBpZCwgdGhpcyByZWFsbHlcbiAgICAvLyBvbmx5IGhhcHBlbnMgd2hlbiB3ZSBhcmUgaW4gYSB2aWRlbyBlcnJvciBzdGF0ZXNcbiAgICBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSA9IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA/IHBsYXllci5nZXRWaWRlb0RhdGEoKS50aXRsZSA6IGlkO1xuICB9XG4gIC8vIFlvdVR1YmUgcmVjb3JkcyB2aWRlbyB0aW1lcyBhcyBhIGZsb2F0LCBpIGFtXG4gIC8vIGFzc3VtaW5nIHdlIHdvbid0IG5lZWQvd2FudCB0byBoYXZlIHN1Y2ggcHJlY2lzaW9uXG4gIC8vIGhlcmUgd2l0aCB0aGUgTWF0aC5mbG9vcigpIGNhbGxzXG4gIHZhciBldmVudFN0YXRlID0ge1xuICAgIGN1cnJlbnRUaW1lOiBNYXRoLmZsb29yKHBsYXllci5nZXRDdXJyZW50VGltZSgpKSwgXG4gICAgZHVyYXRpb246IE1hdGguZmxvb3IocGxheWVyLmdldER1cmF0aW9uKCkpLFxuICAgIGV2ZW50OiBrZXksXG4gICAgaWQ6IGlkLFxuICAgIHRpdGxlOiBwcml2LnZpZGVvc1tpZF0ub3B0cy50aXRsZSxcbiAgICBzdGF0ZTogcHJpdi52aWRlb3NbaWRdLmN1cnJlbnRTdGF0ZSxcbiAgICBtdXRlZDogcGxheWVyLmlzTXV0ZWQoKSxcbiAgICBtczogbmV3IERhdGUoKS5nZXRUaW1lKClcbiAgfTtcbiAgaWYgKHByaXYudmlkZW9zW2lkXS5ldmVudHNba2V5XSkge1xuICAgIGZvcih2YXIgaT0wO2k8ZXZlbnRzLmxlbmd0aDsrK2kpIHtcbiAgICAgIGV2ZW50c1tpXShlLCBldmVudFN0YXRlKTtcbiAgICB9XG4gIH1cbiAgbW9uLmxvZyhldmVudFN0YXRlKTtcbn07XG5cbi8vIHNldHMgdXAgb3VyIGRvbSBvYmplY3QsIHNvIHdlIGhhdmUgYSBzdHJpY3Qgc2NoZW1hIHRvIFxuLy8gYWRoZXJlIHRvIGxhdGVyIG9uIGluIHRoZSBhcGkgXG5wcml2LnJlZmVyZW5jZU9iamVjdCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBvcHRzID0ge30sIGF0dHJzID0gYXR0cihlbCk7XG4gIG9wdHMudmlkZW9JZCA9IGF0dHJzKCdkYXRhLXl0LWFuYWx5dGljcycpO1xuICBpZiAoYXR0cnMoJ2RhdGEteXQtdHJhY2tlZCcpID09IG51bGwpIHtcbiAgICBhdHRycygnZGF0YS15dC10cmFja2VkJywgdHJ1ZSk7XG5cbiAgICAvLyBnZXQgb3B0cyBmcm9tIGRhdGEgYXR0cnNcbiAgICBvcHRzLndpZHRoID0gYXR0cnMoJ2RhdGEteXQtd2lkdGgnKSA/IGF0dHJzKCdkYXRhLXl0LXdpZHRoJykgOiA2NDA7XG4gICAgb3B0cy5oZWlnaHQgPSBhdHRycygnZGF0YS15dC1oZWlnaHQnKSA/IGF0dHJzKCdkYXRhLXl0LWhlaWdodCcpIDogMzkwO1xuICAgIG9wdHMucGxheWVyVmFycyA9IGF0dHJzKCdkYXRhLXl0LXZhcnMnKSA/IHNhZmVQYXJzZShhdHRycygnZGF0YS15dC12YXJzJykpIDogbnVsbDtcbiAgICBvcHRzLnRpdGxlID0gYXR0cnMoJ2RhdGEteXQtdGl0bGUnKSA/IGF0dHJzKCdkYXRhLXl0LXRpdGxlJykgOiBvcHRzLnZpZGVvSWQ7XG4gICAgXG4gICAgLy8gc2V0dXAgdmlkZW9zIGV2ZW50cywgYWxsIGFyZSBhdmFpbGFibGUgcHVibGljYWxseSwgbW9yZSBpbmZvIGNhbiBiZSBcbiAgICAvLyBmb3VuZCBhdCBkZXZlbG9wZXJzLmdvb2dsZS5jb20veW91dHViZS9pZnJhbWVfYXBpX3JlZmVyZW5jZSNFdmVudHNcbiAgICBvcHRzLmV2ZW50cyA9IHtcbiAgICAgIG9uUmVhZHk6IHByaXYuZXZlbnRzLnJlYWR5LFxuICAgICAgb25TdGF0ZUNoYW5nZTogcHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UsXG4gICAgICBvbkVycm9yOiBwcml2LmV2ZW50cy5lcnJvcixcbiAgICAgIG9uUGxheWJhY2tRdWFsaXR5Q2hhbmdlOiBwcml2LmV2ZW50cy5wbGF5YmFja1F1YWxpdHlDaGFuZ2UsXG4gICAgICBvblBsYXliYWNrUmF0ZUNoYW5nZTogcHJpdi5ldmVudHMucGxheWJhY2tSYXRlQ2hhbmdlLFxuICAgICAgb25BcGlDaGFuZ2U6IHByaXYuZXZlbnRzLmFwaUNoYW5nZVxuICAgIH07XG4gICAgXG4gICAgLy8gYnVpbGQgdmlkZW8gb2JqZWN0IHRvIHN0b3JlIGlmIHdlIG5lZWQgdG9cbiAgICBpZiAoIXByaXYudmlkZW9zLmhhc093blByb3BlcnR5KG9wdHMudmlkZW9JZCkpIHtcbiAgICAgIHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0gPSB7fTtcbiAgICB9XG4gICAgXG4gICAgcHJpdi52aWRlb3Nbb3B0cy52aWRlb0lkXS5vcHRzID0gb3B0cztcbiAgICBwcml2LnZpZGVvc1tvcHRzLnZpZGVvSWRdLmVsID0gZWw7XG4gICAgcHJpdi5xdWV1ZS5wdXNoKHByaXYudmlkZW9zW29wdHMudmlkZW9JZF0pO1xuICB9XG59O1xuXG4vL1xuLy8gRVZFTlRTXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gdGhlIGlmcmFtZV9hcGkgYWxsb3dzIHVzIHRvIGF0dGFjaCBkb20gc3R5bGUgZXZlbnRzIHRvXG4vLyB2aWRlb3MsIHdlIGFsd2F5cyBmaXJlIHRoZXNlIGludGVybmFsbHksIGJ1dCB0aGVuIHdlIFxuLy8gYWxzbyBhbGxvdyB5b3UgdG8gYXR0YWNoIGV2ZW50cyB0byBhIHZpZGVvLCBieSBpdHMgaWRcbi8vXG5cbnByaXYuZXZlbnRzLmFwaUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdhcGlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdhcGlDaGFuZ2UnLCBlKTtcbn07XG5cbi8vIGFjY29yZGluZyB0byB5b3V0dWJlIGRvY3MgdGhlc2Ugc3RhdHVzIGNvZGVzXG4vLyByZXByZXNlbnQgdGhlIHN0YXRlIHN0cmluZyB0aGF0IGlzIGluZGljYXRpdmVcbi8vIG9mIHRoZSBlcnJvclxucHJpdi5ldmVudHMuZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICd1bnJlY29nbml6ZWQgZXJyb3InO1xuICBpZiAoZS5kYXRhID09IDIgfHwgZS5kYXRhID09IDEwMCkge1xuICAgIHN0YXRlID0gJ2ludmFsaWQgdmlkZW9JZCc7XG4gIH0gZWxzZSBpZiAoZS5kYXRhID09IDUpIHtcbiAgICBzdGF0ZSA9ICdodG1sNSBwbGF5ZXIgZXJyb3InO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PSAxMDEgfHwgZS5kYXRhID09IDE1MCkge1xuICAgIHN0YXRlID0gJ2VtYmVkZGluZyBmb3JiaWRkZW4nO1xuICB9XG4gIHByaXYucHJvY2Vzc0V2ZW50cygnZXJyb3InLCBlLnRhcmdldC5faWQsIHN0YXRlLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUmF0ZUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1JhdGVDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnBsYXliYWNrUXVhbGl0eUNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlLnRhcmdldC5faWQsICdwbGF5YmFja1F1YWxpdHlDaGFuZ2UnLCBlKTtcbn07XG5cbnByaXYuZXZlbnRzLnJlYWR5ID0gZnVuY3Rpb24oZSkge1xuICBwcml2LnByb2Nlc3NFdmVudHMoJ3JlYWR5JywgZS50YXJnZXQuX2lkLCAncmVhZHknLCBlKTtcbn07XG5cbi8vIHdlIHRyYW5zZm9ybSB0aGUgY3VycmVudCBzdGF0ZSBgaWRgIHRvIGEgaHVtYW4gcmVhZGFibGVcbi8vIHN0cmluZyBiYXNlZCBvbiB0aGUgeW91dHViZSBhcGkgZG9jc1xucHJpdi5ldmVudHMuc3RhdGVDaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG4gIHZhciBzdGF0ZSA9ICd1bmtub3duJztcbiAgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuQlVGRkVSSU5HKSB7XG4gICAgc3RhdGUgPSAnYnVmZmVyaW5nJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkNVRUQpIHtcbiAgICBzdGF0ZSA9ICdjdWVkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLkVOREVEKSB7XG4gICAgc3RhdGUgPSAnZW5kZWQnO1xuICB9IGVsc2UgaWYgKGUuZGF0YSA9PT0gWVQuUGxheWVyU3RhdGUuUEFVU0VEKSB7XG4gICAgc3RhdGUgPSAncGF1c2VkJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlBMQVlJTkcpIHtcbiAgICBzdGF0ZSA9ICdwbGF5aW5nJztcbiAgfSBlbHNlIGlmIChlLmRhdGEgPT09IFlULlBsYXllclN0YXRlLlVOU1RBUlRFRCkge1xuICAgIHN0YXRlID0gJ3Vuc3RhcnRlZCc7XG4gIH1cbiAgcHJpdi5wcm9jZXNzRXZlbnRzKCdzdGF0ZUNoYW5nZScsIGUudGFyZ2V0Ll9pZCwgc3RhdGUsIGUpO1xufTtcblxuLy9cbi8vIFBVQkxJQyBBUElcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuXG4vLyBwdWJsaWMgb24gZXZlbnQsIHNvIHlvdSBjYW4gZXh0ZXJuYWxseSBhdHRhY2ggdG8gdmlkZW9zXG4vLyB0aGlzIGZuIGNhbiBiZSByZWN1cnNpdmUsIHNvIHlvdSBrbm93LCBiZSBzbWFydCB3aXRoIHRoaXNcbi8vIHRyeSB0byBhdm9pZCBleHRyZW1lbHkgbGFyZ2UgYXJyYXlzLCBvciBkb2luZyBhc3luYyBzdHVmZlxuLy8gaW5zaWRlIG9mIHlvdXIgZXZlbnRzIHdpdGhvdXQgdGhlIHByb3BlciBzYWZldHkgbWF0ZXJpYWxzXG52aWRlb0FuYWx5dGljcy5vbiA9IGZ1bmN0aW9uKGV2ZW50cywgaWQsIGZuKSB7XG4gIHZhciByZWN1cnNlID0gZmFsc2UsIGV2ID0gZXZlbnRzO1xuICBpZiAoZXZlbnRzIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZWN1cnNlID0gZXZlbnRzLmxlbmd0aCA+IDAsIGV2ID0gZXZlbnRzLnNoaWZ0KCk7XG4gIH1cbiAgLy8gYCpgIHdpbGRjYXJkIGFsbG93cyB5b3UgdG8gYXR0YWNoIGFuIGV2ZW50IHRvIGV2ZXJ5IHZpZFxuICBpZiAoaWQgPT09ICcqJykge1xuICAgIHZhciB2aWRzID0gT2JqZWN0LmtleXMocHJpdi52aWRlb3MpO1xuICAgIGlmICghdmlkcy5sZW5ndGgpIHJldHVybiB2aWRlb0FuYWx5dGljcztcbiAgICBmb3IodmFyIGk9MDtpPHZpZHMubGVuZ3RoOysraSkge1xuICAgICAgcHJpdi5hdHRhY2hFdmVudHModmlkc1tpXSxldixmbik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHByaXYuYXR0YWNoRXZlbnRzKGlkLGV2LGZuKTtcbiAgfVxuICBpZiAocmVjdXJzZSkgcmV0dXJuIHZpZGVvQW5hbHl0aWNzLm9uKGV2ZW50cyxpZCxmbik7XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIGRlYnVnIG1vZGUsIGFsbG93cyB5b3UgdG8gY2FwdHVyZSBkZWJ1ZyBkYXRhIHNpbXBseVxudmlkZW9BbmFseXRpY3Muc2V0RGVidWcgPSBmdW5jdGlvbihib29sKSB7XG4gIHZhciBlbGVtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEteXQtZGVidWddJyk7XG4gIGJvb2wgPSB0eXBlb2YgYm9vbCA9PT0gJ2Jvb2xlYW4nID8gYm9vbCA6IG51bGw7XG4gIGlmIChlbGVtKSB7XG4gICAgdmFyIGF0dHJzID0gYXR0cihlbGVtKTtcbiAgICB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGF0dHJzKCdkYXRhLXl0LWRlYnVnJykgPT0gJ3RydWUnO1xuICB9XG4gIGlmIChib29sICE9PSBudWxsKSB2aWRlb0FuYWx5dGljcy5kZWJ1ZyA9IGJvb2w7XG4gIG1vbi5kZWJ1ZyA9IHZpZGVvQW5hbHl0aWNzLmRlYnVnO1xuICB2aWRlb0FuYWx5dGljcy5sb2dzID0gdmlkZW9BbmFseXRpY3MuZGVidWcgPyBtb24uaGlzdG9yeSA6IFtdO1xuICByZXR1cm4gdmlkZW9BbmFseXRpY3M7XG59O1xuXG4vLyBwdWJsaWMgdHJhY2tpbmcgZXZlbnQsIHNvIHlvdSBhdHRhY2ggdmlkZW9zIGFmdGVyIGRvbVxuLy8gbG9hZCwgb3Igd2l0aCBzb21lIGxhdGVudC9hc3luYyByZXF1ZXN0c1xudmlkZW9BbmFseXRpY3MudHJhY2sgPSBmdW5jdGlvbigpIHtcbiAgcHJpdi5jb2xsZWN0RG9tKCk7XG4gIGlmIChwcml2LnF1ZXVlLmxlbmd0aCkge1xuICAgIHByaXYuaW5qZWN0U2NyaXB0cygpO1xuICAgIHByaXYuYXR0YWNoVmlkZW9zKHByaXYucXVldWUpO1xuICB9XG4gIHJldHVybiB2aWRlb0FuYWx5dGljcztcbn07XG5cbi8vIHdlIHdhbnQgdG8gaGF2ZSBleHRlcm5hbCBhY2Nlc3MgdG8gdGhlIHZpZGVvcyB3ZSdyZVxuLy8gdHJhY2tpbmcgZm9yIGludGVyYWN0aW9uIHdpdGggb3RoZXIgYXBpc1xudmlkZW9BbmFseXRpY3MudmlkZW9zID0gcHJpdi52aWRlb3M7XG4gIFxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIHByaXYuaW5pdCwgZmFsc2UpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHZpZGVvQW5hbHl0aWNzOyIsInZhciBhdHRyID0gZnVuY3Rpb24oZWxlbSkge1xuICBpZiAodHlwZW9mIGVsZW0gIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gJGF0dHIoa2V5LCB2YWwpIHtcbiAgICAgIGlmKHR5cGVvZiB2YWwgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIGVsZW0uZ2V0QXR0cmlidXRlKGtleSk7XG4gICAgICB9IGVsc2UgaWYgKHZhbCA9PSAncm0nKSB7XG4gICAgICAgIHJldHVybiBlbGVtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGVsZW0uc2V0QXR0cmlidXRlKGtleSwgdmFsKTtcbiAgICAgIH1cbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbnZhciBzYWZlUGFyc2UgPSBmdW5jdGlvbihzdHIpIHtcbiAgdmFyIG91dHB1dCA9IG51bGw7XG4gIHRyeSB7XG4gICAgb3V0cHV0ID0gSlNPTi5wYXJzZShzdHIpO1xuICB9IGNhdGNoIChleCkge31cbiAgcmV0dXJuIG91dHB1dDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICBzYWZlUGFyc2U6IHNhZmVQYXJzZVxufTsiLCJ2YXIgTW9uID0gZnVuY3Rpb24oZGVidWcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1vbikpIHJldHVybiBuZXcgTW9uKGRlYnVnKTtcbiAgdGhpcy5kZWJ1ZyA9IGRlYnVnO1xuICB0aGlzLmhpc3RvcnkgPSBbXTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5Nb24ucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3AgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmhpc3RvcnkucHVzaChjcCk7XG4gIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgaWYodHlwZW9mIHdpbmRvd1snY29uc29sZSddICE9ICd1bmRlZmluZWQnICYmIGNvbnNvbGUubG9nKSB7XG4gICAgICBpZiAoY3AubGVuZ3RoID09PSAxICYmIHR5cGVvZiBjcFswXSA9PSAnb2JqZWN0JykgY3AgPSBKU09OLnN0cmluZ2lmeShjcFswXSxudWxsLDIpO1xuICAgICAgY29uc29sZS5sb2coY3ApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTW9uOyJdfQ==
(1)
});
