import { Chip, Modal, Tag } from '../components/kit'
import { PROVENANCE } from '../../mission/site'
import { useStore } from '../../state/store'

/** Full provenance, limits and AI disclosure. Reachable from every screen. */
export default function DataPanel({ onClose }: { onClose: () => void }) {
  const link = useStore((s) => s.link)
  return (
    <Modal title="Data details, limits and disclosure" onClose={onClose} width={960}>
      <div className="row gap8 wrap" style={{ marginBottom: 12 }}>
        <Tag kind="real" /><Tag kind="model" /><Tag kind="synth" /><Tag kind="game" />
        <span className="src" style={{ flex: 1, minWidth: 240 }}>
          Every figure in this app carries one of these four labels. Nothing is presented as a
          measurement unless it is one.
        </span>
      </div>

      <div className="note danger" style={{ fontSize: 13.5, marginBottom: 14 }}>
        <div className="display rd" style={{ fontSize: 11, marginBottom: 5 }}>THE ONE THING TO TAKE AWAY</div>
        This is a prototype and an educational planning interface. It is not an operationally
        safe route planner for real astronauts and must not be used as one. The best global
        orbital basemap it can fetch is around 326 m per pixel; the whole traverse area is a
        few pixels across on it. Nothing at that resolution &mdash; and in truth, nothing at any
        orbital resolution &mdash; can certify that a human can safely place a boot on a given
        square metre of Mars. The terrain you walk here is synthetic; the real-site map (N, or
        from the planner) shows the real ground at traverse scale from the HiRISE elevation model
        and imagery. The hazard shading is a planning cue. The suit is a game mechanic.
      </div>

      <div className="stack gap10" style={{ marginBottom: 16 }}>
        {PROVENANCE.map((p) => (
          <div key={p.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 11 }}>
            <div className="row between gap8 wrap">
              <span className="mono cy" style={{ fontSize: 13 }}>{p.label}</span>
              <Chip tone={p.kind === 'synthetic' ? 'warning' : p.kind === 'model' ? 'caution' : 'nominal'}>
                {p.kind}
              </Chip>
            </div>
            <div className="src">{p.instrument} &middot; {p.source} &middot; {p.date} &middot; {p.resolution}</div>
            <p style={{ fontSize: 13, marginTop: 4 }}>{p.caveat}</p>
            {p.url && <div className="src"><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></div>}
          </div>
        ))}
      </div>

      <h4 className="display cy" style={{ fontSize: 12 }}>What is genuinely accurate right now</h4>
      <ul style={{ fontSize: 13 }}>
        <li>
          The Earth&ndash;Mars distance ({link.distanceAu.toFixed(4)} AU) and the resulting one-way
          light time, from JPL's approximate planetary positions. Error well under 1%.
        </li>
        <li>
          The Mars season (solar longitude Ls), the Mars Sol Date, the mission sol at Jezero,
          and the local true solar time, from the Allison &amp; McEwen algorithm as published by
          NASA GISS for Mars24.
        </li>
        <li>
          The solar elevation and azimuth at Jezero, which light both the 3D scene and the
          map's hillshade.
        </li>
        <li>
          The atmospheric composition, the surface gravity, and the physical consequences drawn
          from them: air density, speed of sound, the boiling point of water, and the ratio
          between a Martian gust and its Earth equivalent.
        </li>
        <li>
          The geology in every station briefing, which is the published Perseverance result,
          with the real feature named.
        </li>
      </ul>

      <h4 className="display am" style={{ fontSize: 12, marginTop: 12 }}>What is modelled, not measured</h4>
      <ul style={{ fontSize: 13 }}>
        <li>Temperature, pressure, wind and dust opacity: a parameterised climatology whose ranges are anchored to MEDA observations at Jezero. Not a forecast and not telemetry playback.</li>
        <li>Dust-storm and dust-devil timing: a deterministic schedule weighted by the real seasonal dust climatology for the current Ls.</li>
        <li>Visibility, from column optical depth via Koschmieder's relation.</li>
        <li>Solar particle events: whether one happens and when is a game schedule; its total dose is scaled to the largest event Curiosity RAD has measured on the surface (May 2024), compressed into EVA minutes. The cosmic-ray background itself is the RAD measurement.</li>
      </ul>

      <h4 className="display" style={{ fontSize: 12, marginTop: 12, color: 'var(--magenta)' }}>What is invented</h4>
      <ul style={{ fontSize: 13 }}>
        <li>The metre-scale terrain, shaped to the published large-scale morphology of the delta front but not resampled from any NASA DEM.</li>
        <li>Station positions inside the 2.4 km box.</li>
        <li>The suit, its consumable capacities and all consumption rates. No certified Mars surface EVA suit exists.</li>
        <li>The lander. It is not any announced NASA vehicle.</li>
        <li>The hazard weights and the scoring.</li>
      </ul>

      <h4 className="display cy" style={{ fontSize: 12, marginTop: 14 }}>AI use disclosure</h4>
      <p style={{ fontSize: 13 }}>
        This project was built with AI assistance (Anthropic Claude) for code authoring,
        simulation design and copy. No AI-generated images, video or audio are used anywhere in
        the app. Every visual asset is either (a) NASA imagery &mdash; live Mars Trek tiles, the
        CRISM browse map and Perseverance photographs &mdash; credited on the image itself, or
        (b) generated procedurally at runtime by the code in this
        repository &mdash; the terrain, the astronaut, the lander, the sky and the dust are all
        geometry and shaders, not generated art. National flag images are fetched from
        flagcdn.com. There is therefore no AI-generated imagery requiring a watermark.
      </p>

      <h4 className="display cy" style={{ fontSize: 12, marginTop: 12 }}>Credits and links</h4>
      <ul style={{ fontSize: 13 }}>
        <li><a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">NASA Mars Trek</a> &mdash; orbital basemap tiles, used live</li>
        <li><a href="https://science.nasa.gov/mission/mars-2020-perseverance/" target="_blank" rel="noreferrer">NASA Mars 2020 Perseverance</a> &mdash; Jezero geology and MEDA environment</li>
        <li><a href="https://science.nasa.gov/mars/facts/" target="_blank" rel="noreferrer">NASA Mars facts</a> &mdash; composition, gravity, pressure, temperature range</li>
        <li><a href="https://ssd.jpl.nasa.gov/planets/approx_pos.html" target="_blank" rel="noreferrer">JPL approximate planetary positions</a> &mdash; the light-time geometry</li>
        <li><a href="https://www.giss.nasa.gov/tools/mars24/help/algorithm.html" target="_blank" rel="noreferrer">NASA GISS Mars24 algorithm</a> &mdash; Mars timekeeping</li>
        <li><a href="https://www.uahirise.org/" target="_blank" rel="noreferrer">HiRISE</a> &mdash; the resolution limit discussed above</li>
        <li><a href="https://doi.org/10.1126/science.1244797" target="_blank" rel="noreferrer">Hassler et al. 2014, Curiosity RAD</a> &mdash; the surface radiation environment</li>
        <li><a href="https://www.nasa.gov/missions/maven/nasa-watches-mars-light-up-during-epic-solar-storm/" target="_blank" rel="noreferrer">NASA, May 2024 solar storm at Mars</a> &mdash; the 8.1 mGy RAD surface dose the SEP event is scaled to</li>
        <li><a href="https://doi.org/10.5066/P9REJ9JN" target="_blank" rel="noreferrer">Fergason et al. 2020, USGS</a> &mdash; Mars 2020 HiRISE DTM and orthomosaic of Jezero</li>
        <li><a href="https://pds-geosciences.wustl.edu/" target="_blank" rel="noreferrer">PDS Geosciences Node</a> &mdash; CRISM observation FRT00005C5E</li>
        <li><a href="https://science.nasa.gov/photojournal/" target="_blank" rel="noreferrer">NASA Photojournal</a> &mdash; Perseverance images PIA24802, PIA24814, PIA25672, PIA26368, PIA24816, PIA25023; CRISM map PIA23380</li>
      </ul>
    </Modal>
  )
}
