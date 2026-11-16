import { useState } from 'react'
import { Chip, Modal, Tag } from '../components/kit'
import { useStore } from '../../state/store'
import { PROVENANCE, STATIONS } from '../../mission/site'
import { live } from '../../state/live'
import { ROVER_IMAGES } from '../../data/realSite'
import RoverImageCard from './RoverImageCard'

/**
 * A schematic of the outcrop face, drawn so it actually carries the information
 * the observation question asks about rather than being decorative. It is a
 * DIAGRAM, labelled as such: it is not an image of Mars and not a photograph of
 * the real feature.
 */
export function OutcropGraphic({ station }: { station: (typeof STATIONS)[number] }) {
  const common: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: station.rockTint,
  }
  return (
    <div
      className="scanlines"
      style={{
        height: 164,
        border: '1px solid var(--line)',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #2b1a12 0%, #140c08 100%)',
      }}
    >
      {station.id === 'kodiak' && (
        <>
          {/* Topset: near-horizontal beds capping the section */}
          <div
            style={{
              ...common,
              top: 0,
              height: '34%',
              backgroundImage:
                'repeating-linear-gradient(179deg, rgba(0,0,0,0.34) 0 2px, rgba(255,255,255,0.06) 2px 11px)',
            }}
          />
          {/* The truncation surface between them: the thing you are looking for */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: '34%', height: 3,
              background: '#ffd9a8', boxShadow: '0 0 8px rgba(255,217,168,0.9)',
            }}
          />
          {/* Foreset: beds dipping at an angle into what was standing water */}
          <div
            style={{
              ...common,
              top: '34%',
              bottom: 0,
              backgroundImage:
                'repeating-linear-gradient(163deg, rgba(0,0,0,0.38) 0 2px, rgba(255,255,255,0.07) 2px 13px)',
            }}
          />
          <Annot top={12} left={10} text="topset — near horizontal" />
          <Annot top={62} left={10} text="truncation surface" tone="#ffd9a8" />
          <Annot top={104} left={10} text="foreset — dipping ~15°" />
        </>
      )}

      {station.id === 'flats' && (
        <>
          <div
            style={{
              ...common,
              top: 0,
              bottom: 0,
              backgroundImage:
                'repeating-linear-gradient(180deg, rgba(0,0,0,0.13) 0 1px, rgba(255,255,255,0.045) 1px 4px)',
            }}
          />
          {/* Resistant nodular horizons picked out in a recessive unit */}
          {[38, 92, 126].map((t) => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: t, height: 5, background: 'rgba(255,240,215,0.2)' }} />
          ))}
          <Annot top={12} left={10} text="fine, recessive, light-toned" />
          <Annot top={140} left={10} text="laminae below hand-lens resolution" />
        </>
      )}

      {station.id === 'seitah' && (
        <>
          <div
            style={{
              ...common,
              top: 0,
              bottom: 0,
              backgroundImage:
                'radial-gradient(circle at 22% 32%, rgba(190,210,160,0.4) 0 5px, transparent 6px),' +
                'radial-gradient(circle at 68% 58%, rgba(190,210,160,0.34) 0 7px, transparent 8px),' +
                'radial-gradient(circle at 45% 78%, rgba(205,220,180,0.3) 0 6px, transparent 7px)',
              backgroundSize: '58px 58px, 74px 74px, 66px 66px',
            }}
          />
          <Annot top={12} left={10} text="coarse interlocking crystals" />
          <Annot top={140} left={10} text="no bedding — grown from a melt, not deposited" />
        </>
      )}

      <div style={{ position: 'absolute', right: 8, bottom: 7 }}>
        <span className="tag synth">Schematic diagram, not an image of Mars</span>
      </div>
    </div>
  )
}

