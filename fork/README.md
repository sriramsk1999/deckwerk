# Fork tooling

This checkout is a personal fork of [vsitzmann/deckwerk](https://github.com/vsitzmann/deckwerk)
(remote `upstream`), pushed to `origin`. `main` is what runs: upstream plus the
fork's own commits. Fixes that upstream would want go to it as PRs, each from its
own branch off `upstream/main`, so the fork only carries what is ours.

## Before each new deck

1. `fork/check-upstream.sh`: new upstream commits and releases, the fork's
   commits on top, and the state of our PRs. Nothing new upstream: skip to 6.
2. `fork/regress.py baseline`: every slide of every talk, rendered by the
   current build. Talks are found under `~/src/talks` (or `$DECKWERK_TALKS`), or
   pass deck folders.
3. `git rebase upstream/main` (or onto a release tag). Drop fork commits
   upstream has merged.
4. `fork/rebuild.sh`: `npm ci`, the Electron install workaround, `npm run build`.
5. `fork/regress.py compare`: renders again and lists the slides that changed,
   with baseline | current | changes images in
   `~/.cache/deckwerk-regress/report/`. Exit status 0 means nothing changed.
6. `npm run test:unit`, then the Electron tiers on a virtual display so no
   window opens on the desktop:
   `env -u WAYLAND_DISPLAY xvfb-run -a -s "-screen 0 2560x1440x24" npm run test:browser`.
   The screen must be larger than the canvas: `scratchpadRenderingBrowser`
   captures a full 1920×1080 slide at an offset, and on a 1920×1080 screen
   every pixel differs. Run on the real display, the three `web import` tests
   in `webElement.test.ts` (font metrics) and focus- and timing-sensitive
   suites such as `webElementEditorBrowser` can fail spuriously.
7. After a rebase, `git push --force-with-lease origin main`.

## What the fork adds

`fork/check-upstream.sh` lists the fork's commits on top of upstream; everything
else in this checkout is upstream's. Keep each one small and self-contained, with
its tests, so it can go upstream as a PR or be dropped without touching the rest.
