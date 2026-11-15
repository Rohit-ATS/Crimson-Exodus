/**
 * ProcedureOverlay.tsx — What a button press looks like.
 *
 * When the player commits to a procedure, this takes over the screen and shows
 * the work being done: an animated schematic of the tool and the rock, the
 * cuff checklist ticking through its beats with the reason for each one, the
 * mission clock visibly compressed so the minutes being spent are obvious, and
 * the consumables draining while it happens.
 *
 * When it finishes it hands over to a result card carrying the real NASA image
 * of the same operation on Mars, what the step revealed, and one thing worth
 * remembering if you are ever standing on that surface.
 *
 * Everything in the schematic is computed from the procedure's progress, so the
 * animation and the checklist cannot drift apart.
 */

import { useEffect } from 'react'
import { useStore } from '../state/store'
import { activeBeat } from '../mission/activity'
import { img } from '../data/nasaGallery'
import { Chip, Meter } from './components/kit'
import { STATIONS } from '../mission/site'

const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
/** Remap a sub-window of the overall progress to 0-1. */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))

// ---------------------------------------------------------------------------
// Schematics. One per procedure kind, all pure functions of progress.
// ---------------------------------------------------------------------------

const ROCK = 'M 6 118 L 14 74 L 38 56 L 74 48 L 118 54 L 152 70 L 166 102 L 162 150 L 10 150 Z'

function RockFace({ patch = 0, bore = 0 }: { patch?: number; bore?: number }) {
  return (
    <>
      <path d={ROCK} fill="#3a2418" stroke="#6b4530" strokeWidth={1.2} />
      {/* Dust coating and oxidised rind, the thing being cut away */}
      <path d={ROCK} fill="url(#rind)" opacity={0.85} />
      {/* The abraded patch: grows, then brightens as it is blown clear */}
      {patch > 0 && (
        <>
          <circle cx={88} cy={96} r={26 * ease(clamp01(patch * 1.4))} fill="#9d8f7e" />
          <circle
            cx={88} cy={96}
            r={26 * ease(clamp01(patch * 1.4))}
            fill="url(#fresh)"
            opacity={clamp01(patch * 1.6)}
          />
          <circle
            cx={88} cy={96} r={26 * ease(clamp01(patch * 1.4))}
            fill="none" stroke="#d9c8b4" strokeWidth={0.9} opacity={0.8}
          />
        </>
      )}
      {bore > 0 && (
        <ellipse cx={122} cy={104} rx={5} ry={3.4} fill="#120a06" opacity={clamp01(bore * 2)} />
      )}
    </>
  )
}

function Defs() {
  return (
    <defs>
      <radialGradient id="fresh" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0%" stopColor="#cdbda8" />
        <stop offset="100%" stopColor="#8a7b69" />
      </radialGradient>
      <linearGradient id="rind" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8a4a28" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#5e2f1a" stopOpacity="0.95" />
      </linearGradient>
      <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#5a6472" />
        <stop offset="45%" stopColor="#c6d2e0" />
        <stop offset="100%" stopColor="#49525e" />
      </linearGradient>
      <linearGradient id="bronze" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#6d4e22" />
        <stop offset="45%" stopColor="#d6a954" />
        <stop offset="100%" stopColor="#6d4e22" />
      </linearGradient>
      <linearGradient id="core" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#a79482" />
        <stop offset="100%" stopColor="#6d5c4c" />
      </linearGradient>
    </defs>
  )
}

/** Dust and tailings thrown off the tool. Deterministic, so no React churn. */
function Fines({ n, p, cx, cy, spread = 44, tone = '#c9a177' }: {
  n: number; p: number; cx: number; cy: number; spread?: number; tone?: string
}) {
  if (p <= 0) return null
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 1.7
    // Each particle has its own phase so they do not pulse in unison.
    const t = ((p * 2.4 + i * 0.137) % 1)
    const r = t * spread
    out.push(
      <circle
        key={i}
        cx={cx + Math.cos(a) * r}
        cy={cy + Math.sin(a) * r * 0.55 - t * 10}
        r={2.3 * (1 - t) + 0.5}
        fill={tone}
        opacity={(1 - t) * 0.75 * clamp01(p * 3)}
      />,
    )
  }
  return <g>{out}</g>
}

