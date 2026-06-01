/**
 * Serviço de Filtros — domínio puro de Filtros e Pesquisas (Req. 12).
 *
 * Modela, como função pura e total, a aplicação **conjunta (AND)** dos filtros
 * disponíveis sobre os Lançamentos de um Usuário: descrição (parcial, sem
 * diferenciação entre maiúsculas e minúsculas), Categoria, período inclusivo e
 * tipo (Receita/Despesa). O resultado é sempre **ordenado por data de forma
 * decrescente**.
 *
 * Premissas e contrato:
 * - A entrada `txs` é o conjunto de Lançamentos **já pertencentes ao Usuário**
 *   (a verificação de propriedade ocorre na fronteira/serviço, antes de chamar
 *   esta função). Aqui apenas aplicamos os predicados de filtro.
 * - Filtros ausentes (`undefined`) são **ignorados** (Req. 12.5): cada campo
 *   não informado não restringe o resultado.
 * - Os filtros informados são combinados por **conjunção (AND)**: um Lançamento
 *   é mantido somente se satisfizer **todos** os filtros presentes
 *   (Req. 12.1–12.5).
 * - Um resultado **vazio é válido** e retornado como `ok([])` (Req. 12.6 — a UI
 *   apresenta a indicação de ausência de resultados). A **única** condição de
 *   erro é o **período inconsistente** (`start > end`), rejeitado com
 *   `VALIDATION` (Req. 12.7).
 *
 * Decisão de comparação de caixa (case-insensitive):
 * - A correspondência de descrição usa `toLocaleLowerCase("pt-BR")` em **ambos**
 *   os lados (termo e descrição). O locale é fixado explicitamente em `pt-BR`
 *   para manter a função **determinística** (independente do locale do
 *   ambiente de execução) e adequada às descrições em português, que contêm
 *   acentuação. Em seguida, usa-se `String.prototype.includes` para a
 *   correspondência **parcial** (substring) — Req. 12.1.
 *
 * Decisão de ordenação:
 * - Reutiliza-se {@link sortTransactionHistory} (decrescente por `date` e, em
 *   empate de data, decrescente por `createdAt`). O Req. 12.8 exige apenas a
 *   ordem **decrescente por data**; o critério de desempate por `createdAt` é
 *   compatível (não altera a ordem por data) e mantém a apresentação estável e
 *   consistente com o histórico de Lançamentos.
 *
 * Este módulo é **puro** e **total**: não acessa banco de dados, rede nem
 * relógio, não lança exceções e **não muta** o array de entrada (a filtragem e
 * a ordenação ocorrem sobre cópias). Isso permite o teste baseado em
 * propriedades (Property 33 e Property 34) sem mocks nem I/O.
 *
 * Referências: design.md, "Serviço de Filtros (Req. 12)", "Property 33:
 * Aplicação conjunta de filtros" e "Property 34: Ordenação dos resultados de
 * filtro"; requirements.md, critérios 12.1–12.8.
 */

import { type Result, err, ok } from "@/domain/result";
import { sortTransactionHistory } from "@/domain/transaction/history-sort";
import type { DateRange, Transaction, TransactionType } from "@/domain/types";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Conjunto de filtros aplicáveis a Lançamentos. Todos os campos são opcionais;
 * cada campo ausente é ignorado e os campos presentes são combinados por AND.
 */
export interface TransactionFilter {
  /**
   * Termo de descrição (1..100 caracteres) para correspondência **parcial** e
   * **sem diferenciação de caixa** (Req. 12.1). Quando ausente, a descrição não
   * restringe o resultado.
   */
  description?: string;
  /** Identificador da Categoria; correspondência **exata** (Req. 12.2). */
  categoryId?: string;
  /** Intervalo de datas **inclusivo** `[start, end]` sobre `tx.date` (Req. 12.3). */
  period?: DateRange;
  /** Tipo do Lançamento (Receita/Despesa) — correspondência exata (Req. 12.4). */
  type?: TransactionType;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/** Locale fixo usado na comparação de descrição sem diferenciação de caixa. */
const CASE_FOLD_LOCALE = "pt-BR";

/** Mensagem exibida quando o período do filtro é inconsistente (Req. 12.7). */
export const INCONSISTENT_PERIOD_MESSAGE =
  "A data inicial do período não pode ser posterior à data final.";

// ---------------------------------------------------------------------------
// Predicados puros
// ---------------------------------------------------------------------------

/**
 * Verdadeiro se `description` contém `term` em correspondência parcial e sem
 * diferenciação de caixa, segundo o locale fixo `pt-BR` (Req. 12.1).
 */
function descriptionMatches(description: string, term: string): boolean {
  return description
    .toLocaleLowerCase(CASE_FOLD_LOCALE)
    .includes(term.toLocaleLowerCase(CASE_FOLD_LOCALE));
}

/**
 * Verdadeiro se a data `date` está contida no intervalo inclusivo
 * `[period.start, period.end]` (Req. 12.3).
 */
function withinPeriod(date: Date, period: DateRange): boolean {
  const t = date.getTime();
  return t >= period.start.getTime() && t <= period.end.getTime();
}

/**
 * Verdadeiro se o Lançamento satisfaz **todos** os filtros presentes (AND).
 * Filtros ausentes (`undefined`) não restringem (Req. 12.5).
 */
function matchesFilter(tx: Transaction, filter: TransactionFilter): boolean {
  if (
    filter.description !== undefined &&
    !descriptionMatches(tx.description, filter.description)
  ) {
    return false;
  }

  if (filter.categoryId !== undefined && tx.categoryId !== filter.categoryId) {
    return false;
  }

  if (filter.period !== undefined && !withinPeriod(tx.date, filter.period)) {
    return false;
  }

  if (filter.type !== undefined && tx.type !== filter.type) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Aplicação dos filtros
// ---------------------------------------------------------------------------

/**
 * Aplica a conjunção (AND) dos filtros informados sobre os Lançamentos do
 * Usuário e retorna os correspondentes ordenados por data de forma decrescente.
 *
 * Comportamento:
 * - Valida primeiro a consistência do período: se `period.start > period.end`,
 *   rejeita com `err("VALIDATION", ...)` (Req. 12.7). Esta é a única condição
 *   de erro.
 * - Mantém os Lançamentos que satisfazem simultaneamente todos os filtros
 *   presentes; filtros ausentes são ignorados (Req. 12.1–12.5).
 * - Ordena o resultado por data decrescente, reutilizando
 *   {@link sortTransactionHistory} (Req. 12.8).
 * - Resultado vazio é válido: retorna `ok([])` (Req. 12.6).
 *
 * Pura e total: não muta `txs` (filtra e ordena sobre cópias) e não realiza I/O.
 *
 * @param txs    Lançamentos do próprio Usuário a serem filtrados.
 * @param filter Conjunto de filtros a aplicar; campos ausentes são ignorados.
 * @returns `ok(lista filtrada e ordenada por data desc)` ou
 *   `err(VALIDATION)` quando o período é inconsistente.
 */
export function applyFilters(
  txs: Transaction[],
  filter: TransactionFilter,
): Result<Transaction[]> {
  if (
    filter.period !== undefined &&
    filter.period.start.getTime() > filter.period.end.getTime()
  ) {
    return err("VALIDATION", INCONSISTENT_PERIOD_MESSAGE, "period");
  }

  const filtered = txs.filter((tx) => matchesFilter(tx, filter));

  return ok(sortTransactionHistory(filtered));
}
