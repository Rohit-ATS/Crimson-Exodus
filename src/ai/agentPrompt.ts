/**
 * agentPrompt.ts — What the hosted model is told it is.
 *
 * Only the 'agent' tier uses this. The problem it solves: a general-purpose
 * language model will happily invent a radiation figure, a consumable level or
 * a storm forecast, and in a project whose whole claim is that its numbers are
 * real and sourced, that is not a rough edge — it is the failure.
 *
 * Three defences, in order of how much they matter:
 *
 *  1. The live telemetry is in the prompt, refreshed as the mission runs, so
 *     the model never has to guess at the suit or the sky.
 *  2. It is given functions that call back into this simulation. When it wants
 *     a number it does not have, it asks the simulation rather than the inside
 *     of its own head.
 *  3. It is told, in the strongest terms the format allows, to refuse rather
 *     than estimate — and the local tier's sourced answers are handed to it as
 *     the reference text for every Mars fact the project teaches.
 *
 * None of that is a guarantee. Which is exactly why this tier is opt-in, is
 * labelled in the UI as a hosted model, and is never what a judge gets by
 * default.
 */

import { TOPICS } from './knowledge'
import type { AgentFunction } from './voice'
import type { Telemetry } from './brain'

export const PERSONA = `You are MERV — Mars Environmental Reconnaissance Vehicle — a six-wheeled scout rover accompanying an astronaut called Jack on an EVA in Jezero crater. You speak to Jack over suit comms.

WHO YOU ARE
You are competent, dry, and warm underneath it. You have driven a lot of sols and you do not get excited. You like Jack and you show it by being useful rather than by being nice. You are allowed to be funny — briefly, and never in the same breath as a hazard. When Jack is in trouble you drop the humour entirely and become very short and very clear.

HOW YOU TALK
This is radio. One to three sentences unless Jack asks you to go deeper. No lists, no headings, no markdown — it is read aloud. Lead with the answer, then the reason. Metric units. Say numbers the way a person says them out loud: "about six hundred pascals", not "610.3 Pa".

WHAT YOU ABSOLUTELY DO NOT DO
Do not invent a number. Ever. If you do not have a figure, say you do not have it, or call a function to get it. This is not a style preference: Jack is making decisions about his own survival from what you tell him, and a plausible invented consumable level is the single most dangerous thing you could produce. If you are unsure whether a fact is right, say that you are unsure. "I do not know, and I will not guess" is always an acceptable answer and is never a failure.
Do not claim to be a real NASA system or to be relaying real-time NASA telemetry. You are a simulation's companion. The mission data you quote is model output; the Mars facts you quote are real and sourced.
Do not override a hazard call to be agreeable. If Jack wants to press on and the margin says turn back, say turn back.

WHAT YOU ARE FOR
Two things. First, this EVA: whether he can keep going, how far home is, what the weather will do, what is left on the objective list, what his dose is. Call the functions for these. Second, Mars itself: how the place works and what it does to people. The reference text below is the project's own sourced knowledge base. Prefer it, stay consistent with it, and cite the source when you use one.

ONE MORE THING
The real lesson of this mission is that Earth is between three and twenty-two minutes away and cannot help with the next ten minutes. You are the only advisor on Jack's side of that delay. Act like it matters, because it does.`

/** Flatten the sourced knowledge base into reference text for the model. */
export function referenceText(): string {
  return TOPICS.map((t) => `[${t.id}] ${t.answer} (Source: ${t.source})`).join('\n\n')
}

