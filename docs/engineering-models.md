# Engineering screening models

These independently written models reproduce useful, visible *categories* of engineering work. They do not reproduce an unseen proprietary calculation engine and do not certify a design. The UI presents the assumptions, input units, substitutions, numerical checks and source links with every calculation. Initial input values are examples.

Implementation: `src/engineering.js`. Numerical and boundary checks: `tests/engineering.test.mjs`. All methods use finite numeric inputs; strings, null, booleans and non-finite values are rejected. Omitted fields use documented example defaults. Input ranges are deliberately bounded and do not imply validity for every real project inside the range.

## Retaining wall

The model is a uniform vertical concrete stem on a rectangular base, with level cohesionless backfill and sufficient wall movement for active pressure. It evaluates static external stability per metre of wall. Geometry is measured in metres; forces are kN/m, moments kN·m/m, weights kN/m³, and pressures kPa.

`H` is soil height **above the top of the footing**, `B` is footing width, and `t` is footing thickness. The lateral-pressure height is `D = H + t`, measured from the footing underside to ground level on the virtual vertical plane behind the heel. This includes pressure across the footing-side depth. Heel length is `B − toe − stem`. The pressure plane has no wall friction, cohesion, passive resistance, key or seismic load. The soil friction-angle range exposed by the UI is 10–45°.

For water height `hw` **above the footing underside**, bounded by `0 ≤ hw ≤ D`:

```text
Ka = (1 − sin φ)/(1 + sin φ)
γ′ = γsat − γw; γw = 9.81 kN/m³
Ps = Ka/2 [γdry D² + (γ′ − γdry) hw²]
Ms,bottom = Ka/6 [γdry D³ + (γ′ − γdry) hw³]
Pq = Ka q D; Mq,bottom = Pq D/2
Pw = γw hw²/2; Mw,bottom = Pw hw/3
P = Ps + Pq + Pw
Mh,bottom = Ms,bottom + Mq,bottom + Mw,bottom
```

Water pressure is separate and is **never multiplied by Ka**. All moments are already about the footing underside; no second footing-thickness shift is added. The saturated height of soil **above the heel** is `hsoil = max(0, hw − t)`. Its self-weight is `heel × [γdry(H − hsoil) + γsat hsoil]`, using total `γsat`, not submerged unit weight. The beneficial vertical surcharge above the heel is conservatively omitted; its lateral pressure is included.

Uplift is specified independently using heads above the footing underside at the toe (`hT`) and heel (`hH`), with linearly varying pressure:

```text
U = γw B (hT + hH)/2
xU = B (hT + 2hH)/(3(hT + hH)), if hT + hH > 0
N = W − U
FSslide = μN/P, only for N > 0
FSoverturn = MW/(Mh + U xU)
xR = (MW − Mh − U xU)/N
e = B/2 − xR
```

`MW` includes the actual centroids of base, stem and soil above the heel. No double subtraction of buoyancy is made. A zero uplift input is an assumption, not a finding about site drainage. A non-positive `N` is an uplift failure; a resultant outside the footing is a failure without a numerical bearing pressure.

The sliding and overturning ratios are conventional screening ratios with **user-entered** thresholds (example defaults 1.5 and 2.0). They do not implement USACE's complete design framework or its developed/reduced shear-strength sliding method. Gross bearing pressure is compared with the user-entered gross allowable bearing pressure.

Not included: global/slope stability, settlement, seepage/piping, seismic pressures, wall/footing reinforcement, flexure, shear, shear keys, passive soil, sloping backfill, cohesion, consolidation or construction stages.

## Uniaxial footing contact

A rigid rectangular footing of width `B` in the eccentricity direction and perpendicular length `L` is loaded by `N` and signed moment `M` at the footing underside. Soil takes compression only. Inputs are service-level loads when comparing with allowable soil pressure.

```text
e = |M|/N
Full contact, e ≤ B/6:
  qmax,min = N/(BL) (1 ± 6e/B)
Partial contact, B/6 < e < B/2:
  a = 3(B/2 − e)
  qmax = 2N/(aL); qmin = 0
No compressive equilibrium, e ≥ B/2 or N ≤ 0:
  no bearing-pressure value is reported
```

The contact width `a` is distinct from the effective width `B − 2e` used in some bearing-capacity procedures. Partial contact is reported explicitly, including a failed full-contact check. The model does not manufacture a negative tensile soil pressure.

The input `N` and `M` must already include footing weight, soil weight and uplift; the standalone footing tool does not silently add them. Not included: biaxial bending, soil stiffness/settlement, bearing-capacity derivation, punching shear, one-way shear, reinforcement or foundation interaction.

