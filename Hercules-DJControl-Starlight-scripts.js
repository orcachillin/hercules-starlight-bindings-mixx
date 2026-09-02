var DJCStarlight = {};
///////////////////////////////////////////////////////////////
//                       USER OPTIONS                        //
///////////////////////////////////////////////////////////////

// How fast scratching is.
DJCStarlight.scratchScale = 1.0;

// How much faster seeking (shift+scratch) is than scratching.
DJCStarlight.scratchShiftMultiplier = 4;

// How fast bending is.
DJCStarlight.bendScale = 1.0;

// How many jog wheel ticks it takes to move the library track selector by one
// row (higher = less sensitive).
DJCStarlight.browseTickDivisor = 3;

// How long (in milliseconds) SHIFT + Loop pads 3 and 4 may be staggered and
// still count as a "drop loop" chord instead of halve/double.
DJCStarlight.loopChordWindow = 200;

// How long (in milliseconds) a Hotcue pad must be held while playing to snap
// back to where the song would have been on release. Shorter holds (taps)
// just stay at the cue.
DJCStarlight.tempCueHoldTime = 100;

// How long (in milliseconds) two taps may be apart to count as a double-tap
// for the action layers (Vinyl and Shift).
DJCStarlight.layerDoubleTapWindow = 250;

// When true, pushing a track to a deck with Play exits the Select layer, so
// you land back on the default layer ready to play.
DJCStarlight.exitSelectOnLoad = true;

// Set to true to re-run the one-shot base color verification sequence
// (blue -> red -> green -> white -> off) at startup.
// Discovered protocol: 0x91/0x92 note 0x23 sets the base LED color per side,
// using the Hercules DJCU velocity palette (0x60 red, 0x03 blue, 0x1C green,
// 0x7F white, 0x00 off). 0x90 0x24 switches the factory auto light show.
DJCStarlight.baseColorProbe = false;

// DJControl_Starlight_scripts.js
//
// ****************************************************************************
// * Mixxx mapping script file for the Hercules DJControl Starlight.
// * Author: DJ Phatso and Kerrick Staley
// * Version 1.3 (March 21 2019)
// * Forum: https://mixxx.org/forums/viewtopic.php?f=7&t=12570
// * Wiki: https://mixxx.org/wiki/doku.php/hercules_dj_control_starlight
// Changes to v1.4
// - Base LEDs now flash in time with each deck's BPM instead of VU meters.
// - Shift + rotating the wheel by its edge moves the library track selector.
// - Shift + Play loads the selected library track into that deck.
// - Shift lights up and shows the shift functions on the transport LEDs.
// - Shift + Loop pads 1/2 set 16/32 beat loops; pads 3/4 halve/double the
//   loop and light up while a loop is active; 3+4 together toggle the loop.
// - Shift + Hotcue pads trigger Hotcues 5-8; the Green layer clears
//   Hotcues 1-4 (Shift+Green clears 5-8).
// - Action layers: Shift (held, blue base lights), Select (double-tap Vinyl,
//   red, Vinyl LED flashes; wheels only scroll the library, Play loads the
//   selected track which exits Select, and all pad modes do BPM editing:
//   tap on 1, x2 on 3, half on 4 - while a deck plays those pads flash at
//   the beat, double rate and half rate respectively), Alt (double-tap
//   Shift, green; Hotcue pads clear; Filter/EQ knobs become the EQ high and
//   mid bands).
// - Temporary Hotcues: holding a Hotcue pad while playing snaps the track
//   back to where the song would have been on release; taps trigger as
//   usual.
// - Shift + spinning the wheel slides the deck's active loop (1 beat per
//   tick); when the deck has no loop it browses the library instead.
// Changes to v1.3
// - Fix seek-to-start and cue-master behavior.
// - Change loops to 1/2/4/8 beats.
// - Tweak scratch, seek, and bend behavior.
// - Refactor to reduce code size.
// Changes to v1.2
// - Controller knob/slider values are queried on startup, so MIXXX is synced.
// - Fixed vinyl button behavior the first time it's pressed.
// Changes to v1.1
// - Vinyl button now enables/disables scratch function (On by default);
// - FX: SHIFT + Pad = Effect Select
//
// v1.0 : Original release

// TODO: Functions that could be implemented to the script:
// * Tweak/map base LED to other functions (if possible).
// * FX:
//   - Potentially pre-select/load effects into deck and set parameters
// * Fix behavior when adjusting tempo slider after pressing [Sync] (tempo
//   adjustment should be relative, not absolute).
// ****************************************************************************

// We have to disable the no-unused-vars check because we have many MIDI
// callbacks that receive a fixed list of arguments, but we usually don't use
// most of these arguments. Eslint seems to make it relatively difficult to
// disable this check on a case-by-case basis, so we disable it for the whole
// file.
// See this GitHub issue for more context:
// https://github.com/eslint/eslint/issues/1939
/*eslint-disable no-unused-vars*/

DJCStarlight.kScratchActionNone = 0;
DJCStarlight.kScratchActionScratch = 1;
DJCStarlight.kScratchActionSeek = 2;
DJCStarlight.kScratchActionBend = 3;

// The base LEDs flash white in time with each deck's BPM (light show), or
// light up solidly in the active layer's color.
// Base LED colors (Hercules DJCU velocity palette on notes 0x91/0x92 0x23):
DJCStarlight.layerColors = {
	None: null, // BPM flash
	Shift: 0x03, // blue
	ShiftAlt: 0x03, // blue (Shift takes visual precedence)
	Select: 0x60, // red
	Alt: 0x1c, // green
};

// Map a pad midino (0x00-0x03, 0x10-0x13, 0x20-0x23, 0x30-0x33) to pad 1-4.
DJCStarlight._padIndex = function (control) {
	return (control % 0x10) + 1;
};

