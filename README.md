# Hercules DJControl Starlight — Custom Mapping Guide

Customized Mixxx mapping for the Hercules DJControl Starlight, tuned for
Mixxx **2.5.x**. Based on the official mapping (DJ Phatso / Kerrick
Staley), extended with action layers, library browsing, BPM editing,
temporary hotcues and LED feedback.

## Files & installation

| File                                      | Purpose          |
| ----------------------------------------- | ---------------- |
| `Hercules DJControl Starlight.midi.xml`   | Control bindings |
| `Hercules-DJControl-Starlight-scripts.js` | Logic script     |
| `Starlight-Custom-README.md`              | This guide       |

All files live in `~/.mixxx/controllers/` (the user controller folder).
Mixxx loads these instead of the system copies in `/usr/share/mixxx/controllers/`.

**Applying changes**

- XML changes (bindings): fully quit and restart Mixxx — bindings are only
  re-parsed on startup or when the preset is re-selected in
  Preferences → Controllers.
- JS-only changes: re-applying the preset in Preferences also re-runs the
  script, but a restart is the sure bet.

## Action layers

| Layer       | How to engage            | Base LEDs                       |
| ----------- | ------------------------ | ------------------------------- |
| **Default** | —                        | white flash on each deck's beat |
| **Shift**   | hold Shift               | solid blue                      |
| **Alt**     | double-tap Shift (latch) | solid green                     |
| **Select**  | double-tap Vinyl (latch) | solid red                       |

- Shift overrides latched layers while held (Shift+Alt = "ShiftAlt").
- Pushing a track to a deck with Play exits Select automatically
  (see `exitSelectOnLoad` option).
- The pad LEDs reflect the active layer (see the pad tables below) —
  the physical pads keep the same LEDs in every layer, so the script
  re-renders them on layer changes.

## Transport (per deck)

| Control               | Default           | Shift                                                       | Select                             | Alt               |
| --------------------- | ----------------- | ----------------------------------------------------------- | ---------------------------------- | ----------------- |
| **Play**              | play/pause toggle | load selected track                                         | load selected track (exits Select) | play/pause toggle |
| **Cue**               | cue               | rewind to start                                             | cue                                | cue               |
| **Sync**              | sync lock         | sync master                                                 | sync lock                          | sync lock         |
| **PFL / Cue buttons** | headphones (PFL)  | left button = Cue Master, right = Cue+Mix (LEDs show state) | PFL                                | PFL               |

## Jog wheels

| Gesture            | Default                                                  | Shift                                                | Select                                | Alt        |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ---------- |
| Rotate by edge     | pitch bend                                               | slide active loop (±1 beat/tick), or bend if no loop | **scroll library**                    | pitch bend |
| Touch top + rotate | scratch (or bend while playing, unless Vinyl mode is on) | seek (4× scratch speed)                              | **scroll library** (touch is ignored) | scratch    |
| Touch top          | —                                                        | —                                                    | does nothing                          | —          |

Scroll speed: one library row per `browseTickDivisor` wheel ticks (default 3).

## Vinyl button

| Gesture    | Action                                                    |
| ---------- | --------------------------------------------------------- |
| Single tap | toggle scratch mode on both decks (LED shows state)       |
| Double tap | latch/unlatch **Select** layer (LED flashes while active) |

## Shift button

| Gesture    | Action                      |
| ---------- | --------------------------- |
| Hold       | **Shift** layer             |
| Double tap | latch/unlatch **Alt** layer |

## Pads

Pads are mode-independent in Select: **every pad mode does the BPM
editing layout** there (tap on 1, ×2 on 3, ½ on 4).

### Hotcue mode

| Pad | Default  | Shift    | Alt            | Select  |
| --- | -------- | -------- | -------------- | ------- |
| 1   | Hotcue 1 | Hotcue 5 | clear Hotcue 1 | BPM tap |
| 2   | Hotcue 2 | Hotcue 6 | clear Hotcue 2 | —       |
| 3   | Hotcue 3 | Hotcue 7 | clear Hotcue 3 | BPM ×2  |
| 4   | Hotcue 4 | Hotcue 8 | clear Hotcue 4 | BPM ½   |

**Temporary hotcues:** while a deck is _playing_, holding a Hotcue pad for
`tempCueHoldTime` (default 100 ms) and releasing it snaps the track back to
where it would have been (press position + held time, adjusted by the tempo
fader). A quick tap triggers the cue instantly and stays there. Deck
stopped → the pad just triggers the cue. Edge cases: the snap-back math
reads the tempo fader at release and assumes no loop was engaged during the
hold.

### Loop mode

