import test from 'node:test';
import assert from 'node:assert/strict';
import {
  engineeringTools, defaultInputs, bearingContact, retainingWallModel,
  beamModel, slabModel, rectangularFlexure, footingModel, shoringModel,
} from '../src/engineering.js';

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);
}

test('every engineering tool has valid defaults, numerical output and inspectable steps', () => {
  for (const [id, tool] of Object.entries(engineeringTools)) {
    const result = tool.calculate(defaultInputs(id));
    assert.ok(result.summary.length >= 3, id);
    assert.ok(result.steps.length >= 3, id);
    assert.ok(result.checks.length >= 2, id);
    assert.ok(result.notes.length >= 3, id);
    assert.ok(result.values, id);
    for (const item of result.summary) if (typeof item.value === 'number') assert.ok(Number.isFinite(item.value), id);
  }
});

test('imported invalid numeric values are rejected rather than coerced into plausible outputs', () => {
  for (const [id, tool] of Object.entries(engineeringTools)) {
    const key = tool.inputGroups[0].fields[0].key;
    for (const invalid of ['', '300', null, false, NaN, Infinity, { value: 3 }]) {
      assert.throws(() => tool.calculate({ ...defaultInputs(id), [key]: invalid }), Error, `${id}: ${String(invalid)}`);
    }
  }
  assert.throws(() => beamModel({ count: 4.5 }), /จำนวนเต็ม/);
  assert.throws(() => shoringModel({ legs: 3.1 }), /จำนวนเต็ม/);
});

test('centred footing pressure conserves vertical force', () => {
  const v = bearingContact(600, 0, 2, 3);
  assert.equal(v.regime, 'full');
  near(v.qmax, 100);
  near(v.qmin, 100);
  near((v.qmax + v.qmin) / 2 * 2 * 3, 600);
});

test('full-contact pressure conserves both force and applied eccentric moment', () => {
  const N = 600, M = 100, B = 2, L = 3;
  const v = bearingContact(N, M, B, L);
  const force = L * B * (v.qmax + v.qmin) / 2;
  const moment = L * (v.qmax - v.qmin) * B ** 2 / 12;
  near(force, N);
  near(moment, M);
  const mirrored = bearingContact(N, -M, B, L);
  near(mirrored.qmax, v.qmax);
  near(mirrored.qmin, v.qmin);
  assert.equal(mirrored.direction, -1);
});

test('partial contact uses a triangular compression block and conserves load and eccentricity', () => {
  const N = 600, M = 360, B = 2, L = 3;
  const v = bearingContact(N, M, B, L);
  assert.equal(v.regime, 'partial');
  near(v.eccentricity, 0.6);
  near(v.contactWidth, 1.2);
  near(v.qmax, 1000 / 3);
  near(v.qmax * v.contactWidth * L / 2, N);
  near(B / 2 - v.contactWidth / 3, M / N);
  assert.notEqual(v.contactWidth, B - 2 * v.eccentricity);
  assert.equal(v.qmin, 0);
});

test('contact transition is continuous at the kern boundary and fails at or beyond the edge', () => {
  const boundary = bearingContact(600, 200, 2, 2);
  assert.equal(boundary.regime, 'full');
  near(boundary.qmin, 0);
  near(boundary.qmax, 300);
  const above = bearingContact(600, 200.000001, 2, 2);
  assert.equal(above.regime, 'partial');
  near(above.qmax, boundary.qmax, 1e-7);
  for (const M of [600, -600, 601, -601]) {
    const v = bearingContact(600, M, 2, 2);
    assert.equal(v.stable, false);
    assert.equal(v.qmax, null);
  }
  assert.equal(bearingContact(0, 0, 2, 2).regime, 'uplift');
  assert.equal(bearingContact(-100, 20, 2, 2).stable, false);
});

test('dry wall reduces to closed-form triangular soil and rectangular surcharge pressures', () => {
  const v = retainingWallModel({ height: 3, phi: 30, gammaDry: 18, waterHeight: 0, surcharge: 10, base: 0.4 });
  near(v.ka, 1 / 3);
  near(v.pressureHeight, 3.4);
  near(v.soilForce, 18 * 3.4 ** 2 / 6);
  near(v.soilMomentBottom, 18 * 3.4 ** 3 / 18);
  near(v.surchargeForce, 10 * 3.4 / 3);
  near(v.surchargeMomentBottom, 10 * 3.4 ** 2 / 6);
  near(v.waterForce, 0);
  near(v.horizontalMoment, v.soilForce * 3.4 / 3 + v.surchargeForce * 3.4 / 2);
  near(v.normal, v.weight);
});

test('layered effective soil pressure equals independent layer integration; water is not multiplied by Ka', () => {
  const v = retainingWallModel({ height: 4, waterHeight: 2, gammaDry: 18, gammaSat: 20, surcharge: 0, phi: 30 });
  const topHeight = 2.4;
  const dryTriangle = 0.5 * 18 * topHeight ** 2;
  const submergedRectangle = 18 * topHeight * 2;
  const submergedTriangle = 0.5 * (20 - 9.81) * 2 ** 2;
  near(v.soilForce, v.ka * (dryTriangle + submergedRectangle + submergedTriangle));
  const moment = dryTriangle * (2 + topHeight / 3) + submergedRectangle * 1 + submergedTriangle * 2 / 3;
  near(v.soilMomentBottom, v.ka * moment);
  near(v.waterForce, 0.5 * 9.81 * 2 ** 2);
  near(v.waterMomentBottom, v.waterForce * 2 / 3);
  const strongerSoil = retainingWallModel({ height: 4, waterHeight: 2, gammaDry: 18, gammaSat: 20, surcharge: 0, phi: 40 });
  near(strongerSoil.waterForce, v.waterForce);
  assert.ok(strongerSoil.soilForce < v.soilForce);
  near(v.soilWeight, v.heel * (18 * 2.4 + 20 * 1.6));
});

