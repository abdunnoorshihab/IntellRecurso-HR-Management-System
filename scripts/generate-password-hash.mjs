import crypto from 'node:crypto';

const password = process.env.HRMS_ADMIN_PASSWORD;
if (!password || password.length < 10) {
  console.error('Set HRMS_ADMIN_PASSWORD to a value of at least 10 characters.');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
console.log(`${salt}:${hash}`);
