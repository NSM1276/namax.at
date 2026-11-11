// Run: node tools/motion.test.mjs   (no output = pass)
import assert from 'node:assert/strict';
await import('../js/motion.js');
const { sceneProgress, exitProgress, enterProgress, stepOf } = globalThis.__motion;

// pinned scene: 0 while its top is below the viewport top, 1 when its bottom reaches the viewport bottom
assert.equal(sceneProgress(100, 3000, 800), 0);
assert.equal(sceneProgress(0, 3000, 800), 0);
assert.equal(sceneProgress(-1100, 3000, 800), 0.5);
assert.equal(sceneProgress(-2200, 3000, 800), 1);
assert.equal(sceneProgress(-9999, 3000, 800), 1);
assert.equal(sceneProgress(0, 600, 800), 0); // scene shorter than viewport: no division by zero

// exit scene: how far a normal-height section has scrolled off the top
assert.equal(exitProgress(0, 800), 0);
assert.equal(exitProgress(-400, 800), 0.5);
assert.equal(exitProgress(-2000, 800), 1);
assert.equal(exitProgress(50, 800), 0);
assert.equal(exitProgress(0, 0), 0);

// enter scene: how far a section has come up into the viewport
assert.equal(enterProgress(800, 800, 800), 0);
assert.equal(enterProgress(400, 800, 800), 0.5);
assert.equal(enterProgress(0, 800, 800), 1);
assert.equal(enterProgress(-300, 800, 800), 1);
assert.equal(enterProgress(600, 400, 800), 0.5); // short section: fully entered after its own height

assert.equal(stepOf(0, 5), 0);
assert.equal(stepOf(0.5, 5), 2);
assert.equal(stepOf(1, 5), 4); // never past the last step
assert.equal(stepOf(0.99, 1), 0);

// stacked cards: the step is the card that is fully on top, so it rounds to the nearest card
const { stackStep, needsUnpin } = globalThis.__motion;
assert.equal(stackStep(0, 5), 0);
assert.equal(stackStep(0.2, 5), 1);   // card 1 is 80% in: it is the one being looked at
assert.equal(stackStep(0.5, 5), 2);
assert.equal(stackStep(1, 5), 4);
assert.equal(stackStep(0.7, 1), 0);

// a pinned scene whose content is taller than its box must not be pinned (content would be clipped)
assert.equal(needsUnpin(600, 640), false);
assert.equal(needsUnpin(640, 640), false);
assert.equal(needsUnpin(641, 640), false); // sub-pixel rounding tolerance
assert.equal(needsUnpin(660, 640), true);
