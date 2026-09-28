const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const envPath = path.join(__dirname, '.env');
const forceReset = process.argv.includes('--reset');

function readSecret(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this setup directly in an interactive terminal.'));
  }

  process.stdout.write(prompt);
  input.setEncoding('utf8');
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          input.removeListener('data', onData);
          input.setRawMode(false);
          process.stdout.write('\nSetup cancelled.\n');
          reject(new Error('Setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    input.on('data', onData);
  });
}

async function main() {
  if (fs.existsSync(envPath) && !forceReset) {
    throw new Error('Admin is already configured. To change its password, run `npm run admin:setup -- --reset`.');
  }

  const password = await readSecret('New admin password (hidden, at least 12 characters): ');
  const confirmation = await readSecret('Repeat the password: ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const cost = 32768;
  const blockSize = 8;
  const parallelization = 1;
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024
  });
  const passwordHash = `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString('hex')}$${hash.toString('hex')}`;
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const envContents = `ADMIN_USERNAME=sama\nADMIN_PASSWORD_HASH=${passwordHash}\nSESSION_SECRET=${sessionSecret}\n`;
  fs.writeFileSync(envPath, envContents, { mode: 0o600 });
  console.log('Admin credentials configured. The plaintext password was not saved.');
  console.log('Start the protected site with `npm start`.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
