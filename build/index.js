!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var t;"undefined"!=typeof window?t=window:"undefined"!=typeof global?t=global:"undefined"!=typeof self&&(t=self),t.videoAnalytics=e()}}(function(){return function e(t,r,n){function a(o,d){if(!r[o]){if(!t[o]){var s="function"==typeof require&&require;if(!d&&s)return s(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var u=r[o]={exports:{}};t[o][0].call(u.exports,function(e){var r=t[o][1][e];return a(r?r:e)},u,u.exports,e,t,r,n)}return r[o].exports}for(var i="function"==typeof require&&require,o=0;o<n.length;o++)a(n[o]);return a}({1:[function(e,t,r){var n={},a={};a.videos={},a.events={},a.queue=[],n.init=function(){a.collectDom(),a.queue.length&&a.injectScripts()},n.on=function(e,t,r){return a.videos[t].events[e]instanceof Array||(a.videos[t].events[e]=[]),a.videos[t].events[e].push(r),n},n.attachVideos=function(){for(var e;e=a.queue.shift();)e.player=new YT.Player(e.el,e.opts),e.player._id=e.opts.videoId},a.collectDom=function(){for(var e=document.querySelectorAll("[data-yt-analytics]"),t=0;t<e.length;++t)a.referenceObject(e[t])},a.referenceObject=function(e){var t={};t.videoId=e.getAttribute("data-yt-analytics")?e.getAttribute("data-yt-analytics"):null,t.videoId&&null==e.getAttribute("data-yt-tracked")&&(t.width=e.getAttribute("data-yt-width")?e.getAttribute("data-yt-width"):640,t.height=e.getAttribute("data-yt-height")?e.getAttribute("data-yt-height"):390,t.playerVars=e.getAttribute("data-yt-vars")?e.getAttribute("data-yt-vars"):null,t.events=a.setupEvents(),a.videos[t.videoId]={opts:t,el:e,events:{}},a.queue.push(a.videos[t.videoId]),e.setAttribute("data-yt-tracked",!0))},a.setupEvents=function(){var e={};return e.onReady=a.events.ready,e.onStateChange=a.events.stateChange,e.onError=a.events.error,e},a.events.ready=function(e){if(console.log("%s is ready",e.target._id),a.videos[e.target._id].events.ready){var t=a.videos[e.target._id].events.ready;return t.forEach(function(t){return t(e)})}},a.events.stateChange=function(e){var t="unstarted";if(e.data===YT.PlayerState.BUFFERING?t="buffering":e.data===YT.PlayerState.CUED?t="cued":e.data===YT.PlayerState.ENDED?t="ended":e.data===YT.PlayerState.PAUSED?t="paused":e.data===YT.PlayerState.PLAYING&&(t="playing"),console.log("%s is %s",e.target._id,t),a.videos[e.target._id].events.stateChange){var r=a.videos[e.target._id].events.stateChange;r.forEach(function(r){return r(t,e)})}},a.events.error=function(e){var t="invalid videoId";if(2==e.data||100==e.data||(5==e.data?t="html5 player error":(101==e.data||150==e.data)&&(t="forbidden embedding")),console.log("%s is an error of %d (%s)",e.target._id,e.data,t),a.videos[e.target._id].events.error){var r=a.videos[e.target._id].events.error;r.forEach(function(t){return t(e)})}},a.injectScripts=function(e){if(!a.videos.scriptInclude){window.onYouTubeIframeAPIReady=n.attachVideos;var t=document.getElementsByTagName("script")[0];a.videos.scriptInclude=document.createElement("script"),"function"==typeof e&&(a.videos.scriptInclude.setAttribute("async",!0),a.videos.scriptInclude.addEventListener("load",e,!1)),a.videos.scriptInclude.setAttribute("src","//www.youtube.com/iframe_api"),t.parentNode.insertBefore(a.videos.scriptInclude,t)}},document.addEventListener("DOMContentLoaded",n.init,!1),t.exports=n},{}]},{},[1])(1)});