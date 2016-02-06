var helpers = require('./helpers');
var attr = helpers.attr;

// api objects
var pub = {}, priv = {};

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

// init fn that happens on DOMContentLoaded
pub.init = function() {
  priv.collectDom();
  if (priv.queue.length) priv.injectScripts();
};

// public on event, so you can externally attach to videos
pub.on = function(event, id, fn) {
  if (priv.videos[id]) {
    if (!(priv.videos[id].events[event] instanceof Array)) priv.videos[id].events[event] = [];
    priv.videos[id].events[event].push(fn);
  }
  return pub;
};

// the way the iframe_api works is by replacing an element
// with an iframe, so we'll want to attach the video as 
// needed
pub.attachVideos = function() {
  var video;
  while(video = priv.queue.shift()) {
    video.player = new YT.Player(video.el, video.opts);
    video.player._id = video.opts.videoId;
  }
};

// we'll run this on init, or on demand for latent loaded
// html fragments
priv.collectDom = function() {
  var dom = document.querySelectorAll('[data-yt-analytics]');
  for(var i=0;i<dom.length;++i) {
    priv.referenceObject(dom[i]);
  }
};

// sets up our dom object, so we have a strict schema to 
// adhere to later on in the api 
priv.referenceObject = function(el) {
  var opts = {}, attrs = attr(el);
  opts.videoId = attrs('data-yt-analytics') ? attrs('data-yt-analytics') : null;
  if (opts.videoId && attrs('data-yt-tracked') == null) {
    attrs('data-yt-tracked', true);

    // get opts from data attrs
    opts.width = attrs('data-yt-width') ? attrs('data-yt-width') : 640;
    opts.height = attrs('data-yt-height') ? attrs('data-yt-height') : 390;
    opts.playerVars = attrs('data-yt-vars') ? attrs('data-yt-vars') : null;
    opts.title = attrs('data-yt-title') ? attrs('data-yt-title') : opts.videoId;
    
    // setup base events
    opts.events = priv.setupEvents();
    
    // build video object to store
    priv.videos[opts.videoId] = { opts: opts, el: el, events: {} };
    priv.queue.push(priv.videos[opts.videoId]);
  }
};

// this is hack for now, will change/expose this externally
// so we know what is happening
priv.setupEvents = function() {
  var events = {};
  events.onReady = priv.events.ready;
  events.onStateChange = priv.events.stateChange;
  events.onError = priv.events.error;
  return events;
};

// the iframe_api allows us to attach dom style events to
// videos, we always fire these internally, but then we 
// also allow you to attach events to a video, by its id

// default ready state event
priv.events.ready = function(e) {
  // console.log('%s:ready', e.target._id);
  if (priv.videos[e.target._id].events.ready) {
    var events = priv.videos[e.target._id].events.ready;
    return events.forEach(function(event) {
      return event(e);
    });
  }
};

// default state change event
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
  // console.log('%s:%s', e.target._id, state);
  if (priv.videos[e.target._id].events.stateChange) {
    var events = priv.videos[e.target._id].events.stateChange;
    var player = priv.videos[e.target._id].player;
    events.forEach(function(event) {
      return event({
        state: state, 
        currentTime: player.getCurrentTime(), 
        duration: player.getDuration(), 
        ms: new Date().getTime()}, e);   
    });
  }
};

priv.events.error = function(e) {
  var state = 'invalid videoId';
  if (e.data == 2 || e.data == 100) {
    // basically nothing, as these are defaults
  } else if (e.data == 5) {
    state = 'html5 player error';
  } else if (e.data == 101 || e.data == 150) {
    state = 'embedding forbidden';
  }
  // console.log('error:%s:%d:%s', e.target._id, e.data, state);
  if (priv.videos[e.target._id].events.error) {
    var events = priv.videos[e.target._id].events.error;
    var player = priv.videos[e.target._id].player;
    events.forEach(function(event) {
      return event({
        state: state, 
        currentTime: player.getCurrentTime(), 
        duration: player.getDuration(), 
        ms: new Date().getTime()}, e);   
    });
  }
};

// we include youtubes js script async, and we'll need to 
// keep track of the state of that include
priv.injectScripts = function(fn) {
  if (!priv.scriptInclude) {
    // we only want to do this once, and this is the best
    // time to do this once, this also keeps all of the
    // conditional stuff to a single entry, so it works
    window['onYouTubeIframeAPIReady'] = pub.attachVideos;

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
  
document.addEventListener('DOMContentLoaded', pub.init, false);

module.exports = pub;