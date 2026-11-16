/**
 * SettingsPanel.tsx — Controls, comfort and what the machine is doing.
 *
 * One panel, three jobs, in the order a new player needs them:
 *
 *  1. CONTROLS. The full key map, grouped by what you are trying to do rather
 *     than alphabetically. A player who cannot remember how to open the map is
 *     not going to go looking in a README.
 *  2. DISPLAY. Quality, HUD scale, reduced motion, audio. Quality defaults to
 *     automatic and shows the measured frame time next to it, so the choice is
 *     informed rather than a guess about your own hardware.
 *  3. ACCESSIBILITY, stated plainly: what this build does and does not do.
 *     Claiming more than is true would be worse than claiming nothing.
 */

import { Chip, Modal } from '../components/kit'
import { useStore } from '../../state/store'
import { useSettings, type QualityMode } from '../../state/settings'
import { marsAudio } from '../../sim/audio'

const KEYS: Array<[string, Array<[string, string]>]> = [
  ['Moving', [
    ['W A S D / arrows', 'Walk, relative to the camera'],
    ['Q / E', 'Swing the camera left and right'],
    ['Mouse drag', 'Look around'],
    ['Mouse wheel', 'Camera distance'],
    ['V', 'First person / third person'],
    ['P', 'Auto-traverse: Jack follows the planned route'],
    ['Shift (hold)', 'Time-compression boost'],
  ]],
  ['Working', [
    ['F', 'Work the station in reach'],
    ['C', 'Capture a context frame'],
    ['G', 'Plant a commemorative flag'],
    ['R', 'Swap consumables at a depot in reach'],
    ['Enter', 'Ingress at the lander and end the EVA'],
  ]],
  ['The screen', [
    ['Dock buttons', 'Open a HUD window — life support, return, environment, Earth link, map, clocks, log'],
    ['Drag a title bar', 'Move a window. Where you put it is remembered between runs'],
    ['SHOW ALL / CLEAR SCREEN', 'Open every window at once, or go back to nothing but the planet'],
  ]],
  ['Talking to MERV', [
    ['X (hold)', 'Hold to talk to the rover, from anywhere on the surface'],
    ['J', 'Rover comms transcript — type a question, or read the log'],
  ]],
  ['Looking things up', [
    ['O', 'Mission objectives and your Mars field guide'],
    ['M', 'Mission map'],
    ['N', 'Real-site map: HiRISE, CRISM, Perseverance traverse'],
    ['T', 'Earth comms feed and the NASA public feed'],
    ['B', 'Backpack'],
    ['H', 'Hazard overlay'],
    ['K', 'Data provenance and disclosure'],
  ]],
  ['Everything else', [
    ['F1 or ?', 'This panel'],
    ['Space', 'Pause'],
    ['Esc', 'Close a panel, or abandon a running procedure'],
  ]],
]

const QUALITY_NOTE: Record<QualityMode, string> = {
  auto: 'Measures its own frame time and moves between tiers. Downgrades quickly, upgrades slowly, and stops adjusting once it settles.',
  high: 'Full resolution, 4096 px shadows, both ground-litter layers.',
  balanced: 'Three-quarter resolution, 2048 px shadows, a tighter litter radius.',
  performance: 'Native resolution, 1024 px shadows, no boot-scale grit. For integrated graphics.',
}

