# Ezra's Grand Prix

A small racing game for the browser: Babylon.js + Vite, no accounts, no purchases.
Race 3 AI cars for 2 laps; every win unlocks something (paint, wheels, spoilers, cars, tracks).
Progress is saved in the browser's localStorage on the device.

## Run it

```powershell
cd C:\dev\race
npm install
npm run dev
```

## Credits

All art is free to use. Most of it is CC0 (public domain, no credit needed):

- Cars, cones, barriers, diggers, trees, rocks, cacti: [Kenney](https://kenney.nl) (Car Kit, City Kit Roads, Nature Kit)
- Dinosaurs, deer, stag, fox: [Quaternius](https://quaternius.com), downloaded from [Poly Pizza](https://poly.pizza)
- Sky and sand: [Poly Haven](https://polyhaven.com). Asphalt: Poly Haven. Grass and lava: [ambientCG](https://ambientcg.com)

Two models are CC-BY 3.0, which means they must be credited (the menu shows this line too):

- Black bear by Poly by Google, via Poly Pizza (https://poly.pizza/m/56ym_pyVnel)
- Rabbit by Sherkiz, via Poly Pizza (https://poly.pizza/m/Km89u3twcR)

## Easy tweaks

- **Too hard / too easy:** rivals have ten levels (the Rival speed bars on the home screen). It goes up one after
  a win (two after a runaway win) and down one after finishing 3rd or 4th. What each level means is in `difficulty()` in `ai.js`.
- **Shorter races:** `LAPS` in `data.js`.
- **New track:** add an entry to `TRACKS` with a list of `[x, z]` points (meters, going around the loop),
  then add it to `UNLOCKS`. Keep corners gentle and parts of the loop well apart from each other.
- **New unlock:** add a row to `UNLOCKS` — `[winsNeeded, kind, id]`.
