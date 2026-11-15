/**
 * SurvivalGuide.tsx — The thing the challenge actually asked for.
 *
 * The brief is an *Interplanetary Survival Guide*. Burying that payload behind
 * eight minutes of play would mean most people who open this never get it, so
 * the complete guide is one click from the title screen, readable by someone
 * who never presses a key.
 *
 * It is organised by what kills you and in what order, not by game progression,
 * because that is how a survival document is useful. Every entry carries its
 * source. Entries the player has actually earned in the field are marked, which
 * is the only place the game layer shows through: reading the guide is useful,
 * but doing the thing is what makes it stick.
 */

import { Chip, Modal } from '../components/kit'
import { LESSONS } from '../../mission/activity'
import { useStore } from '../../state/store'

interface Section {
  title: string
  blurb: string
  ids: string[]
}

/**
 * Ordered by how fast the thing kills you. Pressure in seconds, CO2 in
 * minutes, cold and oxygen in hours, radiation over a career. Everything
 * after that is about not wasting the trip.
 */
const SECTIONS: Section[] = [
  {
    title: 'Seconds — pressure',
    blurb: 'The atmosphere is not thin. For a human being it is effectively absent.',
    ids: ['pressureSuit'],
  },
  {
    title: 'Minutes — the air you have already breathed',
    blurb: 'The suit is a closed loop, and a closed loop fails in both directions.',
    ids: ['co2Kills'],
  },
  {
    title: 'Hours — cold, power and margin',
    blurb: 'Everything out here is a budget, and the budget is enforced by physics.',
    ids: ['coldKills', 'shelterNotDie', 'massIsLife', 'cacheRange'],
  },
  {
    title: 'The whole time — dust and radiation',
    blurb: 'Two hazards that never stop and that no single action solves.',
    ids: ['dustIsTheHazard', 'radiationShelter'],
  },
  {
    title: 'When you cannot see, and cannot ask',
    blurb: 'The two failures that turn a bad sol into a fatal one.',
    ids: ['noCompass', 'noOneToAsk'],
  },
  {
    title: 'Working on a planet that resists being read',
    blurb: 'How you get a true answer out of Martian rock, and out of 0.38 g.',
    ids: ['rind', 'gravityNotWeight', 'shadowTheTarget', 'contextFrame'],
  },
  {
    title: 'And one that is not about survival at all',
    blurb: '',
    ids: ['flagTreaty'],
  },
]

export default function SurvivalGuide({ onClose }: { onClose: () => void }) {
  // The store exists on every screen, including the title, so the earned marks
  // work whether this is opened before a run or after one.
  const earned = useStore((s) => s.lessons)
  const total = Object.keys(LESSONS).length

  return (
    <Modal title="Mars survival guide" onClose={onClose} width={960}>
      <div className="note info" style={{ fontSize: 13.5, marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 3 }}>What this is</div>
        Fifteen things that decide whether a person standing on Mars comes back, ordered by how
        fast each one kills you. Every entry is sourced. Nothing here is invented for the game:
        the numbers come from Curiosity, Perseverance, Phoenix, MRO and the Mars fact sheet, and
        they are the same numbers the simulation runs on.
        <div style={{ marginTop: 6 }}>
          You can read all of it right now. The reason the game hands these out one at a time, for
          work actually done on the surface, is that a fact you met while your oxygen was draining
          is a fact you keep.
        </div>
      </div>

      <div className="row between gap8 wrap" style={{ marginBottom: 12 }}>
        <span className="label">Ordered by how fast it kills you</span>
        <Chip tone={earned.length > 0 ? 'nominal' : 'info'}>
          {earned.length} of {total} earned in the field
        </Chip>
      </div>

      <div className="stack gap16">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="stack gap8">
            <div>
              <div className="display am" style={{ fontSize: 12, letterSpacing: '0.16em' }}>
                {sec.title.toUpperCase()}
              </div>
              {sec.blurb && <div className="src" style={{ marginTop: 2 }}>{sec.blurb}</div>}
            </div>

            {sec.ids.map((id) => {
              const l = LESSONS[id]
              if (!l) return null
              const got = earned.includes(id)
              return (
                <div
                  key={id}
                  style={{
                    border: `1px solid ${got ? 'rgba(125,255,178,0.4)' : 'var(--line-soft)'}`,
                    borderLeft: `3px solid ${got ? 'var(--lime)' : 'var(--amber)'}`,
                    background: got ? 'rgba(125,255,178,0.04)' : 'rgba(255,178,74,0.035)',
                    padding: '10px 13px',
                  }}
                >
                  <div className="row between gap8 wrap" style={{ alignItems: 'baseline' }}>
                    <span style={{ fontSize: 15, color: 'var(--text)' }}>{l.headline}</span>
                    {got && <Chip tone="nominal">earned in the field</Chip>}
                  </div>
                  <p style={{ fontSize: 13, marginTop: 5, lineHeight: 1.6 }}>{l.body}</p>
                  <div className="src" style={{ marginTop: 4 }}>Source: {l.source}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="note" style={{ marginTop: 16, fontSize: 12.5 }}>
        If you remember only three: <strong>the reserve is what keeps a surprise from becoming a
        fatality</strong>; <strong>dust is what actually breaks equipment and lungs</strong>; and
        <strong> Earth cannot help you with the next ten minutes</strong>.
      </div>
    </Modal>
  )
}
