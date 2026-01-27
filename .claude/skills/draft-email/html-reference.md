# Outlook-Safe HTML Email Reference

All emails are rendered in Microsoft Outlook. Use only these patterns.

## Base Wrapper

Every email uses the simple.hbs template via `wrapWithSignature()` from `services/email/email-templates/index.ts`. The wrapper provides:

- `font-family: Arial, sans-serif; font-size: 14px; color: #333`
- Signature block (Best, / -- / name / title / email / phone)
- Desert Services logo as inline attachment (`<img src="cid:logo">`)

## Signature + Logo Integration

The signature and logo are handled by the template system, NOT by the draft. When drafting:

1. Output ONLY the email body content (greeting through last line before signature)
2. The signature is appended automatically by `wrapWithSignature()`
3. The logo PNG is attached inline via `getLogoAttachment()` with `contentId: "logo"`

The full signature block rendered by the system:

```html
<div>Best,</div>
<div>--</div>
<div><br></div>
<div>Chi Ejimofor</div>
<div>Project Coordinator</div>
<div>E: <a href="mailto:chi@desertservices.net">chi@desertservices.net</a></div>
<div>M: (304) 405-2446</div>
<div><img src="cid:logo" alt="Desert Services LLC" width="264" style="max-width:100%"></div>
```

**Do NOT include the signature or logo in the drafted body.** Just output the body content up to the last line before "Best,".

## Element Patterns

### Line / Paragraph

```html
<div>Text content here</div>
```

Never use `<p>` tags — Outlook adds extra spacing. Always `<div>`.

### Blank Line (Spacing)

```html
<div><br></div>
```

Use this between logical sections: after greeting, between paragraphs, before signature.

### Bold

```html
<b>important text</b>
```

Use `<b>`, not `<strong>`. Outlook handles `<b>` more consistently.

### Link

```html
<a href="mailto:kendra@desertservices.net">kendra@desertservices.net</a>
<a href="https://example.com">link text</a>
```

### Unordered List (Bullets)

```html
<ul style="margin-top:0; margin-bottom:0">
  <li><div>First item</div></li>
  <li><div>Second item</div></li>
  <li><div>Third item</div></li>
</ul>
```

Always wrap list item content in `<div>`. Always include the margin reset on `<ul>`.

### Ordered List (Numbered)

```html
<ol style="margin-top:0; margin-bottom:0">
  <li><div>First item</div></li>
  <li><div>Second item</div></li>
</ol>
```

### Inline Numbered Items (Chi's Style)

When Chi uses informal numbering in prose (not a formal list), use plain text with parenthetical numbers:

```html
<div>(1) The contract lists IDG, which is no longer our active company name/entity. Can you update the contract to match Desert Services LLC?</div>
<div>(2) Then in Exhibits B-2 and B-3, $5M aggregate coverage is required...</div>
```

### Pricing Line Items

```html
<div>Compost Filter Sock (1,200 LF) — $2,940.00</div>
```

Use em dash `—` (not hyphen `-` or en dash `–`) between description and price.

## Complete Email Body Example

```html
<div>Matt,</div>
<div><br></div>
<div>I reviewed the LOI and had a few comments/questions (see attached for markup).</div>
<div><br></div>
<div>Could you provide the schedule of values that you used to get to this $19,439 total?</div>
<div><br></div>
<div>Exhibit A.16 Did you want Desert Services to provide water trucks for Dust Control? Currently, this line would be out of scope but we can provide pricing and include it if you wish.</div>
<div><br></div>
<div>Exhibit A.34 Silt Fence &amp; Wattle are specified here. Usually only filter sock is required per ADEQ. Did you actually want silt fence? Pricing for that is $5.50/LF vs Compost Filter Sock $2.75/LF</div>
<div><br></div>
<div>Let me know if you need an updated quote with water trucks for site water/dust control, lot washes, backflow meter.</div>
```

Note: No signature in the body — it's appended by the template system.

## Things to AVOID

- `<p>` tags (Outlook double-spaces them)
- `<strong>` (use `<b>`)
- `<em>` or `<i>` (Chi doesn't use italics)
- Inline `style` on `<div>` elements (unnecessary, inherits from wrapper)
- `<br>` at end of `<div>` content (the `<div>` itself creates the line break)
- `<table>` for layout (never use tables)
- CSS classes (Outlook strips them)
- `<span>` with styling (use `<b>` for bold, plain text for everything else)
