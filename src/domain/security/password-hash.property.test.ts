import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { hashPassword, verifyPassword } from "@/domain/security/password-hash";

/**
 * Teste de propriedade do armazenamento seguro de senha (Req. 16.1).
 *
 * Property 39 (design.md): para qualquer senha, o valor armazenado nunca é
 * igual à senha em texto puro, a verificação do hash contra a senha original é
 * bem-sucedida, e duas contas que utilizem a mesma senha produzem hashes
 * distintos (salt único por usuário).
 *
 * ## Justificativa do override local de `numRuns`
 *
 * O `bcrypt` é deliberadamente custoso (fator de custo 12 → 2^12 iterações).
 * Cada iteração da propriedade executa **quatro** operações de bcrypt (dois
 * hashes independentes + duas verificações), o que torna 100 execuções (o
 * padrão global de `numRuns` configurado em `vitest.setup.ts`) proibitivamente
 * lento. Reduzimos para `numRuns: 12` **apenas neste teste pesado** — o
 * suficiente para exercitar a propriedade sobre senhas variadas mantendo o
 * tempo de execução razoável. A natureza não determinística do salt já é
 * exercitada em cada iteração (comparamos dois hashes independentes da mesma
 * senha), então um número modesto de execuções cobre bem a propriedade.
 */

// Fator de custo do bcrypt torna cada iteração cara; reduzimos as execuções
// localmente (vs. o padrão global de 100) e ampliamos o timeout do Vitest.
const HEAVY_NUM_RUNS = 12;
const HEAVY_TIMEOUT_MS = 60_000;

// Senhas dentro da faixa válida do domínio (8–64 caracteres, Req. 1.5/3.x) e
// abaixo do limite de 72 bytes do bcrypt, evitando truncamento silencioso.
const passwordArb = fc.string({ minLength: 8, maxLength: 64 });

describe("password-hash: armazenamento seguro com salt único (Req. 16.1)", () => {
  // Feature: financial-management-platform, Property 39: Armazenamento seguro de senha com salt único
  // Validates: Requirements 16.1
  it(
    "nunca armazena texto puro, gera hashes distintos por chamada e verifica corretamente",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          passwordArb,
          passwordArb,
          async (plain, other) => {
            const hash = await hashPassword(plain);

            // (a) O valor armazenado nunca é igual à senha em texto puro.
            expect(hash).not.toBe(plain);

            // (b) Um segundo hash independente da MESMA senha difere do primeiro
            //     (salt aleatório único por chamada → salt único por usuário).
            const hashAgain = await hashPassword(plain);
            expect(hashAgain).not.toBe(hash);

            // (c) A verificação contra a senha original é bem-sucedida.
            expect(await verifyPassword(plain, hash)).toBe(true);

            // (c') Uma senha diferente nunca é aceita pelo hash. Só checamos
            //      quando as senhas geradas de fato diferem (com senhas iguais a
            //      verificação corretamente retornaria true).
            if (other !== plain) {
              expect(await verifyPassword(other, hash)).toBe(false);
            }
          },
        ),
        { numRuns: HEAVY_NUM_RUNS },
      );
    },
    HEAVY_TIMEOUT_MS,
  );
});
