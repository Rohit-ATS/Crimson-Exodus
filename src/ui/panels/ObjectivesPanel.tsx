/**
 * ObjectivesPanel.tsx — The mission, stated plainly.
 *
 * Two tabs, because the project has two jobs.
 *
 * MISSION lists every objective in tiers, with what it needs, how far through
 * it you are, what to do next, and why it matters to somebody actually
 * standing there. One primary objective is enough for mission success; the
 * critical objective is the one that cannot fail.
 *
 * FIELD GUIDE is the survival manual the player builds by playing. Every
 * procedure completed adds its lesson here, in the order they learned it, with
 * its source. By the end of a full EVA it reads as a short, sourced answer to
 * "what actually kills you on Mars, and in what order".
 */

import { useState } from 'react'
import { Chip, Meter, Modal } from '../components/kit'
import { useStore } from '../../state/store'
import { missionStatus, type Objective } from '../../mission/objectives'
import { LESSONS } from '../../mission/activity'
import { SCIENCE_QUESTION } from '../../mission/site'

const TIER_TONE: Record<string, string> = {
  critical: 'var(--red)',
  primary: 'var(--amber)',
  bonus: 'var(--cyan)',
}

const TIER_NOTE: Record<string, string> = {
  critical: 'Cannot fail. Nothing else counts if this one does.',
  primary: 'The reason the EVA was flown. Any one of these is mission success.',
  bonus: 'What a well-run EVA also picks up.',
}

function Row({ o }: { o: Objective }) {
  const tone = TIER_TONE[o.tier]
  return (
    <div
      style={{
        border: `1px solid ${o.done ? 'rgba(125,255,178,0.4)' : o.blocked ? 'rgba(255,77,77,0.5)' : 'var(--line-soft)'}`,
        borderLeft: `3px solid ${o.done ? 'var(--lime)' : tone}`,
        background: o.done ? 'rgba(125,255,178,0.045)' : o.blocked ? 'rgba(255,77,77,0.05)' : 'rgba(255,255,255,0.02)',
        padding: '9px 12px',
      }}
    >
      <div className="row between gap8 wrap" style={{ alignItems: 'baseline' }}>
        <span className="row gap8" style={{ alignItems: 'baseline' }}>
          <span className="mono" style={{ fontSize: 12, color: o.done ? 'var(--lime)' : tone, width: 14 }}>
            {o.done ? '✓' : '○'}
          </span>
          <span style={{ fontSize: 14, color: o.done ? 'var(--text)' : 'var(--text)' }}>{o.title}</span>
        </span>
        <Chip tone={o.done ? 'nominal' : o.blocked ? 'critical' : 'info'}>
          {o.done ? 'complete' : o.statusLabel ?? `${Math.round(o.progress * 100)}%`}
        </Chip>
      </div>

      {!o.done && !o.statusLabel && (
        <div style={{ margin: '5px 0 2px' }}>
          <Meter value={o.progress} tone={tone} height={5} />
        </div>
      )}

      <div className="src" style={{ marginTop: 3, lineHeight: 1.5 }}>{o.detail}</div>

      {o.blocked && <div className="src rd" style={{ marginTop: 3 }}>{o.blocked}</div>}

      {!o.done && o.next && (
        <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--cyan)' }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', marginRight: 6 }}>NEXT</span>
          {o.next}
        </div>
      )}

      <div
        style={{
          marginTop: 6, paddingLeft: 9, borderLeft: '2px solid rgba(255,178,74,0.4)',
          fontSize: 12.5, lineHeight: 1.55, color: '#dcd3c4',
        }}
      >
        <span className="mono am" style={{ fontSize: 9.5, letterSpacing: '0.14em', display: 'block', marginBottom: 2 }}>
          WHY IT MATTERS OUT THERE
        </span>
        {o.survival}
      </div>
    </div>
  )
}

export default function ObjectivesPanel() {
  const s = useStore()
  const [tab, setTab] = useState<'mission' | 'guide'>('mission')
  const m = missionStatus(s)
  const learned = s.lessons.map((id) => LESSONS[id]).filter(Boolean)
  const unlearned = Object.values(LESSONS).filter((l) => !s.lessons.includes(l.id))

  return (
    <Modal title="Mission objectives" onClose={() => s.setUi(null)} width={900}>
      <div className="row gap6 wrap" style={{ marginBottom: 12 }}>
        <button className={`btn sm ${tab === 'mission' ? 'on' : 'ghost'}`} onClick={() => setTab('mission')}>
          Mission
        </button>
        <button className={`btn sm ${tab === 'guide' ? 'on' : 'ghost'}`} onClick={() => setTab('guide')}>
          Field guide ({learned.length}/{learned.length + unlearned.length})
        </button>
        <div className="grow" />
        <Chip tone={m.successPossible ? 'nominal' : 'caution'}>
          {m.successPossible ? 'mission success banked' : 'no primary objective yet'}
        </Chip>
        <Chip tone="info">{m.primaryDone}/{m.primaryTotal} primary &middot; {m.bonusDone}/{m.bonusTotal} bonus</Chip>
      </div>

      {tab === 'mission' ? (
        <div className="stack gap12">
          <div className="note info" style={{ fontSize: 13 }}>
            <div className="label" style={{ marginBottom: 3 }}>The question this EVA exists to answer</div>
            {SCIENCE_QUESTION.short}
          </div>

          {(['critical', 'primary', 'bonus'] as const).map((tier) => {
            const list = tier === 'critical' ? m.critical : tier === 'primary' ? m.primary : m.bonus
            return (
              <div key={tier} className="stack gap6">
                <div className="row between gap8 wrap" style={{ alignItems: 'baseline' }}>
                  <span className="display" style={{ fontSize: 11.5, color: TIER_TONE[tier] }}>
                    {tier.toUpperCase()}
                  </span>
                  <span className="src">{TIER_NOTE[tier]}</span>
                </div>
                {list.map((o) => <Row key={o.id} o={o} />)}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="stack gap10">
          <div className="note" style={{ fontSize: 13 }}>
            This is the part that is meant to outlast the game. Every procedure you actually
            carry out adds the one thing about it worth remembering if you were the one standing
            there, with where the fact comes from. Nothing is added for reading about it.
          </div>

          {learned.length === 0 && (
            <div className="src">Nothing yet. Carry out a procedure and its lesson lands here.</div>
          )}

          {learned.map((l, i) => (
            <div
              key={l.id}
              style={{
                border: '1px solid rgba(255,178,74,0.4)',
                borderLeft: '3px solid var(--amber)',
                background: 'rgba(255,178,74,0.05)',
                padding: '10px 13px',
              }}
            >
              <div className="row between gap8 wrap">
                <span className="mono am" style={{ fontSize: 10.5, letterSpacing: '0.14em' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="src">learned in the field</span>
              </div>
              <div style={{ fontSize: 15, marginTop: 2 }}>{l.headline}</div>
              <p style={{ fontSize: 13, marginTop: 5, lineHeight: 1.6 }}>{l.body}</p>
              <div className="src" style={{ marginTop: 3 }}>Source: {l.source}</div>
            </div>
          ))}

          {unlearned.length > 0 && (
            <>
              <hr className="rule" />
              <div className="label">Still out there</div>
              <div className="stack gap5">
                {unlearned.map((l) => (
                  <div key={l.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 9, opacity: 0.55 }}>
                    <div className="dim" style={{ fontSize: 13 }}>{l.headline}</div>
                    <div className="src">Carry out the procedure that teaches this one.</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
