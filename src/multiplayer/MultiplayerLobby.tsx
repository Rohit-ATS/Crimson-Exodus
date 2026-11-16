import { useEffect, useState } from 'react'
import { Modal, Chip } from '../ui/components/kit'
import { useMultiplayer } from './client'
import { ROLE_CAPACITY, normalizeRoomCode } from './protocol'

export default function MultiplayerLobby({ onClose }: { onClose: () => void }) {
  const multiplayer = useMultiplayer()
  const [code, setCode] = useState('')

  useEffect(() => {
    if (multiplayer.status === 'connected' && (multiplayer.role === 'habcom' || multiplayer.role === 'ev2')) onClose()
  }, [multiplayer.role, multiplayer.status, onClose])

  const connected = multiplayer.status === 'connected'
  return (
    <Modal title="Crew link / multiplayer" onClose={onClose} width={760}>
      <div className="stack gap16">
        <div className="note info">
          Surface co-op for EV-1 and EV-2, plus up to {ROLE_CAPACITY.habcom} at HABCOM.
          Both astronauts can move independently on the same 3D terrain; EV-1 remains mission
          commander and owns shared procedures, science and life-support state.
        </div>

        <div className="row between gap8 wrap">
          <span className="src">
            You are <span className="mono cy">{multiplayer.callsign || 'unassigned'}</span> for this
            browser tab. No sign-up and no account: the id is random, temporary, and gone when you
            close the tab. It exists so the room can tell a reconnect from a new crew member.
          </span>
        </div>

        {connected ? (
          <div className="panel clipped" style={{ padding: 14 }}>
            <div className="row between gap12 wrap">
              <div>
                <div className="label">Mission code</div>
                <div className="display cy" style={{ fontSize: 34, letterSpacing: '0.22em' }}>{multiplayer.roomCode}</div>
              </div>
              <div className="stack gap6" style={{ alignItems: 'flex-end' }}>
                <Chip tone={multiplayer.peerConnected ? 'nominal' : 'caution'}>
                  {multiplayer.roster.length || 1} of {multiplayer.capacity} aboard
                </Chip>
                {multiplayer.roster.length > 0 && (
                  <div className="row gap4 wrap" style={{ justifyContent: 'flex-end' }}>
                    {multiplayer.roster.map((entry) => (
                      <span
                        key={entry.clientId}
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          padding: '2px 7px',
                          border: `1px solid ${entry.role === 'habcom' ? 'var(--line)' : 'var(--lime)'}`,
                          color: entry.you ? 'var(--cyan)' : 'var(--muted)',
                        }}
                      >
                        {entry.callsign} · {entry.role === 'ev' ? 'EV-1' : entry.role === 'ev2' ? 'EV-2' : 'HABCOM'}
                        {entry.you ? ' · you' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p style={{ marginTop: 10 }}>
              Share this code with EV-2 or HABCOM. EV-2 joins the 3D surface; HABCOM opens the
              operations console. Do not share account credentials or private Render URLs.
            </p>
            <div className="row gap8 wrap">
              <button className="btn" onClick={() => void navigator.clipboard?.writeText(multiplayer.roomCode ?? '')}>Copy code</button>
              <button className="btn ghost" onClick={multiplayer.leaveMission}>Close mission room</button>
            </div>
          </div>
        ) : (
          <div className="row gap16 wrap" style={{ alignItems: 'stretch' }}>
            <div className="panel clipped grow" style={{ flexBasis: 280, padding: 14 }}>
              <div className="display cy" style={{ fontSize: 14, marginBottom: 7 }}>EV-1 / host the EVA</div>
              <p>Create the room on the browser that will run the 3D mission. Single-player remains available if HABCOM never joins.</p>
              <button className="btn primary block" disabled={multiplayer.status === 'connecting'} onClick={multiplayer.createMission}>
                {multiplayer.status === 'connecting' ? 'Opening crew link…' : 'Create mission room'}
              </button>
              {multiplayer.resumableEvRoom && (
                <button className="btn ghost block" style={{ marginTop: 7 }} onClick={multiplayer.resumeMission}>
                  Resume EV-1 room {multiplayer.resumableEvRoom}
                </button>
              )}
            </div>
            <div className="panel clipped grow" style={{ flexBasis: 320, padding: 14 }}>
              <div className="display am" style={{ fontSize: 14, marginBottom: 7 }}>Join an existing mission</div>
              <p>
                EV-2 gets independent surface controls. HABCOM receives telemetry and operational
                controls without rendering the 3D scene.
              </p>
              <label className="label" htmlFor="mission-code">Six-character mission code</label>
              <input
                id="mission-code" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off"
                onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
                onKeyDown={(event) => { if (event.key === 'Enter') multiplayer.joinMission(code, 'ev2') }}
                style={{ width: '100%', margin: '6px 0 9px', padding: '10px 12px', background: '#05080d', border: '1px solid var(--line)', font: '20px var(--mono)', letterSpacing: '0.25em' }}
              />
              <div className="row gap8 wrap">
                <button className="btn primary grow" disabled={code.length !== 6 || multiplayer.status === 'connecting'} onClick={() => multiplayer.joinMission(code, 'ev2')}>
                  Join surface as EV-2
                </button>
                <button className="btn grow" disabled={code.length !== 6 || multiplayer.status === 'connecting'} onClick={() => multiplayer.joinMission(code, 'habcom')}>
                  Join as HABCOM
                </button>
              </div>
              {multiplayer.resumableEv2Room && (
                <button className="btn ghost block" style={{ marginTop: 7 }} onClick={multiplayer.resumeEv2}>
                  Resume EV-2 room {multiplayer.resumableEv2Room}
                </button>
              )}
              {multiplayer.resumableHabcomRoom && (
                <button className="btn ghost block" style={{ marginTop: 7 }} onClick={multiplayer.resumeHabcom}>
                  Resume HABCOM room {multiplayer.resumableHabcomRoom}
                </button>
              )}
            </div>
          </div>
        )}

        {multiplayer.error && <div className="note danger">{multiplayer.error}</div>}
        {multiplayer.status === 'unavailable' && (
          <div className="src">
            On GitHub Pages, set the repository Actions variable VITE_MULTIPLAYER_URL to your
            Render endpoint, for example wss://your-service.onrender.com/ws. Render-hosted builds
            discover their same-origin server automatically.
          </div>
        )}
      </div>
    </Modal>
  )
}
