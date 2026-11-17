// main.ts — Lumen's hand-in program (Node 22, standard library only).
//
// It copies this repository's app/ and screenshots/ into the output
// directory and writes dossier.json there with buildDossier from the
// kit's vendored library (vendor/makefun-frontend.ts, unchanged).
// The grader runs it twice in a sandbox with no network; both runs must
// write the same bytes, so nothing here depends on the time, the machine
// or the order the filesystem returns entries in.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// The repository root is the directory holding this file.
const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Same caps the gate applies, so a build that passes here passes there:
// at most 3 screenshots of 256 KiB each, app/ within its file and byte caps,
// and the dossier text capped at 160 KiB.
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

function copyTree(source, target) {
  cpSync(source, target, { recursive: true });
}

function main() {
  mkdirSync(outputDir, { recursive: true });

  // Start from a clean output so a stale file from an earlier run can
  // never leak into the hand-in (and so the two grader runs agree).
  const appOut = join(outputDir, 'app');
  const shotsOut = join(outputDir, 'screenshots');
  rmSync(appOut, { recursive: true, force: true });
  rmSync(shotsOut, { recursive: true, force: true });

  copyTree(join(repoRoot, 'app'), appOut);
  mkdirSync(shotsOut, { recursive: true });
  if (existsSync(join(repoRoot, 'screenshots'))) {
    copyTree(join(repoRoot, 'screenshots'), shotsOut);
  }

  const dossier = buildDossier(outputDir, DOSSIER_OPTIONS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

main();