function Toggle({
  label, note, on, onChange,
}: { label: string; note: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row between gap12" style={{ alignItems: 'flex-start', padding: '7px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5 }}>{label}</div>
        <div className="src" style={{ lineHeight: 1.5 }}>{note}</div>
      </div>
      <button
        className={`btn sm ${on ? 'on' : 'ghost'}`}
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        style={{ flex: '0 0 auto' }}
      >
        {on ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

export default function SettingsPanel() {
  const s = useStore()
  const st = useSettings()
  const resolved = st.tier()

  return (
    <Modal title="Controls, display and accessibility" onClose={() => s.setUi(null)} width={940}>
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>

        {/* --- Controls ----------------------------------------------- */}
        <div className="stack gap12">
          {KEYS.map(([group, rows]) => (
            <div key={group}>
              <div className="label" style={{ marginBottom: 4 }}>{group}</div>
              <div className="stack gap3">
                {rows.map(([k, v]) => (
                  <div key={k} className="row between gap12" style={{ alignItems: 'baseline' }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--cyan)',
                        border: '1px solid var(--line)', padding: '1px 6px', flex: '0 0 auto',
                      }}
                    >
                      {k}
                    </span>
                    <span className="src" style={{ textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* --- Display ------------------------------------------------ */}
        <div className="stack gap12">
          <div>
            <div className="row between gap8 wrap" style={{ marginBottom: 5 }}>
              <span className="label">Render quality</span>
              <span className="row gap6" style={{ alignItems: 'center' }}>
                <Chip tone="info">{resolved.label}</Chip>
                {st.frameMs > 0 && (
                  <Chip tone={st.frameMs > 22 ? 'caution' : 'nominal'}>
                    {st.frameMs.toFixed(1)} ms &middot; {(1000 / st.frameMs).toFixed(0)} fps
                  </Chip>
                )}
              </span>
            </div>
            <div className="row gap6 wrap">
              {(['auto', 'high', 'balanced', 'performance'] as const).map((q) => (
                <button
                  key={q}
                  className={`btn sm ${st.quality === q ? 'on' : 'ghost'}`}
                  onClick={() => st.setQuality(q)}
                >
                  {q === 'auto' ? 'AUTOMATIC' : q.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="src" style={{ marginTop: 5, lineHeight: 1.55 }}>
              {QUALITY_NOTE[st.quality]}
            </div>
            <div className="kv" style={{ marginTop: 7, fontSize: 11 }}>
              <dt>Pixel ratio cap</dt><dd>{resolved.dprMax}&times;</dd>
              <dt>Shadow map</dt><dd>{resolved.shadowMap} px</dd>
              <dt>Ground litter</dt>
              <dd>{resolved.grit ? 'cobbles + grit' : 'cobbles only'} &middot; {(resolved.clastScale * 100).toFixed(0)}% radius</dd>
            </div>
          </div>

          <hr className="rule" />

          <div>
            <div className="row between gap8" style={{ marginBottom: 4 }}>
              <span className="label">HUD scale</span>
              <span className="mono" style={{ fontSize: 12 }}>{(st.hudScale * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.7} max={1.3} step={0.05}
              value={st.hudScale}
              onChange={(e) => st.setHudScale(Number(e.target.value))}
              style={{ width: '100%' }}
              aria-label="HUD scale"
            />
            <div className="src">
              The HUD already shrinks itself to fit small windows. This scales it further,
              for a projector at the back of a room or a very dense laptop screen.
            </div>
          </div>

          <hr className="rule" />

          <Toggle
            label="Reduced motion"
            note="Stops the scanline sweep, the pulsing warning chips and the panel entry animations. The simulation itself is unchanged."
            on={st.reducedMotion}
            onChange={st.setReducedMotion}
          />

          <Toggle
            label="Helmet audio"
            note="Synthesised at runtime, modelled on what Perseverance's microphones measured: about 20 dB fainter than Earth, with the high frequencies absorbed by CO2. Off by default so nothing starts making noise on its own."
            on={st.audio}
            onChange={async (v) => {
              if (v) {
                const ok = await marsAudio.start()
                if (!ok) return
                marsAudio.setMuted(false)
                st.setAudio(true)
              } else {
                marsAudio.setMuted(true)
                st.setAudio(false)
              }
            }}
          />

          <Toggle
            label="First-run guidance"
            note="The step-by-step prompts that walk a new player through planning, working a station and getting the data home."
            on={st.hints}
            onChange={st.setHints}
          />
          <div className="row between gap8" style={{ marginTop: -4 }}>
            <span className="src">
              {st.seenHints.length} card(s) already shown and retired.
            </span>
            <button className="btn sm ghost" onClick={st.resetHints}>Show them all again</button>
          </div>

          <hr className="rule" />

          <div>
            <div className="label" style={{ marginBottom: 4 }}>Accessibility, stated plainly</div>
            <ul style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              <li>Every action has a keyboard shortcut; nothing requires the mouse.</li>
              <li>Reduced motion is honoured from your operating system by default.</li>
              <li>
                Status is never carried by colour alone: every coloured state also has a word
                next to it, and every meter has a number.
              </li>
              <li>
                What this build does <em>not</em> do: full screen-reader narration of the 3D
                scene, remappable keys, or a high-contrast theme. Those are real gaps and we
                would rather say so than imply otherwise.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  )
}
