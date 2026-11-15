import { useState } from 'react'
import type { RoverImage } from '../../data/realSite'

/** A real NASA image with its credit on the image, as Space Apps asks. */
export default function RoverImageCard({ image, compact = false }: { image: RoverImage; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <figure style={{ margin: '0 0 8px' }}>
      <a href={image.url} target="_blank" rel="noreferrer" style={{ display: 'block', position: 'relative' }}>
        <img
          src={image.file}
          alt={`${image.title}, ${image.instrument}`}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', maxHeight: compact ? 150 : 230, objectFit: 'cover', display: 'block', border: '1px solid var(--line)' }}
        />
        <span
          className="mono"
          style={{
            position: 'absolute', right: 0, bottom: 0, fontSize: 9, padding: '2px 5px',
            background: 'rgba(5,8,13,0.78)', color: '#e8eef5',
          }}
        >
          {image.id} &middot; {image.credit}
        </span>
      </a>
      <figcaption className="src" style={{ marginTop: 3, lineHeight: 1.4 }}>
        <span style={{ color: 'var(--text)' }}>{image.title}</span> &middot; {image.instrument} &middot; {image.date}
        {!compact && <><br />{image.caption}</>}
      </figcaption>
    </figure>
  )
}
