# JACK: Marswalk — presentation and demo script

> Written for: the team, to present to Space Apps judges.
> Check your local event's instructions for the controlling format before you
> build slides — the 7-slide / 30-second-video shape below is the commonly used
> one, not a universal requirement.

---

## The seven slides

### 1 — The problem
A Marswalk is not a walk. It is a simultaneous solve of four constraints: where
the science is, what the terrain costs, what the suit can supply, and how long
the walk home takes. Every rover image the public has seen was taken by a machine
that can simply stop. A human cannot. And the one thing a human on Mars cannot do
is phone a friend: Earth is a twenty-minute round trip away, so the astronaut is
the flight director for anything urgent.

*Visual: the live Earth-link readout from the title screen, showing today's real
one-way light time.*

### 2 — The idea
**JACK** is a playable Mars EVA planning and field-science simulation. Three
phases: **plan a route**, **walk it**, **debrief**. One site, one science
question, three stations, three routes, one suit, one decision that matters.

*Visual: the title screen.*

### 3 — The mission
Jezero Crater, western delta front. 18.4447°N, 77.4508°E, −2571 m. The real
science question Perseverance is working: *did the delta front record a
long-lived lake, and do its fine-grained beds preserve organic carbon?* Three
stations, each modelled on a real feature — Kodiak, Hogwallow Flats / Bright
Angel, and the Séítah igneous floor.

*Visual: the briefing screen, mission tab.*

### 4 — The data
Live NASA Mars Trek tiles: Viking MDIM 2.1, MOLA colour shaded relief, MOLA/HRSC
blend. Real ephemerides driving the Mars season, the local solar time, the sun
angle and the Earth light time. MEDA-anchored atmosphere.

**And the honest part, which is the strongest part:** the regional panel draws
the traverse area at true scale on the best global basemap we can fetch. It is a
few pixels wide. Orbital data gives you the crater, the delta and the regional
elevation. It cannot tell you where to put your feet. So the traverse map beside
it is labelled SYNTHETIC rather than pretending to be a NASA product, and every
number in the app carries one of four provenance labels.

*Visual: the planner, with the orange true-scale box called out.*

### 5 — The interaction
Three routes, three real trades: all the science and the most ground; the short
gentle valley that funnels dust and loses visibility first; the climb that buys
sightlines with 91 m of ascent. The planner forecasts consumables along the route
with the same model the live walk uses — so if the plan says 51 minutes of
margin, the walk agrees, right up until the weather changes.

Choosing the route changes the guide line on the ground, the elevation profile,
the hazard raster and the live return estimate, because all five read the same
sampled path.

*Visual: switch routes in the planner; margins and the profile change live.*

### 6 — The result
A dust storm arrives. It does not knock Jack over — the HUD shows, live, that a
22 m/s Martian gust pushes about as hard as a 2.4 m/s breeze on Earth. It takes
his visibility, his solar input, and his battery as the heaters come up. The
model recommends a specific shelter, or tells him to abort when the margin is
already thinner than the walk home. He turns back. The debrief shows the science
he recovered, the reserve he kept, and what he left behind.

*Visual: storm peak, the shelter recommendation, then the debrief.*

### 7 — Impact and next step
This is a communication and training prototype, and it is deliberately honest
about that. It shows the public, and a student, what a Marswalk actually costs,
and it makes the resolution gap between orbital data and a footpath visible
rather than hiding it.

**What would have to change for real use:** a HiRISE stereo DTM in place of the
synthetic height field, validated suit consumable curves in place of our reasoned
game model, a real DSN link schedule in place of straight-line light time, and
per-step hazard assessment that no orbital product can currently provide. We have
written down exactly which parts those are.

---

## Live demo script (3 minutes)

Keep it on **one decision**.

1. **Title (10 s).** "This is today's real Earth–Mars light time. Eleven minutes
   each way. Remember that number."

2. **Planner (50 s).** "Three routes to the same three stations. Route A gets all
   the science and costs the most ground. Route B is short and gentle but it runs
   up a narrow valley that fills with dust. Watch the forecast change." *Click
   between routes.* "And this" — *point to the orange box on the NASA panel* —
   "is our whole traverse at true scale on the best global map NASA publishes.
   Seven pixels. That is why we call our terrain synthetic instead of calling it
   data."

3. **Step out (40 s).** *Demo run.* "Real Mars sol, real season, real sun angle.
   We chose to step out at 09:30 local solar time, because before sunrise the
   heaters alone drain the battery in an hour."

4. **Station (30 s).** *Press F.* "Three readings. One is the interpretation
   Perseverance's data supports. Getting it right is what makes the sample worth
   its mass." *Record, seal a core.*

5. **The storm (40 s).** "Opacity climbing, visibility down to two kilometres,
   sunlight at two percent. It is not going to blow him over — the air is one
   percent of Earth's density. It is going to take his margin. The model says
   abort, because sheltering spends the consumables he needs to walk home on."
   *Declare abort.*

6. **Debrief (20 s).** "Two stations, one sealed core, crew home with the reserve
   intact. And every number labelled: NASA observation, model output, synthetic
   terrain, or game mechanic."

---

## Readiness checklist

### Product
- [x] App launches from a public link (static build, no server).
- [x] Player can finish one complete mission.
- [x] Route choice changes the mission (path, cost, profile, hazard, return).
- [x] Science interactions work (observe, sample, photograph, flag).
- [x] Resource use and return logic are visible and explained.
- [x] Debrief explains the outcome and what it cost.
- [x] Controls and restart are on screen.
- [x] Works if NASA Mars Trek is slow or blocked (labelled fallback).

### Data and science
- [x] NASA data is central to the map and the science interactions.
- [x] Each data item has a source, date and resolution.
- [x] Historical observations are never labelled as live Mars conditions.
- [x] Simplified terrain and game assumptions are identified in-app.
- [x] Images and media are credited on the image itself.

### Submission — do these before the deadline
- [ ] Every teammate registered and listed on the team.
- [ ] Project page complete, all links public.
- [ ] Confirm the 2026 demo format and local deadline on the official project page.
- [ ] AI use disclosed per the applicable instructions (text is in the README and the in-app `K` panel).
- [ ] Deploy and test the public URL in a fresh browser.
- [ ] Record a backup demo video in case the network fails on the day.
