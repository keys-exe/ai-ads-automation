# Intake — the drop folder

One folder, mixed files, no form. `src/intake/classify.ts`.

```
builds/<slug>/inbox/
  anything.mp4          → inspo_video        (§42 absorbs one reference)
  script.md | .txt      → script             (required)
  product-sheet.md      → product_sheet      (optional — created where absent, §18 step 2)
  product-sheet.py      → the Appendix B .py companion
  *.jpg *.png *.webp    → product
  placement/*.jpg       → product_placement  (optional)
  bundle.json           → explicit manifest, wins outright
```

## How it decides

**Extension decides the class, name decides the role.** A `.mp4` is the inspo
video whatever it is called. A `.md` is a Product Sheet or a script depending on
its name (`*sheet*`/`*spec*` → sheet; `*script*`/`*vsl*`/`*ugc*` → script). With
exactly one text file and no naming signal it is the script, because a build
cannot start without one while a Product Sheet is created where absent.

Images go to `product` unless they sit under a `placement/` directory or their
name matches `placement|worn|wearing|on-body|in-situ`.

## When it cannot place something

It reports, it never guesses. `npm run build:run` prints what it could not place
and **stops** — §18 step 2's verification depends on the bundle being what it
claims, and a wrong guess here is invisible until beat forty.

Fix it one of three ways, in this order of preference:

1. Rename the file so its role is obvious.
2. Write `builds/<slug>/inbox/bundle.json`:
   ```json
   { "assets": [ { "kind": "script", "file": "draft-3.md" } ], "productSheetPy": "sheet.py" }
   ```
3. `--force`, which carries on without the file.

## Two consequences worth stating up front

**No worn-placement reference → §9D blocks REVEAL beats** until one exists. The
run prints this. It is not an error; it is a constraint the act map will inherit.

**More than one inspo video, or more than one script**, is not a runnable
bundle: §42 absorbs one reference and §18 builds one script. The extras come
back unclassified with the collision named rather than being picked between.