// The BPM editing actions shared by every pad mode in the Select layer:
// pad 1 = tap, pad 3 = double, pad 4 = half.
DJCStarlight._selectBpmPad = function (deckGroup, pad) {
	if (pad == 1) {
		engine.setValue(deckGroup, "bpm_tap", 1);
	} else if (pad == 3) {
		engine.setValue(deckGroup, "beats_set_double", 1);
	} else if (pad == 4) {
		engine.setValue(deckGroup, "beats_set_halve", 1);
	}
};

// The deck that owns a pad bank (0x96 -> Channel1, 0x97 -> Channel2).
DJCStarlight._padDeckGroup = function (channel) {
	return "[Channel" + (channel - 5) + "]";
};

// The Filter and EQ knobs. Default/Select layers: Filter knob = QuickEffect
// filter, EQ knob = low band. Alt layer: they become the EQ high and mid
// bands (static bindings could not switch per layer).
//
// Because the knobs are absolute and their targets change with the Alt
// layer, a manual soft-takeover is applied: after toggling Alt a knob must
// first cross the current value of its new target before it takes effect,
// so the band does not jump to the knob's physical position. The first knob
// event after startup re-syncs the software to the physical position.
DJCStarlight.knobState = {
	1: {
		filter: { pending: true, lastVal: null },
		eq: { pending: true, lastVal: null },
	},
	2: {
		filter: { pending: true, lastVal: null },
		eq: { pending: true, lastVal: null },
	},
};

DJCStarlight._setKnobTakeover = function () {
	// Both knobs change targets when the Alt layer toggles.
	for (var d = 1; d <= 2; d++) {
		DJCStarlight.knobState[d].filter.pending = true;
		DJCStarlight.knobState[d].eq.pending = true;
	}
};

DJCStarlight._applyKnob = function (deck, knob, value, targetGroup, targetKey, scale) {
	var state = DJCStarlight.knobState[deck][knob];
	var knobFrac = value / 127;
	var scaled;
	var coToFrac = function (co) {
		return co / (scale === undefined ? 1 : scale);
	};
	if (scale === "eq") {
		// The LVMix EQ bands span 0..4 on a logarithmic UI scale with unity
		// at the halfway point. Map the knob so the detent (center) sits at
		// unity: linear below unity, exponential above.
		scaled = knobFrac <= 0.5 ? knobFrac * 2 : Math.pow(4, (knobFrac - 0.5) * 2);
		coToFrac = function (co) {
			return co <= 1 ? co / 2 : 0.5 + (Math.log(co) / Math.log(4)) / 2;
		};
	} else {
		scaled = knobFrac * (scale === undefined ? 1 : scale);
	}
	if (state.lastVal === null) {
		// First event after startup: learn the physical position and sync.
		state.lastVal = value;
		state.pending = false;
		engine.setValue(targetGroup, targetKey, scaled);
		return;
	}
	if (state.pending) {
		var co = engine.getValue(targetGroup, targetKey);
		var targetVal = coToFrac(co) * 127;
		// A knob sitting at (or within ~1 tick of) the target is considered
		// aligned: any movement engages immediately. Otherwise the knob must
		// cross the target value before it takes effect.
		var atTarget = Math.abs(state.lastVal - targetVal) <= 1.5;
		var crossed =
			(state.lastVal <= targetVal && value >= targetVal) ||
			(state.lastVal >= targetVal && value <= targetVal);
		state.lastVal = value;
		if (!atTarget && !crossed) {
			// Knob has not reached its new target yet: ignore the movement.
			return;
		}
		state.pending = false;
	}
	state.lastVal = value;
	engine.setValue(targetGroup, targetKey, scaled);
};

DJCStarlight.filterKnob = function (channel, control, value, status, group) {
	var deck = channel;
	if (DJCStarlight.latchedLayer == "Alt") {
		DJCStarlight._applyKnob(
			deck,
			"filter",
			value,
			"[EqualizerRack1_" + group + "_Effect1]",
			"parameter3",
			"eq",
		);
	} else {
		DJCStarlight._applyKnob(deck, "filter", value, "[QuickEffectRack1_" + group + "]", "super1");
	}
};

DJCStarlight.eqKnob = function (channel, control, value, status, group) {
	var deck = channel;
	var held = DJCStarlight._heldFxGroup(deck);
	if (held) {
		// An effect is being held on this deck: the knob is its level.
		engine.setValue(held, "meta", value / 127);
		return;
	}
	var eqGroup = "[EqualizerRack1_" + group + "_Effect1]";
	if (DJCStarlight.latchedLayer == "Alt") {
		DJCStarlight._applyKnob(deck, "eq", value, eqGroup, "parameter2", "eq");
	} else {
		DJCStarlight._applyKnob(deck, "eq", value, eqGroup, "parameter1", "eq");
	}
};

// Temporary hotcue: while a deck is playing, pressing a Hotcue pad jumps to
// the cue instantly; holding the pad and releasing it snaps the track back to
// where it would have been if it had kept playing (press position plus the
// held time, adjusted by the tempo fader). A quick tap just stays at the
// cue. Works on the activate paths (default and Shift).
DJCStarlight.tempCue = {
	1: { active: false, pos0: 0, time0: 0 },
	2: { active: false, pos0: 0, time0: 0 },
};

DJCStarlight._hotcuePress = function (deck, hotcue) {
	var group = "[Channel" + deck + "]";
	var state = DJCStarlight.tempCue[deck];
	if (engine.getValue(group, "play") != 1) {
		// Deck stopped: trigger the cue as usual (nothing to snap back to).
		state.active = false;
		engine.setValue(group, "hotcue_" + hotcue + "_activate", 1);
		return;
	}
	// Instant trigger. Remember where the track was so a held pad can snap
	// back to where the song would have been on release.
	state.active = true;
	state.pos0 = engine.getValue(group, "playposition");
	state.time0 = Date.now();
	engine.setValue(group, "hotcue_" + hotcue + "_activate", 1);
};

