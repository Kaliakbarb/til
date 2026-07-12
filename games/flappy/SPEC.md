# flappy — shared game spec (all three implementations MUST match this exactly)

Unlike `bench/`, game outputs can't be byte-compared. Fairness contract instead:
every implementation realizes the checklist below with the same constants, is verified
to run, and is written idiomatic-minimal in its language's native game surface
(til → the web canvas host · Python → pygame · JS → raw canvas 2D). No feature may
be dropped or added. Token counts are for the full source file.

## Canvas / world
- playfield 400×600 (til host: `width()`/`height()`; pygame window; canvas element)
- ground: solid strip from y = 540 (H−60) to bottom, color #1a2233
- background #0e1420

## Bird
- circle, x = 90 (fixed), radius 14, color #fbbf24
- gravity +0.45 per frame; flap sets velocity to −7.2
- flap input: Space key OR mouse click / tap

## Pipes
- width 70, color #2dd4bf, horizontal speed 2.6 per frame
- spawned every 90 frames at the right edge; removed when x < −80
- gap height 150; gap top chosen uniformly random in [60, GROUND − 60 − 150]
- a pipe is drawn as two rects: top (0 → gapTop), bottom (gapTop+150 → GROUND)

## States
- `ready`: world drawn frozen + text "press space"; flap input → state `play` + immediate flap
- `play`: physics + pipes + scoring + collision each frame
- `over`: world drawn frozen + texts "game over", "score N  best M", "space to restart";
  flap input → reset (bird y = H/2, vel 0, pipes [], score 0, frames 0) → state `ready`

## Scoring & collision
- +1 when a pipe's right edge (x+70) passes the bird's x, once per pipe
- death when: bird bottom (y+r) > GROUND, or bird top (y−r) < 0, or bird circle's
  bounding box overlaps a pipe rect (x-overlap: bird.x±r vs [p.x, p.x+70];
  y-hit: bird.y−r < gapTop or bird.y+r > gapTop+150)
- `best` persists across restarts (session only)

## HUD
- score: text at (20, 40), size 28, white
- 60 fps frame loop (rAF / pygame clock 60)

## Verification bar
- til: runs on https://til-lang.vercel.app/flappy.html — playable, death + restart exercised
- python: pygame headless (SDL_VIDEODRIVER=dummy), driven ≥300 frames with scripted
  flaps: must survive past first pipe, then die, then restart — assert state transitions
- js: loaded in a browser page, same manual exercise as til