test('full-height water gives correct effective and total pressure without double subtraction', () => {
  const v = retainingWallModel({ height: 3, waterHeight: 3.4, gammaDry: 18, gammaSat: 20, surcharge: 0 });
  near(v.soilForce, 0.5 * v.ka * (20 - 9.81) * 3.4 ** 2);
  near(v.waterForce, 0.5 * 9.81 * 3.4 ** 2);
  near(v.soilWeight, v.heel * 20 * 3);
  near(v.normal, v.weight);
});

test('uplift changes both normal force and base moment at its actual centroid', () => {
  const dry = retainingWallModel();
  const v = retainingWallModel({ upliftToe: 0, upliftHeel: 2 });
  near(v.uplift, 9.81 * v.width);
  near(v.upliftX, 2 * v.width / 3);
  near(v.normal, dry.weight - v.uplift);
  near(v.upliftMoment, v.uplift * v.upliftX);
  assert.ok(v.sliding < dry.sliding);
  assert.ok(v.overturning < dry.overturning);
  const lifted = engineeringTools['retaining-wall'].calculate({ upliftToe: 30, upliftHeel: 30 });
  assert.equal(lifted.values.contact.stable, false);
  assert.equal(lifted.values.contact.qmax, null);
  assert.ok(lifted.checks.some(check => check.pass === false));
});

test('retaining-wall geometry and water bounds reject impossible input', () => {
  assert.throws(() => retainingWallModel({ width: 1, toe: 0.7, stem: 0.3 }), /heel/);
  assert.throws(() => retainingWallModel({ waterHeight: 3.5, height: 3 }), /ระดับน้ำ/);
  assert.throws(() => retainingWallModel({ gammaSat: 17, gammaDry: 18 }), /อิ่มน้ำ/);
});

test('RC beam agrees with independently checked 300 × 500 mm, 4-D20 benchmark', () => {
  const v = beamModel({ b: 300, d: 500, fc: 28, fy: 400, diameter: 20, count: 4, mu: 150 });
  near(v.steelArea, 1256.6370614359173);
  near(v.a, 70.3998353745612);
  near(v.c, 82.8233357347779);
  near(v.strain, 0.015110838452487, 1e-8);
  near(v.nominalMoment, 233.6339914623866, 1e-7);
  near(v.capacity, 210.270592316148, 1e-7);
  assert.equal(v.tensionControlled, true);
});

test('out-of-scope RC compression-controlled section never receives a capacity or pass', () => {
  const v = beamModel({ b: 150, d: 150, diameter: 32, count: 8 });
  assert.equal(v.tensionControlled, false);
  assert.equal(v.capacity, null);
  assert.equal(v.nominalMoment, null);
  assert.equal(v.phi, null);
  const r = engineeringTools['rc-beam'].calculate({ b: 150, d: 150, diameter: 32, count: 8 });
  assert.equal(r.checks[0].pass, false);
  assert.equal(r.checks[1].pass, null);
  assert.throws(() => beamModel({ fc: 35 }), /ระหว่าง/);
});

test('RC strain boundary covers high-yield steel and demand does not change section strength', () => {
  const ordinary = beamModel({ fy: 400 });
  const highYield = beamModel({ fy: 600 });
  near(ordinary.strainLimit, 0.005);
  near(highYield.strainLimit, 0.006);
  near(beamModel({ mu: 1000 }).capacity, ordinary.capacity);
  assert.ok(beamModel({ mu: 1000 }).utilization > 1);
  assert.throws(() => rectangularFlexure({ b: 300, d: 500, fc: 28, fy: 400, steelArea: 0, mu: 20 }), /ขอบเขต/);
});

test('slab uses actual bar area per metre; halving spacing doubles steel area', () => {
  const coarse = slabModel({ diameter: 10, spacing: 200 });
  const fine = slabModel({ diameter: 10, spacing: 100 });
  near(coarse.steelArea, 5 * Math.PI * 10 ** 2 / 4);
  near(fine.steelArea, 2 * coarse.steelArea);
  near(coarse.b, 1000);
  assert.throws(() => slabModel({ diameter: 32, spacing: 25 }), /ระยะเรียง/);
});

test('footing schema passes signed moment to the correct contact regime', () => {
  const v = footingModel({ width: 2, length: 3, normal: 600, moment: -360 });
  assert.equal(v.regime, 'partial');
  assert.equal(v.direction, -1);
  near(v.contactWidth, 1.2);
});

test('shoring demand scales with tributary area and checks certified WLL, not invented member capacity', () => {
  const base = shoringModel();
  const wide = shoringModel({ gridX: 2.4 });
  near(wide.demand, base.demand * 2);
  near(base.serviceLoad, 0.2 * 24 + 0.5 + 2.5);
  near(base.demand, (0.2 * 24 + 0.5 + 2.5) * 1.2 * 1.2 * 1.2);
  near(base.reducedCapacity, 40 * 0.8);
  near(base.padPressure * base.padX * base.padY * base.legs, base.demand);
  const weaker = shoringModel({ capacity: 10, reuse: 0.5 });
  assert.ok(weaker.utilization > 1);
  assert.equal(engineeringTools.shoring.calculate({ capacity: 10, reuse: 0.5 }).checks[0].pass, false);
});
