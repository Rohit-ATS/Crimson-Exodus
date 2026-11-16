import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QUIPS, TOPICS, findTopic, scoreTopic } from '../src/ai/knowledge.ts'

describe('MERV knowledge base', () => {
  it('sources every single entry', () => {
    for (const t of TOPICS) {
      assert.ok(t.source && t.source.length > 8, `${t.id} has no usable source`)
      assert.ok(t.answer.length > 120, `${t.id} answer is too thin to be worth saying`)
    }
  })

  it('has no duplicate ids', () => {
    const ids = TOPICS.map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('writes answers to be spoken, not rendered', () => {
    // These go through a text-to-speech engine as often as they go on screen.
    for (const t of TOPICS) {
      assert.doesNotMatch(t.answer, /[*_`#]|\n- /, `${t.id} contains markup`)
    }
  })

  it('routes the questions a first-time player actually asks', () => {
    const expected: Array<[string, string]> = [
      ['can I breathe the air', 'atmosphere'],
      ['what happens if my helmet comes off', 'pressure'],
      ['how cold does it get', 'temperature'],
      ['why do I need to abrade the rock first', 'rind'],
      ['is there water here', 'water'],
      ['how much radiation', 'radiation'],
      ['which way is north', 'magnetic'],
      ['how long is a day', 'sol'],
      ['why is the sunset blue', 'sky'],
      ['how does anybody get home', 'fuel'],
      ['who owns mars', 'flag'],
      ['what is a dust devil', 'devil'],
      ['can we terraform it', 'terraform'],
      ['how do you make oxygen here', 'oxygen'],
    ]
    for (const [q, id] of expected) {
      assert.equal(findTopic(q)?.id, id, `"${q}" routed wrongly`)
    }
  })

  it('refuses rather than guessing when nothing matches', () => {
    // The most important behaviour in the module. A confidently wrong answer
    // about radiation is worse than no companion at all.
    for (const q of ['who won the world cup', 'what is my bank balance', 'sing me a song']) {
      assert.equal(findTopic(q), null, `"${q}" should not have matched anything`)
    }
    assert.ok(QUIPS.unknown.every((u) => /not|do not|outside what/i.test(u)))
  })

  it('prefers a long key phrase over an incidental word', () => {
    const sol = TOPICS.find((t) => t.id === 'sol')!
    const dust = TOPICS.find((t) => t.id === 'dust')!
    assert.ok(scoreTopic('how long is a day', sol) > scoreTopic('how long is a day', dust))
  })
})
