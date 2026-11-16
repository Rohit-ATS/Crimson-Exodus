import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LinearPcmStream } from '../src/ai/voice.ts'

function wav(samples: number[]): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 24_000, true)
  view.setUint32(28, 48_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true))
  return bytes
}

describe('Deepgram linear16 decoding', () => {
  it('skips a RIFF/WAVE header split across network chunks', () => {
    const decoder = new LinearPcmStream()
    const body = wav([-32768, 0, 32767])
    const decoded: number[] = []

    for (const [from, to] of [[0, 1], [1, 11], [11, 43], [43, 45], [45, 47], [47, 50]]) {
      const pcm = decoder.push(body.subarray(from, to))
      if (pcm) decoded.push(...pcm)
    }

    assert.deepEqual(decoded, [-32768, 0, 32767])
  })

  it('carries an odd byte across bare PCM chunk boundaries', () => {
    const decoder = new LinearPcmStream()
    const first = decoder.push(new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0xff]))
    const second = decoder.push(new Uint8Array([0xff]))

    assert.deepEqual(first && [...first], [-32768, 32767])
    assert.deepEqual(second && [...second], [-1])
  })
})