DJCStarlight._hotcueRelease = function (deck, hotcue) {
	var group = "[Channel" + deck + "]";
	var state = DJCStarlight.tempCue[deck];
	if (!state.active) {
		return;
	}
	state.active = false;
	var held = Date.now() - state.time0;
	if (held < DJCStarlight.tempCueHoldTime || engine.getValue(group, "play") != 1) {
		// Quick tap (or the deck was paused during the hold): stay at the cue.
		return;
	}
	// Where the song would have been if it had kept playing from the press
	// position, adjusted by the tempo fader.
	var speed = 1 + engine.getValue(group, "rate");
	if (speed <= 0) {
		speed = 1;
	}
	var duration = engine.getValue(group, "duration");
	var wouldBe = state.pos0 + ((held / 1000) * speed) / duration;
	if (wouldBe > 1) {
		wouldBe = 1;
	}
	engine.setValue(group, "playposition", wouldBe);
};

// Hotcue pads. Default layer: set/trigger Hotcues 1-4. Alt layer: clear
// Hotcues 1-4. Select layer: BPM editing (tap on 1, double on 3, half on 4).
DJCStarlight.hotcuePad = function (channel, control, value, status, group) {
	var deck = group == "[Channel1]" ? 1 : 2;
	var layer = DJCStarlight.effectiveLayer();
	var number = DJCStarlight._padIndex(control);
	if (value === 0) {
		// Releases always end any temporary hotcue in progress.
		DJCStarlight._hotcueRelease(deck, number);
		return;
	}
	if (layer == "Alt") {
		engine.setValue(group, "hotcue_" + number + "_clear", 1);
	} else if (layer == "Select") {
		DJCStarlight._selectBpmPad(group, number);
	} else {
		DJCStarlight._hotcuePress(deck, number);
	}
};

// Loop pads: beatloop 1/2/4/8 beats; in the Select layer every pad mode does
// the BPM editing actions instead.
DJCStarlight.loopPad = function (channel, control, value, status, group) {
	if (value === 0) {
		return;
	}
	var pad = DJCStarlight._padIndex(control);
	if (DJCStarlight.latchedLayer == "Select" && !DJCStarlight.shiftPressed) {
		DJCStarlight._selectBpmPad(group, pad);
		return;
	}
	var sizes = [1, 2, 4, 8];
	engine.setValue(group, "beatloop_" + sizes[pad - 1] + "_toggle", 1);
};
// FX pads: hold to enable the effect; in the Select layer, BPM editing.
// While effect slots 1-3 are held, that deck's EQ knob is the effect level,
// the Filter knob its main parameter and the wheel cycles loaded effects.
// The FX unit pad (4) does not participate in that.
DJCStarlight.heldFx = { 1: [], 2: [] };

DJCStarlight._fxHeld = function (deck) {
	return DJCStarlight.heldFx[deck].length > 0;
};

DJCStarlight._heldFxGroup = function (deck) {
	var stack = DJCStarlight.heldFx[deck];
	return stack.length ? stack[stack.length - 1] : null;
};

DJCStarlight.fxPad = function (channel, control, value, status, group) {
	var deck = channel - 5;
	var slot = DJCStarlight._padIndex(control);
	if (DJCStarlight.latchedLayer == "Select") {
		// Select layer: only the press does BPM editing; releases are ignored
		// so no effect state is touched.
		if (value > 0) {
			DJCStarlight._selectBpmPad(DJCStarlight._padDeckGroup(channel), slot);
		}
		return;
	}
	if (value > 0) {
		engine.setValue(group, "enabled", 1);
	} else {
		engine.setValue(group, "enabled", 0);
	}
	if (slot != 4) {
		// Track the most recently pressed still-held effect slot.
		var stack = DJCStarlight.heldFx[deck];
		var pos = stack.indexOf(group);
		if (pos != -1) {
			stack.splice(pos, 1);
		}
		if (value > 0) {
			stack.push(group);
		}
	}
};

// Sampler pads: trigger the sampler; in the Select layer, BPM editing.
DJCStarlight.samplerPad = function (channel, control, value, status, group) {
	if (value === 0) {
		return;
	}
	var pad = DJCStarlight._padIndex(control);
	if (DJCStarlight.latchedLayer == "Select") {
		DJCStarlight._selectBpmPad(DJCStarlight._padDeckGroup(channel), pad);
		return;
	}
	engine.setValue(group, "cue_gotoandplay", 1);
};

// Shift + Hotcue pads. Shift layer: set/trigger Hotcues 5-8 (with temporary
// hold behavior). Shift+Alt: clear Hotcues 5-8.
DJCStarlight.hotcuePadShift = function (channel, control, value, status, group) {
	var deck = group == "[Channel1]" ? 1 : 2;
	var number = control - 3; // midino 0x08-0x0B -> Hotcues 5-8
	if (value === 0) {
		DJCStarlight._hotcueRelease(deck, number);
		return;
	}
	if (DJCStarlight.effectiveLayer() == "ShiftAlt") {
		engine.setValue(group, "hotcue_" + number + "_clear", 1);
	} else {
		DJCStarlight._hotcuePress(deck, number);
	}
};

DJCStarlight.baseLEDUpdate = function (value, group, control) {
	var status = group == "[Channel1]" ? 0x91 : 0x92;
	var layerColor = DJCStarlight.layerColors[DJCStarlight.effectiveLayer()];
	if (control == "beat_active") {
		if (value > 0 && engine.getValue(group, "play") == 1) {
			// The white BPM flash overrides any layer color on the beat.
			midi.sendShortMsg(status, 0x23, 0x7f);
		} else if (layerColor !== null) {
			midi.sendShortMsg(status, 0x23, layerColor);
		} else {
			midi.sendShortMsg(status, 0x23, 0x00);
		}
	} else if (control == "play" && value != 1) {
		// Deck paused: restore the layer color or go dark between beats.
		midi.sendShortMsg(status, 0x23, layerColor !== null ? layerColor : 0x00);
	}
};

