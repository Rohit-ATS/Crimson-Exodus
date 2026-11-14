# JACK: Marswalk

**A playable Mars EVA planning and field-science simulation, built on NASA open data.**
NASA Space Apps Challenge 2026.

> Plan a route across real NASA Mars data, walk it in a pressure suit, make the
> observations, and get the astronaut home with the science.

---

## The one-sentence pitch

JACK turns NASA Mars data into a playable Marswalk: plan a route, make field
observations, and get the astronaut back with the science — while Earth is
eleven light-minutes away and cannot answer in time.

## Why this exists

Every public picture of Mars exploration is a rover. The hard part of putting a
*person* on Mars is not the landing, it is the eight hours after the hatch opens:
a finite backpack, a finite sol, terrain nobody has ever walked, weather that
takes your visibility and your power rather than your footing, and a mission
control that is a light-hour round trip away from being any help at all.

JACK makes that tradeoff the whole game. You choose a route knowing what it
costs. You decide, alone, whether to work the third station or turn for the
lander. The debrief tells you what you actually learned and what it cost.

---

## Play it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

It is a static site — the `dist/` folder deploys to Vercel, Netlify, GitHub Pages
or any static host with no server, no API keys and no build-time secrets.

### Deploy

`netlify.toml` and `vercel.json` are committed, so either platform needs no
configuration: point it at the repo and it builds. For GitHub Pages, run
`npm run build` and publish `dist/` — `vite.config.ts` sets `base: './'` so the
app works from a subpath as well as a domain root.

The only runtime network calls are to `trek.nasa.gov` (basemap tiles),
`flagcdn.com` (flag images) and Google Fonts. All three fail gracefully: the map
falls back to a clearly labelled schematic, flags fall back to a drawn
placeholder, and the fonts fall back to system stacks. The simulation itself
never touches the network.

### Controls

| Key | Action |
|---|---|
| `W A S D` / arrows | Walk |
| `Q` / `E`, mouse drag | Swing the camera |
| Mouse wheel | Camera distance |
| `Shift` (hold) | Time-compression boost |
| `F` | Work the station in reach |
| `C` | Capture a frame |
| `G` | Plant a flag |
| `B` | Backpack |
| `M` | Mission map |
| `T` | Earth comms feed |
| `H` | Hazard overlay |
| `V` | First / third person |
| `P` | Auto-traverse |
| `Space` | Pause |
| `K` | Data details and disclosure |
| `Esc` | Close a panel |

---

## The mission

**Site:** Jezero Crater, western delta front. 18.4447°N, 77.4508°E, −2571 m.
A 45 km impact crater with an inlet valley, an outlet valley and a fan-shaped
sediment deposit — the evidence that a lake stood there. Perseverance landed on
the floor in February 2021 and has worked from the floor up onto the delta ever
since.

**Science question:** *Did the Jezero delta front record a long-lived lake, and do
its fine-grained beds preserve organic carbon?*

**Three stations**, each modelled on a real feature Perseverance has studied:

| Station | Real feature | What you have to get right |
|---|---|---|
| 1 — Kodiak | The isolated delta remnant butte south of the front | Inclined foreset beds truncated by flat topsets. That geometry requires standing water, not a flood. |
| 2 — Hogwallow | Hogwallow Flats, and the fine-grained Bright Angel formation where "Cheyava Falls" was sampled in July 2024 | Grain size below hand-lens resolution. Low permeability is why this is the best preservation target on the map. |
| 3 — Séítah | The olivine-rich igneous floor unit | The floor is igneous, not sedimentary. That gives you a datable basement and an absolute age bracket for the lake. |

**Three routes**, each a genuine trade:

| Route | Length | Climb | Stations | The trade |
|---|---|---|---|---|
| A — Floor Traverse | 2.32 km | +64 m | 3 | All the science. The most ground, the least that can go wrong, the least slack for a storm. |
| B — Neretva Breach | 1.66 km | +34 m | 2 | Shortest and gentlest, straight up the incised valley. A narrow corridor that funnels dust and loses visibility first. |
| C — Plateau Rim | 2.23 km | +91 m | 2 | Climbs 46 m of open scarp for the sightlines. Slope dominates the metabolic cost. |

Route choice is not cosmetic. The same sampled polyline feeds the planner's cost
model, the guide line on the ground in 3D, the elevation profile, the hazard
raster and the live return estimate. Change the route and all five change.

---

## What is real, and what is not

Every number in the app carries one of four labels, and the Data Details panel
(`K`) spells out the provenance of each.

