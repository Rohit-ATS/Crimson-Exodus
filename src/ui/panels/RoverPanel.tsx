/**
 * RoverPanel.tsx — The comms link to MERV.
 *
 * Design intent: this must be usable by somebody who has never played a game
 * and does not know what to ask. So the panel opens with the conversation
 * already in progress, offers six situational questions as buttons, and shows
 * its own wiring at the bottom — which tier is running, what that means, and
 * what MERV will and will not do.
 *
 * The honesty footer is not decoration. A talking companion on a NASA-data
 * project invites exactly one suspicion — that the numbers are made up — and
 * the answer to that is to show the plumbing rather than to assert it.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip, Modal } from '../components/kit'
import { useMerv } from '../../state/merv'
import { useSettings } from '../../state/settings'
import { useStore } from '../../state/store'
import { live } from '../../state/live'

const TONE_COLOR: Record<string, string> = {
  info: 'var(--cyan)',
  science: 'var(--lime)',
  warning: 'var(--amber)',
  danger: 'var(--red)',
}

const TIER_LABEL: Record<string, string> = {
  local: 'OFFLINE BRAIN',
  grounded: 'DEEPGRAM VOICE · SOURCED ANSWERS',
  agent: 'DEEPGRAM VOICE AGENT',
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function RoverPanel({ onClose }: { onClose?: () => void } = {}) {
  const setUi = useStore((s) => s.setUi)
  // Outside the surface phase there is no `ui` slot to clear, so the screen
  // that opened the panel passes its own close handler instead.
  const close = onClose ?? (() => setUi(null))
  const lines = useMerv((s) => s.lines)
  const interim = useMerv((s) => s.interim)
  const listening = useMerv((s) => s.listening)
  const speaking = useMerv((s) => s.speaking)
  const thinking = useMerv((s) => s.thinking)
  const micLevel = useMerv((s) => s.micLevel)
  const tier = useMerv((s) => s.tier)
  const linkState = useMerv((s) => s.link)
  const diagnostic = useMerv((s) => s.diagnostic)
  const error = useMerv((s) => s.error)
  const muted = useMerv((s) => s.muted)
  const advise = useMerv((s) => s.advise)
  const prompts = useMerv((s) => s.prompts)
  const micAvailable = useMerv((s) => s.micAvailable)
  const audioOn = useSettings((s) => s.audio)
  const setAudio = useSettings((s) => s.setAudio)

  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mark the transcript read on open, and keep the movement keys from firing
  // while the panel has the keyboard.
  useEffect(() => {
    // Bring the link up if this is the first time anything has asked for it.
    // The panel is reachable from the title screen, the planner and the
    // surface, and each of those would otherwise have to remember to do it.
    const m = useMerv.getState()
    if (!m.booted) void m.boot()
    m.markRead()
    live.inputLocked = true
    inputRef.current?.focus()
    return () => { live.inputLocked = false }
  }, [])

  // Follow the conversation. A transcript that does not scroll is a transcript
  // nobody reads past the fourth line.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, interim, thinking])

  const state = listening ? 'LISTENING'
    : thinking ? 'COMPOSING'
      : speaking ? 'TRANSMITTING'
        : 'STANDING BY'

  const stateTone = listening ? 'nominal' : thinking ? 'caution' : speaking ? 'info' : 'info'

  const send = () => {
    const q = draft.trim()
    if (!q) return
    setDraft('')
    void useMerv.getState().ask(q)
  }

  // Hold-to-talk. Pointer events rather than mouse, so it works on a touch
  // screen at a demo table.
  const holdHandlers = useMemo(() => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      void useMerv.getState().startTalking()
    },
    onPointerUp: () => useMerv.getState().stopTalking(),
    onPointerLeave: () => { if (listening) useMerv.getState().stopTalking() },
  }), [listening])

  return (
    <Modal title="MERV — rover comms" onClose={close} width={900}>
      <div className="row between gap8 wrap" style={{ marginBottom: 10 }}>
        <div className="row gap6 wrap">
          <Chip tone={linkState === 'error' ? 'caution' : 'info'}>{TIER_LABEL[tier] ?? tier}</Chip>
          <Chip tone={stateTone}>{state}</Chip>
          {tier === 'agent' && <Chip tone="caution">hosted language model</Chip>}
        </div>
        <div className="row gap6">
          <button
            className={`btn sm ${advise ? 'on' : 'ghost'}`}
            onClick={() => useMerv.getState().setAdvise(!advise)}
            title="MERV speaks up on his own when something crosses a line"
          >
            {advise ? 'ADVISORIES ON' : 'ADVISORIES OFF'}
          </button>
          <button
            className={`btn sm ${!muted && audioOn ? 'on' : 'ghost'}`}
            onClick={() => {
              if (!audioOn) { setAudio(true); useMerv.getState().setMuted(false) }
              else useMerv.getState().setMuted(!muted)
            }}
            title="MERV's voice. Separate from the environment audio."
          >
            {!muted && audioOn ? 'VOICE ON' : 'VOICE OFF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="note" style={{ borderColor: 'var(--amber)', marginBottom: 10, fontSize: 12.5 }}>
          <span className="am">{error}</span>
        </div>
      )}

      {/* ---- Transcript ---------------------------------------------------- */}
      <div
        ref={scroller}
        className="scroll"
        style={{
          maxHeight: 340,
          minHeight: 180,
          border: '1px solid var(--line-soft)',
          background: 'rgba(2,6,12,0.5)',
          padding: 10,
        }}
      >
        {lines.length === 0 && (
          <div className="src">Bringing the comms link up…</div>
        )}
        <div className="stack gap8">
          {lines.map((l) => {
            if (l.who === 'system') {
              return (
                <div key={l.id} className="src" style={{ alignSelf: 'center', textAlign: 'center', maxWidth: '88%' }}>
                  {l.text}
                </div>
              )
            }
            const mine = l.who === 'jack'
            const color = TONE_COLOR[l.tone] ?? 'var(--cyan)'
            return (
              <div
                key={l.id}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  borderLeft: mine ? undefined : `3px solid ${color}`,
                  borderRight: mine ? '3px solid var(--faint)' : undefined,
                  background: mine ? 'rgba(125,148,166,0.08)' : 'rgba(79,232,255,0.045)',
                  padding: '7px 11px',
                }}
              >
                <div className="row gap8" style={{ alignItems: 'baseline', marginBottom: 2 }}>
                  <span
                    className="display"
                    style={{ fontSize: 10, letterSpacing: '0.16em', color: mine ? 'var(--muted)' : color }}
                  >
                    {mine ? 'JACK' : 'MERV'}
                  </span>
                  <span className="src" style={{ fontSize: 10 }}>T+{mmss(l.at)}</span>
                  {l.volunteered && (
                    <span className="src" style={{ fontSize: 10, color: 'var(--amber)' }}>unprompted</span>
                  )}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.58, color: 'var(--text)' }}>{l.text}</div>
                {l.source && <div className="src" style={{ marginTop: 4 }}>Source: {l.source}</div>}
              </div>
            )
          })}

          {interim && (
            <div style={{ alignSelf: 'flex-end', maxWidth: '86%', padding: '7px 11px', opacity: 0.6 }}>
              <div className="display" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--muted)' }}>
                JACK · SPEAKING
              </div>
              <div style={{ fontSize: 13.5, fontStyle: 'italic' }}>{interim}…</div>
            </div>
          )}
          {thinking && (
            <div className="src" style={{ alignSelf: 'flex-start' }}>MERV is composing…</div>
          )}
        </div>
      </div>

      {/* ---- Suggested questions ------------------------------------------- */}
      {prompts.length > 0 && (
        <div className="stack gap6" style={{ marginTop: 10 }}>
          <span className="label">Ask him</span>
          <div className="row gap6 wrap">
            {prompts.map((p) => (
              <button key={p} className="btn ghost sm" onClick={() => void useMerv.getState().ask(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Input --------------------------------------------------------- */}
      <div className="row gap6" style={{ marginTop: 10, alignItems: 'stretch' }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); send() }
          }}
          placeholder="Ask MERV anything about Mars, or about this EVA…"
          style={{
            flex: '1 1 auto', minWidth: 0,
            background: 'rgba(2,6,12,0.7)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
            fontFamily: 'var(--body)',
            fontSize: 14,
            padding: '9px 11px',
          }}
        />
        <button className="btn primary" onClick={send} disabled={!draft.trim()}>SEND</button>
        <button
          className={`btn ${listening ? 'on' : ''}`}
          disabled={!micAvailable || tier === 'agent'}
          title={tier === 'agent'
            ? 'The voice agent listens continuously — just talk'
            : micAvailable ? 'Hold to talk' : 'No microphone available in this browser'}
          {...holdHandlers}
        >
          {tier === 'agent' ? 'OPEN MIC' : listening ? 'LISTENING…' : 'HOLD TO TALK'}
        </button>
      </div>

      <div className="row between gap8 wrap" style={{ marginTop: 6 }}>
        <span className="src">
          Hold <strong>X</strong> anywhere on the surface to talk without opening this panel.
          {tier !== 'agent' && micAvailable && ' Release to send.'}
        </span>
        {listening && (
          <div className="row gap6" style={{ alignItems: 'center' }}>
            <span className="src">mic</span>
            <div style={{ width: 90, height: 6, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{
                width: `${Math.min(100, micLevel * 160)}%`,
                height: '100%',
                background: 'var(--lime)',
                transition: 'width 90ms linear',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ---- Honesty footer ------------------------------------------------ */}
      <div className="note info" style={{ marginTop: 12, fontSize: 12 }}>
        <div className="label" style={{ marginBottom: 3 }}>How this is wired</div>
        {diagnostic}
        <div style={{ marginTop: 6 }}>
          Every Mars fact MERV states comes from this project&rsquo;s own sourced knowledge base and
          carries its citation in the transcript. Every mission number he quotes is read live out of
          the simulation. He is written to refuse rather than estimate: if you ask something he has
          no source for, he says so.
          {tier === 'agent' && ' On this tier a hosted language model composes the wording, with the live telemetry in its prompt and functions that query the simulation for every figure. The wording is generated; the numbers are not.'}
        </div>
      </div>
    </Modal>
  )
}
