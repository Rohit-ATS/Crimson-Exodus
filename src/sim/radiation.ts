/**
 * radiation.ts — The surface radiation environment during the EVA.
 *
 * Two components, both measured on the surface of Mars by Curiosity's
 * Radiation Assessment Detector (RAD) at Gale Crater:
 *
 *  1. GALACTIC COSMIC RAYS (GCR) — a steady, highly penetrating background.
 *     RAD measured 0.210 ± 0.040 mGy/day absorbed dose and 0.64 ± 0.12 mSv/day
 *     dose equivalent (Hassler et al. 2014, Science 343, 1244797,
 *     doi:10.1126/science.1244797). A suit stops essentially none of it and a
 *     lander cabin only a little, so for a single EVA it is a bookkeeping item,
 *     not a hazard — but it is the number that sets career limits for a crew.
 *
 *  2. SOLAR ENERGETIC PARTICLE (SEP) EVENT — a burst of protons accelerated by a
 *     solar flare or coronal mass ejection. The flare's light arrives first; the
 *     protons follow minutes to hours later. On 20 May 2024 RAD recorded the
 *     largest SEP surface dose of the mission, about 8.1 mGy (NASA, 2024). Unlike
 *     GCR, SEP protons are relatively soft: a few tens of g/cm² of shielding (a
 *     lander cabin, a habitat wall) removes most of them. That is what makes the
 *     right call during an SEP event "get inside", and why the warning time
 *     between the flare and the protons matters so much.
 *
 * MODEL STATUS
 *  - GCR rate: NASA observation (RAD, Gale Crater), applied at Jezero. Jezero's
 *    floor is ~2 km higher than Gale's, so the real column above it is a little
 *    thinner and the real rate a little higher; the app does not correct for it.
 *  - SEP event: timing and probability are a GAME schedule. The event total is
 *    scaled to the May 2024 RAD measurement, but the hours-long real profile is
 *    compressed into EVA minutes so the decision is playable.
 *  - Shielding factors: GAME MECHANIC, physically reasoned (SEP protons are
 *    shielded far more easily than GCR), not computed from a transport code.
 */

/** RAD (Gale) surface GCR absorbed dose rate, µGy per hour. 0.210 mGy/day. */
export const GCR_UGY_PER_H = (0.210 * 1000) / 24
/** RAD (Gale) surface GCR dose equivalent rate, µSv per hour. 0.64 mSv/day. */
export const GCR_USV_PER_H = (0.64 * 1000) / 24
/** Mean quality factor implied by the two RAD numbers above (~3.05). */
const GCR_Q = GCR_USV_PER_H / GCR_UGY_PER_H
/**
 * Quality factor applied to SEP protons. ASSUMPTION: SEP spectra are dominated
 * by low-LET protons, so the dose equivalent sits close to the absorbed dose.
 */
const SEP_Q = 1.2
/** May 2024 RAD surface SEP total, mGy. Used to scale the in-game event. */
export const SEP_REFERENCE_TOTAL_MGY = 8.1
/** NASA-STD-3001 career effective-dose limit, mSv, for context in the UI. */
export const NASA_CAREER_LIMIT_MSV = 600

export type SepPhase = 'alert' | 'rising' | 'peak' | 'decay'

export interface ScheduledSep {
  /** EVA minute at which the flare is seen (the alert begins). */
  flareMin: number
  /** Minutes between the flare and the first protons. */
  leadMin: number
  riseMin: number
  peakMin: number
  decayMin: number
  /** Fraction of the May 2024 event total this event delivers, unshielded. */
  scale: number
}

export interface RadiationState {
  /** Total unshielded absorbed dose rate at Jack's position, µGy/h. */
  doseRateUGyH: number
  /** Dose equivalent rate actually received after shielding, µSv/h. */
  doseRateUSvH: number
  /** Share of the current rate that is SEP, 0-1. */
  sepShare: number
  /** Null when no SEP event is under way. */
  sepPhase: SepPhase | null
  /** Minutes until protons arrive (alert phase) or until the next phase. */
  minutesToNextPhase: number
  /** Shielding factor applied to SEP, 1 = unshielded. */
  shieldSep: number
  headline: string
  detail: string
  /** True while mission rules say head for the lander now. */
  advisesReturn: boolean
}

