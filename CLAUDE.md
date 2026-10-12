# Safari Zoo

Vanilla JS + canvas browser game, hosted on GitHub Pages from the `main` branch. No build step.

## Workflow

- **Always push finished work to `main`** so the GitHub Pages site updates. If working on another branch, also push it to main (`git push origin <branch>:main`).
- Balance numbers live in `js/data.js` (species, upgrades, economy) and `Game.jeepStats()` in `js/state.js`.
- If a balance change makes old saves misleading, bump `SAVE_KEY` in `js/state.js`.
- Bump the `?v=N` cache-busting query on every script/stylesheet tag in `index.html` whenever JS or CSS changes, so phones don't mix cached old files with new ones.
- Animal art lives in `assets/animals/<species key>.png` (Fluent Emoji 3D, MIT; licence in that folder). When replacing images, bump `ASSET_VERSION` in `js/util.js`.
