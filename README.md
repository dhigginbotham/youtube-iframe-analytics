## YouTube `<iframe>` Analytics
I had a need to get at the events fired from [YouTubes `<iframe>` API](https://developers.google.com/youtube/iframe_api_reference) so that I could send them off to analytics -- but I wanted that output of data to be fairly agnostic to whichever analytics provider I might be using. So instead of making a lot of assumptions about where this data goes to, just attach onto an event and you've got data to send over to SiteCatalyst/Custom/etc.

Uses browserify, so `npm i`, no jquery, expects you're on a *modernish* browser **(IE9 and up)**.

----

### API
- `.on('event','videoId',fn)` 
  - `event` can either be a string event name or an array of event names
  - `videoId` supports wildcards `*` to attach an event to all videos
  - `fn` standard callback fn, will be passed back **two** params: `event`, `state`
  
  ######.on() examples
  ```js
  // attach a stateChange event to a specific video
  videoAnalytics.on('stateChange', 'M7lc1UVf-VE', function(e, state) {
    console.log(e, state);
  });
  
  // handle all video errors the same way
  videoAnalytics.on('error', '*', function(e, state) {
    console.log(e, state);
  });
  
  // you can also pass an array of events
  videoAnalytics.on(['ready','stateChange','error'], '*', function(e, state) {
    // i'll be attached to all three events, also I will be attached to every video
    console.log(e, state);
  });
  ```
- `.setDebug(boolean)` - you can programmatically set debug mode, you will then have access to `.logs` array which has a history of all debug logging within that state.
  
  ######.setDebug() examples
  ```js
  videoAnalytics.setDebug(true);
  console.log(videoAnalytics.logs) // [..., logs]
  ```
- `.track()` - you can trigger dom collection and initialization for latent loaded dom elements or binding changes, etc
  
  ######.track() examples
  ```js
  videoAnalytics.track();
  ```
- `.videos` - returns object of videos on the dom for interaction with external api's

  ######.videos examples
  ```js
  videoAnalytics.videos;
  ```
  
----

### Events
You can find out more about why/when these fire [`here`](https://developers.google.com/youtube/iframe_api_reference#Events)
- `apiChange`
- `error`
- `playbackRateChange`
- `playbackQualityChange`
- `ready`
- `stateChange`

All events are passed with **two** parameters:
- `event` - is the event object passed from the youtube event, it will remain **unmodified**
- `state` - is an internally built object to use for tracking/analytics/debugging for example:
```json
{
    "currentTime": 638,
    "duration": 1343,
    "event": "stateChange",
    "id": "M7lc1UVf-VE",
    "title": "YouTube Developers Live: Embedded Web Player Customization",
    "state": "paused",
    "muted": false,
    "ms": 1454850080538
},
{
    "currentTime": 637,
    "duration": 1343,
    "event": "stateChange",
    "id": "M7lc1UVf-VE",
    "title": "YouTube Developers Live: Embedded Web Player Customization",
    "state": "playing",
    "muted": false,
    "ms": 1454850079068
}
```

----

### Usage
[You can check out the demo](https://dhigginbotham.github.io/youtube-iframe-analytics/), if thats more your speed.

#####Markup:
```html
<script src="/path/to/videoAnalytics.min.js"></script>
<div data-yt-analytics='O1YP8QP9gLA' data-yt-width='300' data-yt-height='200' data-yt-vars='{"fs": 1, "autoplay": 1}'></div>
<div data-yt-analytics='z8UgDZ4rXBU' data-yt-width='300' data-yt-height='200' data-yt-title='Netflix does cool stuff with node.js!'></div>
<div data-yt-analytics='DqMFX91ToLw' data-yt-width='300' data-yt-height='200'></div>
<div data-yt-analytics='FAZJsxcykPs' data-yt-width='300' data-yt-height='200'></div>
<div data-yt-analytics='z-yU0sVdKTo' data-yt-width='300' data-yt-height='200'></div>
```

######Markup Options:
| Attribute | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `[data-yt-analytics]` | `String` | **true** | `videoId` of YouTube video to embed |
| `[data-yt-debug]` | `Boolean` | **false** | allows you to set debug level for a given state |
| `[data-yt-height]` | `Number` | **false** | `<iframe>` height, defaults to `390` |
| `[data-yt-title]` | `String` | **false** | Video title, will try to resolve YouTube video title if not set |
| `[data-yt-vars]` | `JSON` | **false** | [Video player](https://developers.google.com/youtube/player_parameters?playerVersion=HTML5#Parameters) vars *(query params)* to pass to YouTube |
| `[data-yt-width]` | `Number` | **false** | `<iframe>` width, defaults to `640` |


#####JavaScript:
```js
// attaches events to ready, stateChange, and error for 
// every video loaded on the page, gg
function init() {
  videoAnalytics.on(['ready','stateChange','error'], '*', function(e,state) {
    console.log(e,state);
  });
}
document.addEventListener('DOMContentLoaded', init, false);
```

----

###License
```
The MIT License (MIT)

Copyright (c) 2016 David Higginbotham

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```