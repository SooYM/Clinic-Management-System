import { afterEach, expect, it, vi } from 'vitest';
import { prepareLogo } from '../src/client/logo-upload';

afterEach(() => vi.unstubAllGlobals());

it('rejects unsupported and oversized source images before decoding', async () => {
  await expect(prepareLogo({ type: 'image/svg+xml', size: 20 } as File)).rejects.toThrow(
    'PNG or JPEG',
  );
  await expect(
    prepareLogo({ type: 'image/png', size: 10 * 1024 * 1024 + 1 } as File),
  ).rejects.toThrow('10 MB');
});

it('shrinks large logos to the stored byte limit while preserving their aspect ratio', async () => {
  vi.stubGlobal(
    'FileReader',
    class {
      result = 'data:image/png;base64,c291cmNl';
      onload!: () => void;
      readAsDataURL() {
        this.onload();
      }
    },
  );
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 2400;
      naturalHeight = 1200;
      async decode() {}
    },
  );
  const drawImage = vi.fn();
  const sizes: number[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toDataURL(type: string) {
      sizes.push([this.width, this.height]);
      return `data:${type};base64,` + 'A'.repeat(this.width > 900 ? 240000 : 120000);
    },
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  const value = await prepareLogo({ type: 'image/png', size: 400000 } as File);
  expect(sizes).toEqual([
    [1200, 600],
    [900, 450],
  ]);
  expect(drawImage).toHaveBeenCalledTimes(2);
  expect(Buffer.from(value.split(',')[1], 'base64').length).toBeLessThanOrEqual(160 * 1024);
});

it('reports corrupt images without attempting to draw them', async () => {
  vi.stubGlobal(
    'FileReader',
    class {
      result = 'data:image/png;base64,YmFk';
      onload!: () => void;
      readAsDataURL() {
        this.onload();
      }
    },
  );
  vi.stubGlobal(
    'Image',
    class {
      async decode() {
        throw new Error('decode failed');
      }
    },
  );
  await expect(prepareLogo({ type: 'image/png', size: 3 } as File)).rejects.toThrow(
    'valid PNG or JPEG',
  );
});
