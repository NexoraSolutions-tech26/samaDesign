require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const path = require('node:path');
const { promisify } = require('node:util');

const app = express();
const root = __dirname;
const port = Number(process.env.PORT || 8765);
const username = process.env.ADMIN_USERNAME || '';
const passwordHash = process.env.ADMIN_PASSWORD_HASH || '';
const sessionSecret = process.env.SESSION_SECRET || '';
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || '';
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || '';
const cookieName = 'sama_admin_session';
const sessionLifetime = 8 * 60 * 60;
const attempts = new Map();
const scrypt = promisify(crypto.scrypt);
const catalogImageKeys = [
  'kitchen-1',
  'table-1',
  'wardrobe-1',
  'wall-1',
  'kitchen-2',
  'table-2',
  'wardrobe-2',
  'living-1'
];
let catalogImageCache = { expiresAt: 0, images: {} };

if (!username || !passwordHash || !sessionSecret) {
  console.error('Admin is not configured. Run `npm run admin:setup` first.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '4kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

function constantTimeStringEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left)).digest();
  const rightHash = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function parseCookie(header, name) {
  const pair = (header || '').split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : '';
}

function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ user, exp: Math.floor(Date.now() / 1000) + sessionLifetime })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function hasValidSession(req) {
  const token = parseCookie(req.headers.cookie, cookieName);
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  if (!constantTimeStringEqual(signature, expected)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.user === username && Number.isInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetime}${secure}`);
}

function requireAdmin(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!hasValidSession(req)) {
    if (req.path.startsWith('/admin/catalog-images')) return res.status(401).json({ error: 'انتهت الجلسة. سجّل الدخول مجدداً.' });
    return res.redirect(303, '/admin/login');
  }
  next();
}

function cloudinaryIsConfigured() {
  return Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);
}

function cloudinarySignature(params) {
  const value = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${value}${cloudinaryApiSecret}`).digest('hex');
}

async function cloudinaryRequest(endpoint, options) {
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${endpoint}`, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error?.message || `Cloudinary returned ${response.status}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  return result;
}

async function uploadCatalogImage(key, file) {
  const params = {
    overwrite: 'true',
    public_id: `sama-design/catalog/${key}`,
    timestamp: String(Math.floor(Date.now() / 1000))
  };
  const form = new FormData();
  Object.entries(params).forEach(([name, value]) => form.set(name, value));
  form.set('api_key', cloudinaryApiKey);
  form.set('signature', cloudinarySignature(params));
  form.set('file', file);
  return cloudinaryRequest('image/upload', { method: 'POST', body: form });
}

async function deleteCatalogImage(key) {
  const params = {
    invalidate: 'true',
    public_id: `sama-design/catalog/${key}`,
    timestamp: String(Math.floor(Date.now() / 1000))
  };
  const form = new FormData();
  Object.entries(params).forEach(([name, value]) => form.set(name, value));
  form.set('api_key', cloudinaryApiKey);
  form.set('signature', cloudinarySignature(params));
  return cloudinaryRequest('image/destroy', { method: 'POST', body: form });
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = attempts.get(ip);
  if (!entry || now - entry.startedAt >= windowMs) {
    attempts.set(ip, { startedAt: now, count: 0 });
    return true;
  }
  return entry.count < 5;
}

function recordFailure(ip) {
  const entry = attempts.get(ip);
  if (entry) entry.count += 1;
}

async function verifyPassword(password) {
  const parts = passwordHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!Number.isInteger(cost) || cost < 2 || cost > 32768 || salt.length < 16 || expected.length !== 64) return false;

  const actual = await scrypt(password, salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024
  });
  return crypto.timingSafeEqual(actual, expected);
}

