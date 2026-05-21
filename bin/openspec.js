#!/usr/bin/env node

process.env.QASPEC_DEPRECATED_SHIM = '1';
await import('../dist/cli/index.js');