// One-shot verification for the base color protocol: the Hercules DJCU
// palette (used by the Inpulse 500 pads) encodes colors as velocities, so
// the base intensity note 0x23 may actually be a color note. Watch the base
// while Mixxx starts: it steps through 5 colors at ~2s intervals and should
// show BLUE, RED, GREEN, WHITE, OFF if the hypothesis holds.
DJCStarlight._runBaseColorProbe = function () {
	var steps = [
		{ color: 0x03, name: "blue" },
		{ color: 0x60, name: "red" },
		{ color: 0x1c, name: "green" },
		{ color: 0x7f, name: "white" },
		{ color: 0x00, name: "off" },
	];
	midi.sendShortMsg(0x90, 0x24, 0x00);
	var i = 0;
	DJCStarlight.probeTimer = engine.beginTimer(2000, function () {
		if (i >= steps.length) {
			engine.stopTimer(DJCStarlight.probeTimer);
			DJCStarlight.probeTimer = 0;
			return;
		}
		midi.sendShortMsg(0x91, 0x23, steps[i].color);
		midi.sendShortMsg(0x92, 0x23, steps[i].color);
		i++;
	});
};

DJCStarlight.init = function () {
	if (engine.getValue("[App]", "num_samplers") < 8) {
		engine.setValue("[App]", "num_samplers", 8);
	}
	DJCStarlight.scratchButtonState = true;
	DJCStarlight.scratchAction = {
		1: DJCStarlight.kScratchActionNone,
		2: DJCStarlight.kScratchActionNone,
	};
	DJCStarlight.shiftPressed = false;
	DJCStarlight.wheelTickCount = 0;
	DJCStarlight.latchedLayer = "None";
	DJCStarlight.lastVinylPress = 0;
	DJCStarlight.lastShiftPress = 0;
	DJCStarlight.vinylTapTimer = 0;
	DJCStarlight.vinylFlashTimer = 0;
	DJCStarlight.vinylFlashState = 0;
	DJCStarlight.bpmFlashTimers = { 1: 0, 2: 0 };
	DJCStarlight.bpmFlashState = { 1: 0, 2: 0 };
	DJCStarlight.halfBeatParity = { 1: false, 2: false };
	DJCStarlight.loopChord = {
		1: { down: { 3: false, 4: false }, timer: 0, chord: false },
		2: { down: { 3: false, 4: false }, timer: 0, chord: false },
	};

	// Turn off base LED default behavior
	midi.sendShortMsg(0x90, 0x24, 0x00);

	// Vinyl button LED On.
	midi.sendShortMsg(0x91, 0x03, 0x7f);

	// Connect the base LEDs to the decks' beat (BPM) pulse
	engine.connectControl("[Channel1]", "beat_active", "DJCStarlight.baseLEDUpdate");
	engine.connectControl("[Channel2]", "beat_active", "DJCStarlight.baseLEDUpdate");
	engine.connectControl("[Channel1]", "play", "DJCStarlight.baseLEDUpdate");
	engine.connectControl("[Channel2]", "play", "DJCStarlight.baseLEDUpdate");

	// Keep the pad LEDs in sync with hotcue and loop state.
	for (var d = 1; d <= 2; d++) {
		var padGroup = "[Channel" + d + "]";
		for (var h = 1; h <= 8; h++) {
			engine.makeConnection(padGroup, "hotcue_" + h + "_status", DJCStarlight.padLEDUpdate);
		}
		engine.makeConnection(padGroup, "loop_enabled", DJCStarlight.padLEDUpdate);
		engine.makeConnection(padGroup, "beatloop_size", DJCStarlight.padLEDUpdate);
		// Beat/play also drive the Select layer's flashing BPM pads, and BPM
		// changes retune the x2 flash rate.
		engine.makeConnection(padGroup, "beat_active", DJCStarlight.padLEDUpdate);
		engine.makeConnection(padGroup, "play", DJCStarlight.padLEDUpdate);
		engine.makeConnection(padGroup, "bpm", DJCStarlight.padLEDUpdate);
	}

	// Set effects Levels - Dry/Wet
	engine.setParameter("[EffectRack1_EffectUnit1_Effect1]", "meta", 0.6);
	engine.setParameter("[EffectRack1_EffectUnit1_Effect2]", "meta", 0.6);
	engine.setParameter("[EffectRack1_EffectUnit1_Effect3]", "meta", 0.6);
	engine.setParameter("[EffectRack1_EffectUnit2_Effect1]", "meta", 0.6);
	engine.setParameter("[EffectRack1_EffectUnit2_Effect2]", "meta", 0.6);
	engine.setParameter("[EffectRack1_EffectUnit2_Effect3]", "meta", 0.6);
	engine.setParameter("[EffectRack1_EffectUnit1]", "mix", 1);
	engine.setParameter("[EffectRack1_EffectUnit2]", "mix", 1);

	// Ask the controller to send all current knob/slider values over MIDI, which will update
	// the corresponding GUI controls in MIXXX.
	midi.sendShortMsg(0xb0, 0x7f, 0x7f);

	if (DJCStarlight.baseColorProbe) {
		DJCStarlight._runBaseColorProbe();
	}
};

// ============================= ACTION LAYERS ===============================
// Actions live on layers: the default layer, Shift (active while held), Alt
// (latched with a double-tap on Shift) and Select (latched with a double-tap
// on Vinyl). While Shift is held it takes precedence over any latched layer.

// The layer whose actions are currently reachable.
DJCStarlight.effectiveLayer = function () {
	if (DJCStarlight.shiftPressed) {
		return DJCStarlight.latchedLayer == "Alt" ? "ShiftAlt" : "Shift";
	}
	return DJCStarlight.latchedLayer;
};