function AbradeScene({ p }: { p: number }) {
  // The bit comes down, spins, cuts, then lifts for the gas puff.
  const down = seg(p, 0.02, 0.18)
  const cutting = seg(p, 0.16, 0.6)
  const gas = seg(p, 0.6, 0.84)
  const lift = seg(p, 0.84, 1)
  const y = 18 + ease(down) * 48 - ease(lift) * 44
  const spin = p * 2400
  return (
    <>
      <Defs />
      <RockFace patch={cutting} />
      <Fines n={16} p={cutting * (1 - gas)} cx={88} cy={92} />
      {/* Nitrogen puff: the gaseous Dust Removal Tool clearing the patch */}
      {gas > 0 && gas < 1 && (
        <>
          <Fines n={22} p={gas} cx={88} cy={92} spread={78} tone="#dfe9f2" />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M ${70 + i * 12} ${64} q ${6 - i * 3} ${14 + i * 4} ${2} ${26}`}
              stroke="#9fd8ff" strokeWidth={1.3} fill="none"
              opacity={0.65 * Math.sin(Math.PI * clamp01((gas * 3 - i * 0.5)))}
            />
          ))}
        </>
      )}
      {/* Tool: shaft, collar, abrading bit */}
      <g transform={`translate(88 ${y})`}>
        <rect x={-4.5} y={-74} width={9} height={62} fill="url(#steel)" />
        <rect x={-11} y={-16} width={22} height={9} fill="#2e3642" stroke="#7d8898" strokeWidth={0.7} />
        <g transform={`rotate(${spin})`}>
          <circle r={13} fill="url(#bronze)" stroke="#2a1d0b" strokeWidth={0.8} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={-1} y={-13} width={2} height={7} fill="#2a1d0b" transform={`rotate(${i * 60})`} />
          ))}
        </g>
      </g>
      <Label x={88} y={168} text={gas > 0 ? 'gDRT · N₂ PUFF' : cutting > 0 ? 'ROTARY PERCUSSIVE' : 'APPROACH'} />
    </>
  )
}

function LensScene({ p, sharp }: { p: number; sharp: boolean }) {
  const shade = seg(p, 0, 0.2)
  const focus = seg(p, 0.2, 0.5)
  const scan = seg(p, 0.4, 0.95)
  const lx = 60 + Math.sin(scan * Math.PI * 2.2) * 30
  const ly = 92 + Math.cos(scan * Math.PI * 1.6) * 14
  const blur = sharp ? (1 - ease(focus)) * 3.2 : 1.9
  return (
    <>
      <Defs />
      <filter id="soft"><feGaussianBlur stdDeviation={Math.max(0.01, blur)} /></filter>
      <RockFace patch={1} />
      {/* Jack's own shadow, put deliberately over the target */}
      <path d={ROCK} fill="#000" opacity={0.42 * ease(shade)} />
      {/* The texture that resolves as focus comes in */}
      <g filter="url(#soft)" opacity={clamp01(focus * 1.3)}>
        {Array.from({ length: 46 }, (_, i) => {
          const a = i * 2.39996
          const r = 24 * Math.sqrt(i / 46)
          return (
            <circle
              key={i}
              cx={88 + Math.cos(a) * r}
              cy={96 + Math.sin(a) * r}
              r={sharp ? 1.1 + (i % 4) * 0.45 : 2.4}
              fill={sharp ? (i % 3 === 0 ? '#e8dcc8' : '#8e7c67') : '#7a6450'}
            />
          )
        })}
      </g>
      {/* The loupe */}
      <g transform={`translate(${lx} ${ly})`}>
        <circle r={25} fill="#9fd8ff" opacity={0.07} />
        <circle r={25} fill="none" stroke="#4fe8ff" strokeWidth={1.6} />
        <circle r={25} fill="none" stroke="#4fe8ff" strokeWidth={6} opacity={0.12} />
        <line x1={-25} y1={0} x2={-13} y2={0} stroke="#4fe8ff" strokeWidth={0.9} />
        <line x1={13} y1={0} x2={25} y2={0} stroke="#4fe8ff" strokeWidth={0.9} />
        <line x1={0} y1={-25} x2={0} y2={-13} stroke="#4fe8ff" strokeWidth={0.9} />
        <line x1={0} y1={13} x2={0} y2={25} stroke="#4fe8ff" strokeWidth={0.9} />
        <rect x={-3} y={-56} width={6} height={32} fill="url(#steel)" />
      </g>
      <Label x={88} y={168} text={sharp ? `≈ 10x · ${(100).toFixed(0)} mm` : 'RIND INTACT · NO RESOLUTION'} />
    </>
  )
}

function RecordScene({ p }: { p: number }) {
  const lines = Math.floor(clamp01(p * 1.15) * 7)
  return (
    <>
      <Defs />
      <rect x={16} y={26} width={144} height={124} fill="#0a1016" stroke="#2b3a46" />
      <rect x={16} y={26} width={144} height={16} fill="#122230" />
      <text x={24} y={38} fill="#4fe8ff" fontSize={8} fontFamily="monospace" letterSpacing="1.5">FIELD LOG</text>
      {Array.from({ length: 7 }, (_, i) => {
        const on = i < lines
        const w = on ? [112, 96, 118, 74, 104, 88, 66][i] : 0
        return (
          <rect key={i} x={26} y={54 + i * 13} width={w} height={4}
            fill={i === lines - 1 ? '#ffb24a' : '#59707f'} opacity={on ? 1 : 0} />
        )
      })}
      {/* The cursor, blinking at a readable rate */}
      <rect
        x={26 + ([112, 96, 118, 74, 104, 88, 66][Math.min(6, lines)] ?? 0)}
        y={52 + Math.min(6, lines) * 13}
        width={5} height={8}
        fill="#ffb24a"
        opacity={p < 1 && Math.sin(p * 44) > 0 ? 1 : 0.15}
      />
      {/* The light-time clock: the reason this is your call and not Earth's */}
      <g transform="translate(88 150)">
        <circle r={0} fill="none" />
      </g>
      <Label x={88} y={168} text="COMMITTING TO THE RECORD" />
    </>
  )
}

function CoreScene({ p }: { p: number }) {
  const down = seg(p, 0.02, 0.16)
  const bore = seg(p, 0.14, 0.46)
  const brk = seg(p, 0.46, 0.6)
  const image = seg(p, 0.6, 0.78)
  const seal = seg(p, 0.8, 1)
  // Percussive jitter while it is actually cutting
  const jit = bore > 0 && brk === 0 ? Math.sin(p * 190) * 1.2 : 0
  const y = 14 + ease(down) * 44 + ease(bore) * 14 - ease(brk) * 10
  return (
    <>
      <Defs />
      <RockFace patch={1} bore={bore} />
      <Fines n={14} p={bore * (1 - brk)} cx={122} cy={100} tone="#b9966e" />
      <g transform={`translate(${122 + jit} ${y})`}>
        <rect x={-6} y={-78} width={12} height={64} fill="url(#steel)" />
        <rect x={-9} y={-18} width={18} height={14} fill="url(#bronze)" stroke="#2a1d0b" strokeWidth={0.7} />
        {/* The core filling the tube as it cuts */}
        <rect x={-3.2} y={-14 - 22 * ease(bore)} width={6.4} height={22 * ease(bore)} fill="url(#core)" />
      </g>
      {/* Tube on the right: volume assessment image, then the seal */}
      <g transform="translate(152 40)" opacity={clamp01(image * 2)}>
        <rect x={-9} y={0} width={18} height={56} fill="#111820" stroke="#4fe8ff" strokeWidth={1} />
        <rect x={-6} y={56 - 40 * ease(image)} width={12} height={40 * ease(image)} fill="url(#core)" />
        <rect x={-11} y={-7} width={22} height={8} fill={seal > 0.4 ? '#7dffb2' : '#2b3a46'} stroke="#4fe8ff" strokeWidth={0.8} />
        <text x={0} y={70} fill="#7b8794" fontSize={7} fontFamily="monospace" textAnchor="middle">
          {seal > 0.4 ? 'SEALED' : image > 0.2 ? 'VOL ASSESS' : ''}
        </text>
      </g>
      <Label x={88} y={168} text={seal > 0 ? 'HERMETIC SEAL' : brk > 0 ? 'CORE BREAK-OFF' : bore > 0 ? 'ROTARY PERCUSSIVE · 60 mm' : 'SEATING BIT'} />
    </>
  )
}

function CacheScene({ p }: { p: number }) {
  const open = seg(p, 0.02, 0.2)
  const bars = [seg(p, 0.2, 0.44), seg(p, 0.44, 0.66), seg(p, 0.62, 0.84), seg(p, 0.66, 0.88)]
  const names = ['O₂', 'CO₂', 'PWR', 'H₂O']
  return (
    <>
      <Defs />
      {/* Ground */}
      <rect x={0} y={132} width={176} height={38} fill="#3a2418" />
      {/* Crate */}
      <rect x={30} y={78} width={116} height={56} fill="#1b222b" stroke="#6d7a89" strokeWidth={1.2} />
      <g transform={`translate(88 78) rotate(${-ease(open) * 104}) translate(-88 -78)`}>
        <rect x={30} y={68} width={116} height={11} fill="#2a333f" stroke="#8d9aa9" strokeWidth={1.1} />
      </g>
      <rect x={30} y={78} width={116} height={6} fill="#ffb24a" opacity={0.25 * ease(open)} />
      {bars.map((b, i) => (
        <g key={i} transform={`translate(${42 + i * 27} 92)`} opacity={clamp01(open * 2)}>
          <rect x={0} y={0} width={14} height={34} fill="#0d141b" stroke="#3b4a58" strokeWidth={0.8} />
          <rect x={1.5} y={34 - 31 * ease(b)} width={11} height={31 * ease(b)}
            fill={b >= 1 ? '#7dffb2' : '#4fe8ff'} />
          <text x={7} y={44} fill="#7b8794" fontSize={7} fontFamily="monospace" textAnchor="middle">{names[i]}</text>
        </g>
      ))}
      <Label x={88} y={168} text="DEPOT ALPHA · SINGLE USE" />
    </>
  )
}

function FlagScene({ p }: { p: number }) {
  const probe = seg(p, 0, 0.24)
  const drive = seg(p, 0.24, 0.56)
  const spar = seg(p, 0.56, 0.82)
  const poleTop = 42
  const sunk = ease(drive) * 16
  return (
    <>
      <Defs />
      <rect x={0} y={128} width={176} height={42} fill="#3a2418" />
      <path d="M 0 128 q 44 -7 88 0 q 44 7 88 0 L 176 140 L 0 140 Z" fill="#4a2e1e" />
      <Fines n={10} p={probe * (1 - drive)} cx={70} cy={128} spread={20} />
      <Fines n={12} p={drive} cx={70} cy={128} spread={26} />
      {/* Pole */}
      <rect x={68} y={poleTop + 30 - sunk} width={4} height={100 - 30 + sunk} fill="url(#steel)" />
      {/* Horizontal spar, because 6 mbar will not hold a flag out */}
      <rect x={70} y={poleTop + 30 - sunk} width={52 * ease(spar)} height={2.6} fill="#9aa7b5" />
      {/* Flag: a plain cloth, the real one is a texture in the 3D scene */}
      <rect x={72} y={poleTop + 32 - sunk} width={50 * ease(spar)} height={30 * ease(spar)}
        fill="#243041" stroke="#6d7a89" strokeWidth={0.8} opacity={0.9} />
      <Label x={88} y={168} text={spar > 0 ? 'SPAR DEPLOYED · 6 mbar' : drive > 0 ? 'DRIVING POLE · 0.38 g' : 'PROBING REGOLITH'} />
    </>
  )
}

function ShelterScene({ p }: { p: number }) {
  const move = seg(p, 0, 0.34)
  const calm = seg(p, 0.3, 1)
  return (
    <>
      <Defs />
      <rect x={0} y={132} width={176} height={38} fill="#3a2418" />
      {/* Wind streaks, thinning as the boulder takes the flux */}
      {Array.from({ length: 9 }, (_, i) => {
        const yy = 36 + i * 10
        const t = ((p * 1.8 + i * 0.11) % 1)
        return (
          <line key={i}
            x1={-20 + t * 220} y1={yy} x2={14 + t * 220} y2={yy + 1.5}
            stroke="#c89a6c" strokeWidth={1.1}
            opacity={0.5 * (1 - ease(calm) * 0.82)} />
        )
      })}
      {/* Boulder */}
      <path d="M 96 132 L 100 92 L 118 76 L 142 82 L 152 110 L 150 132 Z" fill="#453024" stroke="#6b4530" strokeWidth={1.1} />
      {/* Jack, moving into the lee */}
      <g transform={`translate(${44 + ease(move) * 48} 0)`}>
        <rect x={38} y={100} width={11} height={24} rx={4} fill="#e6e9ee" stroke="#9aa7b5" strokeWidth={0.7} />
        <circle cx={43.5} cy={96} r={6} fill="#e6e9ee" stroke="#9aa7b5" strokeWidth={0.7} />
        <circle cx={45} cy={96} r={3.6} fill="#c9a24a" />
        <rect x={33} y={102} width={5} height={15} rx={2} fill="#cfd5dd" />
        <rect x={39} y={124} width={4} height={10} fill="#cfd5dd" />
        <rect x={45} y={124} width={4} height={10} fill="#cfd5dd" />
      </g>
      <Label x={88} y={168} text={calm > 0.5 ? 'IN THE LEE · RATE DOWN' : 'MOVING TO SHELTER'} />
    </>
  )
}

function PhotoScene({ p }: { p: number }) {
  const frame = seg(p, 0, 0.3)
  const geom = seg(p, 0.3, 0.62)
  const queue = seg(p, 0.82, 1)
  return (
    <>
      <Defs />
      {/* A Mars horizon, the thing being framed */}
      <rect x={0} y={0} width={176} height={104} fill="#7a4a2c" />
      <rect x={0} y={0} width={176} height={54} fill="#9c6a42" />
      <circle cx={132} cy={34} r={9} fill="#fff1d4" opacity={0.9} />
      <rect x={0} y={104} width={176} height={66} fill="#5a3722" />
      <path d="M 0 104 L 32 86 L 58 96 L 92 80 L 128 98 L 176 88 L 176 106 L 0 106 Z" fill="#4a2c1b" />
      {/* Viewfinder */}
      <g opacity={clamp01(frame * 2)}>
        {[[20, 20], [156, 20], [20, 150], [156, 150]].map(([x, y], i) => (
          <path key={i}
            d={`M ${x} ${y} h ${i % 2 ? -18 : 18} M ${x} ${y} v ${i < 2 ? 18 : -18}`}
            stroke="#4fe8ff" strokeWidth={2} fill="none" />
        ))}
        <line x1={88} y1={74} x2={88} y2={96} stroke="#4fe8ff" strokeWidth={1} opacity={0.6} />
        <line x1={77} y1={85} x2={99} y2={85} stroke="#4fe8ff" strokeWidth={1} opacity={0.6} />
      </g>
      {/* Sun angle annotation */}
      {geom > 0 && (
        <g opacity={clamp01(geom * 2)}>
          <line x1={132} y1={34} x2={92} y2={104} stroke="#ffb24a" strokeWidth={1} strokeDasharray="3 3" />
          <text x={100} y={62} fill="#ffb24a" fontSize={8} fontFamily="monospace">SUN EL/AZ</text>
        </g>
      )}
      {queue > 0 && (
        <rect x={20} y={158} width={136 * ease(queue)} height={3} fill="#7dffb2" />
      )}
      <Label x={88} y={168} text={queue > 0 ? 'QUEUED FOR DOWNLINK' : geom > 0 ? 'LOGGING GEOMETRY' : 'COMPOSING'} />
    </>
  )
}

function IngressScene({ p }: { p: number }) {
  const clean = seg(p, 0, 0.2)
  const inside = seg(p, 0.2, 0.46)
  const repress = seg(p, 0.46, 0.7)
  const helmet = seg(p, 0.7, 0.9)
  // 7 mbar outside to a habitable cabin. The needle is the whole story.
  const kPa = 0.7 + ease(repress) * 69.3
  const ang = -140 + (kPa / 101) * 280
  return (
    <>
      <Defs />
      <rect x={0} y={0} width={176} height={176} fill="#0a1016" />
      {/* Hull and hatch */}
      <rect x={14} y={14} width={148} height={148} fill="#1b2029" stroke="#6d7a89" strokeWidth={1.2} />
      <circle cx={88} cy={82} r={44} fill="#121820" stroke="#8d9aa9" strokeWidth={1.6} />
      <circle cx={88} cy={82} r={36} fill="#0c1218" stroke="#49525e" strokeWidth={1} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i}
          cx={88 + Math.cos((i / 6) * Math.PI * 2) * 40}
          cy={82 + Math.sin((i / 6) * Math.PI * 2) * 40}
          r={2.6} fill={inside > 0.5 ? '#7dffb2' : '#5d6873'} />
      ))}
      {/* Dust coming off during the clean-down */}
      <Fines n={18} p={clean * (1 - inside)} cx={88} cy={120} spread={52} />
      {/* Jack, moving through the hatch */}
      <g transform={`translate(88 ${118 - ease(inside) * 30}) scale(${1 - ease(inside) * 0.3})`} opacity={1 - ease(helmet) * 0.25}>
        <rect x={-7} y={-18} width={14} height={28} rx={5} fill="#e6e9ee" stroke="#9aa7b5" strokeWidth={0.7} />
        <circle cx={0} cy={-24} r={8} fill={helmet > 0.5 ? '#dfe4ea' : '#e6e9ee'} stroke="#9aa7b5" strokeWidth={0.7} />
        {helmet < 0.5 && <circle cx={2} cy={-24} r={5} fill="#c9a24a" />}
        <rect x={-10} y={-30} width={4} height={10} fill="#c8102e" opacity={0.85} />
      </g>
      {/* Pressure gauge */}
      <g transform="translate(38 140)">
        <circle r={22} fill="#0c1218" stroke="#49525e" strokeWidth={1.2} />
        {[-140, -70, 0, 70, 140].map((a) => (
          <line key={a}
            x1={Math.cos((a - 90) * Math.PI / 180) * 17}
            y1={Math.sin((a - 90) * Math.PI / 180) * 17}
            x2={Math.cos((a - 90) * Math.PI / 180) * 21}
            y2={Math.sin((a - 90) * Math.PI / 180) * 21}
            stroke="#5d6873" strokeWidth={1} />
        ))}
        {/* The Armstrong limit, marked, because it is the point */}
        <line
          x1={Math.cos((-140 + (6.3 / 101) * 280 - 90) * Math.PI / 180) * 13}
          y1={Math.sin((-140 + (6.3 / 101) * 280 - 90) * Math.PI / 180) * 13}
          x2={Math.cos((-140 + (6.3 / 101) * 280 - 90) * Math.PI / 180) * 21}
          y2={Math.sin((-140 + (6.3 / 101) * 280 - 90) * Math.PI / 180) * 21}
          stroke="#ff4d4d" strokeWidth={1.6} />
        <line x1={0} y1={0}
          x2={Math.cos((ang - 90) * Math.PI / 180) * 17}
          y2={Math.sin((ang - 90) * Math.PI / 180) * 17}
          stroke="#4fe8ff" strokeWidth={1.8} />
        <circle r={2.2} fill="#4fe8ff" />
      </g>
      <text x={38} y={170} fill="#4fe8ff" fontSize={8} fontFamily="monospace" textAnchor="middle">
        {kPa < 2 ? '0.7 kPa' : `${kPa.toFixed(0)} kPa`}
      </text>
      <Label x={116} y={170} text={helmet > 0 ? 'HELMET OFF' : repress > 0 ? 'REPRESSURISING' : inside > 0 ? 'AIRLOCK' : 'CLEAN DOWN'} />
    </>
  )
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} fill="#7b8794" fontSize={8} fontFamily="monospace" letterSpacing="1.6" textAnchor="middle">
      {text}
    </text>
  )
}

function Schematic({ kind, p, sharp }: { kind: string; p: number; sharp: boolean }) {
  return (
    <svg
      viewBox="0 0 176 176"
      style={{ width: '100%', aspectRatio: '1', display: 'block', background: 'radial-gradient(circle at 50% 36%, #141c24, #060a0e 72%)' }}
    >
      {kind === 'abrade' && <AbradeScene p={p} />}
      {kind === 'lens' && <LensScene p={p} sharp={sharp} />}
      {kind === 'record' && <RecordScene p={p} />}
      {kind === 'core' && <CoreScene p={p} />}
      {kind === 'cache' && <CacheScene p={p} />}
      {kind === 'flag' && <FlagScene p={p} />}
      {kind === 'shelter' && <ShelterScene p={p} />}
      {kind === 'photo' && <PhotoScene p={p} />}
      {kind === 'ingress' && <IngressScene p={p} />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------

export default function ProcedureOverlay() {
  const s = useStore()
  const proc = s.proc

  useEffect(() => {
    if (!proc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (proc.complete && (e.key === 'Enter' || e.key === ' '))) {
        e.preventDefault()
        useStore.getState().dismissProcedure()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [proc?.complete, !!proc])

  if (!proc) return null
  const { def, progress, complete } = proc
  const bi = activeBeat(def, progress)
  const spentMin = (s.time.evaSec - proc.startEvaSec) / 60
  const compression = Math.round((def.minutes * 60) / def.realSec)
  const sharp = def.resultTitle !== 'Little resolved'

  const dO2 = Math.max(0, proc.startFrac.o2 - s.frac.o2)
  const dBat = Math.max(0, proc.startFrac.battery - s.frac.battery)

  const station = STATIONS.find((x) => x.id === (proc.commit.type === 'abrade' || proc.commit.type === 'lens' || proc.commit.type === 'core' || proc.commit.type === 'record' ? proc.commit.stationId : ''))

  return (
    <div
      className="screen center"
      style={{
        background: 'rgba(2,4,8,0.9)',
        backdropFilter: 'blur(6px)',
        zIndex: 80,
        padding: 18,
        animation: 'fadeUp 0.16s ease-out',
      }}
    >
      <div
        className="panel clipped brackets stack"
        style={{ width: 'min(100%, 1040px)', maxHeight: '92vh' }}
      >
        <div className="panel-head">
          <h3>{complete ? def.resultTitle : def.title}</h3>
          <span className="row gap8 wrap" style={{ justifyContent: 'flex-end' }}>
            {!complete && (
              <Chip tone="caution">mission clock ×{compression}</Chip>
            )}
            <Chip tone={complete ? 'nominal' : 'info'}>
              {complete ? 'procedure complete' : `${(progress * 100).toFixed(0)}%`}
            </Chip>
          </span>
        </div>

        <div className="panel-body scroll grow">
          {!complete ? (
            <RunningView
              def={def} progress={progress} bi={bi} sharp={sharp}
              spentMin={spentMin} dO2={dO2} dBat={dBat}
              o2={s.frac.o2} bat={s.frac.battery}
              marginMin={s.ret.marginMinutes}
            />
          ) : (
            <ResultView def={def} spentMin={spentMin} dO2={dO2} dBat={dBat} stationReveal={revealFor(proc, station)} />
          )}
        </div>

        <div className="panel-head" style={{ borderBottom: 0, borderTop: '1px solid var(--line-soft)' }}>
          {complete ? (
            <>
              <span className="src">
                {proc.def.minutes} min of mission time spent, {spentMin.toFixed(1)} min on the clock.
                The clock did not stop while you worked.
              </span>
              <button className="btn primary" onClick={() => s.dismissProcedure()}>
                Continue [Enter]
              </button>
            </>
          ) : (
            <>
              <span className="src">
                Step {bi + 1} of {def.beats.length} &middot; {def.beats[bi].meter ?? ''}
              </span>
              <button className="btn ghost sm" onClick={() => s.dismissProcedure()}>
                Abandon [Esc]
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** What the procedure revealed about this particular rock, if anything. */
function revealFor(proc: NonNullable<ReturnType<typeof useStore.getState>['proc']>, station?: (typeof STATIONS)[number]): string | null {
  if (!station) return null
  if (proc.def.kind === 'abrade') return station.abradeReveal
  if (proc.def.kind === 'lens') return proc.def.resultTitle === 'Little resolved'
    ? 'Through the dust coating and the oxidised rind, very little resolved. Clearing the rind first is what makes a lens worth the minutes.'
    : station.lensReveal
  return null
}

function RunningView({
  def, progress, bi, sharp, spentMin, dO2, dBat, o2, bat, marginMin,
}: {
  def: NonNullable<ReturnType<typeof useStore.getState>['proc']>['def']
  progress: number; bi: number; sharp: boolean; spentMin: number
  dO2: number; dBat: number; o2: number; bat: number; marginMin: number
}) {
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(220px, 300px) 1fr', alignItems: 'start' }}>
      <div className="stack gap8">
        <div style={{ border: '1px solid var(--line)', position: 'relative' }} className="scanlines">
          <Schematic kind={def.kind} p={progress} sharp={sharp} />
        </div>
        <div className="src">{def.subtitle}</div>
        <div>
          <Meter value={progress} tone="var(--cyan)" height={10} />
          <div className="row between" style={{ marginTop: 4 }}>
            <span className="src">{spentMin.toFixed(1)} min spent</span>
            <span className="src">{def.minutes} min budgeted</span>
          </div>
        </div>
        <div className="kv" style={{ fontSize: 11 }}>
          <dt>O&#8322; used</dt><dd>{(dO2 * 100).toFixed(1)}%</dd>
          <dt>O&#8322; left</dt><dd style={{ color: o2 < 0.3 ? 'var(--amber)' : undefined }}>{(o2 * 100).toFixed(0)}%</dd>
          <dt>Battery used</dt><dd>{(dBat * 100).toFixed(1)}%</dd>
          <dt>Battery left</dt><dd>{(bat * 100).toFixed(0)}%</dd>
          <dt>Return margin</dt>
          <dd style={{ color: marginMin < 10 ? 'var(--red)' : marginMin < 25 ? 'var(--amber)' : 'var(--lime)' }}>
            {marginMin.toFixed(0)} min
          </dd>
        </div>
      </div>

      <div className="stack gap6">
        <div className="label">Cuff checklist</div>
        {def.beats.map((b, i) => {
          const done = i < bi
          const active = i === bi
          return (
            <div
              key={b.label}
              style={{
                border: `1px solid ${active ? 'rgba(79,232,255,0.45)' : 'var(--line-soft)'}`,
                borderLeft: `3px solid ${done ? 'var(--lime)' : active ? 'var(--cyan)' : 'var(--faint)'}`,
                background: active ? 'rgba(79,232,255,0.07)' : done ? 'rgba(125,255,178,0.035)' : 'transparent',
                padding: '7px 11px',
                transition: 'background 0.25s, border-color 0.25s',
                opacity: !done && !active ? 0.45 : 1,
              }}
            >
              <div className="row gap8" style={{ alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 11, color: done ? 'var(--lime)' : active ? 'var(--cyan)' : 'var(--faint)', width: 14 }}>
                  {done ? '✓' : i + 1}
                </span>
                <span style={{ fontSize: 13.5, color: active ? 'var(--text)' : 'var(--muted)' }}>{b.label}</span>
                {active && b.meter && (
                  <span className="mono am" style={{ fontSize: 10, marginLeft: 'auto', letterSpacing: '0.1em' }}>
                    {b.meter}
                  </span>
                )}
              </div>
              {(active || done) && (
                <div className="src" style={{ marginTop: 3, lineHeight: 1.55, color: active ? '#cfe3d6' : undefined }}>
                  {b.detail}
                </div>
              )}
            </div>
          )
        })}
        <div className="note" style={{ fontSize: 12, marginTop: 2 }}>
          The mission clock is running compressed so that the {def.minutes} minute{def.minutes === 1 ? '' : 's'} this
          costs are actually charged against your oxygen, your battery and your walk home. Nothing here is free.
        </div>
      </div>
    </div>
  )
}

function ResultView({
  def, spentMin, dO2, dBat, stationReveal,
}: {
  def: NonNullable<ReturnType<typeof useStore.getState>['proc']>['def']
  spentMin: number; dO2: number; dBat: number; stationReveal: string | null
}) {
  const images = def.images.map(img).filter(Boolean)
  return (
    <div className="stack gap12">
      {stationReveal && (
        <div className="note info" style={{ fontSize: 13.5 }}>
          <div className="label" style={{ marginBottom: 3 }}>What you found</div>
          {stationReveal}
        </div>
      )}

      {images.length > 0 && (
        <div>
          <div className="row between gap8 wrap" style={{ marginBottom: 5 }}>
            <span className="label">The same operation, on Mars, for real</span>
            <span className="tag real">NASA observation</span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))` }}>
            {images.map((im) => (
              <figure key={im!.id} style={{ margin: 0 }}>
                <a href={im!.url} target="_blank" rel="noreferrer" style={{ display: 'block', position: 'relative' }}>
                  <img
                    src={im!.file}
                    alt={`${im!.title}, ${im!.instrument}`}
                    loading="lazy"
                    style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block', border: '1px solid var(--line)' }}
                  />
                  <span
                    className="mono"
                    style={{
                      position: 'absolute', right: 0, bottom: 0, fontSize: 9, padding: '2px 5px',
                      background: 'rgba(5,8,13,0.82)', color: '#e8eef5',
                    }}
                  >
                    {im!.id} &middot; {im!.credit}
                  </span>
                </a>
                <figcaption className="src" style={{ marginTop: 4, lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--text)' }}>{im!.title}</span> &middot; {im!.instrument} &middot; {im!.date}
                  <br />{im!.caption}
                  {im!.teaches && (
                    <><br /><span className="cy">{im!.teaches}</span></>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          border: '1px solid rgba(255,178,74,0.45)',
          borderLeft: '3px solid var(--amber)',
          background: 'rgba(255,178,74,0.06)',
          padding: '11px 13px',
        }}
      >
        <div className="row between gap8 wrap">
          <span className="display am" style={{ fontSize: 11 }}>SURVIVAL NOTE</span>
          <span className="src">added to your field guide</span>
        </div>
        <div style={{ fontSize: 15, marginTop: 4, color: 'var(--text)' }}>{def.lesson.headline}</div>
        <p style={{ fontSize: 13, marginTop: 5, lineHeight: 1.6 }}>{def.lesson.body}</p>
        <div className="src" style={{ marginTop: 4 }}>Source: {def.lesson.source}</div>
      </div>

      <div className="kv" style={{ fontSize: 11 }}>
        <dt>Mission time spent</dt><dd>{spentMin.toFixed(1)} min</dd>
        <dt>Oxygen spent</dt><dd>{(dO2 * 100).toFixed(1)}% of the load</dd>
        <dt>Battery spent</dt><dd>{(dBat * 100).toFixed(1)}% of the load</dd>
      </div>
    </div>
  )
}
