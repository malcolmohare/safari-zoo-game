# 🚀 Astro Blaster

A side-scrolling space shooter, part of [AIrcade](../). Fly a ship up and down, hold fire, and blast the aliens coming in from the right.

- **Controls:** W/S or ↑/↓ to move, hold Space (or the mouse button) to fire, P or Esc to pause. On phones, drag anywhere to move and hold the FIRE button.
- **Lives:** you start with 3. Getting hit costs a life and one weapon level.
- **Aliens:** drones, wavers, divers that dash at you, shooters that stop and fire, and armoured brutes. Formations appear too.
- **Power-ups** drop every 20 to 30 kills: **P** more guns (up to 5-way), **R** rapid fire, **S** a shield that absorbs one hit, **B** a bomb that clears the screen, **1** an extra life.
- **Difficulty** rises the longer you survive. After enough kills a **mothership boss** arrives. Beat it to loop back to the start, where everything is faster, tougher and worth more, and the boss returns stronger.

Everything is drawn in code as pixel art (`js/pixel.js`, `js/sprites.js`) at 320×180 and scaled up. Sounds are generated with WebAudio. The high score is saved in the browser.
