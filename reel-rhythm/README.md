# 🎣 Reel Rhythm

A rhythm fishing game crossed with an aquarium shop, part of [AIrcade](../). Catch fish to the beat, keep them happy in your tanks, and sell them to customers.

**Game loop:** go fishing → hook a bite → win a rhythm fight to reel it in → stock your tanks → open the shop and ring up customers → pay rent each week → buy upgrades that unlock new waters and new kinds of tanks → repeat.

## Play

Open https://malcolmohare.github.io/safari-zoo-game/reel-rhythm/ (or pick it on the AIrcade page). No build step. Progress is saved in your browser's localStorage.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Cast / hook / hit a note | Space (or F) | Tap anywhere |
| Two-lane fish | F for the top lane, J for the bottom lane | Tap the left or right half of the screen |
| Hold notes | Hold the key | Keep your finger down |
| Head home early | Esc | 🏠 Head home |

## How it works

- **Fishing.** Each trip has a few casts (more with the 🪱 Bait Box). Wait for the bobber to dive and hook it fast. Fake nibbles don't count, and striking too early spooks the fish.
- **The fight.** Notes slide to the ring in time with the music. Perfect and Good hits fill the **REEL** bar; misses, early let-gos and random taps strain the **LINE**. Fill REEL to land the fish; max out LINE and it snaps. Every 4th bar the fish fights back with a harder pattern (red notes). Harder fish are faster, use two lanes and hold notes.
- **Rods are a hard gate.** A fish that needs a stronger rod still bites, but snaps your line. The Fishpedia tells you which rod you need.
- **Tanks.** Every fish has needs: fresh or salt water, cold/temperate/tropical, a big enough tank, plants/rocks/coral, schools of 3+, and no bullies. Happiness (♥) sets the price, and customers won't buy fish below a minimum that rises each day. Unhappy fish get sick and die; wrong water kills overnight; aggressive fish may eat small tankmates. Tanks get dirty; clean them or buy better filters.
- **The shop.** Customers browse, pick a fish, and queue at the counter. Tap them to ring them up before they lose patience (or hire a cashier). Some ask for a specific species and pay extra. Reputation brings more customers.
- **Difficulty.** Rent is due every 7th night and grows each week. Miss it twice in a row and the shop closes. Five fishing spots unlock with travel upgrades (Waders → Rowboat → Motorboat → Trawler), and their fish need Chillers, Heaters and the Saltwater Kit to survive.

## Code

| File | What's in it |
| --- | --- |
| `js/data.js` | Species, spots, tanks, decor, upgrades and economy numbers |
| `js/state.js` | Save/load and the rules: happiness, prices, upgrades, end of day |
| `js/fishing.js` | The fishing trip and rhythm fight |
| `js/shop.js` | The shop scene and customer simulation |
| `js/ui.js` | HTML top bar, action bar and menus |
| `js/audio.js` | WebAudio music, sound effects and the rhythm clock |
| `js/sprites.js`, `js/pixel.js` | Pixel-art fish and people built in code |
