# Crimson Exodus — presentation and demo script

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

*Visual: the briefing screen, mission tab, then the objectives panel [O] —
critical, primary and bonus, with a "why it matters out there" line on each.*

### 4 — The data
Five NASA missions (MRO, Mars 2020, Curiosity, Viking, Mars Global Surveyor), layered at the scale of a footpath. The **real-site map**: the
1 m **HiRISE elevation model** Perseverance landed with (slope, elevation, hillshade,
route climb and profile), **HiRISE 25 cm** and **CTX** imagery live from Mars Trek,
a **CRISM** carbonate layer, and **Perseverance's own traverse**. **Mastcam-Z** photos
of every real outcrop. **Curiosity RAD** surface radiation. Plus Viking and MOLA for
regional context, real ephemerides for the season, sun and light time, and a
MEDA-anchored atmosphere.

**And the honest part, which is the strongest part:** the regional panel draws
the traverse area at true scale on the best global basemap we can fetch. It is a
few pixels wide. Orbital data gives you the crater, the delta and the regional
elevation. It cannot tell you where to put your feet. So the traverse map beside
it is labelled SYNTHETIC rather than pretending to be a NASA product, and every
number in the app carries one of four provenance labels.

*Visual: the real-site map — HiRISE imagery with the slope layer, the science loop
and its real profile — then the orange true-scale box on the global map.*

### 5 — The interaction
**Nothing in this game is a button that flips a checkbox.** Every action that
costs mission time plays as a procedure: an animated schematic of the tool and
the rock, a cuff checklist that says why each beat is done that way, the
mission clock visibly compressed so the minutes really come out of the oxygen
and the walk home, and then a result card carrying the **real NASA image of
that same operation being done on Mars**, credited on the image. Abrading means
grinding a 5 cm circle 8 mm deep and blowing the tailings clear with nitrogen,
because a brush would smear dust back across the surface you cut it to see —
and the player sees Perseverance's actual abrasion patches at Skinner Ridge and
Wildcat Ridge the moment they finish doing it themselves.

Finishing a station's field work downlinks the whole package, shown as the
two-hop journey it really is: UHF to a relay orbiter at 2 Mbit/s, X-band to the
Deep Space Network, then the part no progress bar can honestly animate — minutes
of flight time at the speed of light. The post sits in the NASA feed marked IN
FLIGHT with a live countdown from the real planetary geometry and publishes
itself when the light arrives. Beside it: what the same packet would cost direct
to Earth, a thousand times slower. That gap is why relay orbiters exist.

Three routes, three real trades: all the science and the most ground; the short
gentle valley that funnels dust and loses visibility first; the climb that buys
sightlines with 91 m of ascent. The planner forecasts consumables along the route
with the same model the live walk uses — so if the plan says 51 minutes of
margin, the walk agrees, right up until the weather changes.

Choosing the route changes the guide line on the ground, the elevation profile,
the hazard raster and the live return estimate, because all five read the same
sampled path.

*Visual: abrade a patch — watch the bit spin, the tailings build, the nitrogen
puff clear the patch — then the real PIA24926 abrasion patches appear. Then the
downlink bar fills with the frames you just took, and stops at IN FLIGHT with
10 minutes on the clock.*

### 6 — The result
A dust storm arrives. It does not knock Jack over — the HUD shows, live, that a
22 m/s Martian gust pushes about as hard as a 2.4 m/s breeze on Earth. It takes
his visibility, his solar input, and his battery as the heaters come up. The
model recommends a specific shelter, or tells him to abort when the margin is
already thinner than the walk home. He turns back. The debrief shows the science
he recovered, the reserve he kept, and what he left behind.

Then the Sun flares. The lander's particle monitor warns that protons will arrive in
about 20 minutes; Earth's warning is a light-time behind. The suit stops almost none
of them; the cabin stops most. Outside for the whole event: ~10 mSv. Inside: ~1 mSv.

*Visual: storm peak, the radiation banner, the abort recommendation, then the debrief.*

### 7 — Impact and next step
**The thing we actually want someone to walk away with is a survival guide.**
The objectives panel has a second tab that fills up only from procedures the
player actually carried out — ten sourced entries on what kills you on Mars and
in what order, repeated in full at the debrief. If a player remembers nothing
else: the reserve is what keeps a surprise from becoming a fatality, dust is
what actually breaks equipment and lungs, and Earth cannot help you with the
next ten minutes.

This is a communication and training prototype, and it is deliberately honest
about that. It shows the public, and a student, what a Marswalk actually costs,
and it makes the resolution gap between orbital data and a footpath visible
rather than hiding it.

**What we did to make this survive a judging table:** guidance that teaches one
thing at a time from the current mission state and retires the moment you act on
it; a renderer that measures its own frame time and picks a quality tier so an
unknown laptop is not a gamble; a settings panel that states what the build does
*not* do for accessibility rather than implying it does everything; and a
downloadable mission card so the run leaves with the player.

**What would have to change for real use:** a HiRISE stereo DTM in place of the
synthetic height field, validated suit consumable curves in place of our reasoned
game model, a real DSN link schedule in place of straight-line light time, and
per-step hazard assessment that no orbital product can currently provide. We have
written down exactly which parts those are.

---

## If you only have ninety seconds

Click **Two-minute demo** on the title screen. It drops straight onto the
surface on the route that visits all three stations, auto-traverse already
walking, the clock at 30x, with a regional dust front scheduled. It reaches the
first station with a storm watch running in about twenty-five seconds. Press
**F** there and you are inside the thing this project is actually about.

Click **Mars survival guide** instead and you get the whole educational payload
without playing at all: fifteen sourced entries, ordered by how fast each thing
kills you.

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
   Seven pixels. So we went to the data Perseverance landed with." *Open the
   real-site map.* "HiRISE: 25 cm imagery, a 1 m elevation model. Slope in red.
   The dashed line is where Perseverance actually drove. Our science loop is
   6.5 km on real terrain, and it stops at the foot of Kodiak instead of climbing it."
   *Click Kodiak to show the Mastcam-Z photo.*

3. **Step out (40 s).** *Demo run.* "Real Mars sol, real season, real sun angle.
   We chose to step out at 09:30 local solar time, because before sunrise the
   heaters alone drain the battery in an hour."

4. **Station (30 s).** *Press F.* "Three readings. One is the interpretation
   Perseverance's data supports. Getting it right is what makes the sample worth
   its mass." *Record, seal a core.*

5. **The storm, then the Sun (40 s).** "Opacity climbing, visibility down to two kilometres,
   sunlight at two percent. It is not going to blow him over — the air is one
   percent of Earth's density. It is going to take his margin." *If the flare
   alert is up:* "And now a solar flare: protons in twenty minutes. The suit stops
   none of them, the lander stops most. The model says abort." *Declare abort.*

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
- [x] Every teammate registered and listed on the team (Team Ataman, four members; also in the README).
- [ ] Project page complete, all links public.
- [ ] Confirm the 2026 demo format and local deadline on the official project page.
- [ ] AI use disclosed per the applicable instructions (text is in the README and the in-app `K` panel).
- [ ] Deploy and test the public URL in a fresh browser.
- [ ] Record a backup demo video in case the network fails on the day.
