!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var t;"undefined"!=typeof window?t=window:"undefined"!=typeof global?t=global:"undefined"!=typeof self&&(t=self),t.videoAnalytics=e()}}(function(){return function e(t,n,a){function r(o,d){if(!n[o]){if(!t[o]){var s="function"==typeof require&&require;if(!d&&s)return s(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var c=n[o]={exports:{}};t[o][0].call(c.exports,function(e){var n=t[o][1][e];return r(n?n:e)},c,c.exports,e,t,n,a)}return n[o].exports}for(var i="function"==typeof require&&require,o=0;o<a.length;o++)r(a[o]);return r}({1:[function(e,t,n){var a=e("./helpers"),r=a.attr,i=a.stringifySafe,o={},d={};d.videos={},d.events={},d.queue=[],d.loaded=!1,d.init=function(){d.collectDom(),d.queue.length&&d.injectScripts()},d.attachVideos=function(){if(d.loaded)for(var e;e=d.queue.shift();)e.player=new YT.Player(e.el,e.opts),e.player._id=e.opts.videoId},d.attachVideosInternal=function(){d.loaded=!0,d.attachVideos()},d.collectDom=function(){for(var e=document.querySelectorAll("[data-yt-analytics]"),t=0;t<e.length;++t)d.referenceObject(e[t])},d.referenceObject=function(e){var t={},n=r(e);t.videoId=n("data-yt-analytics"),null==n("data-yt-tracked")&&(n("data-yt-tracked",!0),t.width=n("data-yt-width")?n("data-yt-width"):640,t.height=n("data-yt-height")?n("data-yt-height"):390,t.playerVars=n("data-yt-vars")?i(n("data-yt-vars")):null,t.title=n("data-yt-title")?n("data-yt-title"):t.videoId,t.events=d.setupEvents(),d.videos[t.videoId]={opts:t,el:e,events:{}},d.queue.push(d.videos[t.videoId]))},d.setupEvents=function(){var e={};return e.onReady=d.events.ready,e.onStateChange=d.events.stateChange,e.onError=d.events.error,e.onPlaybackQualityChange=d.events.playbackQualityChange,e.onPlaybackRateChange=d.events.playbackRateChange,e.onApiChange=d.events.apiChange,e},d.processEvents=function(e,t,n,a){if(d.videos[t].events[e]){var r=d.videos[t].events[e],i=d.videos[t].player;d.videos[t].opts.title==t&&(d.videos[t].opts.title=i.getVideoData().title?i.getVideoData().title:t);for(var o=0;o<r.length;++o)r[o](a,{currentTime:Math.floor(i.getCurrentTime()),duration:Math.floor(i.getDuration()),event:e,id:t,title:d.videos[t].opts.title,state:n,muted:i.isMuted(),ms:(new Date).getTime()})}},d.events.apiChange=function(e){d.processEvents("apiChange",e.target._id,"apiChange",e)},d.events.error=function(e){var t="invalid videoId";2==e.data||100==e.data||(5==e.data?t="html5 player error":(101==e.data||150==e.data)&&(t="embedding forbidden")),d.processEvents("error",e.target._id,t,e)},d.events.playbackRateChange=function(e){d.processEvents("playbackRateChange",e.target._id,"playbackRateChange",e)},d.events.playbackQualityChange=function(e){d.processEvents("playbackQualityChange",e.target._id,"playbackQualityChange",e)},d.events.ready=function(e){d.processEvents("ready",e.target._id,"ready",e)},d.events.stateChange=function(e){var t="unstarted";e.data===YT.PlayerState.BUFFERING?t="buffering":e.data===YT.PlayerState.CUED?t="cued":e.data===YT.PlayerState.ENDED?t="ended":e.data===YT.PlayerState.PAUSED?t="paused":e.data===YT.PlayerState.PLAYING&&(t="playing"),d.processEvents("stateChange",e.target._id,t,e)},d.injectScripts=function(e){if(!d.scriptInclude){window.onYouTubeIframeAPIReady=d.attachVideosInternal;var t=document.getElementsByTagName("script")[0];d.scriptInclude=document.createElement("script"),"function"==typeof e&&(d.scriptInclude.setAttribute("async",!0),d.scriptInclude.addEventListener("load",e,!1)),d.scriptInclude.setAttribute("src","//www.youtube.com/iframe_api"),t.parentNode.insertBefore(d.scriptInclude,t)}},o.on=function(e,t,n){var a=function(t){d.videos[t]&&(d.videos[t].events[e]instanceof Array||(d.videos[t].events[e]=[]),d.videos[t].events[e].push(n))};return"*"===t?Object.keys(d.videos).forEach(a):a(t),o},o.track=function(){return d.collectDom(),d.queue.length&&(d.injectScripts(),d.attachVideos()),o},document.addEventListener("DOMContentLoaded",d.init,!1),t.exports=o},{"./helpers":2}],2:[function(e,t,n){n.attr=function(e){return"undefined"!=typeof e?function(t,n){return"undefined"==typeof n?e.getAttribute(t):"rm"==n?e.removeAttribute(t):e.setAttribute(t,n)}:null},n.stringifySafe=function(e){var t=null;try{t=JSON.stringify(e)}catch(n){}return t}},{}]},{},[1])(1)});