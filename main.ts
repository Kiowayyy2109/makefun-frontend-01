// main.ts — Lumen v2's hand-in program (Node 22, standard library only).
//
// It hands the app in: it copies this repository's app/ and
// screenshots/ into the output directory and writes dossier.json
// there with buildDossier from the kit's vendored library
// (vendor/makefun-frontend.ts, unchanged — the scorer rebuilds the
// dossier with its own copy and compares the two byte for byte).
//
// The grader runs this program twice in a sandbox with no network and
// both runs must write the same bytes, so nothing here depends on the
// time, the machine, or the order the filesystem returns entries in:
// the output directories are wiped first, the copies are plain file
// copies, and the dossier library itself sorts everything it reads.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// The repository root is the directory holding this file.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The same caps the gate applies, so a build that passes here passes
// there: at most 3 screenshots of 256 KiB each, app/ within its file
// and byte caps, and the dossier text capped at 160 KiB.
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

const appSource = join(repoRoot, 'app');
const shotsSource = join(repoRoot, 'screenshots');
const appTarget = join(outputDir, 'app');
const shotsTarget = join(outputDir, 'screenshots');

mkdirSync(outputDir, { recursive: true });

// Start from a clean output so a stale file from an earlier run can
// never leak into the hand-in (and so the two grader runs agree).
rmSync(appTarget, { recursive: true, force: true });
rmSync(shotsTarget, { recursive: true, force: true });

cpSync(appSource, appTarget, { recursive: true });
mkdirSync(shotsTarget, { recursive: true });
if (existsSync(shotsSource)) {
  cpSync(shotsSource, shotsTarget, { recursive: true });
}

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, DOSSIER_OPTIONS),
);

console.log(`Lumen v2 handed in to ${outputDir}`);
