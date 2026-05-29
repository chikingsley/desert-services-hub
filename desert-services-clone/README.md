# Desert Services (Next.js Clone)

This repo contains:

- `desertservices.net/`: the original static crawl (reference only)
- `src/`: the new Next.js app (Next.js `16.1.6`)
- `public/wp-content/`: locally served theme/Elementor assets used to preserve the original look

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure env vars (see `.env.example`):

- `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_TO`

3. Run dev server:

```bash
npm run dev
```

## Forms

- Contact form posts to `POST /api/forms/contact` (Resend email, then redirects to `/contact/?submitted=1`)
- Service request form posts to `POST /api/forms/service-request` (supports attachments up to 20MB total, then redirects to `/servicerequests/thank-you/`)

