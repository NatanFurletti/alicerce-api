import { FixedClock, SystemClock } from './clock';
import { SequentialIdGenerator, UuidGenerator } from './id-generator';

describe('Clock', () => {
  it('SystemClock devolve a hora atual', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock devolve sempre o mesmo instante', () => {
    const fixed = new Date('2026-02-01T12:00:00Z');
    const clock = new FixedClock(fixed);
    expect(clock.now()).toEqual(fixed);
    expect(clock.now()).toEqual(fixed);
  });

  it('FixedClock devolve cópia — mutar o retorno não corrompe o relógio', () => {
    const clock = new FixedClock(new Date('2026-02-01T12:00:00Z'));
    clock.now().setFullYear(1999);
    expect(clock.now().getFullYear()).toBe(2026);
  });
});

describe('IdGenerator', () => {
  it('UuidGenerator produz UUID v4 válido e único', () => {
    const generator = new UuidGenerator();
    const first = generator.generate();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first).not.toBe(generator.generate());
  });

  it('UuidGenerator não colide em volume', () => {
    const generator = new UuidGenerator();
    const ids = new Set(Array.from({ length: 1000 }, () => generator.generate()));
    expect(ids.size).toBe(1000);
  });

  it('SequentialIdGenerator produz ids previsíveis com prefixo', () => {
    const generator = new SequentialIdGenerator('sim');
    expect(generator.generate()).toBe('sim-1');
    expect(generator.generate()).toBe('sim-2');
  });

  it('SequentialIdGenerator usa prefixo default quando omitido', () => {
    expect(new SequentialIdGenerator().generate()).toBe('id-1');
  });
});
