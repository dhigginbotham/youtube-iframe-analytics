!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var t;"undefined"!=typeof window?t=window:"undefined"!=typeof global?t=global:"undefined"!=typeof self&&(t=self),t.videoAnalytics=e()}}(function(){return function e(t,n,a){function r(o,d){if(!n[o]){if(!t[o]){var s="function"==typeof require&&require;if(!d&&s)return s(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var c=n[o]={exports:{}};t[o][0].call(c.exports,function(e){var n=t[o][1][e];return r(n?n:e)},c,c.exports,e,t,n,a)}return n[o].exports}for(var i="function"==typeof require&&require,o=0;o<a.length;o++)r(a[o]);return r}({1:[function(e,t,n){var a=e("./helpers"),r=a.attr,i={},o={};o.videos={},o.events={},o.queue=[],o.loaded=!1,o.init=function(){o.collectDom(),o.queue.length&&o.injectScripts()},o.attachVideos=function(){if(o.loaded)for(var e;e=o.queue.shift();)e.player=new YT.Player(e.el,e.opts),e.player._id=e.opts.videoId},o.attachVideosInternal=function(){o.loaded=!0,o.attachVideos()},o.collectDom=function(){for(var e=document.querySelectorAll("[data-yt-analytics]"),t=0;t<e.length;++t)o.referenceObject(e[t])},o.referenceObject=function(e){var t={},n=r(e);t.videoId=n("data-yt-analytics"),null==n("data-yt-tracked")&&(n("data-yt-tracked",!0),t.width=n("data-yt-width")?n("data-yt-width"):640,t.height=n("data-yt-height")?n("data-yt-height"):390,t.playerVars=n("data-yt-vars")?n("data-yt-vars"):null,t.title=n("data-yt-title")?n("data-yt-title"):t.videoId,t.events=o.setupEvents(),o.videos[t.videoId]={opts:t,el:e,events:{}},o.queue.push(o.videos[t.videoId]))},o.setupEvents=function(){var e={};return e.onReady=o.events.ready,e.onStateChange=o.events.stateChange,e.onError=o.events.error,e.onPlaybackQualityChange=o.events.playbackQualityChange,e.onPlaybackRateChange=o.events.playbackRateChange,e.onApiChange=o.events.apiChange,e},o.processEvents=function(e,t,n,a){if(o.videos[t].events[e]){var r=o.videos[t].events[e],i=o.videos[t].player;o.videos[t].opts.title==t&&(o.videos[t].opts.title=i.getVideoData().title?i.getVideoData().title:t);for(var d=0;d<r.length;++d)r[d](a,{currentTime:i.getCurrentTime(),duration:i.getDuration(),event:e,id:t,title:o.videos[t].opts.title,state:n,ms:(new Date).getTime()})}},o.events.apiChange=function(e){o.processEvents("apiChange",e.target._id,"apiChange",e)},o.events.error=function(e){var t="invalid videoId";2==e.data||100==e.data||(5==e.data?t="html5 player error":(101==e.data||150==e.data)&&(t="embedding forbidden")),o.processEvents("error",e.target._id,t,e)},o.events.playbackRateChange=function(e){o.processEvents("playbackRateChange",e.target._id,"playbackRateChange",e)},o.events.playbackQualityChange=function(e){o.processEvents("playbackQualityChange",e.target._id,"playbackQualityChange",e)},o.events.ready=function(e){o.processEvents("ready",e.target._id,"ready",e)},o.events.stateChange=function(e){var t="unstarted";e.data===YT.PlayerState.BUFFERING?t="buffering":e.data===YT.PlayerState.CUED?t="cued":e.data===YT.PlayerState.ENDED?t="ended":e.data===YT.PlayerState.PAUSED?t="paused":e.data===YT.PlayerState.PLAYING&&(t="playing"),o.processEvents("stateChange",e.target._id,t,e)},o.injectScripts=function(e){if(!o.scriptInclude){window.onYouTubeIframeAPIReady=o.attachVideosInternal;var t=document.getElementsByTagName("script")[0];o.scriptInclude=document.createElement("script"),"function"==typeof e&&(o.scriptInclude.setAttribute("async",!0),o.scriptInclude.addEventListener("load",e,!1)),o.scriptInclude.setAttribute("src","//www.youtube.com/iframe_api"),t.parentNode.insertBefore(o.scriptInclude,t)}},i.on=function(e,t,n){var a=function(t){o.videos[t]&&(o.videos[t].events[e]instanceof Array||(o.videos[t].events[e]=[]),o.videos[t].events[e].push(n))};return"*"===t?Object.keys(o.videos).forEach(a):a(t),i},i.track=function(){return o.collectDom(),o.queue.length&&(o.injectScripts(),o.attachVideos()),i},document.addEventListener("DOMContentLoaded",o.init,!1),t.exports=i},{"./helpers":2}],2:[function(e,t,n){n.attr=function(e){return"undefined"!=typeof e?function(t,n){return"undefined"==typeof n?e.getAttribute(t):"rm"==n?e.removeAttribute(t):e.setAttribute(t,n)}:null}},{}]},{},[1])(1)});