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
const cookieName = 'sama_admin_session';
const sessionLifetime = 8 * 60 * 60;
const attempts = new Map();
const scrypt = promisify(crypto.scrypt);

if (!username || !passwordHash || !sessionSecret) {
  console.error('Admin is not configured. Run `npm run admin:setup` first.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
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
  if (!hasValidSession(req)) return res.redirect(303, '/admin/login');
  next();
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

app.use('/dist', express.static(path.join(root, 'dist'), { dotfiles: 'deny', index: false }));
app.get('/catalog-images.js', (req, res) => res.sendFile(path.join(root, 'catalog-images.js')));
app.use((req, res) => res.sendStatus(404));

app.listen(port, () => console.log(`Sama-Design is running at http://localhost:${port}`));
