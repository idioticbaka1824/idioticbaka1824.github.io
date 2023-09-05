# organya-js

By Alula: https://github.com/alula

A tiny and accurate player for Organya music files.

Organya is a chiptune music format created by [Daisuke "Pixel" Amaya](https://twitter.com/oxizn), meant for use in his [Cave Story](https://cavestory.org) game.

See the demo: https://alula.github.io/organya-js/

- organya.js - the main player component, it's all you need for playing .org files in browser. (~250 LoC)
- organya-ui.js - optional component that renders a piano roll on HTML5 canvas. (~150 LoC)

UI graphics were taken from original Organya source code: https://github.com/shbow/organya

-----------------------------

This is a very slightly modified version: It now supports Org-03 (with the new drums and all).
The demo index page has some small added perks:
- a simple option to input a link to an org file and have it played (only File Garden upload links work)
- play, pause, backward, forward, home buttons
- mute any track while playing
- use arrow keys to go up/down/left/right on the piano roll canvas

see https://raadshaikh.github.io/organya-js-03/org-index.html