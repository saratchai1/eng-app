# Verification record

Date: 21 November 2026 (Asia/Bangkok)

Release checks: `npm run check` passed; `npm test` passed all 55 tests; `npm run build` produced the static application in `dist/`.

## Numerical and workflow checks

The Node test suite independently checks physical equilibrium and hand-computable benchmarks, not only matching displayed output to the implementation. Covered cases include:

- Full-contact and partial-contact footing force/moment equilibrium, both moment signs, kern continuity and loss of contact.
- Independent integration of dry and submerged Rankine pressures, hydrostatic pressure without multiplying by Ka, footing-underside datum and uplift centroid.
- RC reference section capacity 210.270603 kN·m for b=300 mm, d=500 mm, f′c=28 MPa, fy=400 MPa and four 20 mm bars; no usable capacity outside the tension-controlled scope.
- Slab steel per metre, shoring tributary-load scaling and user-specified WLL.
- Geometric volume/area unit consistency, weighted indices and invalid inputs.
- BOQ order of overhead/VAT, CPM branching/cycles/date rollover/progress weighting, checklist states and bounded image imports.
- Polygon geometry/calibration, invalid image payloads, quiz scoring and CSV formula escaping.
- Project identity after refresh, independent per-tool and per-project drafts, stale-draft protection, reset/delete scope, legacy migration and explicit persistence failures.

## Browser checks

Performed in a real browser against the local app:

- All 20 catalog routes load their expected tool without a load error.
- Thai search narrows “กำแพง” to the retaining-wall tool.
- Changing wall friction/water changes the force and FS output; blank height suppresses results and shows an actionable error.
- Editable BOQ quantity and added material/labor row produce a hand-verified total: 402,100 baht direct cost × 1.10 × 1.07 = 473,271.70 baht.
- Saving, editing, refreshing and saving the same project preserves its identity instead of creating a duplicate. The edited quantity remains 22 and the saved-project count remains one.
- Two saved RC-beam projects retain independent unsaved edits: A keeps Mu = 111 kN·m and B keeps Mu = 222 kN·m after switching between both projects; B also retains its name and value after refresh.
- An actual JSON download and file-picker reimport preserve all six BOQ rows and the edited total of 479,745.20 baht.
- The image-measurement UI preserves manually entered coordinates between points. On an 800 × 500 px image at 0.02 m/px, a 400 px segment measures 8 m and a 400 × 200 px rectangle measures 32 m².
- The report preview includes the project name, units, image measurements and declared scope. Native print/PDF system dialogs were not automated.
- Two correct quiz answers show 2/12 and explain unanswered questions separately.
- Phone (390 px iframe) and tablet (768 px iframe) render responsive layouts without body horizontal overflow. Toolbars and category strips remain accessible.

This is model and application verification within the documented scope. It is not professional certification of complete structural designs, official government forms, manufacturer capacities or live market data. Browser-specific print dialogs and device camera behavior can vary.