// Update the base LEDs to indicate the active layer: solid blue for Shift,
// red for Select, green for Alt. With no layer they return to the BPM flash
// (the next beat re-establishes it, so go dark for the moment).
DJCStarlight._updateLayerLEDs = function () {
	var layerColor = DJCStarlight.layerColors[DJCStarlight.effectiveLayer()];
	var color = layerColor !== null ? layerColor : 0x00;
	midi.sendShortMsg(0x91, 0x23, color);
	midi.sendShortMsg(0x92, 0x23, color);
};

// The Vinyl button LED flashes while the Select layer is latched; otherwise
// it shows the scratch on/off state.
DJCStarlight._updateVinylLED = function () {
	if (DJCStarlight.latchedLayer == "Select") {
		if (!DJCStarlight.vinylFlashTimer) {
			DJCStarlight.vinylFlashTimer = engine.beginTimer(400, function () {
				DJCStarlight.vinylFlashState = DJCStarlight.vinylFlashState ? 0 : 0x7f;
				midi.sendShortMsg(0x91, 0x03, DJCStarlight.vinylFlashState);
			});
		}
	} else {
		if (DJCStarlight.vinylFlashTimer) {
			engine.stopTimer(DJCStarlight.vinylFlashTimer);
			DJCStarlight.vinylFlashTimer = 0;
		}
		midi.sendShortMsg(0x91, 0x03, DJCStarlight.scratchButtonState ? 0x7f : 0x00);
	}
};

// Pad LEDs are managed here rather than via static outputs: the physical
// pads keep the same LED addresses in every layer, so they must reflect the
// active layer's functions. Hotcue pads show Hotcues 1-4 normally and 5-8
// while Shift is held. Loop pads light the pad matching the active loop
// duration: 1/2/4/8 beats normally, 16/32/64/128 with Shift (the Shift+3/4
// buttons themselves stay halve/double).
DJCStarlight.padLEDUpdate = function (value, group, control) {
	var deck = group == "[Channel1]" ? 1 : 2;
	if (control == "play" || control == "bpm" || (control == "beat_active" && value > 0)) {
		// (Re)sync the x2 flash timer, and flip the half-rate parity on each
		// beat.
		DJCStarlight._updateBpmFlashTimer(deck);
	}
	if (control == "beat_active" && value > 0) {
		DJCStarlight.halfBeatParity[deck] = !DJCStarlight.halfBeatParity[deck];
	}
	DJCStarlight._updatePadLEDs(deck);
};

// Drives the Select layer's pad-3 LED flashing at double the deck's BPM (two
// 50%-duty flashes per beat). Runs only while Select is active without Shift
// and the deck is playing. The half-rate pad 4 and the per-beat pad 1 are
// grid-synced instead (see _updatePadLEDs).
DJCStarlight._updateBpmFlashTimer = function (deck) {
	var group = "[Channel" + deck + "]";
	var running =
		DJCStarlight.latchedLayer == "Select" &&
		!DJCStarlight.shiftPressed &&
		engine.getValue(group, "play") == 1;
	if (running) {
		var bpm = engine.getValue(group, "bpm");
		if (bpm < 1) {
			bpm = 120;
		}
		if (DJCStarlight.bpmFlashTimers[deck]) {
			engine.stopTimer(DJCStarlight.bpmFlashTimers[deck]);
		}
		var status = deck == 1 ? 0x96 : 0x97;
		var pad3Notes = [0x02, 0x12, 0x22, 0x32];
		DJCStarlight.bpmFlashTimers[deck] = engine.beginTimer(Math.round(15000 / bpm), function () {
			DJCStarlight.bpmFlashState[deck] = DJCStarlight.bpmFlashState[deck] ? 0 : 0x7f;
			for (var n = 0; n < pad3Notes.length; n++) {
				midi.sendShortMsg(status, pad3Notes[n], DJCStarlight.bpmFlashState[deck]);
			}
		});
	} else {
		if (DJCStarlight.bpmFlashTimers[deck]) {
			engine.stopTimer(DJCStarlight.bpmFlashTimers[deck]);
			DJCStarlight.bpmFlashTimers[deck] = 0;
		}
		DJCStarlight.bpmFlashState[deck] = 0;
		DJCStarlight._updatePadLEDs(deck);
	}
};