app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/admin/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (hasValidSession(req)) return res.redirect(303, '/admin');
  res.sendFile(path.join(root, 'login.html'));
});
app.post('/admin/login', async (req, res, next) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) return res.redirect(303, '/admin/login?error=1');
  try {
    const providedUser = String(req.body.username || '');
    const providedPassword = String(req.body.password || '');
    const userMatches = constantTimeStringEqual(providedUser, username);
    const passwordMatches = await verifyPassword(providedPassword);
    if (!userMatches || !passwordMatches) {
      recordFailure(ip);
      return res.redirect(303, '/admin/login?error=1');
    }
    attempts.delete(ip);
    setSessionCookie(res, createSession(username));
    return res.redirect(303, '/admin');
  } catch (error) {
    next(error);
  }
});
app.get(['/admin', '/admin/'], requireAdmin, (req, res) => res.sendFile(path.join(root, 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect(303, '/admin'));
app.get('/admin.js', requireAdmin, (req, res) => res.sendFile(path.join(root, 'admin.js')));
app.post('/admin/logout', requireAdmin, (req, res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  res.redirect(303, '/admin/login');
});

app.get('/api/catalog-images', async (req, res, next) => {
  if (!cloudinaryIsConfigured()) {
    return res.status(503).json({ error: 'خدمة تخزين الصور غير مضبوطة على الخادم.' });
  }
  if (catalogImageCache.expiresAt > Date.now()) {
    return res.set('Cache-Control', 'no-store').json(catalogImageCache.images);
  }

  try {
    const endpoint = new URL(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/resources/image/upload`);
    endpoint.searchParams.set('prefix', 'sama-design/catalog/');
    endpoint.searchParams.set('max_results', '100');
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${cloudinaryApiKey}:${cloudinaryApiSecret}`).toString('base64')}`
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error?.message || `Cloudinary returned ${response.status}`);
      error.statusCode = 502;
      throw error;
    }
    if (!Array.isArray(result.resources)) {
      const error = new Error('Cloudinary returned an invalid image list');
      error.statusCode = 502;
      throw error;
    }
    const images = {};
    result.resources.forEach((resource) => {
      const key = resource.public_id.slice('sama-design/catalog/'.length);
      if (catalogImageKeys.includes(key) && typeof resource.secure_url === 'string') {
        images[key] = resource.secure_url;
      }
    });
    catalogImageCache = { expiresAt: Date.now() + 15000, images };
    return res.set('Cache-Control', 'no-store').json(images);
  } catch (error) {
    next(error);
  }
});

app.post('/admin/catalog-images/reset', requireAdmin, async (req, res, next) => {
  if (!cloudinaryIsConfigured()) {
    return res.status(503).json({ error: 'خدمة تخزين الصور غير مضبوطة على الخادم.' });
  }
  const keys = req.body?.keys ?? catalogImageKeys;
  if (!Array.isArray(keys) || keys.some((key) => !catalogImageKeys.includes(key))) {
    return res.status(400).json({ error: 'قائمة صور غير صحيحة.' });
  }
  try {
    await Promise.all(keys.map(deleteCatalogImage));
    catalogImageCache = { expiresAt: 0, images: {} };
    return res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.post('/admin/catalog-images/:key', requireAdmin, express.raw({ type: 'image/webp', limit: '8mb' }), async (req, res, next) => {
  const { key } = req.params;
  if (!catalogImageKeys.includes(key)) return res.status(404).json({ error: 'عنصر الكتالوج غير موجود.' });
  if (!cloudinaryIsConfigured()) {
    return res.status(503).json({ error: 'خدمة تخزين الصور غير مضبوطة على الخادم.' });
  }

  let file;
  if (Buffer.isBuffer(req.body) && req.body.length >= 12
    && req.body.toString('ascii', 0, 4) === 'RIFF'
    && req.body.toString('ascii', 8, 12) === 'WEBP') {
    file = new Blob([req.body], { type: 'image/webp' });
  } else if (req.is('application/json') && typeof req.body?.url === 'string') {
    try {
      const url = new URL(req.body.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid URL protocol');
      file = url.href;
    } catch {
      return res.status(400).json({ error: 'أدخل رابط صورة صحيحاً يبدأ بـ http:// أو https://.' });
    }
  } else {
    return res.status(400).json({ error: 'اختر صورة WebP صحيحة أو أدخل رابط صورة.' });
  }

  try {
    const result = await uploadCatalogImage(key, file);
    if (typeof result.secure_url !== 'string') {
      const error = new Error('Cloudinary did not return an image URL');
      error.statusCode = 502;
      throw error;
    }
    catalogImageCache = { expiresAt: 0, images: {} };
    return res.json({ url: result.secure_url });
  } catch (error) {
    next(error);
  }
});

app.delete('/admin/catalog-images/:key', requireAdmin, async (req, res, next) => {
  const { key } = req.params;
  if (!catalogImageKeys.includes(key)) return res.status(404).json({ error: 'عنصر الكتالوج غير موجود.' });
  if (!cloudinaryIsConfigured()) {
    return res.status(503).json({ error: 'خدمة تخزين الصور غير مضبوطة على الخادم.' });
  }
  try {
    await deleteCatalogImage(key);
    catalogImageCache = { expiresAt: 0, images: {} };
    return res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.use('/dist', express.static(path.join(root, 'dist'), { dotfiles: 'deny', index: false }));
app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny', index: false }));
app.get('/catalog-images.js', (req, res) => res.sendFile(path.join(root, 'catalog-images.js')));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = error.statusCode || error.status || 500;
  if (req.path.startsWith('/admin/catalog-images') || req.path === '/api/catalog-images') {
    return res.status(status).json({ error: status === 413 ? 'حجم الصورة كبير جداً.' : 'تعذر إكمال العملية. تحقق من إعداد التخزين وحاول مجدداً.' });
  }
  return res.status(status).send('حدث خطأ في الخادم.');
});
app.use((req, res) => res.sendStatus(404));

app.listen(port, () => console.log(`Sama-Design is running at http://localhost:${port}`));
