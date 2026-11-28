import { describe, expect, it } from 'vitest';
import type { Http } from '../src/images/http.js';
import { AsiaProvider, parseDetail, parseListIds } from '../src/images/asia.js';
import { KoreanProvider, LimitlessJpProvider } from '../src/images/direct-url.js';
import type { ImageQuery } from '../src/images/types.js';

function fakeHttp(routes: Record<string, string>, calls: string[] = []): Http {
  const get = async (url: string) => {
    calls.push(url);
    return routes[url] ?? null;
  };
  return {
    json: async () => null,
    text: get,
    bytes: async () => null,
  };
}

const card = (over: Partial<ImageQuery> = {}): ImageQuery => ({
  id: 1,
  pokemon: 'Alfa',
  setName: 'Set',
  setCode: 'SV4A',
  cardNumber: '150/190',
  note: '',
  languageCode: 'th',
  ...over,
});

const detail = (img: string, num: string, symbol: string) => `
<div class="cardImage">
  <img class="lazy" src="${img}" alt="x">
</div>
<span class="collectorNumber">${num}</span>
<span class="expansionSymbol"><img src="/th/card-img/symbol/${symbol}?v=1" alt=""></span>`;

const B = 'https://asia.pokemon-card.com';

describe('AsiaProvider', () => {
  it('parseListIds és parseDetail', () => {
    expect(
      parseListIds(
        '<a href="/th/card-search/detail/7760/"><img data-original="x"></a>' +
          '<a href="/th/card-search/detail/7760/">x</a><a href="/th/card-search/detail/12/">',
      ),
    ).toEqual(['7760', '12']);
    expect(
      parseDetail(detail('/th/card-img/th00007760.png', ' 150/190 ', 'sv4a_th.png'), 'th'),
    ).toEqual({
      image: `${B}/th/card-img/th00007760.png`,
      number: '150/190',
      setCode: 'sv4a',
    });
    expect(parseDetail('<html></html>', 'th')).toBeNull();
  });

  it('helyi névvel keres, szám és set alapján választ, lapoz és gyorsítótáraz', async () => {
    const calls: string[] = [];
    const list = `${B}/th/card-search/list/?keyword=${encodeURIComponent('อัลฟา')}`;
    const http = fakeHttp(
      {
        [list]: '<a href="/th/card-search/detail/1/"></a> <a href="?pageNo=2">2</a>',
        [`${list}&pageNo=2`]:
          '<a href="/th/card-search/detail/2/"></a><a href="/th/card-search/detail/3/"></a>',
        [`${B}/th/card-search/detail/1/`]: detail('/a.png', '150/190', 'sv1s_th.png'),
        [`${B}/th/card-search/detail/2/`]: detail('/b.png', '151/190', 'sv4a_th.png'),
        [`${B}/th/card-search/detail/3/`]: detail(
          'https://asia.pokemon-card.com/th/card-img/th00007760.png',
          '150/190',
          'sv4a_th.png',
        ),
      },
      calls,
    );
    const p = new AsiaProvider(http, { alfa: { th: 'อัลฟา' } });
    expect(await p.findImage(card(), 'th')).toEqual({
      url: `${B}/th/card-img/th00007760.png`,
      source: `${B}/th/card-search/detail/3/`,
    });
    const n = calls.length;
    expect(await p.findImage(card({ cardNumber: '151/190' }), 'th')).toMatchObject({
      url: `${B}/b.png`,
    });
    expect(calls.length).toBe(n); // minden a gyorsítótárból jött
    expect(await p.findImage(card({ cardNumber: '9/190' }), 'th')).toBeNull();
  });

  it('helyi név nélkül a kártya nevével keres; nem támogatott nyelvre nem kérdez', async () => {
    const calls: string[] = [];
    const p = new AsiaProvider(fakeHttp({}, calls), {});
    expect(await p.findImage(card({ languageCode: 'id' }), 'id')).toBeNull();
    expect(calls).toEqual([`${B}/id/card-search/list/?keyword=Alfa`]);
    expect(await p.findImage(card(), 'zh-tw')).toBeNull();
    expect(calls.at(-1)).toBe(`${B}/tw/card-search/list/?keyword=Alfa`);
    const before = calls.length;
    expect(await p.findImage(card(), 'de')).toBeNull();
    expect(calls.length).toBe(before);
  });
});

describe('KoreanProvider és LimitlessJpProvider', () => {
  it('a kép címe a setkódból és a számból áll össze', async () => {
    const ko = new KoreanProvider();
    expect(await ko.findImage(card({ setCode: 'sv1s', cardNumber: '68/078' }), 'ko')).toEqual({
      url: 'https://pokemoncard.co.kr/public-assets/home/data/cards.image_www/data/wmimages/SV/SV1S/SV1S_068.webp',
      source: 'https://pokemoncard.co.kr/cards (SV1S_068)',
    });
    expect(await ko.findImage(card(), 'ja')).toBeNull();
    expect(await ko.findImage(card({ setCode: 'SM1' }), 'ko')).toBeNull();
    expect(await ko.findImage(card({ cardNumber: 'SVP-1' }), 'ko')).toBeNull();

    const jp = new LimitlessJpProvider();
    expect(await jp.findImage(card({ setCode: 'SV-P', cardNumber: '008/SV-P' }), 'ja')).toEqual({
      url: 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SVP/SVP_8_R_JP.png',
      source: 'https://limitlesstcg.com/cards/jp/SVP/8',
    });
    expect(await jp.findImage(card({ setCode: null }), 'ja')).toBeNull();
    expect(await jp.findImage(card(), 'en')).toBeNull();
  });
});