DJCStarlight._updatePadLEDs = function (deck) {
	var group = "[Channel" + deck + "]";
	var status = deck == 1 ? 0x96 : 0x97;
	var shifted = DJCStarlight.shiftPressed;
	var layer = DJCStarlight.effectiveLayer();
	var select = layer == "Select";
	var playing = engine.getValue(group, "play") == 1;
	var beatLit = playing && engine.getValue(group, "beat_active") == 1;
	// In Select the pads show the BPM layout: pad 1 flashes per beat (tap),
	// pad 3 at double rate (x2), pad 4 every other beat (half), pad 2 dark.
	// While paused they sit solid so the functions stay discoverable.
	function selectLit(pad) {
		if (pad == 1) {
			return playing ? beatLit : true;
		}
		if (pad == 2) {
			return false;
		}
		if (pad == 3) {
			return playing ? DJCStarlight.bpmFlashState[deck] != 0 : true;
		}
		return playing ? DJCStarlight.halfBeatParity[deck] : true;
	}
	var i;
	var lit;
	// Hotcue pads
	for (i = 1; i <= 4; i++) {
		lit = select ? selectLit(i) : engine.getValue(group, "hotcue_" + (shifted ? i + 4 : i) + "_status") > 0.5;
		midi.sendShortMsg(status, i - 1, lit ? 0x7e : 0x00);
	}
	// Loop pads
	var size = engine.getValue(group, "beatloop_size");
	var ladder = shifted ? [16, 32, 64, 128] : [1, 2, 4, 8];
	var otherLadder = shifted ? [1, 2, 4, 8] : [16, 32, 64, 128];
	var loopOn = engine.getValue(group, "loop_enabled") && size > 0;
	for (i = 0; i < 4; i++) {
		if (select) {
			lit = selectLit(i + 1);
		} else if (loopOn && Math.abs(size - ladder[i]) < 0.001) {
			// The active duration lives on this layer's ladder: solid.
			lit = true;
		} else if (loopOn && Math.abs(size - otherLadder[i]) < 0.001) {
			// The active duration lives on the other layer's ladder: flash
			// on the beat (solid while paused).
			lit = !playing || beatLit;
		} else {
			lit = false;
		}
		midi.sendShortMsg(status, 0x10 + i, lit ? 0x7f : 0x00);
	}
	// FX pads: BPM layout in Select, otherwise effect enabled state.
	var fxGroups =
		deck == 1
			? [
					"[EffectRack1_EffectUnit1_Effect1]",
					"[EffectRack1_EffectUnit1_Effect2]",
					"[EffectRack1_EffectUnit1_Effect3]",
					"[EffectRack1_EffectUnit1]",
				]
			: [
					"[EffectRack1_EffectUnit2_Effect1]",
					"[EffectRack1_EffectUnit2_Effect2]",
					"[EffectRack1_EffectUnit2_Effect3]",
					"[EffectRack1_EffectUnit2]",
				];
	for (i = 0; i < 4; i++) {
		lit = select ? selectLit(i + 1) : engine.getValue(fxGroups[i], "enabled") > 0.5;
		midi.sendShortMsg(status, 0x20 + i, lit ? 0x7f : 0x00);
	}
	// Sampler pads: BPM layout in Select, otherwise playing state.
	for (i = 1; i <= 4; i++) {
		lit = select
			? selectLit(i)
			: engine.getValue("[Sampler" + ((deck - 1) * 4 + i) + "]", "play_indicator") > 0.5;
		midi.sendShortMsg(status, 0x30 + i - 1, lit ? 0x7f : 0x00);
	}
};

// The Vinyl button. A single tap toggles scratching on both decks (fired
// after the double-tap window); a double tap toggles the Select layer.
DJCStarlight.vinylButton = function (channel, control, value, status, group) {
	if (!value) {
		return;
	}
	var now = Date.now();
	if (now - DJCStarlight.lastVinylPress <= DJCStarlight.layerDoubleTapWindow) {
		// Double tap: toggle the Select layer instead of toggling scratch.
		if (DJCStarlight.vinylTapTimer) {
			engine.stopTimer(DJCStarlight.vinylTapTimer);
			DJCStarlight.vinylTapTimer = 0;
		}
		DJCStarlight.latchedLayer = DJCStarlight.latchedLayer == "Select" ? "None" : "Select";
		DJCStarlight._updateLayerLEDs();
		DJCStarlight._updateVinylLED();
		DJCStarlight._updatePadLEDs(1);
		DJCStarlight._updatePadLEDs(2);
		DJCStarlight._updateBpmFlashTimer(1);
		DJCStarlight._updateBpmFlashTimer(2);
		DJCStarlight.lastVinylPress = 0;
		return;
	}
	DJCStarlight.lastVinylPress = now;
	DJCStarlight.vinylTapTimer = engine.beginTimer(
		DJCStarlight.layerDoubleTapWindow,
		function () {
			DJCStarlight.vinylTapTimer = 0;
			DJCStarlight.scratchButtonState = !DJCStarlight.scratchButtonState;
			DJCStarlight._updateVinylLED();
		},
		true,
	);
};

DJCStarlight._scratchEnable = function (deck) {
	var alpha = 1.0 / 8;
	var beta = alpha / 32;
	engine.scratchEnable(deck, 248, 33 + 1 / 3, alpha, beta);
};

DJCStarlight._convertWheelRotation = function (value) {
	// When you rotate the jogwheel, the controller always sends either 0x1
	// (clockwise) or 0x7F (counter clockwise). 0x1 should map to 1, 0x7F
	// should map to -1 (IOW it's 7-bit signed).
	return value < 0x40 ? 1 : -1;
};

// The touch action on the jog wheel's top surface
DJCStarlight.wheelTouch = function (channel, control, value, status, group) {
	var deck = channel;
	if (value > 0 && (DJCStarlight.latchedLayer == "Select" || DJCStarlight._fxHeld(deck))) {
		// Select layer / effect mode: the top surface is ignored.
		return;
	}
	if (value > 0) {
		//  Touching the wheel.
		if (engine.getValue("[Channel" + deck + "]", "play") !== 1 || DJCStarlight.scratchButtonState) {
			DJCStarlight._scratchEnable(deck);
			DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionScratch;
		} else {
			DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionBend;
		}
	} else {
		// Released the wheel.
		engine.scratchDisable(deck);
		DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionNone;
	}
};

// The touch action on the jog wheel's top surface while holding shift
DJCStarlight.wheelTouchShift = function (channel, control, value, status, group) {
	var deck = channel - 3;
	// We always enable scratching regardless of button state.
	if (value > 0) {
		DJCStarlight._scratchEnable(deck);
		DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionSeek;
	} else {
		// Released the wheel.
		engine.scratchDisable(deck);
		DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionNone;
	}
};

// Scratching on the jog wheel (rotating it while pressing the top surface)
DJCStarlight._scratchWheelImpl = function (deck, value) {
	var interval = DJCStarlight._convertWheelRotation(value);
	var scratchAction = DJCStarlight.scratchAction[deck];

	if (scratchAction == DJCStarlight.kScratchActionScratch) {
		engine.scratchTick(deck, interval * DJCStarlight.scratchScale);
	} else if (scratchAction == DJCStarlight.kScratchActionSeek) {
		engine.scratchTick(deck, interval * DJCStarlight.scratchScale * DJCStarlight.scratchShiftMultiplier);
	} else {
		DJCStarlight._bendWheelImpl(deck, value);
	}
};

