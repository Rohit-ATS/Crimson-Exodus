/**
 * knowledge.ts — What MERV knows about Mars without asking anybody.
 *
 * ===========================================================================
 *  This is the rover's offline brain, and it is the one that always runs.
 *
 *  A judge opening this project on conference wifi with no API key set must
 *  still be able to hold a real conversation about Mars. So every entry here
 *  is a hand-written, sourced answer — not generated, not paraphrased from a
 *  model, and not subject to a network call. When a speech or language service
 *  is configured it makes MERV fluent; it does not make him informed.
 *
 *  The rule for every entry: a specific number, where it came from, and why a
 *  person standing on Mars would care. An answer that fails all three is not
 *  worth the bytes.
 * ===========================================================================
 */

export interface Topic {
  id: string
  /** Words and phrases that should route a question here. */
  keys: string[]
  /** What MERV says. Written to be spoken aloud, so: short sentences. */
  answer: string
  /** Where the number comes from. Shown under the answer in the transcript. */
  source: string
  /** The survival-guide entry this reinforces, if any. */
  lesson?: string
}

/**
 * Written as spoken answers. No bullet lists, no markdown: these go through a
 * text-to-speech engine as often as they go on screen.
 */
export const TOPICS: Topic[] = [
  // ---- The air -----------------------------------------------------------
  {
    id: 'atmosphere',
    keys: ['atmosphere', 'air', 'what is the air', 'composition', 'breathe', 'breathable', 'oxygen in the air'],
    answer:
      'The air is about 95 percent carbon dioxide, 2.6 percent nitrogen, 1.9 percent argon, and only about 0.16 percent oxygen. Mean surface pressure is around 610 pascals — roughly six tenths of one percent of sea level on Earth. You cannot breathe it, and the problem is not mainly the composition. It is that there is almost nothing there at all.',
    source: 'NASA Mars fact sheet; Viking and Curiosity SAM measurements',
    lesson: 'pressureSuit',
  },
  {
    id: 'pressure',
    keys: ['pressure', 'vacuum', 'armstrong', 'boil', 'boiling', 'blood boil', 'depressurise', 'depressurize', 'suit breach', 'helmet', 'without a suit', 'no suit', 'take off my'],
    answer:
      'At about 6.3 kilopascals — the Armstrong limit — water boils at 37 degrees Celsius, which is body temperature. Mars surface pressure is about 610 pascals, ten times lower than that. So the saliva on your tongue and the water lining your lungs would flash to vapour. You would have maybe ten to fifteen seconds of useful consciousness. The suit is not clothing. It is the only thing between you and that.',
    source: 'Armstrong limit, USAF aerospace physiology; NASA Mars fact sheet',
    lesson: 'pressureSuit',
  },
  {
    id: 'co2',
    keys: ['co2', 'carbon dioxide', 'scrubber', 'rebreathe', 'exhale', 'suffocate', 'lithium hydroxide'],
    answer:
      'Carbon dioxide kills faster than running out of oxygen does. At about 7 to 10 percent inspired CO2 you lose consciousness in minutes. Your suit does not vent your breath, it scrubs it, and the scrubber has a finite capacity. That is why there are four consumables on your display and not one: oxygen can be fine while the scrubber is the thing about to end your day.',
    source: 'NASA human-systems CO2 exposure limits; Apollo and ISS EMU scrubber design',
    lesson: 'co2Kills',
  },
  {
    id: 'speedofsound',
    keys: ['sound', 'speed of sound', 'hear', 'noise', 'quiet', 'shout', 'talk without radio'],
    answer:
      'Sound travels at roughly 240 metres per second here, against 343 on Earth, and the thin cold air absorbs high frequencies hard. Perseverance carries the first microphones ever landed on Mars, and they confirmed something odd: there are effectively two speeds of sound, because higher frequencies travel slightly faster than lower ones. Practically, you would not hear me shout from thirty metres. That is what the radio is for.',
    source: 'Perseverance SuperCam microphone, Maurice et al., Nature 2022',
  },

  // ---- Temperature and power --------------------------------------------
  {
    id: 'temperature',
    keys: ['temperature', 'cold', 'how cold', 'hot', 'freeze', 'freezing', 'warm', 'heat'],
    answer:
      'At Jezero the ground can reach a few degrees above freezing in the afternoon sun and then fall to minus 80 or lower before dawn. The swing in a single sol can be 80 to 100 degrees Celsius. The thin air cannot hold heat, so the moment the sun goes, the warmth goes with it. Your heaters run off the same battery as everything else, which is why cold is a power problem before it is a comfort problem.',
    source: 'Perseverance MEDA, Jezero crater seasonal records',
    lesson: 'coldKills',
  },
  {
    id: 'power',
    keys: ['power', 'solar', 'battery', 'rtg', 'nuclear', 'plutonium', 'generator', 'electricity'],
    answer:
      'Solar is honest but fragile here. Sunlight at Mars is about 590 watts per square metre at the top of the atmosphere against 1361 at Earth, and a dust storm can cut what reaches the ground by 90 percent. Both Opportunity and InSight died of exactly that. Curiosity and Perseverance carry a radioisotope generator instead — about 110 watts of electricity, continuously, from the decay heat of plutonium-238, and a dust storm does nothing to it. My own array is making less every sol I spend out here.',
    source: 'NASA MMRTG specifications; Opportunity end of mission 2018; InSight 2022',
  },
  {
    id: 'windpower',
    keys: ['wind power', 'windmill', 'turbine', 'wind energy'],
    answer:
      'Wind looks tempting and is mostly a trap. Power in wind scales with air density, and Martian air is about one percent of Earth\'s. A 25 metre per second Martian gust carries roughly the punch of a 3 metre per second breeze at home. It is strong enough to lift dust and ruin your visibility, and nowhere near strong enough to be your power plant.',
    source: 'Derived from NASA Mars fact sheet density, 0.020 kg/m3',
  },

  // ---- Dust --------------------------------------------------------------
  {
    id: 'dust',
    keys: ['dust', 'dusty', 'regolith', 'dirt', 'soil', 'grit', 'abrasive'],
    answer:
      'The dust is the thing that actually breaks missions. Grains average a few microns across — finer than talc — and they are electrostatically clingy and chemically reactive. They jam seals, scratch visors, coat solar arrays and carry perchlorates. Apollo crews came home with suits abraded through after three days on the Moon. Every seal you open out here lets some in, and nothing you do gets it all out.',
    source: 'Phoenix and Curiosity soil analyses; Apollo dust lessons-learned',
    lesson: 'dustIsTheHazard',
  },
  {
    id: 'storm',
    keys: ['storm', 'dust storm', 'global storm', 'regional storm', 'tau', 'opacity', 'visibility'],
    answer:
      'Dust storms here are common, seasonal and occasionally planet-wide. They peak in southern spring and summer. A global event can raise optical depth above 5 and hold it for weeks — the 2018 one is what ended Opportunity. What a storm does to you is not wind damage. It is darkness, lost visibility and no solar power, for longer than your consumables last. Which is why the rule is to shelter or walk home on your own assessment, not on a forecast.',
    source: 'MRO MARCI daily global dust monitoring; 2018 planet-encircling event',
    lesson: 'dustIsTheHazard',
  },
  {
    id: 'devil',
    keys: ['dust devil', 'devil', 'whirlwind', 'vortex', 'tornado'],
    answer:
      'Dust devils are routine at Jezero — Perseverance sees them most sols in the afternoon, and they can be hundreds of metres tall. They are convective vortices, strongest when the ground is hottest. They are survivable, and they are also useful: they clean solar panels. Spirit and Opportunity both got years of extra life from being swept by one. Do not stand in one in a suit, but do not panic about one either.',
    source: 'Perseverance MEDA dust-devil survey; Spirit and Opportunity cleaning events',
  },
  {
    id: 'perchlorate',
    keys: ['perchlorate', 'toxic', 'poison', 'chemical', 'eat the soil', 'safe to touch'],
    answer:
      'Phoenix found perchlorate in the soil at the northern plains at roughly 0.4 to 0.6 percent by weight, and later missions found it widely. Perchlorate interferes with your thyroid and it is water-soluble, so it goes everywhere water goes. Practically: you never bring surface dust into a habitat on purpose, you never eat anything grown in untreated regolith, and the airlock dust-off procedure is not housekeeping, it is medicine.',
    source: 'Phoenix Wet Chemistry Laboratory, Hecht et al., Science 2009',
    lesson: 'dustIsTheHazard',
  },

  // ---- Radiation ---------------------------------------------------------
  {
    id: 'radiation',
    keys: ['radiation', 'dose', 'cosmic', 'gcr', 'sievert', 'cancer', 'shield', 'shielding'],
    answer:
      'Curiosity\'s RAD instrument measures about 0.2 to 0.3 millisieverts per day on the surface — something like 15 to 25 times what you get at sea level on Earth. There is no global magnetic field, and the atmosphere is only about 20 grams per square centimetre of column mass, so you are shielded by maybe a tenth of what Earth gives you. Time is the dose. Regolith is the answer: a couple of metres of it over your habitat does more than any suit ever will.',
    source: 'MSL RAD surface measurements, Hassler et al., Science 2014',
    lesson: 'radiationShelter',
  },
  {
    id: 'sep',
    keys: ['solar flare', 'flare', 'sep', 'solar particle', 'proton', 'solar storm', 'cme'],
    answer:
      'A solar particle event is the one radiation hazard that can hurt you inside a single EVA rather than across a career. RAD measured a surface event delivering about 8 milligray over a few days. The flash of light reaches you in minutes; the protons follow over tens of minutes to hours. Your suit stops almost none of it. The lander hull stops most of it. If the particle monitor climbs, the answer is always the same — get inside now and argue about the science later.',
    source: 'MSL RAD SEP observations; NASA Space Radiation Analysis Group practice',
    lesson: 'radiationShelter',
  },
  {
    id: 'magnetic',
    keys: ['magnetic', 'magnetosphere', 'compass', 'north', 'navigate', 'navigation', 'lost', 'gps'],
    answer:
      'Mars has no global dipole field. Mars Global Surveyor found only crustal remanent magnetism — frozen-in patches from a field that died more than four billion years ago. So a magnetic compass is useless, and there is no GPS constellation either. You navigate by sun angle, by dead reckoning off your own odometry, and by matching the skyline to orbital imagery. In a dust storm you lose the sun and the skyline at the same time, and that is how people get lost within sight of home.',
    source: 'Mars Global Surveyor magnetometer, Acuña et al. 1999',
    lesson: 'noCompass',
  },

  // ---- Water, food, making things ---------------------------------------
  {
    id: 'water',
    keys: ['water', 'ice', 'drink', 'find water', 'glacier', 'subsurface ice', 'aquifer'],
    answer:
      'There is a lot of water, and almost none of it is convenient. The poles hold kilometres of layered ice. The Phoenix lander dug into buried ice at 68 degrees north and watched it sublimate away in front of its camera. SHARAD and the Mars Odyssey neutron spectrometer map shallow ice across much of the mid-latitudes, sometimes under a metre of soil. And the regolith itself is a few percent water by weight almost everywhere — Curiosity baked it out of a scoop. The honest answer is that you mine it. You do not find a stream.',
    source: 'Phoenix 2008; Mars Odyssey neutron spectrometer; MRO SHARAD; MSL SAM',
  },
  {
    id: 'oxygen',
    keys: ['make oxygen', 'moxie', 'isru', 'produce oxygen', 'oxygen from', 'electrolysis'],
    answer:
      'This one is already solved in principle. MOXIE, a toaster-sized box on Perseverance, pulled carbon dioxide from the air and split it into oxygen and carbon monoxide by solid oxide electrolysis. It ran sixteen times, produced about 122 grams of oxygen in total, and hit roughly 12 grams an hour at its best — about what a small dog breathes. The point was never the quantity. It was proving you can make your air and your return propellant out of the atmosphere instead of carrying them.',
    source: 'MOXIE technology demonstration, Perseverance, 2021 to 2023',
  },
  {
    id: 'fuel',
    keys: ['fuel', 'propellant', 'methane fuel', 'sabatier', 'rocket fuel', 'get home', 'launch window', 'return trip', 'go home'],
    answer:
      'The standard plan is to make it there. The Sabatier reaction takes Martian carbon dioxide plus hydrogen and gives you methane and water; electrolyse the water and you have your oxidiser too. Then you wait, because you cannot leave whenever you like. Earth and Mars line up for an efficient transfer about every 26 months, and the crossing is six to nine months each way. A surface stay is not a visit. It is a year and a half, minimum.',
    source: 'NASA Design Reference Architecture 5.0; Hohmann transfer geometry',
  },
  {
    id: 'food',
    keys: ['food', 'grow', 'farm', 'plant', 'potato', 'greenhouse', 'agriculture', 'eat', 'lunch', 'hungry', 'calories'],
    answer:
      'You can grow things in Martian regolith simulant — people have, repeatedly — but not straight out of the ground. You have to wash the perchlorates out, add nitrogen and organics, and do all of it under pressure and light you paid for. Nitrogen is the quiet problem: the air is only 2.6 percent nitrogen at 610 pascals, so there is almost no accessible nitrogen for proteins. Expect most calories to arrive from Earth for a long time.',
    source: 'Wageningen University regolith-simulant crop trials; NASA Mars fact sheet',
  },

  // ---- Time, sky, place --------------------------------------------------
  {
    id: 'sol',
    keys: ['sol', 'day length', 'how long is a day', 'time', 'clock', 'year', 'calendar', 'season'],
    answer:
      'A sol is 24 hours 39 minutes and 35 seconds, so about 2.7 percent longer than an Earth day. That sounds trivial and it is not: crews working on Mars time drift out of phase with Earth by about 40 minutes a sol, which is why mission teams have historically burned out on it. A Mars year is 687 Earth days, so seasons last roughly twice as long — and southern spring and summer are when the dust gets dangerous.',
    source: 'NASA Mars fact sheet; MSL and MER operations experience',
  },
  /**
   * The most-asked question about Mars, and it used to be refused.
   *
   * 'why is mars red' matched no key here: the sky entry carried 'why red',
   * which the phrase people actually say does not contain. The redness also
   * deserves its own answer — it is a fact about the ground and the dust, not
   * about scattering in the sky.
   */
  {
    id: 'rust',
    keys: ['why is mars red', 'why is it red', 'mars red', 'red planet', 'why red', 'rust',
      'rusty', 'rusted', 'iron oxide', 'what colour is mars', 'what color is mars',
      'red dust', 'red soil', 'why is the ground red'],
    answer:
      'Mars is red because it is rusted. The surface is loaded with iron, and that iron has oxidised to nanophase ferric oxide — the same chemistry as rust on a gate, run over billions of years with whatever oxygen the atmosphere could spare. The coating is extremely thin, which is why abrading a rock turns it grey or green underneath within a millimetre. That is the whole reason you carry an abrasion tool: the red is a weathering rind, and the rock you actually came to read is under it.',
    source: 'Viking and Pathfinder soil chemistry; MER Mossbauer spectrometry; Perseverance abrasion patches',
    lesson: 'rind',
  },
  {
    id: 'sky',
    keys: ['sky', 'sky colour', 'sky color', 'sunset', 'blue sunset', 'colour of the sky', 'color of the sky'],
    answer:
      'Backwards from Earth, and for the same physics. Here the dust particles are a few microns across, which is large compared with visible wavelengths, so they forward-scatter blue light into a tight halo around the sun. The result is a butterscotch daytime sky and a genuinely blue sunset. The ground is red because of iron oxide — the planet is rusted. Spirit and Perseverance both photographed those blue sunsets, and they look wrong every time.',
    source: 'Spirit and Perseverance sunset imaging; Mie scattering by micron-scale dust',
  },
  {
    id: 'gravity',
    keys: ['gravity', 'weight', 'jump', 'heavy', 'mass', 'how much do i weigh', 'lifting'],
    answer:
      'Surface gravity is 3.72 metres per second squared, about 38 percent of Earth. So you weigh a third as much and have exactly the same inertia. That trips people up constantly: a 30 kilogram sample case is easy to hold and just as hard to stop once it is swinging. Apollo crews converged on a loping bound in one sixth g for the same reason. Lifting is easy here. Changing your mind about where something is going is not.',
    source: 'NASA Mars fact sheet; Apollo surface locomotion studies',
    lesson: 'gravityNotWeight',
  },
  {
    id: 'jezero',
    keys: ['jezero', 'where are we', 'crater', 'delta', 'this site', 'landing site'],
    answer:
      'Jezero crater, 45 kilometres across, at about 18.4 north and 77.5 east. Three and a half billion years ago a river ran into it and built a delta, and the crater held a lake. That is why it was chosen: a delta sorts and buries fine sediment, and fine sediment buried fast is the best preservation environment for biosignatures anyone has mapped from orbit. Perseverance landed here in February 2021 and has been working the delta front ever since.',
    source: 'Perseverance landing site selection; Mars 2020 science objectives',
  },
  {
    id: 'moons',
    keys: ['moon', 'moons', 'phobos', 'deimos'],
    answer:
      'Two, and both are small and odd. Phobos is about 22 kilometres across and orbits so close and so fast that it rises in the west and crosses the sky twice a sol — and it is spiralling inward, so in a few tens of millions of years it will break up or hit. Deimos is 12 kilometres and looks like a bright star. Neither gives you useful moonlight. They are probably captured asteroids, or debris from a giant impact; the argument is not settled.',
    source: 'Mars Express and Viking observations of Phobos and Deimos',
  },
  {
    id: 'geography',
    keys: ['olympus', 'volcano', 'valles marineris', 'canyon', 'mountain', 'tallest', 'biggest'],
    answer:
      'Mars has the extremes. Olympus Mons is about 22 kilometres high and roughly the size of Arizona — it got that big because there are no moving tectonic plates to carry the volcano off its hot spot. Valles Marineris runs over 4000 kilometres and is up to 7 kilometres deep, which would stretch across the entire United States. Low gravity and a dead crust let structures here grow to sizes Earth cannot hold up.',
    source: 'MOLA global topography, Mars Global Surveyor',
  },

  // ---- Life, science -----------------------------------------------------
  {
    id: 'life',
    keys: ['life', 'alien', 'biosignature', 'fossil', 'microbe', 'living', 'anybody there'],
    answer:
      'No life has been found, and that is a precise statement rather than a disappointment. What has been found is habitability: ancient standing water, clays and sulphates that need water to form, and organic molecules in mudstone. Viking ran biology experiments in 1976 and the results were ambiguous enough that people still argue about them. The current approach is more modest and more likely to work — core the best rocks, seal them, and bring them home to laboratories no rover could carry.',
    source: 'MSL Gale crater organics; Viking biology experiments; Mars Sample Return rationale',
  },
  {
    id: 'methane',
    keys: ['methane', 'seasonal methane', 'trace gas'],
    answer:
      'Curiosity has measured background methane around 0.4 parts per billion with spikes to several parts per billion, and a seasonal cycle. The Trace Gas Orbiter, which is far more sensitive, has struggled to see it from orbit at all. That disagreement is one of the live puzzles in Mars science. Methane could be geological or biological, and nobody has earned the right to claim either yet.',
    source: 'Curiosity SAM-TLS; ExoMars Trace Gas Orbiter non-detections',
  },
  {
    id: 'rind',
    keys: ['rind', 'weathering', 'abrade', 'why abrade', 'grind', 'outside of the rock', 'rock surface'],
    answer:
      'Every exposed rock face here is a liar. Billions of years of radiation, dust impact and thin-film chemistry build a weathering rind that tells you about the atmosphere, not the rock. That is why Perseverance grinds a 5 centimetre patch about 8 millimetres deep before it believes anything, and then blows the tailings away with puffs of nitrogen rather than a brush, because a brush would smear the surface it just cleaned. Abrade first. Always.',
    source: 'Perseverance abrading bit and gaseous Dust Removal Tool operations',
    lesson: 'rind',
  },
  {
    id: 'samplereturn',
    keys: ['sample return', 'tube', 'core', 'depot', 'three forks', 'bring back', 'sample'],
    answer:
      'Perseverance drills cores about 6 centimetres long and a little thicker than a pencil, seals them in individual titanium tubes, and keeps a record of exactly where each one came from. Ten of them were laid out as a backup depot at Three Forks in early 2023. The intent is that a later mission collects them and returns them to Earth — the first round trip of material from another planet. A sample without its context is a rock. A sample with its context is a measurement.',
    source: 'Mars 2020 sampling campaign; Three Forks sample depot, January 2023',
    lesson: 'contextFrame',
  },

  // ---- Operations --------------------------------------------------------
  {
    id: 'lightdelay',
    keys: ['delay', 'light time', 'latency', 'call earth', 'talk to earth', 'help from earth', 'mission control', 'earth'],
    answer:
      'One way, between about 3 and 22 minutes depending on where the planets are. So a question and its answer cost you double that. Nobody on Earth can help you with the next ten minutes, and pretending otherwise has killed people in other environments. The flight rule that follows is uncomfortable and correct: you are the decision authority on the surface, and Earth is an advisor you consult, not a supervisor you wait for.',
    source: 'Light-time geometry from JPL approximate planetary positions',
    lesson: 'noOneToAsk',
  },
  {
    id: 'dsn',
    keys: ['dsn', 'deep space network', 'antenna', 'relay', 'downlink', 'uplink', 'bandwidth', 'data rate'],
    answer:
      'Almost nothing goes direct to Earth. Surface assets talk UHF to an orbiter overhead at up to about 2 megabits per second during a pass a few minutes long, and the orbiter forwards it on X-band to the Deep Space Network — Goldstone, Madrid and Canberra, spaced about 120 degrees apart so one of them always has Mars in the sky. Direct-to-Earth from the surface is more like 20 kilobits per second. The relay is not a convenience. It is the entire reason the data volume works.',
    source: 'Mars Relay Network and DSN link specifications',
  },
  {
    id: 'edl',
    keys: ['landing', 'edl', 'seven minutes', 'parachute', 'descent', 'how do you land'],
    answer:
      'Entry, descent and landing is the hardest seven minutes in robotic spaceflight, and the reason is this atmosphere. It is thick enough to cook you on entry and far too thin to land you. So you need all of it — a heat shield, a supersonic parachute, and then rockets or a skycrane for the last stretch. And light time means it is over before Earth knows it started. Roughly half of all Mars landing attempts in history have failed.',
    source: 'Mars 2020 and MSL EDL design; historical Mars mission record',
  },
  {
    id: 'ingenuity',
    keys: ['ingenuity', 'helicopter', 'fly', 'drone', 'aircraft'],
    answer:
      'Ingenuity was supposed to make five flights and made 72, over about three years, before rotor damage ended it in January 2024. Flying in one percent of Earth\'s air density needed counter-rotating blades about 1.2 metres across, spinning near 2500 rpm, to lift 1.8 kilograms. It proved powered flight works on another planet, which nobody could be certain of beforehand.',
    source: 'Ingenuity Mars Helicopter flight campaign, 2021 to 2024',
  },
  {
    id: 'rovers',
    keys: ['rover', 'perseverance', 'curiosity', 'opportunity', 'spirit', 'sojourner', 'zhurong', 'how fast do rovers', 'how fast are you'],
    answer:
      'Slower than you would believe. Perseverance tops out near 0.042 metres per second — about 152 metres an hour — and a good sol is a few hundred metres. Opportunity drove 45 kilometres over 14 years. I move at your walking pace because a companion that cannot keep up is not a companion, and that is the one honest fiction in my design. Everything else about me, including this suspension, is how the real ones work.',
    source: 'Mars 2020 and MER mobility specifications',
  },
  {
    id: 'rockerbogie',
    keys: ['suspension', 'rocker', 'bogie', 'wheels', 'how do you drive', 'six wheels'],
    answer:
      'Rocker-bogie, and it has no springs at all. Each side has two passive pivots arranged so that when one wheel climbs an obstacle the chassis only rises about half as far, and the other five wheels stay loaded. It lets a rover climb something the size of its own wheel without tipping, and keeps the body within about 30 degrees of level. NASA has used it on every Mars rover since Sojourner in 1997, because the simplest thing that works is what you send somewhere you cannot repair it.',
    source: 'JPL rocker-bogie mobility design, Sojourner through Perseverance',
  },
  {
    id: 'suit',
    keys: ['suit', 'spacesuit', 'eva suit', 'what am i wearing', 'how long can i stay out'],
    answer:
      'A Mars surface suit has to do everything an EVA suit does, plus survive dust, plus be re-donned hundreds of times — and that last part nobody has solved yet. Current ISS suits carry roughly 7 to 8 hours of consumables. Your limit is never one number: oxygen, carbon dioxide scrubbing, battery and water all deplete at different rates, and whichever runs out first owns your schedule. Watch the limiting item on your display, not the biggest bar.',
    source: 'NASA EMU and exploration EVA suit requirements',
    lesson: 'massIsLife',
  },
  {
    id: 'shelter',
    keys: ['shelter', 'cave', 'lava tube', 'habitat', 'where do i hide', 'hide'],
    answer:
      'The best shelter here is mass over your head, and the cheapest mass is the ground itself. A couple of metres of regolith cuts the cosmic ray dose substantially and flattens the temperature swing. Lava tubes are the free version, and Mars has enormous ones — low gravity lets them span far wider than on Earth. For the next hour, though, shelter means the nearest thing that breaks the wind, and the one thing that actually repressurises. Only one of those is the lander.',
    source: 'Regolith shielding analyses; THEMIS and HiRISE lava-tube skylight surveys',
    lesson: 'shelterNotDie',
  },
  {
    id: 'margin',
    keys: ['margin', 'reserve', 'turn back', 'how far can i go', 'walk back', 'when should i leave', 'walkback'],
    answer:
      'The rule that keeps people alive is the walk-back rule: never go further out than you can get back from on what you have left, with a reserve on top that you do not spend. The reserve is not a resource. It is the thing that turns a surprise into an inconvenience instead of a fatality. If your margin is falling toward your walk-home time, you are already past the decision point and you should be moving.',
    source: 'NASA EVA flight rules; Apollo surface walkback constraints',
    lesson: 'massIsLife',
  },
  {
    id: 'flag',
    keys: ['flag', 'claim', 'treaty', 'own mars', 'sovereignty', 'who owns'],
    answer:
      'Nobody owns it, and that is law rather than sentiment. Article Two of the 1967 Outer Space Treaty rules out national appropriation of celestial bodies by any means, and every spacefaring nation is a party to it. So planting a flag is commemoration. It marks that people came. It claims nothing, and anybody who tells you otherwise is selling something.',
    source: 'Outer Space Treaty, 1967, Article II',
    lesson: 'flagTreaty',
  },
  {
    id: 'terraform',
    keys: ['terraform', 'terraforming', 'make it like earth', 'atmosphere thicker'],
    answer:
      'Not with anything close to current capability. A 2018 analysis looked at every accessible carbon dioxide reservoir on Mars — polar caps, gas adsorbed in soil, carbon locked in minerals — and concluded that releasing all of it gets you to roughly 7 percent of Earth sea-level pressure. That is not breathable, and not enough for liquid water to be stable over most of the surface. And with no global magnetic field the solar wind keeps stripping it. Pressurised habitats are the realistic plan.',
    source: 'Jakosky and Edwards, Nature Astronomy 2018',
  },
  {
    id: 'whygo',
    keys: ['why go', 'why mars', 'point of this', 'worth it', 'why bother'],
    answer:
      'Because it is the only other place in reach where a planet ran the same experiment as Earth and then stopped. Mars had water, an atmosphere and a magnetic field, and lost all three. Finding out whether life started there before that happened answers whether life is common or whether we are the strange case. And everything you have to invent to live here — closed-loop air, water from nothing, power under a dust storm — is the same engineering a crowded Earth needs anyway.',
    source: 'NASA Moon to Mars objectives; Mars Exploration Program science goals',
  },
]

