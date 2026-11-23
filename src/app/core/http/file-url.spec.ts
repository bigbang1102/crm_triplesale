import { describe, expect, it } from 'vitest';
import { browserFileUrl } from './file-url';

const dev = { origin: 'http://localhost:4200', hostname: 'localhost' };
const api = 'https://uat.example.th';

describe('browserFileUrl', () => {
  it('sends a file of the API host through the dev proxy', () => {
    expect(browserFileUrl('https://uat.example.th/files/p/1/a.jpg?x=1', api, dev)).toBe('/ts-files/files/p/1/a.jpg?x=1');
  });
  it('leaves everything else as it is', () => {
    expect(browserFileUrl('https://other.th/a.jpg', api, dev)).toBe('https://other.th/a.jpg');
    expect(browserFileUrl('prospect/1/a.jpg', api, dev)).toBe('prospect/1/a.jpg');
    expect(browserFileUrl('https://uat.example.th/a.jpg', undefined, dev)).toBe('https://uat.example.th/a.jpg');
    // not on the dev server: the address is the real one
    expect(browserFileUrl('https://uat.example.th/a.jpg', api, { origin: 'https://app.example.th', hostname: 'app.example.th' })).toBe('https://uat.example.th/a.jpg');
    // same origin already
    expect(browserFileUrl('https://uat.example.th/a.jpg', api, { origin: 'https://uat.example.th', hostname: 'localhost' })).toBe('https://uat.example.th/a.jpg');
  });
});
