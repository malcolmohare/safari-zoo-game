# AIrcade

A collection of vanilla JS browser games, hosted on GitHub Pages from the `main` branch. No build step.

## Layout

- `index.html` + `games.js`: the AIrcade landing page and its game list. `thumbs/` holds 16:9 card screenshots.
- `shared/analytics.js`: Google Analytics, shared by the landing page and all games.
- One folder per game (currently `safari-zoo/`), each with its own `index.html`, `js/`, `css/`, `assets/`.

## Workflow

- **Always push finished work to `main`** so the GitHub Pages site updates. If working on another branch, also push it to main (`git push origin <branch>:main`).
- New games: own top-level folder, entry in `games.js`, thumbnail in `thumbs/`, 🕹️ link back to `../`.
- Bump the `?v=N` cache-busting query on every script/stylesheet tag in the relevant `index.html` whenever its JS or CSS changes, so phones don't mix cached old files with new ones.

## Safari Zoo (`safari-zoo/`)

- Balance numbers live in `safari-zoo/js/data.js` (species, upgrades, economy) and `Game.jeepStats()` in `safari-zoo/js/state.js`.
- If a balance change makes old saves misleading, bump `SAVE_KEY` in `safari-zoo/js/state.js`.
- Animal art lives in `safari-zoo/assets/animals/<species key>.png` (Fluent Emoji 3D, MIT; licence in that folder). When replacing images, bump `ASSET_VERSION` in `safari-zoo/js/util.js`.
- Graphics are pixel art built in code in `safari-zoo/js/pixel.js` (1 art pixel = 2 world units, 16px tiles). Keep new sprites in that style: outlined, lit from the top-left, no anti-aliasing.