// Scratching on the jog wheel (rotating it while pressing the top surface)
DJCStarlight.scratchWheel = function (channel, control, value, status, group) {
	var deck = channel;
	if (DJCStarlight.latchedLayer == "Select" && !DJCStarlight.shiftPressed) {
		// Select layer: rotating the wheel scrolls the library whether or not
		// the top surface is touched.
		if (DJCStarlight._throttleTicks()) {
			engine.setValue("[Library]", "MoveVertical", DJCStarlight._convertWheelRotation(value));
		}
		return;
	}
	if (DJCStarlight._fxHeld(deck) && !DJCStarlight.shiftPressed) {
		// Effect mode: the top surface is ignored (the edge cycles effects).
		return;
	}
	DJCStarlight._scratchWheelImpl(deck, value);
};

// Seeking on the jog wheel (rotating it while pressing the top surface and holding Shift)
DJCStarlight.scratchWheelShift = function (channel, control, value, status, group) {
	var deck = channel - 3;
	DJCStarlight._scratchWheelImpl(deck, value);
};

DJCStarlight._bendWheelImpl = function (deck, value) {
	var interval = DJCStarlight._convertWheelRotation(value);
	engine.setValue("[Channel" + deck + "]", "jog", interval * DJCStarlight.bendScale);
};

// Process at most one wheel action per browseTickDivisor ticks.
DJCStarlight._throttleTicks = function () {
	DJCStarlight.wheelTickCount++;
	if (DJCStarlight.wheelTickCount < DJCStarlight.browseTickDivisor) {
		return false;
	}
	DJCStarlight.wheelTickCount = 0;
	return true;
};

// Rotating the jog wheel by its edge:
// - Select layer: scrolls the library (deck functions are disabled).
// - Shift layer: slides the deck's active loop backwards/forwards.
// - Otherwise: pitch bend.
DJCStarlight.bendWheel = function (channel, control, value, status, group) {
	if (DJCStarlight.latchedLayer == "Select" && !DJCStarlight.shiftPressed) {
		// Select layer: the wheels only scroll the library.
		if (DJCStarlight._throttleTicks()) {
			engine.setValue("[Library]", "MoveVertical", DJCStarlight._convertWheelRotation(value));
		}
		return;
	}
	if (DJCStarlight.shiftPressed && engine.getValue("[Channel" + channel + "]", "loop_enabled")) {
		// Move the loop by one beat per processed tick.
		if (DJCStarlight._throttleTicks()) {
			engine.setValue("[Channel" + channel + "]", "loop_move", DJCStarlight._convertWheelRotation(value));
		}
		return;
	}
	var held = DJCStarlight.heldFx[channel];
	if (held) {
		// Holding an FX pad: the wheel cycles the loaded effect in that slot.
		if (DJCStarlight._throttleTicks()) {
			var rotation = DJCStarlight._convertWheelRotation(value);
			engine.setValue(held, rotation > 0 ? "next_effect" : "prev_effect", 1);
		}
		return;
	}
	DJCStarlight._bendWheelImpl(channel, value);
};

// Shift + rotating the wheel edge, as reported by units that remap the wheel
// encoder to the shift MIDI channels while Shift is held.
DJCStarlight.bendWheelShift = function (channel, control, value, status, group) {
	var deck = channel - 3;
	if (engine.getValue("[Channel" + deck + "]", "loop_enabled")) {
		// Move the loop by one beat per processed tick.
		if (DJCStarlight._throttleTicks()) {
			engine.setValue("[Channel" + deck + "]", "loop_move", DJCStarlight._convertWheelRotation(value));
		}
		return;
	}
	DJCStarlight._bendWheelImpl(deck, value);
};

// SHIFT + Loop pads 3 and 4. Pressed individually they halve/double the loop
// length (fired after a short window so they can be combined); pressed
// together within that window they toggle the loop on/off.
DJCStarlight._loopPadDown = function (deck, pad) {
	var chord = DJCStarlight.loopChord[deck];
	chord.down[pad] = true;
	var other = pad == 3 ? 4 : 3;
	if (chord.down[other]) {
		// Chord: toggle the loop (exit if active, reloop otherwise) and cancel
		// the pending single-pad action.
		if (chord.timer) {
			engine.stopTimer(chord.timer);
			chord.timer = 0;
		}
		chord.chord = true;
		engine.setValue("[Channel" + deck + "]", "reloop_toggle", 1);
		return;
	}
	chord.timer = engine.beginTimer(
		DJCStarlight.loopChordWindow,
		function () {
			DJCStarlight._loopPadTimerDone(deck, pad);
		},
		true,
	);
};

DJCStarlight._loopPadTimerDone = function (deck, pad) {
	var chord = DJCStarlight.loopChord[deck];
	chord.timer = 0;
	if (chord.chord) {
		return;
	}
	engine.setValue("[Channel" + deck + "]", pad == 3 ? "loop_halve" : "loop_double", 1);
};

DJCStarlight._loopPadUp = function (deck, pad) {
	var chord = DJCStarlight.loopChord[deck];
	chord.down[pad] = false;
	if (!chord.down[3] && !chord.down[4]) {
		chord.chord = false;
	}
};

DJCStarlight.loopPadHalve = function (channel, control, value, status, group) {
	var deck = channel - 5;
	if (value > 0) {
		DJCStarlight._loopPadDown(deck, 3);
	} else {
		DJCStarlight._loopPadUp(deck, 3);
	}
};

DJCStarlight.loopPadDouble = function (channel, control, value, status, group) {
	var deck = channel - 5;
	if (value > 0) {
		DJCStarlight._loopPadDown(deck, 4);
	} else {
		DJCStarlight._loopPadUp(deck, 4);
	}
};

