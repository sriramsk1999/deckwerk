# Fork tooling

This checkout is a personal fork of [vsitzmann/deckwerk](https://github.com/vsitzmann/deckwerk)
(remote `upstream`), pushed to `origin`. `main` is what runs: upstream plus the
fork's own commits. Fixes that upstream would want go to it as PRs, each from its
own branch off `upstream/main`, so the fork only carries what is ours.

## Before each new deck

1. `fork/check-upstream.sh`: new upstream commits and releases, the fork's
   commits on top, and the state of our PRs. Nothing new upstream: skip to 6.
2. Stop any local servers live slides use (viser and the like), then
   `fork/regress.py baseline`: every slide of every talk, rendered by the
   current build. Talks are found under `~/talks` (or `$DECKWERK_TALKS`), or
   pass deck folders.
3. `git rebase upstream/main` (or onto a release tag). Drop fork commits
   upstream has merged.
4. `fork/rebuild.sh`: `npm ci`, the Electron install workaround, `npm run build`.
5. `fork/regress.py compare`: renders again and lists the slides that changed,
   with baseline | current | changes images in
   `~/.cache/deckwerk-regress/report/`. Exit status 0 means nothing changed.
6. `npm run test:unit` and `npm run test:browser`. Known failures on this
   machine, with or without the fork's commits: `streamingRenditions` (needs
   ffmpeg-static's binary, which `rebuild.sh` skips) and three `web import`
   tests in `webElement.test.ts` (font metrics).
7. After a rebase, `git push --force-with-lease origin main`.

## What the fork adds

- **Live web elements.** A web element can show a page served from this
  machine, such as a viser scene, instead of a deck-relative page:

  ```html
  <div data-element="web" data-src="http://127.0.0.1:8080/"
       data-poster="assets/web/scene.poster.png" data-title="Live scene"
       style="width:1680px;height:780px"></div>
  ```

  While presenting it loads once the server answers, showing "Waiting for …"
  until then. Previews and Speaker View show the poster instead of a second live
  copy. The mouse drives the scene; keys and the clicker still drive the talk.

  For the poster, start the server and run
  `fork/live-poster.mjs <deck> <slide number> [name]`: it captures the live
  element into `<deck>/assets/web/` and prints the path for `data-poster`.
  Speaker View, PDF export and the waiting state show that still.
- **KaTeX_Size3 loads in the desktop windows.** Sent upstream as
  vsitzmann/deckwerk#27; drop it here once merged.
