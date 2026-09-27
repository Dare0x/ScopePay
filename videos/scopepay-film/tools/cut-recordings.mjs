#!/usr/bin/env node
// Cuts the raw screen recordings (recordings/<name>.mp4 + <name>.json cue marks,
// written by ../../tools/record.mjs) into assets/rec-<clip>.mp4, retimed so each
// click lands on its word in the narration.
//
// Each clip is a list of anchors [source time, clip time]. Between two anchors the
// footage plays at whatever speed joins them: idle waits speed up, clicks stay on
// their cue. Clip time 0 is the moment the frame shows the video (its data-start),
// and the frame-local cue times noted below come from audio_engine_meta.json.
//   FFMPEG=<path> node tools/cut-recordings.mjs [03 04 …]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const REC = join(ROOT, "recordings");
const FFMPEG = process.env.FFMPEG || "C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe";
const r3 = (x) => Math.round(x * 1000) / 1000;

// clip id → [recording, anchors(marks)]
export const CLIPS = {
  // F3 from 0: dialog opens under "describes", the Pay-in select on "USDC",
  // amounts under "Then", the lock click on "locked", confirmation under "before any work starts".
  "03": ["story", (m) => [[m.form - 0.9, 0], [m.form, 0.9], [m.token, 6.4], [m.amounts, 8.0], [m.lock, 11.0], [m.funded, 13.2], [m.funded + 1.0, 14.2]]],
  // F4 from 0: role switch shown, delivery committed on "on-chain", confirmed by "private".
  "04": ["story", (m) => [[m.worker - 0.2, 0], [m.submit, 3.4], [m.delivered, 5.2], [m.delivered + 2.6, 7.95]]],
  // F5 from 0: release clicked by "milestone", paid on "seconds", then hold on the paid bar.
  "05": ["story", (m) => [[m.client - 0.2, 0], [m.release, 1.9], [m.paid, 3.6], [m.paid + 2.2, 5.85]]],
  // F6 from 2.6: Claim clicked on "closes" (5.5), paid by "payment" (7.4).
  "06a": ["claim", (m) => [[m.click - 2.7, 0], [m.click, 2.7], [m.claimed, 4.8], [m.claimed + 0.9, 5.5]]],
  // F6 from 8.05: Reclaim clicked on "takes back" (10.85), done on "left" (11.9).
  "06b": ["reclaim", (m) => [[m.click - 2.6, 0], [m.click, 2.8], [m.reclaimed, 3.9], [m.reclaimed + 0.9, 4.75]]],
  // F7 from 0: the split typed while "the deal freezes", settled on "splits it", outcome held.
  "07a": ["arbiter", (m) => [[m.settle - 2.4, 0], [m.settle, 2.5], [m.settled, 3.9], [m.settled + 0.4, 4.35]]],
  // F7 from 4.3: the frozen deal's arbiter clock, under "never decides … fourteen days".
  "07b": ["frozen", (m) => [[m.start + 0.2, 0], [m.end - 0.2, 4.0]]],
  // F8 from 0: record opens on "work record", the deals list under "The next client can check it".
  "08": ["record", (m) => [[m.start + 0.3, 0], [m.record, 2.0], [m.deals, 6.2], [m.deals + 2.4, 9.1]]],
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const pick = process.argv.slice(2);
  for (const [id, [name, anchorsOf]] of Object.entries(CLIPS)) {
    if (pick.length && !pick.includes(id)) continue;
    const marks = JSON.parse(readFileSync(join(REC, `${name}.json`), "utf8"));
    const anchors = anchorsOf(marks);
    const parts = [], labels = [];
    for (let i = 0; i + 1 < anchors.length; i++) {
      const [a, ta] = anchors[i], [b, tb] = anchors[i + 1];
      const speed = (b - a) / (tb - ta);
      if (!(speed > 0)) throw new Error(`${id}: anchors ${i}→${i + 1} run backwards (cues out of order?)`);
      parts.push(`[s${i}]trim=start=${r3(Math.max(0, a))}:end=${r3(b)},setpts=(PTS-STARTPTS)/${r3(speed)},fps=30[v${i}]`);
      labels.push(`[v${i}]`);
      console.log(`  ${id} ${i}: src ${r3(a)}–${r3(b)} → ${ta}–${tb}  ×${r3(speed)}`);
    }
    const n = parts.length;
    const fc = `[0:v]tpad=stop_mode=clone:stop_duration=4,split=${n}${labels.map((_, i) => `[s${i}]`).join("")};` +
      parts.join(";") + ";" + labels.join("") + `concat=n=${n}:v=1:a=0,format=yuv420p[out]`;
    const out = join(ROOT, "assets", `rec-${id}.mp4`);
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", join(REC, `${name}.mp4`), "-filter_complex", fc, "-map", "[out]",
      "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-g", "15", "-keyint_min", "15", "-movflags", "+faststart", out]);
    console.log(`✓ assets/rec-${id}.mp4  ${r3(anchors.at(-1)[1] - anchors[0][1])}s`);
  }
}
