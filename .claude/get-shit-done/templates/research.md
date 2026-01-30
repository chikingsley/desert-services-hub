# Research Template

Template for `.planning/phases/XX-name/{phase}-RESEARCH.md` - comprehensive ecosystem research before planning.

**Purpose:** Document what Claude needs to know to implement a phase well - not just "which library" but "how do experts build this."

---

## File Template

```markdown
# Phase [X]: [Name] - Research

**Researched:** [date]
**Domain:** [primary technology/problem domain]
**Confidence:** [HIGH/MEDIUM/LOW]

<research_summary>
## Summary

[2-3 paragraph executive summary]
- What was researched
- What the standard approach is
- Key recommendations

**Primary recommendation:** [one-liner actionable guidance]
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [name] | [ver] | [what it does] | [why experts use it] |
| [name] | [ver] | [what it does] | [why experts use it] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| [name] | [ver] | [what it does] | [use case] |
| [name] | [ver] | [what it does] | [use case] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| [standard] | [alternative] | [when alternative makes sense] |

**Installation:**
```bash
npm install [packages]
# or
yarn add [packages]
```html
```

src/
├── [folder]/        # [purpose]
├── [folder]/        # [purpose]
└── [folder]/        # [purpose]

```css
```typescript
// [code example from Context7/official docs]
```css
```typescript
// [code example]
```csv
```typescript
// Source: [Context7/official docs URL]
[code]
```css
```typescript
// Source: [Context7/official docs URL]
[code]
```css
```typescript
// Source: [Context7/official docs URL]
[code]
```html
```

---

## Good Example

```markdown
# Phase 3: 3D City Driving - Research

**Researched:** 2025-01-20
**Domain:** Three.js 3D web game with driving mechanics
**Confidence:** HIGH

<research_summary>
## Summary

Researched the Three.js ecosystem for building a 3D city driving game. The standard approach uses Three.js with React Three Fiber for component architecture, Rapier for physics, and drei for common helpers.

Key finding: Don't hand-roll physics or collision detection. Rapier (via @react-three/rapier) handles vehicle physics, terrain collision, and city object interactions efficiently. Custom physics code leads to bugs and performance issues.

**Primary recommendation:** Use R3F + Rapier + drei stack. Start with vehicle controller from drei, add Rapier vehicle physics, build city with instanced meshes for performance.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | 0.160.0 | 3D rendering | The standard for web 3D |
| @react-three/fiber | 8.15.0 | React renderer for Three.js | Declarative 3D, better DX |
| @react-three/drei | 9.92.0 | Helpers and abstractions | Solves common problems |
| @react-three/rapier | 1.2.1 | Physics engine bindings | Best physics for R3F |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/postprocessing | 2.16.0 | Visual effects | Bloom, DOF, motion blur |
| leva | 0.9.35 | Debug UI | Tweaking parameters |
| zustand | 4.4.7 | State management | Game state, UI state |
| use-sound | 4.0.1 | Audio | Engine sounds, ambient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rapier | Cannon.js | Cannon simpler but less performant for vehicles |
| R3F | Vanilla Three | Vanilla if no React, but R3F DX is much better |
| drei | Custom helpers | drei is battle-tested, don't reinvent |

**Installation:**
```bash
npm install three @react-three/fiber @react-three/drei @react-three/rapier zustand
```html
```

src/
├── components/
│   ├── Vehicle/          # Player car with physics
│   ├── City/             # City generation and buildings
│   ├── Road/             # Road network
│   └── Environment/      # Sky, lighting, fog
├── hooks/
│   ├── useVehicleControls.ts
│   └── useGameState.ts
├── stores/
│   └── gameStore.ts      # Zustand state
└── utils/
    └── cityGenerator.ts  # Procedural generation helpers

```css
```typescript
// Source: @react-three/rapier docs
import { RigidBody, useRapier } from '@react-three/rapier'

function Vehicle() {
  const rigidBody = useRef()

  return (
    <RigidBody
      ref={rigidBody}
      type="dynamic"
      colliders="hull"
      mass={1500}
      linearDamping={0.5}
      angularDamping={0.5}
    >
      <mesh>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardMaterial />
      </mesh>
    </RigidBody>
  )
}
```csv
```typescript
// Source: drei docs
import { Instances, Instance } from '@react-three/drei'

function Buildings({ positions }) {
  return (
    <Instances limit={1000}>
      <boxGeometry />
      <meshStandardMaterial />
      {positions.map((pos, i) => (
        <Instance key={i} position={pos} scale={[1, Math.random() * 5 + 1, 1]} />
      ))}
    </Instances>
  )
}
```csv
```typescript
// Source: @react-three/rapier getting started
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'

function Game() {
  return (
    <Canvas>
      <Physics gravity={[0, -9.81, 0]}>
        <Vehicle />
        <City />
        <Ground />
      </Physics>
    </Canvas>
  )
}
```css
```typescript
// Source: Community pattern, verified with drei docs
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'

function useVehicleControls(rigidBodyRef) {
  const [, getKeys] = useKeyboardControls()

  useFrame(() => {
    const { forward, back, left, right } = getKeys()
    const body = rigidBodyRef.current
    if (!body) return

    const impulse = { x: 0, y: 0, z: 0 }
    if (forward) impulse.z -= 10
    if (back) impulse.z += 5

    body.applyImpulse(impulse, true)

    if (left) body.applyTorqueImpulse({ x: 0, y: 2, z: 0 }, true)
    if (right) body.applyTorqueImpulse({ x: 0, y: -2, z: 0 }, true)
  })
}
```html
```

---

## Guidelines

**When to create:**

- Before planning phases in niche/complex domains
- When Claude's training data is likely stale or sparse
- When "how do experts do this" matters more than "which library"

**Structure:**

- Use XML tags for section markers (matches GSD templates)
- Seven core sections: summary, standard_stack, architecture_patterns, dont_hand_roll, common_pitfalls, code_examples, sources
- All sections required (drives comprehensive research)

**Content quality:**

- Standard stack: Specific versions, not just names
- Architecture: Include actual code examples from authoritative sources
- Don't hand-roll: Be explicit about what problems to NOT solve yourself
- Pitfalls: Include warning signs, not just "don't do this"
- Sources: Mark confidence levels honestly

**Integration with planning:**

- RESEARCH.md loaded as @context reference in PLAN.md
- Standard stack informs library choices
- Don't hand-roll prevents custom solutions
- Pitfalls inform verification criteria
- Code examples can be referenced in task actions

**After creation:**

- File lives in phase directory: `.planning/phases/XX-name/{phase}-RESEARCH.md`
- Referenced during planning workflow
- plan-phase loads it automatically when present
