# Deploy Safety Checklist

Use this before touching the production PM2 process.

## Local or server build check

```bash
npm run build
npm run deploy:check
```

The check fails if `dist/public/index.html` references missing assets or if a built JS/CSS asset looks like fallback HTML.

## Production URL check

After building on the Hostinger server, but before considering the deploy healthy:

```bash
npm run deploy:check -- https://venysound.com
```

For JavaScript assets, the result must be a 2xx response with a JavaScript content type. If an `/assets/*.js` URL returns `text/html`, the React app will not mount and users may only see the AdSense fallback content.

## Minimum production deploy sequence

```bash
cd /var/www/venysound/app && git fetch origin main && git reset --hard origin/main && npm install --include=dev && npm run db:deploy && npm run build && npm run deploy:check -- https://venysound.com && npm prune --omit=dev && pm2 restart venysound
```

If `deploy:check` fails, stop and inspect the server before restarting PM2.
