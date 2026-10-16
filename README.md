# Sama-Design

## Local preview

Install dependencies with `npm install`, then run `npm run build` and `npm start`. Open `http://localhost:8765` for the public site.

## Catalog image admin

Run `npm run admin:setup` once to set the admin password. The password is entered through a hidden terminal prompt; only a scrypt hash and a generated session secret are written to the ignored `.env` file. Open `http://localhost:8765/admin` to sign in and manage catalog images.

The admin route is protected by server-side authentication. Catalog images are uploaded to Cloudinary so changes are shared with all visitors and persist across Render deploys and restarts. Create a free Cloudinary account and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the local `.env` file and as environment variables in Render. Keep the API secret private.

Rebuild the Tailwind stylesheet after changing page styles with `npm run build`. For production, set `NODE_ENV=production` and serve over HTTPS so the authentication cookie is marked Secure.

## Deploy to Render

Create a new Blueprint in Render and select this repository. Render reads `render.yaml`, installs the locked dependencies, builds the stylesheet, and starts the Node server. Render provides the `PORT` environment variable automatically.

Before creating the service, generate the admin credentials locally with `npm run admin:setup`. In the ignored `.env` file, copy `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` into the matching environment-variable prompts in Render. Do not commit `.env` or share secret values. The web service will not start until the three admin variables are set; image uploads require the three Cloudinary variables.
