/**
 * comms.ts — The Earth link, with the real delay.
 *
 * This is the module that teaches the hardest thing about Mars operations:
 * nobody on Earth can help you with the decision you are making right now.
 *
 * The one-way light time comes from `orbits.ts` and is computed from real
 * planetary positions for the real current instant. At Mars it ranges from
 * roughly 3 minutes near opposition to about 22 minutes near conjunction.
 * Every message Jack sends arrives that late; every answer arrives that late
 * again. By the time Earth tells you what to do about a dust front, the front
 * has been on top of you for twice the light time.
 *
 * SOURCE for the geometry: JPL approximate planetary positions.
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * What is NOT modelled: Deep Space Network antenna scheduling, data rates,
 * relay orbiter passes, coding and framing overhead, or the solar conjunction
 * command moratorium beyond a simple flag. This is a light-time model, not a
 * telecommunications link budget.
 */

export type MsgDir = 'downlink' | 'uplink'
export type MsgKind = 'status' | 'science' | 'decision' | 'emergency' | 'flag' | 'advisory' | 'ack'

export interface CommsMessage {
  id: string
  dir: MsgDir
  kind: MsgKind
  /** Title shown in the feed. */
  subject: string
  body: string
  /** EVA elapsed seconds at which it was transmitted from its origin. */
  sentEvaSec: number
  /** EVA elapsed seconds at which it reaches the far end. */
  arriveEvaSec: number
  /** One-way light time applied to this message, seconds. */
  owltSec: number
  /** Whether the recipient has it yet. */
  delivered: boolean
  /** For downlinks that will get a reply: the queued reply. */
  replyId?: string
}

export interface OutgoingTemplate {
  id: string
  kind: MsgKind
  subject: string
  body: string
  /** How long Earth takes to compose a reply after receiving it, seconds. */
  earthThinkSec: number
  reply: { subject: string; body: (ctx: ReplyContext) => string }
  /** Only offer this template when the predicate passes. */
  available?: (ctx: ReplyContext) => boolean
}

export interface ReplyContext {
  owltSec: number
  stationsWorked: number
  samplesHeld: number
  marginMinutes: number
  limiting: string
  weatherHeadline: string
  dustTau: number
  routeName: string
  distanceFromLanderM: number
  scienceScore: number
}

const mmss = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export const OUTGOING: OutgoingTemplate[] = [
  {
    id: 'status',
    kind: 'status',
    subject: 'EVA status report',
    body: 'Position, consumables and route progress downlinked.',
    earthThinkSec: 70,
    reply: {
      subject: 'RE: EVA status report',
      body: (c) =>
        `Copy your status. Note for the record: this packet left Mars ${mmss(c.owltSec)} ago and our reply will reach you ${mmss(c.owltSec)} from now, so you have been on your own for ${mmss(c.owltSec * 2)} of decision time. We see ${c.stationsWorked} station(s) worked, ${c.samplesHeld} tube(s) sealed, ${c.marginMinutes.toFixed(0)} min margin with ${c.limiting} limiting, on ${c.routeName}. Flight director concurs with continuing while that margin holds. We are not going to second-guess a call you make in the next half hour — we physically cannot. Backroom standing by.`,
    },
  },
  {
    id: 'science',
    kind: 'science',
    subject: 'Science observation downlink',
    body: 'Observation record and station imagery queued for downlink.',
    earthThinkSec: 180,
    reply: {
      subject: 'RE: Science observation downlink',
      body: (c) =>
        `Science backroom has your observations. Running score on our side is ${c.scienceScore}. The team is already arguing about the bedding geometry, which is the correct response to a good dataset. Two requests when you can: a wider context frame at each station so we can tie your observations into the orbital mapping, and the grain-size call on the finest bed you reach. Remember we are ${mmss(c.owltSec)} behind you — do not wait on us to confirm a target.`,
    },
  },
  {
    id: 'decision',
    kind: 'decision',
    subject: 'Request guidance: continue or turn back',
    body: 'Requesting flight director call on pressing to the next station.',
    earthThinkSec: 240,
    reply: {
      subject: 'RE: Request guidance',
      body: (c) =>
        `We have to say this plainly: by the time you read this the situation you described is ${mmss(c.owltSec * 2 + 240)} old. We are not in a position to make this call and you are. Our input, based on what we saw: margin ${c.marginMinutes.toFixed(0)} min, ${c.limiting} limiting, τ ≈ ${c.dustTau.toFixed(2)}, ${c.distanceFromLanderM.toFixed(0)} m from the lander, weather ${c.weatherHeadline}. If the margin has fallen below your walk-home time since you sent this, turn around without waiting for us again. That is a standing authorisation.`,
    },
  },
  {
    id: 'emergency',
    kind: 'emergency',
    subject: 'DECLARING ABORT — returning to lander',
    body: 'Declaring EVA abort. Proceeding to lander on the return leg.',
    earthThinkSec: 45,
    reply: {
      subject: 'RE: DECLARING ABORT',
      body: (c) =>
        `Abort copied. You made the call ${mmss(c.owltSec * 2 + 45)} before we could acknowledge it, which is exactly the way this has to work. Lander systems nominal on our last telemetry. Get inside, repress, and we will debrief on the next pass. Science already downlinked is safe — nothing you leave behind today is worth the suit.`,
    },
  },
  {
    id: 'flag',
    kind: 'flag',
    subject: 'Commemorative flag emplacement',
    body: 'Reporting flag emplacement at the station site.',
    earthThinkSec: 120,
    reply: {
      subject: 'RE: Commemorative flag emplacement',
      body: () =>
        `Copied and logged, and the image is already on its way to the public affairs feed. For the record as always: Article II of the Outer Space Treaty, which every spacefaring nation is party to, means that planting a flag on Mars is commemoration and nothing else. It establishes no claim of sovereignty, no appropriation, and no territory. It marks that people went there. Good moment. Now get back to the stratigraphy.`,
    },
  },
]

