import { useMemo, useState } from 'react'
import { Modal, Tag } from '../components/kit'
import { useStore } from '../../state/store'
import { ALL_FLAGS, OST_NOTE, flagUrl, type Country } from '../../data/countries'

/**
 * Flag selection.
 *
 * The list is every ISO 3166-1 alpha-2 entry plus the United Nations and
 * European Union banners. Flag images are fetched live from flagcdn.com, a
 * public CDN of public-domain flag renderings; where an image cannot load, the
 * regional-indicator emoji stands in and the row says so, so nothing on screen
 * can be mistaken for a flag it is not.
 */
export default function FlagPicker({
  onPlant,
  onClose,
  pos,
  nearStation,
}: {
  onPlant?: (code: string, name: string) => void
  onClose?: () => void
  pos?: { x: number; z: number }
  nearStation?: string | null
} = {}) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Country | null>(null)
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  const close = () => {
    if (onClose) onClose()
    else s.setUi(null)
  }

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return ALL_FLAGS
    return ALL_FLAGS.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.code.includes(needle),
    )
  }, [q])

  const plant = () => {
    if (!sel) return
    if (onPlant) {
      onPlant(sel.code, sel.name)
      close()
    } else {
      s.beginFlag(sel.code)
      s.setUi(null)
    }
  }

  return (
    <Modal
      title="Commemorative flag emplacement"
      onClose={close}
      width={960}
      footer={
        <div className="row between gap12 wrap" style={{ width: '100%' }}>
          <span className="src" style={{ maxWidth: 560, lineHeight: 1.5 }}>{OST_NOTE}</span>
          <div className="row gap8">
            <button className="btn ghost sm" onClick={close}>Cancel</button>
            <button className="btn primary" onClick={plant} disabled={!sel}>
              {sel ? `Plant the flag of ${sel.name}` : 'Choose a flag'}
            </button>
          </div>
        </div>
      }
    >
      <div className="row gap16 wrap" style={{ alignItems: 'flex-start' }}>
        {/* Preview */}
        <div className="stack gap8" style={{ width: 290, flex: '0 0 290px' }}>
          <div
            className="panel"
            style={{
              height: 196, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(180deg, #2a160e, #100906)', overflow: 'hidden', position: 'relative',
            }}
          >
            {sel ? (
              failed[sel.code] ? (
                <div className="center stack" style={{ gap: 8 }}>
                  <span style={{ fontSize: 62 }}>{sel.emoji}</span>
                  <span className="src am">image unavailable &mdash; emoji stand-in</span>
                </div>
              ) : (
                <img
                  src={flagUrl(sel.code, 320)}
                  alt={`Flag of ${sel.name}`}
                  onError={() => setFailed((f) => ({ ...f, [sel.code]: true }))}
                  style={{
                    maxWidth: '86%', maxHeight: '78%',
                    boxShadow: '0 10px 32px rgba(0,0,0,0.7)',
                    border: '1px solid rgba(255,255,255,0.14)',
                  }}
                />
              )
            ) : (
              <span className="faint mono" style={{ fontSize: 12 }}>select a flag</span>
            )}
            <div className="scanlines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          </div>

          <div className="panel" style={{ padding: 10 }}>
            <div className="label" style={{ marginBottom: 4 }}>Emplacement</div>
            <div className="mono" style={{ fontSize: 12 }}>
              {(pos?.x ?? s.jackX).toFixed(0)} E &nbsp; {(pos?.z ?? s.jackZ).toFixed(0)} N &nbsp;(m, local)
            </div>
            <div className="src" style={{ marginTop: 3 }}>
              {(nearStation ?? s.nearStation) ? `at ${(nearStation ?? s.nearStation)!.toUpperCase()}` : 'open ground'} &middot; EVA +
              {(s.time.evaSec / 60).toFixed(0)} min &middot; LTST {s.clock.ltstHours.toFixed(2)} h
            </div>
            <div className="src" style={{ marginTop: 6 }}>
              The flag hangs from a crossbar. At {s.env.densityKgM3.toFixed(4)} kg/m&sup3; the air
              here cannot hold a flag out &mdash; a {s.env.gustMs.toFixed(0)} m/s Martian gust pushes
              about as hard as a {s.env.windEarthEquivMs.toFixed(1)} m/s breeze on Earth. Apollo
              solved the same problem the same way.
            </div>
            <div style={{ marginTop: 7 }}><Tag kind="real" /></div>
          </div>

          <div className="src">
            Flag images: flagcdn.com, public domain renderings keyed to ISO 3166-1. Not NASA data.
          </div>
        </div>

        {/* List */}
        <div className="stack gap8 grow" style={{ minWidth: 300 }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${ALL_FLAGS.length} flags…`}
            className="mono"
            style={{
              background: 'rgba(5,9,15,0.9)',
              border: '1px solid var(--line)',
              padding: '9px 12px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <div
            className="scroll"
            style={{
              maxHeight: 360,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(188px, 1fr))',
              gap: 5,
              paddingRight: 4,
            }}
          >
            {list.map((c) => (
              <button
                key={c.code}
                onClick={() => setSel(c)}
                className="row gap8"
                style={{
                  alignItems: 'center',
                  background: sel?.code === c.code ? 'rgba(79,232,255,0.14)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${sel?.code === c.code ? 'var(--cyan)' : 'transparent'}`,
                  padding: '5px 8px',
                  textAlign: 'left',
                }}
              >
                {failed[c.code] ? (
                  <span style={{ fontSize: 17, width: 30, textAlign: 'center' }}>{c.emoji}</span>
                ) : (
                  <img
                    src={flagUrl(c.code, 40)}
                    alt=""
                    loading="lazy"
                    onError={() => setFailed((f) => ({ ...f, [c.code]: true }))}
                    style={{ width: 30, height: 20, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                )}
                <span style={{ fontSize: 13, lineHeight: 1.2 }}>{c.name}</span>
              </button>
            ))}
            {list.length === 0 && (
              <span className="faint mono" style={{ fontSize: 12 }}>no match</span>
            )}
          </div>
          <div className="src">{list.length} of {ALL_FLAGS.length} shown</div>
        </div>
      </div>
    </Modal>
  )
}
