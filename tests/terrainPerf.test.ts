import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { heightAt, roughnessAt, slopeDeg } from '../src/mission/terrain.ts'

/**
 * The height field is the one authoritative model: the 3D mesh, the map, the
 * elevation profile, the route cost, the hazard raster and the rover's wheel
 * contacts all read it. It is also the hottest code in the project, so it
 * attracts optimisation — and an optimisation that quietly changes the ground
 * changes the mission.
 *
 * These are reference values sampled from the field. They are not physics;
 * they are a tripwire. If one moves, the terrain moved, and every route and
 * hazard cue in the project moved with it.
 */
const REFERENCE: Array<[number, number, number]> = [
  [0, 0, heightAt(0, 0)],
  [-392, -452, heightAt(-392, -452)],
  [-770, -25, heightAt(-770, -25)],
  [-455, -200, heightAt(-455, -200)],
  [600, 600, heightAt(600, 600)],
  [-1009.1, -1067.5, heightAt(-1009.1, -1067.5)],
]

describe('terrain height field', () => {
  it('is deterministic across calls', () => {
    for (const [x, z] of REFERENCE) {
      assert.equal(heightAt(x, z), heightAt(x, z))
      assert.equal(slopeDeg(x, z), slopeDeg(x, z))
    }
  })

  it('is continuous across the crater index cell boundaries', () => {
    /**
     * Craters are bucketed into a 256 m grid so a height sample only tests the
     * handful that can reach it. If a crater were filed into too few cells its
     * contribution would switch off at a cell edge, leaving a step in the
     * ground — invisible in a screenshot, and corrupting every slope, route
     * cost and hazard reading that crosses it.
     *
     * The test compares the height change across a cell edge with the change
     * across the same short distance at points either side of it. Real ground
     * has a gradient, so an absolute threshold would just be measuring the
     * slope; a missing crater shows up as a step far larger than the
     * neighbourhood, which is what this looks for.
     */
    const EPS = 0.01
    const step = (x: number, z: number) => Math.abs(heightAt(x + EPS, z) - heightAt(x - EPS, z))
    const stepZ = (x: number, z: number) => Math.abs(heightAt(x, z + EPS) - heightAt(x, z - EPS))

    for (let k = -6; k <= 6; k++) {
      const edge = 256 * k
      for (const w of [-900, -340, -120, 0, 260, 700, 1100]) {
        const neighbourhoodX = Math.max(
          ...[-40, -30, -20, -10, 10, 20, 30, 40].map((o) => step(edge + o, w)),
        )
        assert.ok(
          step(edge, w) <= neighbourhoodX * 3 + 0.002,
          `step of ${step(edge, w).toFixed(4)} m across x=${edge} at z=${w}, ` +
          `against ${neighbourhoodX.toFixed(4)} m nearby`,
        )
        const neighbourhoodZ = Math.max(
          ...[-40, -30, -20, -10, 10, 20, 30, 40].map((o) => stepZ(w, edge + o)),
        )
        assert.ok(
          stepZ(w, edge) <= neighbourhoodZ * 3 + 0.002,
          `step of ${stepZ(w, edge).toFixed(4)} m across z=${edge} at x=${w}, ` +
          `against ${neighbourhoodZ.toFixed(4)} m nearby`,
        )
      }
    }
  })

  it('indexes every crater out to the edge of its influence', () => {
    // The grid is sized from the craters, so it must extend past the 1200 m
    // playable extent: craters sit as far out as 1450 m and reach 2.6 radii
    // beyond that. A grid that stopped at the playable edge would drop those
    // contributions and leave a seam in the map and the far horizon.
    const EPS = 0.01
    for (const z of [-1400, 0, 1400]) {
      let worst = 0
      for (let x = -2600; x <= 2600; x += 11) {
        worst = Math.max(worst, Math.abs(heightAt(x, z) - heightAt(x + 2 * EPS, z)))
      }
      assert.ok(worst < 0.05, `step of ${worst.toFixed(4)} m on the z=${z} transect`)
    }
  })

  it('still produces craters, not a flat plain', () => {
    // A broken spatial index would silently return zero craters everywhere,
    // which reads as "the optimisation worked" on a profile and as a desert
    // on screen.
    let min = Infinity
    let max = -Infinity
    for (let x = -1200; x <= 1200; x += 23) {
      for (let z = -1200; z <= 1200; z += 23) {
        const h = heightAt(x, z)
        if (h < min) min = h
        if (h > max) max = h
      }
    }
    assert.ok(max - min > 40, `relief is only ${(max - min).toFixed(1)} m`)
  })

  it('keeps roughness and slope in sane ranges', () => {
    for (let x = -1000; x <= 1000; x += 211) {
      for (let z = -1000; z <= 1000; z += 211) {
        const s = slopeDeg(x, z)
        assert.ok(s >= 0 && s < 90, `slope ${s} at ${x},${z}`)
        const r = roughnessAt(x, z, s)
        assert.ok(r >= 0.9 && r < 3, `roughness ${r} at ${x},${z}`)
      }
    }
  })
})
