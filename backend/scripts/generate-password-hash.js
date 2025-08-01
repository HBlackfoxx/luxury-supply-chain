#!/usr/bin/env node

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.log('Usage: node generate-password-hash.js <password>');
  process.exit(1);
}

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log(`Password: ${password}`);
console.log(`Hash: ${hash}`);
console.log(`\nVerifying...`);
console.log(`Match: ${bcrypt.compareSync(password, hash)}`);