## YouTube iframe events
I had a need to get at the events fired from [YouTubes JS iframe](https://developers.google.com/youtube/iframe_api_reference) so that I could send them off to analytics -- but I wanted that output of data to be fairly agnostic to whichever analytics provider I might be using. So instead of making a lot of assumptions about where this data goes to, just attach onto an event and you've got data to send over to SiteCatalyst/Custom/etc.

Uses browserify, so `npm i`, no jquery, expects you're on a modernish browser (IE9 and up).

### API
- `.on('event','videoId',fn)` - you can pass in `*` as the videoId to attach an event to all videos
- `.track()` - you can trigger dom collection and initialization for latent loaded dom elements or binding changes, etc

### Events
You can find out more about why/when these fire [here](https://developers.google.com/youtube/iframe_api_reference#Events)
- `apiChange`
- `error`
- `playbackRateChange`
- `playbackQualityChange`
- `ready`
- `stateChange`

All events are passed with two parameters:
- `event` - is the event object passed from the youtube event, it will remain **unmodified**
- `state` - is an internally built object to use for tracking/analytics/debugging for example:
```json
// example output of a state object on `stateChange` event
{
    "currentTime": 641.070869,
    "duration": 1343.641,
    "event": "stateChange",
    "id": "M7lc1UVf-VE",
    "state": "paused",
    "ms": 1454845150087
}
```

### Usage
DOM:
```html
  <script src="pathof.js"></script>
  <div data-yt-analytics="eWxGdmLU4Nk" data-yt-height="400" data-yt-width="600" data-yt-title="tracking name...?"></div>
```
----
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

####DEMO
[fiddle](https://fiddle.jshell.net/dhiggy/egas87om/show/)