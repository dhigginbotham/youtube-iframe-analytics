## YouTube IFRAME Analytics
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
    "currentTime": 638.612874,
    "duration": 1343.641,
    "event": "stateChange",
    "id": "M7lc1UVf-VE",
    "title": "YouTube Developers Live: Embedded Web Player Customization",
    "state": "paused",
    "ms": 1454846039769
},
{
    "currentTime": 637,
    "duration": 1343.641,
    "event": "stateChange",
    "id": "M7lc1UVf-VE",
    "title": "YouTube Developers Live: Embedded Web Player Customization",
    "state": "playing",
    "ms": 1454846037978
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
      console.log(e, state);
    }).on('stateChange', '*', function(e, state) {
      console.log(e, state);
    }).on('error', '*', function(e, state) {
      console.log(e, state);
    });
  }

  document.addEventListener('DOMContentLoaded', init, false);
```

###DEMO
[fiddle](https://fiddle.jshell.net/dhiggy/egas87om/show/)

###License
```
The MIT License (MIT)

Copyright (c) 2016 David Higginbotham

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```