/**
 * Things MERV says that are not answers. Personality, kept in one place so it
 * is obvious what is flavour and what is fact, and so the flavour never
 * invents a number.
 */
export const QUIPS = {
  greeting: [
    'MERV online. Six wheels, one mast, and no opinions I cannot source. Ask me anything about where we are.',
    'MERV up and tracking you. I will hold station about three metres off your left shoulder and speak up if the sky changes.',
    'Awake, charged, and pointed at you. If I start talking about power, it is because the array is losing its argument with the dust.',
  ],
  unknown: [
    'I do not have a sourced answer for that, and I would rather say so than invent one. Try me on the air, the dust, radiation, water, power, time, navigation, or getting home.',
    'That is outside what I can back up, and I am not going to guess at you. Ask about pressure, cold, storms, the light-time delay, or what the rocks are doing.',
  ],
  acknowledged: ['Copy.', 'Understood.', 'On it.', 'Logged.'],
  idle: [
    'Nothing changing out here. Array holding, mast on survey.',
    'Still watching. The horizon has not done anything interesting since you last asked.',
  ],
}

/** Deterministic pick, so one situation does not produce a different line each render. */
export function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.round(seed)) % arr.length]
}

/**
 * Score a question against a topic.
 *
 * Deliberately simple: longer key phrases are worth more than single words, so
 * "how long is a day" beats a stray match on "day". There is no stemming and
 * no embedding model, because a confidently wrong answer about radiation is far
 * worse than an honest "I do not know".
 */
export function scoreTopic(q: string, t: Topic): number {
  const text = ` ${q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  let score = 0
  for (const k of t.keys) {
    const key = ` ${k.toLowerCase()} `
    if (text.includes(key)) {
      // Weight by how much of the question the key accounts for.
      score += 1 + k.split(' ').length * 1.6
    } else if (!k.includes(' ') && text.includes(` ${k.toLowerCase()}`)) {
      // Prefix match catches plurals and simple inflections.
      score += 0.55
    }
  }
  return score
}

/** Best matching topic, or null when nothing clears the bar. */
export function findTopic(question: string): Topic | null {
  let best: Topic | null = null
  let bestScore = 0
  for (const t of TOPICS) {
    const s = scoreTopic(question, t)
    if (s > bestScore) { bestScore = s; best = t }
  }
  return bestScore >= 1.5 ? best : null
}