// Cue master button
DJCStarlight.cueMaster = function (channel, control, value, status, group) {
	// This button acts as a toggle. Ignore the release.
	if (value === 0) {
		return;
	}

	var masterIsCued = engine.getValue("[Master]", "headMix") > 0;
	// Toggle state.
	masterIsCued = !masterIsCued;

	var headMixValue = masterIsCued ? 1 : -1;
	engine.setValue("[Master]", "headMix", headMixValue);

	// Set LED (will be overwritten when [Shift] is released)
	var cueMasterLedValue = masterIsCued ? 0x7f : 0x00;
	midi.sendShortMsg(0x91, 0x0c, cueMasterLedValue);
};

// Cue mix button, toggles PFL / master split feature
// We need a special function for this because we want to turn on the LED (but
// we *don't* want to turn on the LED when the user clicks the headSplit button
// in the GUI).
DJCStarlight.cueMix = function (channel, control, value, status, group) {
	// This button acts as a toggle. Ignore the release.
	if (value === 0) {
		return;
	}

	// Toggle state.
	script.toggleControl("[Master]", "headSplit");

	// Set LED (will be overwritten when [Shift] is released)
	var cueMixLedValue = engine.getValue("[Master]", "headSplit") ? 0x7f : 0x00;
	midi.sendShortMsg(0x92, 0x0c, cueMixLedValue);
};

// The Play button. In the Select layer (or while Shift is held) this loads
// the selected library track into the deck instead of playing. (The
// controller sends this button on the normal MIDI channel even when Shift is
// held, so we branch here rather than relying on the shift-mode channel.)
DJCStarlight.playButton = function (channel, control, value, status, group) {
	// Only act on the button press; the release must not stop playback.
	if (value === 0) {
		return;
	}
	if (DJCStarlight.latchedLayer == "Select" || DJCStarlight.shiftPressed) {
		engine.setValue(group, "LoadSelectedTrack", 1);
		if (DJCStarlight.exitSelectOnLoad && DJCStarlight.latchedLayer == "Select") {
			// Track cued to a deck: knock the user out of Select mode.
			DJCStarlight.latchedLayer = "None";
			DJCStarlight._updateLayerLEDs();
			DJCStarlight._updateVinylLED();
			DJCStarlight._updatePadLEDs(1);
			DJCStarlight._updatePadLEDs(2);
			DJCStarlight._updateBpmFlashTimer(1);
			DJCStarlight._updateBpmFlashTimer(2);
		}
	} else {
		script.toggleControl(group, "play");
	}
};

// Light the Shift button and the transport button LEDs to show the shift
// functions while Shift is held, or the normal functions when released.
DJCStarlight._updateTransportLEDs = function () {
	// The Shift button itself (no-op if the hardware has no LED there).
	midi.sendShortMsg(0x90, 0x03, DJCStarlight.shiftPressed ? 0x7f : 0x00);
	var decks = [1, 2];
	for (var i = 0; i < decks.length; i++) {
		var deck = decks[i];
		var group = "[Channel" + deck + "]";
		var status = deck == 1 ? 0x91 : 0x92;
		var playLed, cueLed, syncLed;
		if (DJCStarlight.shiftPressed) {
			// SHIFT+Play loads the selected track, SHIFT+Cue rewinds to start.
			playLed = 0x7f;
			cueLed = 0x7f;
			syncLed = engine.getValue(group, "sync_leader") ? 0x7f : 0x00;
		} else {
			playLed = engine.getValue(group, "play_indicator") ? 0x7f : 0x00;
			cueLed = engine.getValue(group, "cue_indicator") ? 0x7f : 0x00;
			syncLed = engine.getValue(group, "sync_enabled") ? 0x7f : 0x00;
		}
		midi.sendShortMsg(status, 0x07, playLed);
		midi.sendShortMsg(status, 0x06, cueLed);
		midi.sendShortMsg(status, 0x05, syncLed);
	}
};

DJCStarlight.shiftButton = function (channel, control, value, status, group) {
	DJCStarlight.shiftPressed = value >= 0x40;
	if (value > 0) {
		var now = Date.now();
		if (now - DJCStarlight.lastShiftPress <= DJCStarlight.layerDoubleTapWindow) {
			// Double tap: toggle the Alt action layer. The knobs change
			// targets, so arm their soft-takeover.
			DJCStarlight.latchedLayer = DJCStarlight.latchedLayer == "Alt" ? "None" : "Alt";
			DJCStarlight._setKnobTakeover();
			DJCStarlight.lastShiftPress = 0;
		} else {
			DJCStarlight.lastShiftPress = now;
		}
	}
	DJCStarlight._updateTransportLEDs();
	DJCStarlight._updateLayerLEDs();
	DJCStarlight._updatePadLEDs(1);
	DJCStarlight._updatePadLEDs(2);
	DJCStarlight._updateBpmFlashTimer(1);
	DJCStarlight._updateBpmFlashTimer(2);
	if (DJCStarlight.shiftPressed) {
		// When Shift is held, light the LEDs to show the status of the alt
		// functions of the cue buttons.
		var cueMasterLedValue = engine.getValue("[Master]", "headMix") > 0 ? 0x7f : 0x00;
		midi.sendShortMsg(0x91, 0x0c, cueMasterLedValue);
		var cueMixLedValue = engine.getValue("[Master]", "headSplit") ? 0x7f : 0x00;
		midi.sendShortMsg(0x92, 0x0c, cueMixLedValue);
	} else {
		// When Shift is released, go back to the normal LED values.
		var cueChan1LedValue = engine.getValue("[Channel1]", "pfl") ? 0x7f : 0x00;
		midi.sendShortMsg(0x91, 0x0c, cueChan1LedValue);
		var cueChan2LedValue = engine.getValue("[Channel2]", "pfl") ? 0x7f : 0x00;
		midi.sendShortMsg(0x92, 0x0c, cueChan2LedValue);
	}
};

DJCStarlight.shutdown = function () {
	// Reset base LED
	midi.sendShortMsg(0x90, 0x24, 0x7f);
};
