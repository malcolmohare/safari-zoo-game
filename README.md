# 🦒 Safari Zoo

A browser game prototype: run a zoo, and drive a jeep through the wild to catch animals for it with nets.

**Game loop:** go on safari → catch animals → bring them back to base camp → sell them for money, or put one of each new species on display in your zoo → your collection unlocks better upgrade tiers → spend the money on jeep/net upgrades, land and enclosures → reach further regions with more valuable animals → repeat.

## Play

Open `index.html` in a browser; there's no build step and no dependencies. Progress is saved in your browser's localStorage.

### Hosting on GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", choose the branch (e.g. `main`) and the `/ (root)` folder, then click **Save**.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

## Controls

**At the zoo** you walk your zookeeper around.

| Action | Keys |
| --- | --- |
| Walk | W A S D or the arrow keys |
| Interact | E (stand next to a building, truck, jeep or enclosure) |
| Close a menu | Esc |

**On safari** you drive the jeep.

| Action | Keys |
| --- | --- |
| Drive | W A S D or the arrow keys |
| Fire a net | Space (hold it down to keep firing). Nets fire straight out of the front of the jeep. |
| Pick up a netted animal | Drive into it before its timer ring runs out |
| Pick up a missed net | Drive over it |
| Gather a resource | Drive over a glowing 🌾 🪵 🍄 🌵 🧊 |
| Refill fuel and nets | Drive back into base camp (needs the ⛺ Camp Supply Depot perk from the Garage) |
| Go home | Drive back to base camp and press E |
| Auto-fire on/off | F (once you have Auto-Aim Turret level 3) |
| Pause | Esc (press Q while paused to call a tow truck) |

**On phones and tablets** the game switches to touch controls automatically.

| Action | Touch |
| --- | --- |
| Walk / drive | Drag your thumb on the left side of the screen. A joystick appears under it; the jeep turns to face where you push. |
| Use (zoo) | Tap ✋ when you're next to something |
| Fire a net | Hold 🕸️ |
| Go home | Tap 🏁 at base camp |
| Auto-fire on/off | Tap AUTO |
| Pause / tow truck | Tap ⏸ |

## How it works

- **The zoo:** walk to the 🚙 jeep to go on safari. When you come back, your catch waits in the 🚚 truck. Carry each animal (one at a time) to an enclosure that matches its home region. You start with a single plot. Walk up to a 🪧 for-sale sign to buy another (each costs more money than the last, plus resources: grass for the first plots, then wood, mushrooms, cactus and ice), to an empty plot to build an enclosure, to an enclosure to expand it or sell animals, to the 🔧 Garage for jeep and net upgrades, and to the 🏢 Office for your collection progress, upgrade tiers and the field guide.
- **Regions:** the wild is a long strip with five regions, each further from base camp than the last: Savanna → Wetlands → Jungle → Desert → Tundra. Further regions have more valuable animals, but you need more fuel and a faster jeep to get there and back. Within a region, the rarest animals live on its far side.
- **Auto-Aim Turret:** a Garage upgrade that makes the turret lock onto animals in a cone in front of the jeep. Each level widens the cone, and from level 3 it can fire by itself. Toggle auto-fire with F (or the AUTO button on touch screens) when you'd rather save nets; the turret keeps aiming either way.
- **Nets:** you only carry a limited number of nets (upgrade the Net Rack for more). Missed nets land on the ground and can be picked back up. Big animals need several nets, and a partly-netted animal shakes the net off if you leave it alone. Lions, hippos, crocodiles, gorillas, tigers, scorpions, cobras, rhinos and polar bears **charge your jeep**, and every hit costs you fuel.
- **Fuel:** this is your time limit. Once you buy the ⛺ Camp Supply Depot perk at the Garage, driving back into base camp refills your fuel and nets, so a trip can last as long as you keep returning to camp. Crashing into trees and rocks burns extra fuel. If you run out, a tow truck brings you home for a fee.
- **Money:** you only earn money by **selling animals** (from the truck or from an enclosure). Animals on display in an enclosure grow in value the longer they stay: +20% per minute of play, up to 3× their base value. Values climb steeply with distance: savanna animals sell for $10–45, wetlands $40–145, jungle $150–470, desert $500–1,300 and tundra $1,500–5,770.
- **Collection & tiers:** the number of different species on display in your enclosures sets your tier (5, 10, 16 and 22 species for tiers 2–5). Each tier gives a permit to drive into the next region (a ranger fence blocks it until then) and unlocks more levels of every upgrade. Tiers stay unlocked even if you sell animals later. Keep one of each species for the collection and sell the duplicates.
- **Resources:** each region has its own resource to gather by driving over the glowing nodes: 🌾 grass (Savanna), 🪵 wood (Wetlands), 🍄 mushrooms (Jungle), 🌵 cactus (Desert) and 🧊 ice (Tundra). Upgrade levels cost money plus their tier's resource (1–4 units per level), and building or expanding an enclosure costs money plus its region's resource.
- **Upgrades:** every upgrade has many small levels (up to 50) spread across the five tiers, e.g. the Fuel Tank is 50 levels of +1.5s. Each tier's levels are priced to take roughly 10–15 minutes of catching and selling that region's animals.

## Code layout

| File | What's in it |
| --- | --- |
| `js/data.js` | All balance numbers: species, biomes, upgrades, amenities, economy. **Start here to tweak.** |
| `js/state.js` | Save/load, the economy, buying things, ending the day |
| `js/safari.js` | The top-down driving and netting game |
| `js/zoo.js` | The zoo map view (enclosures, wandering animals, visitors) |
| `js/ui.js` | Sidebar shop and the pop-up dialogs |
| `js/main.js` | Input, switching between scenes, main loop |
| `js/touch.js` | Touch joystick and on-screen buttons for phones |
| `js/util.js` | Helpers, emoji sprite cache, synthesized sound effects |

Graphics are emoji drawn on a canvas, and sounds are generated with WebAudio, so there are no asset files.

## License

Copyright (c) 2026 malcolmohare. All rights reserved. You're welcome to play the game, but the code may not be copied, modified or redistributed without permission. See [LICENSE](LICENSE).
