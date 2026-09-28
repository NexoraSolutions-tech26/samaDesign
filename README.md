# Sama-Design

## Local preview

Install dependencies with `npm install`, then run `npm run build` and `npm start`. Open `http://localhost:8765` for the public site.

## Catalog image admin

Run `npm run admin:setup` once to set the admin password. The password is entered through a hidden terminal prompt; only a scrypt hash and a generated session secret are written to the ignored `.env` file. Open `http://localhost:8765/admin` to sign in and manage catalog images.

The admin route is protected by server-side authentication. Catalog image changes are still stored in the current browser's local storage and do not synchronize to visitors or other devices; shared production storage still needs to be connected.

Rebuild the Tailwind stylesheet after changing page styles with `npm run build`. For production, set `NODE_ENV=production` and serve over HTTPS so the authentication cookie is marked Secure.