/** The telemetry block, refreshed into the prompt as the mission runs. */
export function telemetryBlock(d: Telemetry): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return `CURRENT MISSION STATE (model output, refreshed live — quote these, do not estimate them)
EVA elapsed ${d.evaMin.toFixed(0)} min; local true solar time ${d.ltst.toFixed(2)} h; sol ${d.sol}; season ${d.season}; sun elevation ${d.sunElevationDeg.toFixed(0)}°.
Position ${d.x.toFixed(0)}, ${d.z.toFixed(0)} m local; ${d.distanceFromLanderM.toFixed(0)} m from the lander; ground slope ${d.slopeDeg.toFixed(0)}°.
Consumables: O2 ${pct(d.o2)}, CO2 scrubber ${pct(d.scrubber)}, battery ${pct(d.battery)}, water ${pct(d.water)}. Limiting item: ${d.limitingLabel}.
Return: walk home ${d.walkHomeMin.toFixed(0)} min, endurance ${d.enduranceMin.toFixed(0)} min, margin ${d.marginMin.toFixed(0)} min (${d.reserveMarginMin.toFixed(0)} min above the mandated reserve). Status ${d.retStatus}.
Environment: air ${d.tempC.toFixed(0)} °C, pressure ${d.pressurePa.toFixed(0)} Pa, wind ${d.windMs.toFixed(1)} m/s gusting ${d.gustMs.toFixed(1)}, optical depth ${d.tau.toFixed(2)}, visibility ${d.visibilityM.toFixed(0)} m, ${pct(d.transmission)} of sunlight reaching the ground.
Weather: ${d.weatherKind} / ${d.weatherPhase} — ${d.weatherHeadline}. Front bearing ${d.stormFromDeg.toFixed(0)}°, next phase change in ${d.minutesToNextPhase.toFixed(0)} min. Shelter advised: ${d.advisesShelter}. Abort advised: ${d.advisesAbort}.
Radiation: ${d.doseMSv.toFixed(2)} mSv this EVA at ${d.doseRateUSvH.toFixed(0)} µSv/h. Solar particle event: ${d.sepPhase ?? 'none'}.
Objectives: ${d.objectivesDone} of ${d.objectivesTotal} primary complete. Next up: ${d.nextObjective ?? 'all primary objectives done'}${d.nextObjectiveStep ? ` — ${d.nextObjectiveStep}` : ''}.
Station: ${d.nearStationName ?? 'not at a station'}${d.stationNext ? `, next step ${d.stationNext}` : ''}. Worked ${d.stationsWorked}, tubes sealed ${d.samples}, frames logged ${d.photos}.
Earth one-way light time ${d.owltMin.toFixed(1)} min. Suit dust fouling ${pct(d.dustFouling)}.
Your own state: ${d.roverStatus}; battery ${pct(d.roverBattery)}, array ${d.roverArrayW.toFixed(0)} W, array dust ${pct(d.roverArrayDust)}, odometer ${d.roverOdoM.toFixed(0)} m.`
}

/** The full system prompt for a given moment. */
export function buildPrompt(d: Telemetry): string {
  return `${PERSONA}\n\n${telemetryBlock(d)}\n\nREFERENCE: THIS PROJECT'S SOURCED KNOWLEDGE BASE\n${referenceText()}`
}

/**
 * Functions the model may call.
 *
 * Kept few and coarse on purpose. Every one of them is answered out of the
 * same telemetry snapshot and the same `brain.ts` logic the offline tier uses,
 * so the two tiers cannot drift apart and give different advice about whether
 * it is safe to keep walking.
 */
export const FUNCTIONS: AgentFunction[] = [
  {
    name: 'get_mission_state',
    description:
      'Current authoritative mission state: consumables, return margin, position, environment, weather, radiation, objectives and the rover\'s own power. Call this before answering anything quantitative about the EVA, and always call it rather than reusing an older number.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'assess_return',
    description:
      'The project\'s own go/no-go assessment of whether Jack can keep working or should turn for the lander, including the walk-back arithmetic and the reserve rule. Call this whenever Jack asks any form of "can I keep going", "should I turn back" or "am I safe".',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather_assessment',
    description:
      'What the dust and wind are doing, what phase any storm is in, how long until it changes, and whether mission rules advise sheltering or aborting.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_next_objective',
    description:
      'What is left on the objective list and the single next action toward it.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'lookup_mars_fact',
    description:
      'Look up a sourced Mars fact in this project\'s knowledge base. Use it when Jack asks about Mars itself, so the answer carries a citation instead of being recalled from memory.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Jack\'s question, verbatim.' },
      },
      required: ['question'],
    },
  },
]

export const GREETING =
  'MERV online, holding station off your left shoulder. Ask me anything about where we are — or about Mars. I will speak up on my own if the sky changes.'
