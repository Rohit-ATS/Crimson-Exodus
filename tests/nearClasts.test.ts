import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const source = readFileSync('src/three/NearClasts.tsx', 'utf8')

describe('NearClasts instance lifecycle', () => {
  it('keeps the material stable while dust changes', () => {
    const materialBlock = source.match(
      /const material = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[\]\)/,
    )?.[0] ?? ''
    assert.match(materialBlock, /new THREE\.MeshStandardMaterial/)
    assert.doesNotMatch(materialBlock, /\[dust\]/)
    assert.match(source, /material\.color\.copy\(base\)\.lerp\(dusty,/)
  })

  it('invalidates cached matrices if R3F ever replaces the mesh', () => {
    assert.match(source, /if \(lastMesh\.current !== im\)/)
    assert.match(source, /origin\.current = \[NaN, NaN\]/)
    assert.match(source, /halfRef\.current = 0/)
  })
})