/** One step of the station procedure: state, cost, what it revealed. */
function ProcStep({
  n, title, done, minutes, action, onDo, blurb, reveal, warn,
}: {
  n: number
  title: string
  done: boolean
  minutes: number
  action: string
  onDo?: () => void
  blurb: string
  reveal: string | null
  warn?: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${done ? 'rgba(125,255,178,0.4)' : 'var(--line-soft)'}`,
        borderLeft: `3px solid ${done ? 'var(--lime)' : 'var(--faint)'}`,
        background: done ? 'rgba(125,255,178,0.05)' : 'rgba(255,255,255,0.02)',
        padding: '8px 11px',
      }}
    >
      <div className="row between gap8 wrap">
        <span className="row gap8" style={{ alignItems: 'baseline' }}>
          <span className="mono" style={{ fontSize: 11, color: done ? 'var(--lime)' : 'var(--faint)' }}>
            {done ? '\u2713' : n}
          </span>
          <span style={{ fontSize: 13.5, color: done ? 'var(--text)' : 'var(--muted)' }}>{title}</span>
        </span>
        <span className="row gap8" style={{ alignItems: 'center' }}>
          <span className="src">{minutes} min</span>
          {onDo
            ? <button className="btn sm primary" onClick={onDo}>{action}</button>
            : <span className="src" style={{ color: done ? 'var(--lime)' : undefined }}>{done ? 'done' : action}</span>}
        </span>
      </div>
      {!done && <div className="src" style={{ marginTop: 3, lineHeight: 1.5 }}>{blurb}</div>}
      {warn && <div className="src am" style={{ marginTop: 3 }}>{warn}</div>}
      {reveal && (
        <div style={{ fontSize: 12.5, marginTop: 5, color: '#cfe3d6', lineHeight: 1.5 }}>{reveal}</div>
      )}
    </div>
  )
}

function Annot({ top, left, text, tone }: { top: number; left: number; text: string; tone?: string }) {
  return (
    <div
      className="mono"
      style={{
        position: 'absolute',
        top,
        left,
        fontSize: 10,
        letterSpacing: '0.1em',
        color: tone ?? '#f4e3cf',
        textShadow: '0 1px 3px rgba(0,0,0,1), 0 0 7px rgba(0,0,0,0.9)',
        background: 'rgba(8,6,4,0.45)',
        padding: '1px 5px',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}

export default function SciencePanel() {
  const s = useStore()
  const st = STATIONS.find((x) => x.id === s.nearStation)
  const state0 = st ? s.stations[st.id] : undefined
  // Reopening a station you are part-way through should land on the procedure,
  // not send you back to the briefing you have already read.
  const started = !!state0 && (state0.abraded || state0.inspected || !!state0.choice || state0.sampled)
  const [tab, setTab] = useState<'brief' | 'observe' | 'sources'>(started ? 'observe' : 'brief')
  if (!st) return null

  const state = s.stations[st.id]
  const chosen = st.observation.options.find((o) => o.id === state.choice)
  const srcs = PROVENANCE.filter((p) => st.sources.includes(p.id))

  return (
    <Modal title={`${st.codename} — ${st.name}`} onClose={() => s.setUi(null)} width={880}>
      <div className="row gap6 wrap" style={{ marginBottom: 12 }}>
        {([['brief', 'Field briefing'], ['observe', 'Field procedure'], ['sources', 'Where this comes from']] as const).map(
          ([id, label]) => (
            <button key={id} className={`btn sm ${tab === id ? 'on' : 'ghost'}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ),
        )}
        <div className="grow" />
        <Chip tone={state.abraded ? 'nominal' : 'caution'}>
          {state.abraded ? 'patch abraded' : 'rind intact'}
        </Chip>
        <Chip tone={state.choice ? (state.choiceConfident ? 'nominal' : 'caution') : 'caution'}>
          {state.choice ? (state.choiceConfident ? 'observation recorded' : 'recorded, caveated') : 'no observation yet'}
        </Chip>
        <Chip tone={state.sampled ? 'nominal' : 'info'}>
          {state.sampled ? 'core sealed' : `${s.samples.length}/4 tubes used`}
        </Chip>
      </div>

      {tab === 'brief' && (
        <div className="stack gap10">
          <OutcropGraphic station={st} />

          <p style={{ fontSize: 14 }}>{st.briefing}</p>

          <div className="note info" style={{ fontSize: 13 }}>
            <strong className="cy">Real feature:</strong> {st.realFeature}
          </div>

          {(ROVER_IMAGES[st.id] ?? []).length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>What the real outcrop looks like &mdash; Perseverance</div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {ROVER_IMAGES[st.id].map((im) => <RoverImageCard key={im.id} image={im} />)}
              </div>
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 4 }}>Game assumptions at this station</div>
            <ul style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {st.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>

          <div className="row gap8 wrap">
            <button className="btn primary" onClick={() => setTab('observe')}>
              Begin the field procedure &rarr;
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                const url = live.captureFrame?.()
                s.beginPhoto(`${st.codename} context frame`, url)
              }}
            >
              Capture a frame [C]
            </button>
          </div>
        </div>
      )}

      {tab === 'observe' && (
        <div className="stack gap10">
          {/* --- The procedure, in the order a geologist actually works ---- */}
          <div className="stack gap6">
            <div className="label">Field procedure</div>

            <ProcStep
              n={1}
              title="Clear the weathering rind"
              done={state.abraded}
              minutes={st.abradeMinutes}
              action="Brush & abrade"
              onDo={state.abraded ? undefined : () => s.beginAbrade(st.id)}
              blurb="Every rock on Mars wears a dust coating over an oxidised rind. Cut a patch down to fresh rock before you believe anything you see."
              reveal={state.abraded ? st.abradeReveal : null}
            />

            <ProcStep
              n={2}
              title="Hand lens on the patch"
              done={state.inspected}
              minutes={st.lensMinutes}
              action="Inspect"
              onDo={state.inspected ? undefined : () => s.beginLens(st.id)}
              warn={!state.abraded && !state.inspected ? 'Not abraded yet \u2014 little will resolve through the rind.' : undefined}
              blurb="Close inspection of the prepared surface. Grain size, sorting, cement and crystal habit are decided here."
              reveal={state.inspected ? (state.abraded ? st.lensReveal : 'Through the dust coating and the oxidised rind, very little resolved.') : null}
            />

            <ProcStep
              n={3}
              title="Record the interpretation"
              done={!!state.choice}
              minutes={Math.round(st.workMinutes * 0.3)}
              action={state.choice ? 'Recorded' : 'Choose below'}
              onDo={undefined}
              warn={!state.choice && !(state.abraded && state.inspected)
                ? 'You can record now, but it will be logged with a confidence caveat and scored lower.'
                : undefined}
              blurb="One call, permanent, and it is what gives any sample you take its meaning."
              reveal={null}
            />

            <ProcStep
              n={4}
              title="Seal a core"
              done={state.sampled}
              minutes={Math.round(st.workMinutes * 0.55)}
              action={st.sampleable ? `Core \u2014 ${st.sampleName}` : 'Not sampleable'}
              onDo={st.sampleable && !state.sampled && s.samples.length < 4
                ? () => s.beginCore(st.id)
                : undefined}
              blurb="The one thing a human on the surface can do that no orbiter can."
              reveal={null}
            />
          </div>

          <hr className="rule" />

          {/* --- The observation itself -------------------------------- */}
          <p className="am" style={{ fontSize: 14.5 }}>{st.observation.prompt}</p>

          {!state.choice ? (
            <>
              <div className="stack gap6">
                {st.observation.options.map((o) => (
                  <button
                    key={o.id}
                    className="btn ghost"
                    style={{
                      textAlign: 'left', justifyContent: 'flex-start',
                      padding: '11px 13px', fontFamily: 'var(--body)', fontSize: 14,
                      letterSpacing: 0, textTransform: 'none', fontWeight: 400, lineHeight: 1.45,
                    }}
                    onClick={() => s.beginRecord(st.id, o.id)}
                  >
                    {o.text}
                  </button>
                ))}
              </div>
              <div className={`note ${state.abraded && state.inspected ? 'info' : ''}`} style={{ fontSize: 12.5 }}>
                {state.abraded && state.inspected
                  ? 'Surface prepared and inspected. Whatever you record now carries full weight.'
                  : 'The surface is not prepared. You can still record an interpretation \u2014 field geologists make calls on weathered rock all the time \u2014 but it is logged with a caveat and scored lower, because a rind can hide or fake almost any texture.'}
              </div>
            </>
          ) : (
            <>
              <div className={`note ${chosen?.supported ? 'info' : 'danger'}`} style={{ fontSize: 13.5 }}>
                <div className="row between gap8" style={{ marginBottom: 4 }}>
                  <span className="display" style={{ fontSize: 11, color: chosen?.supported ? 'var(--lime)' : 'var(--red)' }}>
                    {chosen?.supported ? 'SUPPORTED BY THE PUBLISHED OBSERVATIONS' : 'NOT SUPPORTED'}
                  </span>
                  <Chip tone={state.choiceConfident ? 'nominal' : 'caution'}>
                    {state.choiceConfident ? 'prepared surface' : 'unprepared \u2014 caveated'}
                  </Chip>
                </div>
                <div style={{ marginBottom: 6 }}><em>You recorded:</em> {chosen?.text}</div>
                {chosen?.feedback}
              </div>

              <div className="stack gap6">
                <div className="label">The other readings, and why they are not it</div>
                {st.observation.options.filter((o) => o.id !== state.choice).map((o) => (
                  <div key={o.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 9, fontSize: 12.5 }}>
                    <div className="dim">{o.text}</div>
                    <div className="faint" style={{ marginTop: 2 }}>{o.feedback}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <hr className="rule" />

          <div className="row gap8 wrap">
            <button
              className="btn"
              onClick={() => {
                const url = live.captureFrame?.()
                s.beginPhoto(`${st.codename} ${state.choice ? 'documentation' : 'context'} frame`, url)
              }}
            >
              Capture a frame [C]
            </button>
            <button className="btn ghost" onClick={() => s.setUi(null)}>Back to the surface [Esc]</button>
          </div>

          <div className="src">
            Every step above spends mission time and consumables. The full procedure on all
            three stations is deliberately more than a comfortable margin allows — deciding
            what to skip is the game.
          </div>
        </div>
      )}

      {tab === 'sources' && (
        <div className="stack gap10">
          {srcs.map((p) => (
            <div key={p.id} style={{ borderLeft: '2px solid var(--cyan)', paddingLeft: 10 }}>
              <div className="row between gap8 wrap">
                <span className="mono cy" style={{ fontSize: 12.5 }}>{p.label}</span>
                <Chip tone={p.kind === 'synthetic' ? 'warning' : p.kind === 'model' ? 'caution' : 'nominal'}>{p.kind}</Chip>
              </div>
              <div className="src">{p.instrument} &middot; {p.source} &middot; {p.date} &middot; {p.resolution}</div>
              <p style={{ fontSize: 12.5, marginTop: 4 }}>{p.caveat}</p>
              {p.url && <div className="src"><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></div>}
            </div>
          ))}
          <div className="note" style={{ fontSize: 12.5 }}>
            <Tag kind="synth" /> The ground under your boots at this station is procedural.
            The geology in the briefing is real and sourced above. Both statements are true at
            once, and the app will not blur them.
          </div>
        </div>
      )}
    </Modal>
  )
}
