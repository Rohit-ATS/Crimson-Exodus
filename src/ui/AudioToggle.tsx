import { useEffect, useState } from 'react'
import { marsAudio } from '../sim/audio'
import { useStore } from '../state/store'

/**
 * Audio is off until the player asks for it, because browsers refuse to start
 * an AudioContext without a user gesture and because a demo in a quiet room
 * should not start making noise on its own.
 */
export default function AudioToggle() {
  const [on, setOn] = useState(false)
  const [failed, setFailed] = useState(false)
  const env = useStore((st) => st.env)

  useEffect(() => () => { marsAudio.setMuted(true) }, [])

  const toggle = async () => {
    if (!on) {
      const ok = await marsAudio.start()
      if (!ok) { setFailed(true); return }
      marsAudio.setMuted(false)
      setOn(true)
      useStore.getState().pushLog('info',
        `Helmet audio on. What you hear outside the visor is modelled on what Perseverance's ` +
        `microphones actually recorded: sound on Mars is about 20 dB fainter than on Earth because ` +
        `intensity scales with air density, it travels at roughly ${env.speedOfSoundMs.toFixed(0)} m/s ` +
        `instead of 343, and CO₂ at this pressure absorbs the high frequencies so hard that distant ` +
        `sources lose their treble entirely. The suit fan and your own breathing are loud by comparison, ` +
        `because inside the helmet you are in Earth-pressure air.`)
    } else {
      marsAudio.setMuted(true)
      setOn(false)
    }
  }

  return (
    <button
      className={`btn sm ${on ? 'on' : 'ghost'}`}
      style={{ padding: '2px 6px', fontSize: 9 }}
      onClick={toggle}
      title={failed
        ? 'Audio is unavailable in this browser'
        : 'Procedurally synthesised, modelled on the real acoustics of the Martian surface'}
      disabled={failed}
    >
      {failed ? 'NO AUDIO' : on ? 'SOUND ON' : 'SOUND OFF'}
    </button>
  )
}