/** Mulberry32, a separate stream from the weather so the two don't correlate. */
function rng(seed: number) {
  let a = (seed ^ 0x5eed5eed) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Decide whether this EVA sees an SEP event, and when.
 *
 * @param seed          mission seed
 * @param evaLengthMin  planned EVA length
 * @param force         guarantee one event (the guided demo)
 */
export function scheduleSep(seed: number, evaLengthMin: number, force = false): ScheduledSep | null {
  const rand = rng(seed)
  // Big SEP events are rare on any given sol. This is tuned for play, not
  // climatology, and the Data panel says so.
  if (!force && rand() > 0.22) return null
  return {
    flareMin: force ? evaLengthMin * (0.3 + 0.05 * rand()) : evaLengthMin * (0.2 + 0.45 * rand()),
    leadMin: 18 + 14 * rand(),
    riseMin: 10 + 6 * rand(),
    peakMin: 30 + 20 * rand(),
    decayMin: 40 + 30 * rand(),
    scale: force ? 1 : 0.35 + 0.65 * rand(),
  }
}

/** Unshielded SEP absorbed dose rate at the event's peak, µGy/h. */
function sepPeakUGyH(e: ScheduledSep): number {
  // Trapezoid area in hours: half the rise, the plateau, half the decay.
  const hours = (e.riseMin / 2 + e.peakMin + e.decayMin / 2) / 60
  return (SEP_REFERENCE_TOTAL_MGY * 1000 * e.scale) / hours
}

/**
 * The radiation environment at one instant.
 *
 * @param e            scheduled SEP event, or null
 * @param evaMin       EVA elapsed minutes
 * @param atLander     inside the lander's shielding
 * @param sheltering   crouched in the lee of terrain, which blocks part of the sky
 */
export function radiationAt(
  e: ScheduledSep | null,
  evaMin: number,
  atLander: boolean,
  sheltering: boolean,
): RadiationState {
  // GAME MECHANIC shielding. Cabin walls barely touch GCR but stop most SEP
  // protons; a rock face or scarp blocks a slice of the sky for both.
  const shieldGcr = atLander ? 0.85 : sheltering ? 0.8 : 1
  const shieldSep = atLander ? 0.12 : sheltering ? 0.7 : 1

  let sepUGyH = 0
  let phase: SepPhase | null = null
  let toNext = 0
  if (e) {
    const t = evaMin - e.flareMin
    const tRise = e.leadMin
    const tPeak = tRise + e.riseMin
    const tDecay = tPeak + e.peakMin
    const tEnd = tDecay + e.decayMin
    const peak = sepPeakUGyH(e)
    if (t >= 0 && t < tRise) { phase = 'alert'; toNext = tRise - t }
    else if (t >= tRise && t < tPeak) { phase = 'rising'; toNext = tPeak - t; sepUGyH = peak * ((t - tRise) / e.riseMin) }
    else if (t >= tPeak && t < tDecay) { phase = 'peak'; toNext = tDecay - t; sepUGyH = peak }
    else if (t >= tDecay && t < tEnd) { phase = 'decay'; toNext = tEnd - t; sepUGyH = peak * (1 - (t - tDecay) / e.decayMin) }
  }

  const doseRateUGyH = GCR_UGY_PER_H + sepUGyH
  const doseRateUSvH = GCR_UGY_PER_H * GCR_Q * shieldGcr + sepUGyH * SEP_Q * shieldSep
  const sepShare = doseRateUGyH > 0 ? sepUGyH / doseRateUGyH : 0

  let headline = 'GCR BACKGROUND'
  let detail = 'Galactic cosmic ray background, as measured on the surface by Curiosity RAD. No solar particle event in progress.'
  let advisesReturn = false
  if (phase === 'alert') {
    headline = 'SOLAR FLARE — PROTONS INBOUND'
    detail = `X-ray flare detected by the lander's particle monitor. Energetic protons expected in ~${toNext.toFixed(0)} min. The suit will not stop them; the lander cabin stops most of them. Head for the lander now.`
    advisesReturn = true
  } else if (phase === 'rising' || phase === 'peak') {
    headline = phase === 'peak' ? 'SOLAR PARTICLE EVENT — PEAK' : 'SOLAR PARTICLE EVENT — RISING'
    detail = `Proton flux ${phase === 'peak' ? 'at peak' : 'climbing'}. Dose rate is ${(doseRateUGyH / GCR_UGY_PER_H).toFixed(0)}× the cosmic-ray background. Every minute outside the lander costs dose that shielding would have removed.`
    advisesReturn = true
  } else if (phase === 'decay') {
    headline = 'SOLAR PARTICLE EVENT — DECAYING'
    detail = 'Proton flux falling back toward background. Resume only when the rate is back near GCR levels.'
    advisesReturn = sepShare > 0.5
  }

  return { doseRateUGyH, doseRateUSvH, sepShare, sepPhase: phase, minutesToNextPhase: toNext, shieldSep, headline, detail, advisesReturn }
}

export const RADIATION_CLEAR: RadiationState = radiationAt(null, 0, false, false)
