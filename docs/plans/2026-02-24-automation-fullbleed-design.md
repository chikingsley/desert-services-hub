# Full-Bleed VNC Automation Page

## Problem

The automation page wastes ~45% of viewport on chrome (status card, padding, header, tab buttons). The VNC panel — the thing you're actually looking at — gets squeezed into the remaining space.

## Design

Adopt the map page pattern: VNC fills 100% of the available space, all controls float on top as absolutely-positioned overlays.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [● Ready] [Maricopa ▾]              [Ensure] [KA] [Stop]  │  ← Floating toolbar
│                                                             │
│                                                             │
│                     VNC PANEL                               │
│                   (fills 100%)                              │
│                                                             │
│  ┌──────────────────────────────────────────┐               │
│  │ ⚠ Submit renewal for D0056693?  [Yes][No]│               │  ← Checkpoint (floating)
│  └──────────────────────────────────────────┘               │
│                                                             │
│  ● Portal ready                              Cmd+V to paste│  ← Status badge (existing)
└─────────────────────────────────────────────────────────────┘
```

## Changes

### 1. automation.tsx — Full-bleed layout

- Remove `<PageHeader>`, padding wrapper (`p-6 lg:p-8`), status card, tab buttons
- Root element becomes `position: relative; width: 100%; height: 100%`
- VNC panel fills the entire surface
- Always-mounted pattern in `app.tsx` is preserved unchanged

### 2. New floating toolbar

- Single horizontal bar: `absolute top-3 left-3 right-3 z-20`
- Styled: `backdrop-blur-sm bg-black/70 border border-border rounded-xl`
- Left side: status dot + label, portal switcher pill (Maricopa / BuildingConnected)
- Right side: action buttons (Ensure Ready, Keep Alive, Stop)
- Clipboard hint (`Cmd+V to paste`) as subtle text on the right

### 3. Telemetry — on-demand

- The 6 telemetry fields (last login, last keepalive, busy, etc.) move to a tooltip/popover
- Triggered by clicking the status indicator
- Not always visible — these are diagnostic, not operational

### 4. CheckpointBanner — floating overlay

- Position: `absolute bottom-16 left-3 right-3 z-30` (above status badge)
- Same content and Yes/No buttons
- Amber border + backdrop-blur for visibility against VNC content

### 5. Error banners — floating

- "Status check failed" and "Last error" float below the toolbar
- Auto-dismiss when error clears (SWR polling handles this)

### 6. Sidebar consolidation

- Merge "Maricopa Portal" and "BuildingConnected" into single "Automation" nav item
- Route: `/automation` (defaults to Maricopa view)
- `/maricopa` and `/buildingconnected` still work as deep links
- Portal switching handled by the floating toolbar pill, not sidebar
- Sidebar footer portal status dot unchanged

### 7. vnc-panel.tsx — no changes

- Already fills 100% of its parent container
- Status badge at bottom-left already works in this layout
- Scanline overlay, clipboard callbacks, WebSocket connection — all untouched

## What doesn't change

- app.tsx RootLayout always-mounted pattern
- WebSocket URLs, clipboard bridge, auto-reconnect
- PermitClient / automation API proxy
- BuildingConnected auth status polling
- Sidebar footer portal status indicator

## Space comparison

| | Before | After |
|---|---|---|
| VNC panel | ~55% of viewport | ~100% of viewport |
| Chrome overhead | ~360px | ~0px (floating overlays) |
| Telemetry | Always visible (6 fields) | On-demand (click to expand) |
