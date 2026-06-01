/**
 * Validação de **período de relatório** — domínio puro (Req. 10.6, 10.7).
 *
 * Implementa, como função **pura, total e determinística** (sem I/O), a regra
 * de aceitação do período `[start, end]` informado em uma solicitação de
 * relatório do Serviço_de_Relatorios, conforme os critérios de aceitação do
 * Requisito 10:
 *
 * - **10.6** — se a **data inicial ou a data final** não for informada, a
 *   solicitação é rejeitada, informando que o período deve conter data inicial
 *   e data final.
 * - **10.7** — se a **data inicial for posterior à data final**, a solicitação
 *   é rejeitada (o relatório não é gerado), informando a inconsistência do
 *   período.
 *
 * Corresponde à assinatura prevista em design.md
 * (`validatePeriod(start, end): ValidationResult<DateRange>` — "ambos presentes,
 * start <= end") e é validada pela **Property 30** (teste 14.2): o período é
 * aceito **se e somente se** ambas as datas estiverem presentes (e válidas) e
 * `start <= end`.
 *
 * ## Borda: intervalo de um único dia
 *
 * O {@link DateRange} é **fechado e inclusivo** (`[start, end]`). O caso
 * `start === end` (mesmo instante) é **aceito**, representando um intervalo de
 * um único ponto/dia. A rejeição ocorre apenas quando `start` é
 * **estritamente** posterior a `end` (Req. 10.7).
 *
 * ## Pureza
 *
 * A função **não muta** as entradas: o {@link DateRange} retornado contém
 * **cópias defensivas** (`new Date(...)`) das datas informadas.
 */

import { type DateRange } from "@/domain/types";
import { type ValidationResult, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Mensagens (seguras para exibição ao usuário)
// ---------------------------------------------------------------------------

/** Data inicial e/ou final ausente ou inválida (Req. 10.6). */
export const PERIOD_MISSING_DATES_MESSAGE =
  "O período deve conter data inicial e data final.";

/** Data inicial posterior à data final (Req. 10.7). */
export const PERIOD_INCONSISTENT_MESSAGE =
  "A data inicial do período não pode ser posterior à data final.";

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida o período `[start, end]` de uma solicitação de relatório e produz o
 * {@link DateRange} normalizado.
 *
 * Retorna sucesso **se e somente se** (Req. 10.6, 10.7):
 *
 * 1. ambas as datas estiverem **presentes** e forem **datas válidas**; e
 * 2. `start` for **menor ou igual** a `end` (a igualdade — intervalo de um
 *    único instante/dia — é permitida, pois o intervalo é fechado e inclusivo).
 *
 * Em caso de falha, retorna um erro `VALIDATION` com o `field` ofensor e uma
 * mensagem segura para exibição:
 *
 * - data ausente/inválida → {@link PERIOD_MISSING_DATES_MESSAGE} (`field`:
 *   `"start"` quando a inicial estiver ausente, senão `"end"`);
 * - `start` posterior a `end` → {@link PERIOD_INCONSISTENT_MESSAGE} (`field`:
 *   `"start"`).
 *
 * A função é pura e total: não muta as entradas. As datas em
 * {@link DateRange} são cópias defensivas.
 *
 * @param start Data inicial do período (pode ser `null`/`undefined`).
 * @param end   Data final do período (pode ser `null`/`undefined`).
 */
export function validatePeriod(
  start: Date | null | undefined,
  end: Date | null | undefined,
): ValidationResult<DateRange> {
  // 1) Presença e validade de cada data (Req. 10.6).
  const startCopy = coerceValidDate(start);
  if (startCopy === null) {
    return err("VALIDATION", PERIOD_MISSING_DATES_MESSAGE, "start");
  }
  const endCopy = coerceValidDate(end);
  if (endCopy === null) {
    return err("VALIDATION", PERIOD_MISSING_DATES_MESSAGE, "end");
  }

  // 2) Consistência: start <= end; start === end é permitido (Req. 10.7).
  if (startCopy.getTime() > endCopy.getTime()) {
    return err("VALIDATION", PERIOD_INCONSISTENT_MESSAGE, "start");
  }

  return ok({ start: startCopy, end: endCopy });
}

/**
 * Converte a entrada em uma **cópia** de `Date` válida, ou `null` quando a
 * entrada estiver ausente (`null`/`undefined`) ou não representar um instante
 * válido (`Invalid Date`). Não muta a entrada.
 */
function coerceValidDate(value: Date | null | undefined): Date | null {
  if (!(value instanceof Date)) {
    return null;
  }
  const time = value.getTime();
  return Number.isNaN(time) ? null : new Date(time);
}
