## YouTube IFRAME_API Analytics
I had a need to get at the events fired from [YouTubes JS IFRAME_API](https://developers.google.com/youtube/iframe_api_reference) so that I could send them off to analytics -- but I wanted that output of data to be fairly agnostic to whichever analytics provider I might be using. So instead of making a lot of assumptions about where this data goes to, just attach onto an event and you've got data to send over to Omniture/SiteCatalyst/Custom/etc.

Uses browserify, so `npm i`, no dependencies, other than IE9+ish, go nuts.

### Usage
DOM:
```html
  <script src="pathof.js"></script>
  <div data-yt-analytics="eWxGdmLU4Nk" data-yt-height="400" data-yt-width="600" data-yt-title="tracking name...?"></div>
```
JS:
```js
  function init() {
    videoAnalytics.on('ready', '*', function(e, state) {
      console.log('ready');
      console.log(state, e);
    }).on('stateChange', '*', function(e, state) {
      console.log('state change');
      console.log(state, e);
    }).on('error', '*', function(e, state) {
      console.log('error');
      console.log(state, e);
    });
  }

  document.addEventListener('DOMContentLoaded', init, false);
```

### API
- `.attachVideos()`
- `.init()`
- `.on('event','videoId',fn)`