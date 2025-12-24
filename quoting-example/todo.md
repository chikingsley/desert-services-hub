# Quoting Service TODO

## Colors/Styling

- [ ] Fix card colors - Bill To, Job Info, Line Items section should look like cards, not flat
- [ ] Fix input styling - orange ring/highlight with proper inside color

## Layout/Header

- [ ] Move Saved indicator to top right corner
- [ ] Move Settings to gear icon in top right, remove from tabs
- [ ] Remove Plus tab - New quote should work differently
- [ ] Add logo and responsive brand text top left
- [ ] Make Quote Editor title bigger
- [ ] Keep Estimator/Date/Estimate# in row on tablet

## Responsiveness

- [ ] Fix Bill To section responsiveness
- [ ] Fix Job Information responsiveness
- [ ] Fix line items table - breaks at certain widths
- [ ] Create card view for line items on mobile

## PDF Preview

- [ ] Make PDF preview collapsible sidebar (not always open)
- [ ] Add option to view PDF as modal
- [ ] Fix PDF zoom - too zoomed in
- [ ] Add Download button at bottom of editor (like mobile)

## QuotesTable

- [ ] Make search fuzzy on all fields, not just estimate#
- [ ] Make status a changeable dropdown
- [ ] Replace native confirm with shadcn dialog for delete
- [ ] Fix column label alignment
- [ ] Add address column (truncated)
- [ ] Make columns resizable

## Features

- [ ] Add subtitle/section feature for line items
- [ ] Brainstorm Draft/Lock/Archive workflow

## Infrastructure

- [ ] Research Fusejs - can it deploy to Cloudflare serverless?

## Company Enrichment / ContractorAutocomplete

- [ ] Fix ContractorAutocomplete to fill address/phone when selecting contractor (currently only fills name + email)
- [ ] Add "Enrich" button to Create New Company form
- [ ] Show loading state while enriching (skeleton/spinner on fields)
- [ ] Show suggestions UI - fields marked as "suggested" with accept/reject per field
- [ ] Add "Accept All" / "Skip" buttons for suggestions
- [ ] Consider extending contractors DB schema (website, description, founded, industry)
- [ ] Handle name collisions (e.g. "Baker Construction" - national vs local)

---

## CSS Variables (reference)

:root {
  --background: #fafafa;
  --foreground: #16181d;
  --card: #ffffff;
  --card-foreground: #16181d;
  --popover: #ffffff;
  --popover-foreground: #16181d;
  --primary: #e0891f;
  --primary-foreground: #ffffff;
  --secondary: #ededed;
  --secondary-foreground: #16181d;
  --muted: #ededed;
  --muted-foreground: #737373;
  --accent: #e6e6e6;
  --accent-foreground: #e0891f;
  --destructive: #ef4343;
  --destructive-foreground: #ffffff;
  --border: #d9d9d9;
  --input: #e6e6e6;
  --ring: #e0891f;
  --chart-1: #e0891f;
  --chart-2: #22c3a8;
  --chart-3: #7c67e4;
  --chart-4: #d9ac26;
  --chart-5: #dd3cdd;
  --sidebar: #f2f2f2;
  --sidebar-foreground: #16181d;
  --sidebar-primary: #e0891f;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e6e6e6;
  --sidebar-accent-foreground: #e0891f;
  --sidebar-border: #cccccc;
  --sidebar-ring: #e0891f;
  --font-sans: 'Inter', sans-serif;
  --font-serif: 'Merriweather', serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius: 0.3rem;
  --shadow-x: 0px;
  --shadow-y: 0px;
  --shadow-blur: 0px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.0;
  --shadow-color: hsl(0, 0%, 0%);
  --shadow-2xs: 0px 0px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-xs: 0px 0px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-sm: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow-md: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 2px 4px -1px hsl(0 0% 0% / 0.00);
  --shadow-lg: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 4px 6px -1px hsl(0 0% 0% / 0.00);
  --shadow-xl: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 8px 10px -1px hsl(0 0% 0% / 0.00);
  --shadow-2xl: 0px 0px 0px 0px hsl(0 0% 0% / 0.00);
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}

.dark {
  --background: #16181d;
  --foreground: #e6e6e6;
  --card: #121317;
  --card-foreground: #e6e6e6;
  --popover: #121317;
  --popover-foreground: #e6e6e6;
  --primary: #e0891f;
  --primary-foreground: #16181d;
  --secondary: #21242c;
  --secondary-foreground: #e6e6e6;
  --muted: #21242c;
  --muted-foreground: #999999;
  --accent: #2c313a;
  --accent-foreground: #e0891f;
  --destructive: #ef4343;
  --destructive-foreground: #e6e6e6;
  --border: #404040;
  --input: #272c34;
  --ring: #e0891f;
  --chart-1: #e0891f;
  --chart-2: #22c3a8;
  --chart-3: #7c67e4;
  --chart-4: #d9ac26;
  --chart-5: #dd3cdd;
  --sidebar: #1a1d23;
  --sidebar-foreground: #e6e6e6;
  --sidebar-primary: #e0891f;
  --sidebar-primary-foreground: #16181d;
  --sidebar-accent: #2c313a;
  --sidebar-accent-foreground: #e0891f;
  --sidebar-border: #404040;
  --sidebar-ring: #e0891f;
  --font-sans: 'Inter', sans-serif;
  --font-serif: 'Merriweather', serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius: 0.3rem;
  --shadow-x: 0px;
  --shadow-y: 0px;
  --shadow-blur: 0px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.0;
  --shadow-color: hsl(0, 0%, 0%);
  --shadow-2xs: 0px 0px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-xs: 0px 0px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-sm: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow-md: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 2px 4px -1px hsl(0 0% 0% / 0.00);
  --shadow-lg: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 4px 6px -1px hsl(0 0% 0% / 0.00);
  --shadow-xl: 0px 0px 0px 0px hsl(0 0% 0% / 0.00), 0px 8px 10px -1px hsl(0 0% 0% / 0.00);
  --shadow-2xl: 0px 0px 0px 0px hsl(0 0% 0% / 0.00);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}
