import { describe, expect, it } from 'vitest';
import { ehRobo } from './robos';

describe('ehRobo', () => {
  it.each([
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'Slackbot-LinkExpanding 1.0',
    'python-requests/2.31.0',
  ])('reconhece %s', (ua) => expect(ehRobo(ua)).toBe(true));

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    // navegador interno do Instagram/Facebook: é gente clicando no anúncio
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0 FBAN/FBIOS',
  ])('trata como pessoa: %s', (ua) => expect(ehRobo(ua)).toBe(false));

  it('sem user-agent conta como pessoa', () => {
    expect(ehRobo(null)).toBe(false);
    expect(ehRobo('')).toBe(false);
  });
});
