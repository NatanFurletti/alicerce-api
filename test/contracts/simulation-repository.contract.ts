import type { Simulation } from '../../src/domain/entities/simulation';
import type { SimulationRepository } from '../../src/domain/repositories/simulation-repository';
import { makeDbSimulation } from '../builders/simulation-builder';
import { uuidFor } from '../builders/uuid';

/**
 * Contrato do `SimulationRepository`, executado contra TODAS as implementações.
 *
 * **Por que isto existe.** Os casos de uso da Etapa 2 são testados contra um fake em
 * memória. Se o fake ordena por data decrescente e a implementação Prisma esquecer o
 * `orderBy`, os testes de caso de uso continuam verdes e a produção quebra — o fake
 * mentiria sobre o contrato.
 *
 * Cada garantia que um caso de uso assume vira um caso aqui, e as duas implementações
 * precisam passar nos mesmos testes. É a especificação executável da interface: um
 * repositório novo (cache, outro banco) só está pronto quando passa nesta suíte.
 *
 * Os fixtures inserem **fora de ordem** de propósito. Um teste de ordenação cujo
 * fixture já está ordenado passa por coincidência, mesmo sem `ORDER BY`.
 */
export function testSimulationRepositoryContract(
  name: string,
  setup: {
    makeRepository: () => Promise<SimulationRepository>;
    /** Cria os usuários referenciados, quando a implementação exige FK. */
    seedUsers?: (userIds: readonly string[]) => Promise<void>;
    teardown?: () => Promise<void>;
  },
): void {
  describe(`SimulationRepository [${name}]`, () => {
    let repository: SimulationRepository;

    beforeEach(async () => {
      repository = await setup.makeRepository();
      await setup.seedUsers?.(['user-1', 'user-2']);
    });

    afterAll(async () => {
      await setup.teardown?.();
    });

    async function persist(simulation: Simulation): Promise<void> {
      await repository.create(simulation);
    }

    describe('create e findByIdAndUserId', () => {
      it('persiste e recupera preservando todos os parâmetros', async () => {
        await persist(makeDbSimulation({ id: 'sim-1', userId: 'user-1' }));

        const found = await repository.findByIdAndUserId(
          uuidFor('sim-1'),
          uuidFor('user-1'),
        );

        expect(found).not.toBeNull();
        expect(found?.id).toBe(uuidFor('sim-1'));
        expect(found?.propertyValue.cents).toBe(50_000_000);
        expect(found?.downPayment.cents).toBe(10_000_000);
        expect(found?.termMonths).toBe(360);
        expect(found?.annualRate).toBeCloseTo(0.0975, 10);
        expect(found?.rateConvention).toBe('EFFECTIVE');
        expect(found?.amortizationSystem).toBe('SAC');
        expect(found?.charges).toEqual({
          mipMonthlyRate: 0.00025,
          dfiMonthlyRate: 0.00005,
          adminFeeCents: 2500,
        });
      });

      it('a simulação recuperada calcula a MESMA tabela que a original', async () => {
        // O teste que realmente importa para um mapper: ida e volta pelo banco não
        // pode alterar um único centavo do resultado financeiro.
        const original = makeDbSimulation({ id: 'sim-1', userId: 'user-1' });
        await persist(original);

        const found = await repository.findByIdAndUserId(
          uuidFor('sim-1'),
          uuidFor('user-1'),
        );

        expect(found?.buildSchedule()).toEqual(original.buildSchedule());
        expect(found?.calculateCet()).toEqual(original.calculateCet());
      });

      it('ESCOPO: não devolve simulação de outro usuário', async () => {
        await persist(makeDbSimulation({ id: 'sim-1', userId: 'user-1' }));

        expect(
          await repository.findByIdAndUserId(uuidFor('sim-1'), uuidFor('user-2')),
        ).toBeNull();
      });

      it('devolve null para id inexistente', async () => {
        expect(
          await repository.findByIdAndUserId(uuidFor('nao-existe'), uuidFor('user-1')),
        ).toBeNull();
      });

      it('preserva renda ausente como undefined, não como zero', async () => {
        await persist(
          makeDbSimulation({ id: 'sim-1', userId: 'user-1', monthlyIncome: undefined }),
        );

        const found = await repository.findByIdAndUserId(
          uuidFor('sim-1'),
          uuidFor('user-1'),
        );

        expect(found?.monthlyIncome).toBeUndefined();
      });

      it('preserva valores monetários grandes sem perda de precisão', async () => {
        // R$ 90.071.992,54 — perto do limite de precisão de um double, e o tipo de
        // valor que revelaria um mapper que passou por float.
        const { Money } = await import('../../src/domain/value-objects/money.vo');
        await persist(
          makeDbSimulation({
            id: 'sim-1',
            userId: 'user-1',
            propertyValue: Money.fromCents(9_007_199_254),
            downPayment: Money.fromCents(4_503_599_627),
          }),
        );

        const found = await repository.findByIdAndUserId(
          uuidFor('sim-1'),
          uuidFor('user-1'),
        );

        expect(found?.propertyValue.cents).toBe(9_007_199_254);
        expect(found?.downPayment.cents).toBe(4_503_599_627);
      });

      it('preserva a data de criação', async () => {
        const createdAt = new Date('2026-03-15T13:45:30.123Z');
        await persist(makeDbSimulation({ id: 'sim-1', userId: 'user-1', createdAt }));

        const found = await repository.findByIdAndUserId(
          uuidFor('sim-1'),
          uuidFor('user-1'),
        );

        expect(found?.createdAt.toISOString()).toBe(createdAt.toISOString());
      });

      it('persiste os dois sistemas de amortização e as duas convenções', async () => {
        await persist(
          makeDbSimulation({
            id: 'sim-price',
            userId: 'user-1',
            amortizationSystem: 'PRICE',
            rateConvention: 'NOMINAL',
          }),
        );

        const found = await repository.findByIdAndUserId(
          uuidFor('sim-price'),
          uuidFor('user-1'),
        );

        expect(found?.amortizationSystem).toBe('PRICE');
        expect(found?.rateConvention).toBe('NOMINAL');
      });
    });

    describe('listByUserId', () => {
      /** Insere fora de ordem: a ordenação não pode depender da ordem de inserção. */
      async function seedUnordered(): Promise<void> {
        for (const day of [15, 3, 28, 9, 21]) {
          await persist(
            makeDbSimulation({
              id: `sim-${day}`,
              userId: 'user-1',
              createdAt: new Date(Date.UTC(2026, 0, day)),
            }),
          );
        }
      }

      it('ordena por data decrescente, mesmo inserindo embaralhado', async () => {
        await seedUnordered();

        const { items } = await repository.listByUserId(uuidFor('user-1'), {
          page: 1,
          pageSize: 10,
        });

        expect(items.map((s) => s.createdAt.getUTCDate())).toEqual([28, 21, 15, 9, 3]);
      });

      it('ESCOPO: lista apenas as simulações do próprio usuário', async () => {
        await persist(makeDbSimulation({ id: 'minha', userId: 'user-1' }));
        await persist(makeDbSimulation({ id: 'alheia', userId: 'user-2' }));

        const { items, total } = await repository.listByUserId(uuidFor('user-1'), {
          page: 1,
          pageSize: 10,
        });

        expect(total).toBe(1);
        expect(items.map((s) => s.id)).toEqual([uuidFor('minha')]);
      });

      it('pagina sem repetir nem pular itens', async () => {
        await seedUnordered();

        const p1 = await repository.listByUserId(uuidFor('user-1'), {
          page: 1,
          pageSize: 2,
        });
        const p2 = await repository.listByUserId(uuidFor('user-1'), {
          page: 2,
          pageSize: 2,
        });
        const p3 = await repository.listByUserId(uuidFor('user-1'), {
          page: 3,
          pageSize: 2,
        });

        const ids = [...p1.items, ...p2.items, ...p3.items].map((s) => s.id);
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
        expect(ids).toEqual(
          ['sim-28', 'sim-21', 'sim-15', 'sim-9', 'sim-3'].map(uuidFor),
        );
      });

      it('o total reflete o conjunto inteiro, não o tamanho da página', async () => {
        await seedUnordered();

        const page = await repository.listByUserId(uuidFor('user-1'), {
          page: 1,
          pageSize: 2,
        });

        expect(page.items).toHaveLength(2);
        expect(page.total).toBe(5);
      });

      it('devolve os metadados de paginação recebidos', async () => {
        await seedUnordered();

        const page = await repository.listByUserId(uuidFor('user-1'), {
          page: 2,
          pageSize: 3,
        });

        expect(page.page).toBe(2);
        expect(page.pageSize).toBe(3);
      });

      it('página além do fim devolve lista vazia, com o total correto', async () => {
        await seedUnordered();

        const page = await repository.listByUserId(uuidFor('user-1'), {
          page: 99,
          pageSize: 10,
        });

        expect(page.items).toHaveLength(0);
        expect(page.total).toBe(5);
      });

      it('usuário sem simulações recebe página vazia', async () => {
        const page = await repository.listByUserId(uuidFor('user-1'), {
          page: 1,
          pageSize: 10,
        });

        expect(page.items).toHaveLength(0);
        expect(page.total).toBe(0);
      });
    });

    describe('delete', () => {
      it('remove a simulação', async () => {
        const simulation = makeDbSimulation({ id: 'sim-1', userId: 'user-1' });
        await persist(simulation);

        await repository.delete(simulation);

        expect(
          await repository.findByIdAndUserId(uuidFor('sim-1'), uuidFor('user-1')),
        ).toBeNull();
      });

      it('remove apenas a simulação alvo', async () => {
        const alvo = makeDbSimulation({ id: 'sim-1', userId: 'user-1' });
        await persist(alvo);
        await persist(makeDbSimulation({ id: 'sim-2', userId: 'user-1' }));

        await repository.delete(alvo);

        expect(
          await repository.findByIdAndUserId(uuidFor('sim-2'), uuidFor('user-1')),
        ).not.toBeNull();
      });
    });
  });
}