| Pad | Default     | Shift                   | Select  |
| --- | ----------- | ----------------------- | ------- |
| 1   | 1-beat loop | 16-beat loop            | BPM tap |
| 2   | 2-beat loop | 32-beat loop            | —       |
| 3   | 4-beat loop | halve loop length (½)   | BPM ×2  |
| 4   | 8-beat loop | double loop length (×2) | BPM ½   |

**Shift+3 + Shift+4 together** (within `loopChordWindow`, 200 ms) toggles
the loop on/off (reloop). Individual ½/×2 presses fire after that window,
so chords and single presses can be told apart.

**Loop pad LEDs** show the active loop's duration: solid when it matches
this layer's ladder (1/2/4/8 normal, 16/32/64/128 with Shift — pads 3/4
light for 64/128 even though they do ½/×2), **flashing** when
the duration belongs to the other layer's ladder, dark for unmatched sizes.

### FX mode

| Pad | Default                 | Shift           | Select  |
| --- | ----------------------- | --------------- | ------- |
| 1   | hold to enable effect 1 | select effect 1 | BPM tap |
| 2   | hold to enable effect 2 | select effect 2 | —       |
| 3   | hold to enable effect 3 | select effect 3 | BPM ×2  |
| 4   | hold to enable FX unit  | —               | BPM ½   |

### Sampler mode

| Pad | Default                                               | Select               |
| --- | ----------------------------------------------------- | -------------------- |
| 1–4 | trigger Sampler 1–4 (deck A bank) / 5–8 (deck B bank) | BPM tap / — / ×2 / ½ |

## Knobs & faders

| Control      | Default / Select                             | Alt               |
| ------------ | -------------------------------------------- | ----------------- |
| Filter knob  | QuickEffect filter (left = LPF, right = HPF) | **EQ high band**  |
| EQ knob      | EQ low band                                  | **EQ mid band**   |
| Volume fader | channel volume                               | channel volume    |
| Crossfader   | master crossfader                            | master crossfader |
| Pitch fader  | deck rate                                    | deck rate         |

The Filter/EQ knobs use a manual soft-takeover across the Alt toggle: after
latching/unlatching Alt, a knob is inert until its position _crosses_ the
new band's current value (or until it moves, if it already sits within
~1 tick of it).

## LEDs

### Base strips (left = deck A, right = deck B)

- Beat flash (white) when no layer is active; solid layer color otherwise:
  Shift = blue, Alt = green, Select = red. The white beat flash overrides
  the layer color on each beat while a deck plays.

### Pad LEDs (script-managed)

- Hotcue pads: lit when the visible hotcue (1–4, or 5–8 with Shift) is set.
- Loop pads: duration ladder + cross-layer flashing (see Loop mode above).
- Select layer: BPM layout — pad 1 flashes on the beat, pads 3/4 flash at
  double / half the beat rate while the deck plays; solid while paused.
- FX and sampler pads: effect enabled / sampler playing (outside Select).

Base color palette (notes `0x91/0x92 0x23`): `0x60` red, `0x03` blue,
`0x1C` green, `0x7F` white, `0x00` off. Dim variants: `0x40`/`0x02`/`0x10`.
Factory auto light show: `0x90 0x24 0x7F` (the script disables it at startup
with `0x90 0x24 0x00`).

## User options (top of the script)

| Option                   | Default | Purpose                                           |
| ------------------------ | ------- | ------------------------------------------------- |
| `scratchScale`           | 1.0     | scratch speed multiplier                          |
| `scratchShiftMultiplier` | 4       | Shift+wheel seek speed                            |
| `bendScale`              | 1.0     | pitch bend strength                               |
| `browseTickDivisor`      | 3       | wheel ticks per library row (higher = slower)     |
| `loopChordWindow`        | 200     | ms window for Shift+3+4 reloop chord              |
| `tempCueHoldTime`        | 100     | ms hold before a Hotcue press counts as temporary |
| `layerDoubleTapWindow`   | 250     | ms window for layer double-taps                   |
| `exitSelectOnLoad`       | true    | exit Select when a track is pushed to a deck      |
| `baseColorProbe`         | false   | run the base LED color test at startup            |

## Notes & gotchas

- Loading a track into a _playing_ deck requires
  Preferences → Behavior → "Allow track load in playing deck".
- Temporary hotcue snap-back assumes a constant tempo fader during the hold
  and no engaged loop.
- The shift-mode pad notes are the normal notes +8 (0x00→0x08, 0x10→0x18,
  0x20→0x28, 0x30→0x38); Shift-mode transport notes are on MIDI channels +3
  (0x91→0x94), but the transport _buttons_ themselves keep sending on the
  normal channels while Shift is held — the script branches on layer state
  instead of trusting the channels.
- `beatloop_16/32`, `beats_set_double/halve`, `[Library], MoveVertical` and
  `slip`-free temporary hotcues are Mixxx 2.5 control names — older Mixxx
  versions may need different names.