### NASA observation
* **Orbital basemaps**, fetched live from [NASA Mars Trek](https://trek.nasa.gov/mars/)
  as standard WMTS tiles: Viking MDIM 2.1 colour mosaic (232 m/px), MOLA colour
  shaded relief (463 m/px), and the MOLA/HRSC blend (200 m/px).
* **The geology.** Every station briefing is the published Perseverance result,
  with the real feature named and the instrument cited.
* **Atmospheric composition, gravity, temperature and pressure ranges** from
  [NASA Mars facts](https://science.nasa.gov/mars/facts/) and the Mars 2020
  [MEDA](https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/)
  record.

### Model output — accurate, computed live, not measured
* **Earth–Mars distance and one-way light time**, from the JPL
  [approximate planetary positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html).
  Error well under 1%. This drives the comms delay, and it is the real one.
* **Mars season (Ls), Mars Sol Date, the mission sol at Jezero, and local true
  solar time**, from the Allison & McEwen algorithm as published for
  [NASA GISS Mars24](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html).
* **Sun elevation and azimuth**, which light both the 3D scene and the map's
  hillshade.
* **Temperature, pressure, wind and dust opacity**: a parameterised climatology
  whose ranges are anchored to MEDA observations at Jezero. Not a forecast, not
  telemetry playback.

### Synthetic terrain
The metre-scale ground you walk on is **procedural**. It is shaped to the
published large-scale morphology of the delta front — floor elevation near
−2600 m, a scarp of several tens of metres trending roughly N–S, an incised
breach valley, an isolated remnant butte, a megarippled trough on the floor — but
it is **not resampled from any NASA DEM**.

### Game mechanic
The suit, its consumable capacities, every consumption rate, the hazard weights
and the scoring. No certified Mars surface EVA suit exists, so there is nothing
to calibrate against. The physical *reasoning* is grounded (oxygen demand from
metabolic power at 20.9 kJ per litre of O₂; CO₂ from the respiratory quotient;
Tobler's hiking function for walking speed against slope); the absolute numbers
are tuned for play.

### The honest headline

> This is a prototype and an educational planning interface. **It is not an
> operationally safe route planner for real astronauts.** The best global orbital
> basemap it can fetch is about 326 m per pixel — the entire 2.4 km traverse is a
> few pixels across on it, and the app draws that footprint at true scale so you
> can see it. Nothing at orbital resolution can certify that a human can safely
> place a boot on a given square metre of Mars.

---

## What the simulation actually models

**Atmosphere.** Hydrostatic pressure reduced to site elevation on a column-mean
temperature, modulated by the seasonal CO₂ condensation cycle (two maxima per
Mars year) and the diurnal thermal tide. Density and speed of sound follow from
the CO₂-dominated gas mixture. The boiling point of water is obtained by
inverting the Magnus saturation formula — at ~800 Pa it comes out near 4 °C,
which is the real reason the suit is not optional.

**Why a Mars storm is dangerous, and why it is not.** Wind force scales with air
density, and Mars air is about 1% as dense as Earth's. The HUD shows, live, that
a 19 m/s Martian gust carries the same dynamic pressure as a ~2 m/s breeze on
Earth. A storm does not knock you over. It takes your visibility (Koschmieder's
relation from column optical depth), takes your solar input (Beer–Lambert through
a slant path), drives the suit heater load up, and coats the radiator in abrasive
dust so the sublimator burns feedwater faster. Your margin disappears while you
are deciding.

**Shelter and abort.** The hazard model combines slope, roughness, exposure to the
dust-front bearing and range from the lander. When a front arrives it recommends
a specific shelter — or, if the return margin is already thin, it says go home,
because sheltering spends the consumables you need to walk home on. Taking that
advice is how you win. The game never ambushes you.

**The Earth link.** Every message carries the real one-way light time for the
current geometry. Messages in flight show a live countdown. Replies say, in their
own text, how stale they are by the time they arrive — and mission control
explicitly hands the decision back, because it physically cannot make it.

**Timekeeping.** The Mars date is real: the current sol at Jezero, the current
season, the sun's actual path. What the planner chooses is the *hour of the sol*
to step out, exactly as a flight plan does — and that choice matters, because
before sunrise the heaters alone drain the battery in about an hour.

---

## Architecture

```
src/
  sim/
    orbits.ts        Keplerian ephemerides, Mars24 timekeeping, sun geometry, light time
    mars.ts          Surface environment: pressure, temperature, density, wind, dust
    weather.ts       Dust devils and regional storms, phased, seasonally weighted
    consumables.ts   Portable life support: O2, CO2 scrubber, battery, feedwater
    comms.ts         The Earth link and its delay
    hazard.ts        Planning cues and shelter recommendation
  mission/
    terrain.ts       The one authoritative height field (craters, scarp, breach, dunes)
    site.ts          Jezero: stations, routes, shelters, provenance
    path.ts          Route sampling, cost, return estimates
    forecast.ts      Pre-walk consumables forecast
  three/             Terrain, far horizon, sky, rocks, Jack, lander, flag, dust, scene
  ui/                Title, briefing, planner, HUD, panels, debrief
    map/             Local raster layers, NASA Trek tiles, elevation profile
  state/             Zustand store, fixed-step sim loop, input
  data/              ISO 3166-1 flags, flag textures
```

One height field serves the 3D mesh, the map, the elevation profile, the cost
model and the hazard raster, so the plan and the walk can never disagree.

**Stack:** React 18 + TypeScript + Vite, Three.js via react-three-fiber, Zustand.
No art assets are loaded: the terrain, astronaut, lander, sky and dust are all
geometry and shaders generated at runtime.

---

## AI use disclosure

This project was built with AI assistance (Anthropic Claude) for code authoring,
simulation design and copy.

**No AI-generated images, video or audio appear anywhere in the app.** Every
visual is either (a) live NASA Mars Trek tile imagery, credited on the image
itself, or (b) generated procedurally at runtime by the code in this repository.
National flag images are fetched from flagcdn.com (public-domain renderings keyed
to ISO 3166-1), and are not NASA data. There is therefore no AI-generated imagery
requiring a watermark.

## Licences and credits

* Code in this repository: MIT.
* NASA Mars Trek tiles, Mars 2020 imagery and NASA data: NASA/JPL-Caltech,
  public domain, credited in-app.
* Flag renderings: flagcdn.com, public domain.
* Fonts: Orbitron, Share Tech Mono, Barlow Condensed (Google Fonts, OFL).

A flag planted on Mars in this game is commemorative. Article II of the 1967
Outer Space Treaty is explicit that it creates no claim of sovereignty.