/** Earth-originated advisories, triggered by what Earth can infer from telemetry. */
export interface AdvisoryTrigger {
  id: string
  subject: string
  body: (c: ReplyContext) => string
}

export const ADVISORIES: Record<string, AdvisoryTrigger> = {
  stormSeen: {
    id: 'stormSeen',
    subject: 'ADVISORY: regional dust activity in your telemetry',
    body: (c) =>
      `Orbital assets and your own MEDA-class downlink show opacity rising over Jezero. We are flagging it, but understand the timing: what we are reacting to is ${mmss(c.owltSec)} old and this message takes another ${mmss(c.owltSec)} to reach you. If the front is already on you, this advisory is history. Standing guidance: shelter or abort on your local assessment, do not wait for Earth concurrence.`,
  },
  marginLow: {
    id: 'marginLow',
    subject: 'ADVISORY: consumables trending',
    body: (c) =>
      `Our last good consumables frame showed ${c.limiting} as your limiting item with ${c.marginMinutes.toFixed(0)} min of margin over the walk home. Flight rule reminder: the reserve is not a resource, it is the thing that makes the reserve a reserve. If you are reading this and the margin is lower than it was, you are already past the decision point.`,
  },
  solarFlare: {
    id: 'solarFlare',
    subject: 'ADVISORY: solar flare, energetic particles expected',
    body: (c) =>
      `Our solar observatories saw an eruptive flare on the Mars-facing side. Energetic protons follow the flash by tens of minutes to hours. This warning took ${mmss(c.owltSec)} to reach you, so your lander's particle monitor almost certainly told you first, and that is the warning to act on. Guidance: abort to the lander and stay inside until the rate is back to background. The suit stops almost none of it; the cabin stops most of it.`,
  },
  conjunction: {
    id: 'conjunction',
    subject: 'ADVISORY: solar conjunction geometry',
    body: () =>
      `Sun-Earth-Mars angle is inside the commanding moratorium. Link quality is degraded and real missions suspend uplink entirely through this window. Treat yourself as fully autonomous for the duration of this EVA.`,
  },
}

/** Build a transmitted message pair. */
export function transmit(
  template: OutgoingTemplate,
  nowEvaSec: number,
  owltSec: number,
  ctx: ReplyContext,
): { down: CommsMessage; up: CommsMessage } {
  const id = `${template.id}-${Math.round(nowEvaSec)}`
  const replyId = `${id}-reply`
  const down: CommsMessage = {
    id,
    dir: 'downlink',
    kind: template.kind,
    subject: template.subject,
    body: template.body,
    sentEvaSec: nowEvaSec,
    arriveEvaSec: nowEvaSec + owltSec,
    owltSec,
    delivered: false,
    replyId,
  }
  const up: CommsMessage = {
    id: replyId,
    dir: 'uplink',
    kind: 'ack',
    subject: template.reply.subject,
    body: template.reply.body(ctx),
    sentEvaSec: nowEvaSec + owltSec + template.earthThinkSec,
    arriveEvaSec: nowEvaSec + 2 * owltSec + template.earthThinkSec,
    owltSec,
    delivered: false,
  }
  return { down, up }
}

export function advisory(
  trigger: AdvisoryTrigger,
  /** EVA seconds at which the condition became visible in Mars telemetry. */
  observedEvaSec: number,
  owltSec: number,
  ctx: ReplyContext,
  earthThinkSec = 150,
): CommsMessage {
  return {
    id: `${trigger.id}-${Math.round(observedEvaSec)}`,
    dir: 'uplink',
    kind: 'advisory',
    subject: trigger.subject,
    body: trigger.body(ctx),
    sentEvaSec: observedEvaSec + owltSec + earthThinkSec,
    arriveEvaSec: observedEvaSec + 2 * owltSec + earthThinkSec,
    owltSec,
    delivered: false,
  }
}

/** Human-readable light-time string. */
export function formatDelay(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}
