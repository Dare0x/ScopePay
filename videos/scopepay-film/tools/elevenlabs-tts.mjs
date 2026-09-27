#!/usr/bin/env node
// ElevenLabs narration for this project, in the same shape the HyperFrames
// audio engine writes (assets/voice/NN.wav + audio_engine_meta.json voices with
// per-word timings). Uses the /with-timestamps endpoint, so word timings come
// from ElevenLabs' own alignment — no transcription pass (whisper.cpp isn't
// available on this Windows machine).
//
//   node tools/elevenlabs-tts.mjs --voice <voice_id> [--only 01,04] [--speed 0.97]
//
// The API key is read from ~/.elevenlabs-key (never printed).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const ROOT = resolve(flag("dir", "."));
const VOICE = flag("voice", "SAz9YHcvj6GT2YYXdXww"); // River
const MODEL = flag("model", "eleven_v3");
const SPEED = Number(flag("speed", "0.97"));
const ONLY = flag("only", null)?.split(",");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const key = readFileSync(join(homedir(), ".elevenlabs-key"), "utf8").replace(/^﻿/, "").trim();
if (!key.startsWith("sk_")) throw new Error("~/.elevenlabs-key doesn't look like an ElevenLabs key");

// SCRIPT.md → [{ id, text }], same rules as the product-launch adapter.
function parseScript(md) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ id: String(cur.frame).padStart(2, "0"), text: cur.text.trim() });
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+.*?\(frame\s+(\d+)\)/i);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "" };
      continue;
    }
    if (!cur || /^\s*\*\*/.test(line)) continue;
    const m = line.match(/^(?: {4,}|\t)(.+)$/);
    if (m) cur.text += (cur.text ? " " : "") + m[1].trim();
  }
  flush();
  return out;
}

// Character alignment → words (punctuation stays attached, as captions expect).
function toWords(al) {
  const words = [];
  let w = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (w) words.push(w);
      w = null;
      return;
    }
    if (!w) w = { text: "", start: al.character_start_times_seconds[i], end: 0 };
    w.text += ch;
    w.end = al.character_end_times_seconds[i];
  });
  if (w) words.push(w);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return words.map((x, i) => ({ id: `w${i}`, text: x.text, start: r3(x.start), end: r3(x.end) }));
}

function durationOf(file) {
  const out = execFileSync(FFMPEG.replace(/ffmpeg(\.exe)?$/, "ffprobe$1"), [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]).toString();
  return Math.round(Number(out) * 1000) / 1000;
}

const lines = parseScript(readFileSync(join(ROOT, "SCRIPT.md"), "utf8"));
const metaPath = join(ROOT, "audio_engine_meta.json");
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
const voices = new Map((meta.voices ?? []).map((v) => [v.id, v]));
mkdirSync(join(ROOT, "assets", "voice"), { recursive: true });

let chars = 0;
for (let i = 0; i < lines.length; i++) {
  const { id, text } = lines[i];
  if (ONLY && !ONLY.includes(id)) continue;
  // v3 takes stability as 0 / 0.5 / 1 and no speed/style; v2 takes the full set.
  const settings = MODEL === "eleven_v3"
    ? { stability: 0.5, similarity_boost: 0.75 }
    : { stability: 0.55, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true, speed: SPEED };
  const call = (stitch) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        // Neighbouring lines keep the delivery continuous across frames (when the model supports it).
        ...(stitch ? { previous_text: lines[i - 1]?.text, next_text: lines[i + 1]?.text } : {}),
        voice_settings: settings,
      }),
    });
  let res = await call(true);
  if (res.status === 400) res = await call(false);
  if (!res.ok) throw new Error(`line ${id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const mp3 = join(ROOT, "assets", "voice", `${id}.mp3`);
  const wav = join(ROOT, "assets", "voice", `${id}.wav`);
  writeFileSync(mp3, Buffer.from(body.audio_base64, "base64"));
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", mp3, "-ar", "48000", "-ac", "2", wav]);
  const words = toWords(body.alignment);
  voices.set(id, { id, path: `assets/voice/${id}.wav`, duration_s: durationOf(wav), words });
  chars += text.length;
  console.log(`✓ ${id}  ${durationOf(wav)}s  ${words.length} words`);
}

meta.tts_provider = "elevenlabs";
meta.voice_id = VOICE;
meta.voices = [...voices.values()].sort((a, b) => a.id.localeCompare(b.id));
meta.bgm ??= null;
meta.sfx ??= [];
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`✓ ${meta.voices.length} voice lines in ${metaPath} (${chars} characters sent)`);
