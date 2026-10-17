# 🚀 Astro Blaster

A side-scrolling space shooter, part of [AIrcade](../). Fly a ship up and down, hold fire, and blast the aliens coming in from the right.

- **Controls:** W/S or ↑/↓ to move, hold Space (or the mouse button) to fire, P or Esc to pause. On phones, drag anywhere to move and hold the FIRE button.
- **Lives:** you start with 3. Getting hit costs a life and one weapon level.
- **Aliens:** drones, wavers, divers that dash at you, shooters that stop and fire, and armoured brutes. Formations appear too.
- **Power-ups** drop every 20 to 30 kills: **P** more guns (up to 5-way), **R** rapid fire, **S** a shield that absorbs one hit, **B** a bomb that clears the screen, **1** an extra life.
- **Weapon tiers:** a **P** at 5 guns upgrades your weapon to the next tier (MK 2, MK 3, and so on forever). You drop back to one gun, but every shot hits harder and has a new look (bolts, lasers, plasma orbs, chevrons, helixes, in new colours each tier). The HUD shows your tier and guns.
- **Difficulty** rises the longer you survive. After enough kills a **boss** arrives. Beat it to loop back to the start, where everything is faster, tougher and worth more.
- **Bosses** take turns, one per loop, and come back stronger (MK 2...) after all four:
  - **Mothership:** bobs up and down firing fans, aimed bursts and spirals, and launches drones.
  - **Space Serpent:** weaves around the screen. Only the head takes damage; its armoured body segments block your shots (you can shoot them off) and fire back.
  - **The Watcher:** a giant eye that follows you. It locks on and fires a screen-wide laser (get out of the red line), and blinks shut to become armoured while firing rings.
  - **Gemini Twins:** two gunships sharing one health bar. They fire walls of shots with a gap to slip through and spin around to swap places. Kill one and the other gets angry.

Everything is drawn in code as pixel art (`js/pixel.js`, `js/sprites.js`) at 320×180 and scaled up. Sounds are generated with WebAudio. The high score is saved in the browser.
