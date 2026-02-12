# Outlook-Safe HTML Email Reference

All emails are rendered in Microsoft Outlook. Use only these patterns.

## Base Wrapper

Every email uses the `simple.hbs` wrapper via `wrapWithSignature()` from `apps/cli-tools/email-cli/src/email-templates/index.ts`. The wrapper provides:

- `font-family: Aptos, sans-serif; font-size: 12pt; color: #333`
- Signature block (Best, / -- / name / title / email / phone)
- Desert Services logo as inline attachment (`<img src="cid:logo">`)

## Signature Handling

**For drafts created via MCP:** Use `skipSignature: true`. Outlook adds the signature from account settings when you send.

**For programmatic sends using templates:** The signature is baked into the template or added by `wrapWithSignature()`.

The full signature block:

```html
<div>Best,</div>
<div>--</div>
<div><br></div>
<div>Chi Ejimofor</div>
<div>Project Coordinator</div>
<div>E: <a href="mailto:chi@desertservices.net">chi@desertservices.net</a></div>
<div>M: (304) 216-8700</div>
<div><img src="cid:logo" alt="Desert Services LLC" width="264" style="max-width:100%"></div>
```

## Text Content

```html
<div>Text content here</div>
```

## Line Breaks (Blank Lines)

```html
<div><br></div>
```

## Bold Text

```html
<b>important text</b>
```

## Links

```html
<a href="mailto:kendra@desertservices.net">kendra@desertservices.net</a>
<a href="https://example.com">link text</a>
```

## Unordered Lists (CRITICAL)

Use `<ul>` with zero top/bottom margins to avoid extra spacing in Outlook.

```html
<ul style="margin-top:0; margin-bottom:0;">
  <li><div>First item</div></li>
  <li><div>Second item</div></li>
  <li><div>Third item</div></li>
</ul>
```

**IMPORTANT:**

- Do NOT add `<div><br></div>` before or after lists — creates double spacing
- Use exactly `style="margin-top:0; margin-bottom:0;"` on `<ul>/<ol>`

## Ordered Lists

Same rules as unordered lists:

```html
<ol style="margin-top:0; margin-bottom:0;">
  <li><div>First item</div></li>
  <li><div>Second item</div></li>
</ol>
```

## Inline Numbered Points (Alternative to Lists)

When you need tighter control over spacing:

```html
<div>(1) First point here.</div>
<div>(2) Second point here.</div>
```

## Line Items with Prices

```html
<div>Compost Filter Sock (1,200 LF) — $2,940.00</div>
```

## Full Example Email

```html
<div>Matt,</div>
<div><br></div>
<div>I reviewed the LOI and had a few comments/questions (see attached for markup).</div>
<div><br></div>
<div>Could you provide the schedule of values that you used to get to this $19,439 total?</div>
<ul>
<li><div><b>Item 1:</b> Value here</div></li>
<li><div><b>Item 2:</b> Value here</div></li>
</ul>
<div>Let me know if you have any questions!</div>
```

Note: No signature in the body when using `skipSignature: true` — Outlook adds it.

## Things to AVOID

- `<p>` tags (Outlook double-spaces them)
- `<strong>` (use `<b>`)
- `<em>` or `<i>` (Chi doesn't use italics)
- Inline `style` on `<div>` elements (unnecessary, inherits from wrapper)
- `<br>` at end of `<div>` content (the `<div>` itself creates the line break)
- `<table>` for layout (never use tables)
- CSS classes (Outlook strips them)
- `<span>` with styling (use `<b>` for bold, plain text for everything else)
- Missing zero-margins on `<ul>/<ol>` — can introduce inconsistent spacing in Outlook
- `<div><br></div>` before/after `<ul>` — creates double spacing
