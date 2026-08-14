import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mobileChat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')

test('mobile voice transcript keeps finalized chunks plus only the latest interim hypothesis', () => {
  assert.match(mobileChat, /const finalPieces: string\[\] = \[\]/)
  assert.match(mobileChat, /let latestInterim = ''/)
  assert.match(mobileChat, /if \(result\.isFinal\) finalPieces\.push\(transcript\)/)
  assert.match(mobileChat, /else latestInterim = transcript/)
  assert.match(mobileChat, /mergeTranscriptPieces\(\[\.\.\.finalPieces, latestInterim\]\.filter\(Boolean\)\)/)
})

test('mobile voice transcript collapses cumulative and overlapping recognition pieces', () => {
  assert.match(mobileChat, /function mergeTranscriptPieces\(pieces: string\[\]\)/)
  assert.match(mobileChat, /piece\.startsWith\(merged\)/)
  assert.match(mobileChat, /merged\.startsWith\(piece\)/)
  assert.match(mobileChat, /leftTail === rightHead/)
  assert.doesNotMatch(mobileChat, /pieces\.push\(transcript\)[\s\S]{0,200}pieces\.join\(' '\)/)
})
