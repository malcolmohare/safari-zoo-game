# 🦒 Safari Zoo

A browser game prototype: run a zoo, and drive a jeep through the wild to catch animals for it with nets.

**Game loop:** go on safari → catch animals → bring them back to base camp → they move into your zoo → a day passes and visitors pay to see them → spend the money on enclosures, amenities and jeep/net upgrades → repeat.

## Play

Open `index.html` in a browser; there's no build step and no dependencies. Progress is saved in your browser's localStorage.

### Hosting on GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", choose the branch (e.g. `main`) and the `/ (root)` folder, then click **Save**.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

## Controls (safari)

| Action | Keys |
| --- | --- |
| Drive | W A S D or the arrow keys |
| Aim | Mouse |
| Fire a net | Left click or Space (hold it down to keep firing) |
| Pick up a netted animal | Drive into it before its timer ring runs out |
| Go home | Drive back to base camp and press E |
| Pause | Esc (press Q while paused to call a tow truck) |

## How it works

- **Habitats:** there are three biomes: savanna (around base camp), jungle (one side of the map) and tundra (far north). Animals can only live in an enclosure of their own habitat. If you catch an animal with no room for it, it's traded to another zoo for a bit of cash.
- **Nets:** big animals need several nets, and a partly-netted animal shakes the net off if you leave it alone. Lions, rhinos, gorillas, tigers and polar bears **charge your jeep**, and every hit costs you fuel.
- **Fuel:** this is your time limit. If you run out, a tow truck brings you home for a fee.
- **Income:** visitors = based on total animal appeal × a variety bonus for each different species. Every visitor pays for a ticket, plus extra if you have a snack bar or gift shop. Each animal costs food every day.

## Code layout

| File | What's in it |
| --- | --- |
| `js/data.js` | All balance numbers: species, biomes, upgrades, amenities, economy. **Start here to tweak.** |
| `js/state.js` | Save/load, the economy, buying things, ending the day |
| `js/safari.js` | The top-down driving and netting game |
| `js/zoo.js` | The zoo map view (enclosures, wandering animals, visitors) |
| `js/ui.js` | Sidebar shop and the pop-up dialogs |
| `js/main.js` | Input, switching between scenes, main loop |
| `js/util.js` | Helpers, emoji sprite cache, synthesized sound effects |

Graphics are emoji drawn on a canvas, and sounds are generated with WebAudio, so there are no asset files.

## License

Copyright (c) 2026 malcolmohare. All rights reserved. You're welcome to play the game, but the code may not be copied, modified or redistributed without permission. See [LICENSE](LICENSE).
