import { describe, expect, it } from 'vitest';
import { allowedOrigins } from './app.setup.js';

describe('allowedOrigins', () => {
  it('adds localhost next to 127.0.0.1 on the same port', () => {
    expect(allowedOrigins('http://127.0.0.1:3000')).toEqual([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ]);
  });

  it('adds 127.0.0.1 next to localhost', () => {
    expect(allowedOrigins('http://localhost:5173')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('allows only the configured origin for a real host', () => {
    expect(allowedOrigins('https://kb.example.com')).toEqual(['https://kb.example.com']);
  });
});
