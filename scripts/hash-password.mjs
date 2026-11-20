// Helper for setting up logins.
//   npm run hash-password            -> asks for a password (hidden) and prints its hash
//   npm run hash-password -- --secret -> prints a random AUTH_SECRET
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../api/_lib/auth.js';

if (process.argv.includes('--secret')) {
  console.log(randomBytes(48).toString('base64url'));
  process.exit(0);
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.on('data', (c) => (data += c));
      process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
      return;
    }
    process.stdout.write(prompt);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function onKey(ch) {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onKey);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(1); // Ctrl+C
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    });
  });
}

const password = await askHidden('Password: ');
if (password.length < 8) {
  console.error('Use at least 8 characters.');
  process.exit(1);
}
console.log('\nPut this after the username in AUTH_USERS, e.g.  owner:<hash>\n');
console.log(hashPassword(password));
