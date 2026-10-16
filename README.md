# 🕹️ AIrcade

A collection of browser games made with AI. Free to play, no install.

**Play:** https://malcolmohare.github.io/safari-zoo-game/

## Games

| Game | Folder | About |
| --- | --- | --- |
| 🦒 [Safari Zoo](safari-zoo/) | `safari-zoo/` | Drive a jeep into the wild, net animals across five regions, and build your zoo. See [its README](safari-zoo/README.md). |

## Layout

| Path | What's in it |
| --- | --- |
| `index.html` | The AIrcade landing page (game index) |
| `games.js` | The list of games shown on the landing page |
| `thumbs/` | 16:9 screenshots used on the game cards |
| `shared/analytics.js` | Google Analytics setup shared by the arcade page and every game |
| `safari-zoo/` | Safari Zoo (each game lives in its own folder) |

## Adding a game

1. Put the game in its own folder at the top level, with its own `index.html`.
2. Add a 16:9 screenshot (about 640×360) to `thumbs/`.
3. Add an entry to `GAMES` in `games.js`.
4. Optionally load `../shared/analytics.js` in the game and call `Analytics.init()` so it reports to the same Google Analytics property, and add a 🕹️ link back to `../`.

Everything is static files with no build step, hosted on GitHub Pages from the `main` branch. Each game's saves live in the browser's localStorage under its own key.

## Analytics

Put your GA4 Measurement ID (`G-XXXXXXXXXX`) in `GA_MEASUREMENT_ID` at the top of `shared/analytics.js`. The arcade page reports page views and a `game_select` event when someone picks a game; games can send their own events. Nothing is sent while the ID is empty or when running locally.

## License

Copyright (c) 2026 malcolmohare. All rights reserved. You're welcome to play the games, but the code may not be copied, modified or redistributed without permission. See [LICENSE](LICENSE). Third-party assets keep their own licences (e.g. `safari-zoo/assets/animals/LICENSE.txt`).
