import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Midi as MidiInstance } from "@tonejs/midi";

/** @tonejs/midi ships CJS; Node ESM named import `{ Midi }` fails on Node 20+. */
const requireCjs = createRequire(import.meta.url);
const { Midi } = requireCjs("@tonejs/midi") as { Midi: new (data: Buffer) => MidiInstance };

/**
 * basic-pitch MIDI 를 16분음표 격자에 맞춰 MuseScore 에서 읽기 쉽게 정리.
 * 템포는 MIDI 내 첫 tempo 또는 기본 120 BPM.
 */
export function quantizeMidiFile(inputPath: string, outputPath: string): void {
  const midi = new Midi(readFileSync(inputPath));
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const beatSec = 60 / Math.max(40, Math.min(220, bpm));
  const sixteenthSec = beatSec / 4;

  for (const track of midi.tracks) {
    for (const note of track.notes) {
      const qStart = Math.round(note.time / sixteenthSec) * sixteenthSec;
      note.time = Math.max(0, qStart);
      const rawDur = note.duration;
      const steps = Math.max(1, Math.round(rawDur / sixteenthSec));
      note.duration = steps * sixteenthSec;
    }
  }

  const out = midi.toArray();
  writeFileSync(outputPath, Buffer.from(out));
}
