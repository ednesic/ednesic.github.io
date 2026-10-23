import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, wrapAngle, axes, makeRng } from '../src/utils.js';

test('fmt shows minutes and tenths', () => {
  assert.equal(fmt(65.25), '1:05.3');
  assert.equal(fmt(9.04), '0:09.0');
});

test('wrapAngle keeps angles in -π..π', () => {
  assert.ok(Math.abs(wrapAngle(3 * Math.PI / 2) + Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(wrapAngle(-0.3) + 0.3) < 1e-12);
});

test('axes: forward and right are unit vectors at right angles, right turned clockwise from forward', () => {
  for (const psi of [0, 0.4, -2]) {
    const { fx, fy, rx, ry } = axes(psi);
    assert.ok(Math.abs(Math.hypot(fx, fy) - 1) < 1e-12);
    assert.ok(Math.abs(fx * rx + fy * ry) < 1e-12);
  }
  assert.deepEqual(axes(0), { fx: 0, fy: 1, rx: 1, ry: -0 });
});

test('makeRng repeats for the same seed', () => {
  const a = makeRng(5), b = makeRng(5);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
