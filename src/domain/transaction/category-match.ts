/**
 * Correspondência de categoria por tipo e dono (domínio puro).
 *
 * Ao registrar/editar um Lançamento (Receita ou Despesa), a Categoria informada
 * só é aceita quando **pertence ao mesmo Usuário** e seu **tipo é igual** ao
 * tipo do Lançamento. Categoria de outro usuário ou de tipo divergente sempre
 * resulta em rejeição:
 *
 * - Req. 6.9 — Receita: a Categoria deve ser do tipo Receita e pertencer ao Usuário.
 * - Req. 7.9 — Despesa: a Categoria deve ser do tipo Despesa e pertencer ao Usuário.
 * - Req. 8.7 — apenas Categorias do próprio Usuário cujo tipo corresponda ao
 *   tipo do Lançamento são selecionáveis.
 *
 * Este módulo é **puro** e **total** (sem I/O, sem mutação): recebe a Categoria,
 * o tipo esperado e o id do dono e retorna um booleano ou um {@link Result}. As
 * verificações de propriedade da conta e correspondência de tipo são feitas na
 * fronteira (serviço de Lançamentos) antes da persistência.
 *
 * Referências: design.md, "Serviço de Lançamentos — Receitas e Despesas
 * (Req. 6, 7)" e "Property 17: Categoria deve corresponder ao tipo e ao dono".
 */

import { type Result, err, ok } from "@/domain/result";
import type { Category, TransactionType } from "@/domain/types";

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/** Rótulo em português do tipo de Lançamento, usado nas mensagens ao usuário. */
function transactionTypeLabel(type: TransactionType): string {
  return type === "INCOME" ? "Receita" : "Despesa";
}

/**
 * Mensagem exibida quando a Categoria não corresponde ao tipo do Lançamento
 * (Req. 6.9 / 7.9). O rótulo do tipo é interpolado ("Receita" / "Despesa").
 */
export function categoryMatchMessage(type: TransactionType): string {
  const label = transactionTypeLabel(type);
  return `A Categoria selecionada deve ser do tipo ${label} e pertencer ao Usuário.`;
}

// ---------------------------------------------------------------------------
// Predicado puro
// ---------------------------------------------------------------------------

/**
 * Verdadeiro **se e somente se** a Categoria pertence ao usuário `ownerId`
 * **e** seu tipo é igual a `type` (Req. 6.9, 7.9, 8.7).
 *
 * Função pura e total: não lança, não realiza I/O e não muta nenhum argumento.
 *
 * @param category Categoria a ser verificada.
 * @param type     Tipo esperado do Lançamento (`INCOME` / `EXPENSE`).
 * @param ownerId  Identificador do Usuário dono do Lançamento.
 */
export function categoryMatchesType(
  category: Category,
  type: TransactionType,
  ownerId: string,
): boolean {
  return category.userId === ownerId && category.type === type;
}

// ---------------------------------------------------------------------------
// Variante que retorna Result
// ---------------------------------------------------------------------------

/**
 * Garante que a Categoria corresponde ao tipo e ao dono do Lançamento.
 *
 * Retorna `ok(undefined)` quando {@link categoryMatchesType} é verdadeiro.
 * Caso contrário, falha com a seguinte **precedência** de verificação:
 *
 * 1. **Propriedade** — se `category.userId !== ownerId`, falha com `FORBIDDEN`
 *    (a Categoria pertence a outro Usuário; erro de autorização). Esta checagem
 *    tem prioridade para não revelar o tipo de um recurso alheio.
 * 2. **Tipo** — se o dono confere mas `category.type !== type`, falha com
 *    `VALIDATION` (a Categoria é do tipo errado para o Lançamento).
 *
 * Ambas as falhas usam a mensagem de Req. 6.9/7.9 ("A Categoria selecionada
 * deve ser do tipo X e pertencer ao Usuário"), com `field: "categoryId"`.
 *
 * Função pura e total: não lança, não realiza I/O e não muta argumentos.
 *
 * @param category Categoria a ser verificada.
 * @param type     Tipo esperado do Lançamento (`INCOME` / `EXPENSE`).
 * @param ownerId  Identificador do Usuário dono do Lançamento.
 */
export function ensureCategoryMatches(
  category: Category,
  type: TransactionType,
  ownerId: string,
): Result<void> {
  const message = categoryMatchMessage(type);

  if (category.userId !== ownerId) {
    return err("FORBIDDEN", message, "categoryId");
  }

  if (category.type !== type) {
    return err("VALIDATION", message, "categoryId");
  }

  return ok(undefined);
}
