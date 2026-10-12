# Backyard Grand Prix

A small racing game for the browser: Babylon.js + Vite, no physics engine, no accounts, no purchases.
Race 3 AI cars for 3 laps; every win unlocks something (paint, wheels, spoilers, cars, tracks).
Progress is saved in the browser's localStorage on the device.

## Run it

```powershell
cd C:\dev\race
npm install
npm run dev
```

Vite prints a `Network:` URL like `http://192.168.1.50:5173`. Open that on the tablet (same Wi-Fi).
Windows will probably ask to allow Node through the firewall the first time — allow it on private networks.

Desktop controls: arrows/WASD, Space to brake. On a touch screen you get big on-screen buttons.

## Put it on his tablet

`npm run build` makes a static site in `dist/`. Host it anywhere that serves static files over **HTTPS**
(Cloudflare Pages, Netlify, GitHub Pages, or your homelab behind a reverse proxy). On the iPad: open it in
Safari → Share → **Add to Home Screen**. It launches fullscreen like an app and keeps working offline
after the first load (the service worker only registers over HTTPS).

## Where things live

| File | What it does |
| --- | --- |
| `src/data.js` | **Start here.** Cars and their stats, paint colors, wheels, spoilers, tracks, laps, and the unlock ladder. |
| `src/physics.js` | Arcade driving model, soft walls, bumping, lap counting. Pure JS. |
| `src/ai.js` | Opponents: follow the road, slow for corners, rubber-band to keep races close. |
| `src/trackmath.js` | Turns a track's control points into a smooth, evenly sampled loop. |
| `src/world.js` | Builds the 3D track: road, curbs, start line, trees. |
| `src/env.js` | The look: sky lighting, sun and shadows, shiny materials. Lists where the files in `public/assets` came from (all CC0). |
| `src/carmesh.js` | Builds the cars from `src/cars.json` and gives them paint, glass, wheels and spoilers. |
| `tools/build-cars.mjs` | Makes `src/cars.json` from the Kenney Car Kit models in `tools/car-kit` (CC0). Notes at the top explain how to add a car. |
| `src/sound.js` | Engine, countdown beeps and jingles, all generated in code (no sound files). |
| `src/race.js` | One race: grid, countdown, camera, HUD, finish. |
| `src/showroom.js` | Turntable scene behind the menu and garage. |
| `src/ui.js`, `src/style.css` | Menus, garage, HUD, results. |

## Easy tweaks

- **Too hard / too easy:** rivals have a level from 0 to 10 (the dots on the menu). It goes up one after
  a win and down one after finishing 3rd or 4th. What each level means is in `difficulty()` in `ai.js`.
- **Shorter races:** `LAPS` in `data.js`.
- **New track:** add an entry to `TRACKS` with a list of `[x, z]` points (meters, going around the loop),
  then add it to `UNLOCKS`. Keep corners gentle and parts of the loop well apart from each other.
- **New unlock:** add a row to `UNLOCKS` — `[winsNeeded, kind, id]`.