## Rectangular reinforced-concrete beam / one-way slab

Units are mm and MPa inside the stress-block calculation, with moment in kN·m. Slab output is per metre width. The model is a singly reinforced rectangular section with equivalent rectangular stress block and tensile steel centroid at `d`.

The implemented concrete-strength range is deliberately limited to **17–28 MPa** so `β1 = 0.85`. Steel yield strength is limited to 200–600 MPa. Steel elasticity modulus is 200,000 MPa and assumed extreme concrete strain is 0.003.

```text
Beam As = number × π db²/4
Slab As = (1000/spacing) × π db²/4, b = 1000 mm
a = As fy/(0.85 f′c b)
c = a/β1
εt = 0.003 (d − c)/c
εlimit = max(0.005, fy/200000 + 0.003)
```

The yielded-steel nominal moment expression and reduction factor are only used when `εt ≥ εlimit`:

```text
Mn = As fy (d − a/2) × 10⁻⁶
φ = 0.90
capacity = φ Mn
utilization = Mu/capacity
```

For a section outside the tension-controlled scope, the program returns no nominal/design moment capacity, no utilization and no strength pass. It does not extrapolate a fixed `φ = 0.90` to compression-controlled sections.

Hand-check benchmark: `b = 300`, `d = 500`, `f′c = 28`, `fy = 400`, four 20 mm bars produce approximately `As = 1256.637 mm²`, `a = 70.400 mm`, `c = 82.823 mm`, `εt = 0.015111`, `Mn = 233.634 kN·m` and `φMn = 210.271 kN·m`.

The user supplies factored moment `Mu`; there is no automatic load-combination selection. This is a flexural-capacity calculation, **not a full ACI compliance check**. Minimum/maximum reinforcement provisions, detailing, clear cover, bar clearances, development/anchorage, shear, punching, deflection, cracking, two-way slabs, continuous analysis and compression reinforcement are not checked.

## Frame-shoring gravity demand

This calculator derives a tributary-area gravity demand and compares it with the **user's certified working load limit** for a complete frame. The example WLL is not a manufacturer's recommendation.

```text
q = (γconcrete × slab thickness + form load + construction live load) × amplification
Pframe = q × gridX × gridY
WLLadjusted = certified WLL × condition factor
Pleg = Pframe / number of legs
qpad = Pleg/(padX × padY)
```

Legs are assumed equally loaded. WLL must correspond to the actual model, frame height, jack extensions, bracing and configuration. WLL already refers to working load and must not be confused with ultimate strength or LRFD resistance. The optional amplification factor is an explicitly applied demand allowance; it is not identified as a prescribed standard factor.

Not included: member design, joists, bearers, jacks/U-heads, buckling, lateral loads, bracing, unequal leg load, concentrated stored materials, slab support capacity, ground settlement, casting sequence or FEA. Passing these two numerical comparisons alone is insufficient to approve a shoring system.

## Sources and applicability

- [USACE EM 1110-2-2502 (2022)](https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf?JMIwQ0zD=0N5Sl): reference for Rankine earth pressures, groundwater and surcharge. The app's conventional FS screening is not asserted to be a complete implementation of the manual.
- [FHWA: eccentricity and contact pressure](https://www.fhwa.dot.gov/publications/research/infrastructure/bridge/14094/004.cfm): full, partial and lost contact under eccentric load.
- [FHWA: flexural section calculations](https://www.fhwa.dot.gov/bridge/lrfd/pscus04.cfm): rectangular compression-block equilibrium and lever arm.
- [Caltrans Bridge Design Practice 5.4 (2022)](https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/bridge-design-practices/202210bdpchapter54precastpretensionedboxgirdera11y.pdf): strain compatibility and stress-block examples. The app is not a prestressed-girder model.
- [ACI article on the tension-controlled strain limit](https://www.concrete.org/publications/getarticle.aspx?m=icap&pubID=51740277): reason to account for yield strain when selecting the tension-controlled scope.

The statics-based shoring demand calculation is a derivation from user-provided loads, areas and certified working limits; it does not claim a manufacturer or AISC capacity calculation.

## Numerical verification

Tests use force/moment equilibrium and independent hand values, not only snapshots of implementation output. They cover both contact transitions, sign symmetry, wall pressure integration in layers, independent hydrostatic load, moment-datum offsets, uplift centroids, physical failures, RC strain gating, a checked RC benchmark, slab area scaling, shoring tributary-area scaling and malformed imported inputs.
