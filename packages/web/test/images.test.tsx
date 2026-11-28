import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Card } from '@gms/shared';
import { App } from '../src/App';
import { CardImage } from '../src/components/CardImage';
import { mockApi, renderWithProviders } from './render';

const health = { ok: true, version: '0.2.0', dbPath: '/x', appTitle: 'Teszt' };
const lang = { id: 3, name: 'German', nameHu: 'Német', shortCode: 'DE', sortOrder: 3 };

function card(id: number, image: Partial<Card['image']>): Card {
  return {
    id,
    displayId: `DE-Alfa-${id}`,
    owned: false,
    onTheWay: false,
    pokemon: 'Alfa',
    setName: 'Set',
    setCode: 'S',
    cardNumber: `${id}/10`,
    finish: { id: 1, name: 'Normal', description: null },
    language: lang,
    note: '',
    image: {
      status: 'pending',
      url: null,
      thumbUrl: null,
      languageId: null,
      languageNameHu: null,
      ...image,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('CardImage (S-41, S-42)', () => {
  it('keresés közben "Kép keresése…", kép nélkül helykitöltő a névvel és számmal', () => {
    const { rerender } = renderWithProviders(<CardImage card={card(1, {})} />);
    expect(screen.getByTestId('image-searching')).toHaveTextContent('Kép keresése…');
    expect(screen.getByText('Alfa')).toBeInTheDocument();
    expect(screen.getByText('1/10')).toBeInTheDocument();
    rerender(<CardImage card={card(2, { status: 'none' })} />);
    expect(screen.queryByTestId('image-searching')).not.toBeInTheDocument();
  });

  it('rácson a bélyegképet, a részleteknél a nagy képet használja; tartalék képen jelvény', () => {
    const c = card(1, {
      status: 'fallback',
      url: '/api/images/1-a.webp',
      thumbUrl: '/api/images/1-a-thumb.webp',
      languageId: 1,
      languageNameHu: 'Angol',
    });
    const { container, rerender } = renderWithProviders(<CardImage card={c} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/images/1-a-thumb.webp');
    expect(screen.getByTestId('image-badge')).toHaveTextContent('Kép: angol');
    rerender(<CardImage card={c} size="large" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/images/1-a.webp');
    expect(screen.queryByTestId('image-badge')).not.toBeInTheDocument();
    rerender(<CardImage card={{ ...c, image: { ...c.image, status: 'exact' } }} />);
    expect(screen.queryByTestId('image-badge')).not.toBeInTheDocument();
  });
});

describe('részletek és beállítások (S-43, S-40/EF4)', () => {
  it('S-43: "Kép újrakeresése" gomb, az eredmény a panelen látszik', async () => {
    const fallback = card(1, { status: 'fallback', languageNameHu: 'Angol', languageId: 1 });
    const refreshed = { ...fallback, image: { ...fallback.image, status: 'pending' as const } };
    const fetchMock = mockApi({
      '/api/health': { body: health },
      '/api/cards': { body: [fallback] },
      '/api/cards/1': { body: fallback },
      'POST /api/cards/1/image/refresh': { body: refreshed },
      '/api/images/status': {
        body: { total: 1, pending: 1, exact: 0, fallback: 0, none: 0, error: 0 },
      },
    });
    renderWithProviders(<App />, '/kartyak/1');
    const panel = await screen.findByTestId('card-details');
    expect(await within(panel).findByTestId('image-result')).toHaveTextContent(
      'Nincs pontos kép, tartalék: angol nyelvű lap.',
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Kép újrakeresése' }));
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Kép keresése…' })).toBeDisabled(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/1/image/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(within(panel).getByTestId('image-result')).toHaveTextContent('folyamatban');
  });

  it('saját kép: link mentése, hibaüzenet, fájl feltöltése', async () => {
    const none = card(1, { status: 'none' });
    const saved = {
      ...none,
      image: { ...none.image, status: 'exact' as const, url: '/api/images/1-abcdef12.webp' },
    };
    let calls = 0;
    const fetchMock = mockApi({
      '/api/health': { body: health },
      '/api/cards': { body: [none] },
      '/api/cards/1': { body: none },
      'PUT /api/cards/1/image': () =>
        ++calls === 1
          ? {
              status: 400,
              body: {
                error: { code: 'DOWNLOAD', message: 'A kép nem tölthető le erről a linkről.' },
              },
            }
          : { body: saved },
      '/api/images/status': {
        body: { total: 1, pending: 0, exact: 0, fallback: 0, none: 1, error: 0 },
      },
    });
    renderWithProviders(<App />, '/kartyak/1');
    const panel = await screen.findByTestId('card-details');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Saját kép megadása' }));
    const field = within(panel).getByRole('textbox', { name: 'Képlink' });
    const save = within(panel).getByRole('button', { name: 'Link mentése' });
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: 'https://example.org/x.png' } });
    fireEvent.click(save);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('nem tölthető le');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/1/image',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ url: 'https://example.org/x.png' }),
      }),
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'k.png', { type: 'image/png' });
    fireEvent.change(within(panel).getByLabelText('Kép feltöltése…', { selector: 'input' }), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(within(panel).queryByRole('textbox', { name: 'Képlink' })).not.toBeInTheDocument(),
    );
    const last = fetchMock.mock.calls.at(-1)!;
    expect((last[1] as RequestInit).body).toBe(file);
    expect((last[1] as RequestInit).headers).toMatchObject({ 'content-type': 'image/png' });
  });

  it('S-40/EF4: a Beállítások a képállapot darabszámait mutatja', async () => {
    mockApi({
      '/api/health': { body: health },
      '/api/import/summary': {
        status: 404,
        body: { error: { code: 'NOT_IMPORTED', message: 'x' } },
      },
      '/api/lookups': { body: { languages: [], finishes: [], pokemon: [], sets: [] } },
      '/api/images/status': {
        body: { total: 10, pending: 0, exact: 6, fallback: 2, none: 1, error: 1 },
      },
    });
    renderWithProviders(<App />, '/beallitasok');
    const box = await screen.findByTestId('image-status');
    expect(within(box).getByTestId('image-count-exact')).toHaveTextContent('6');
    expect(within(box).getByTestId('image-count-fallback')).toHaveTextContent('2');
    expect(within(box).getByTestId('image-count-none')).toHaveTextContent('1');
    expect(within(box).getByTestId('image-count-pending')).toHaveTextContent('0');
    expect(within(box).getByTestId('image-count-error')).toHaveTextContent('1');
  });
});
