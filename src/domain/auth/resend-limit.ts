/**
 * Limite de reenvio do e-mail de validação (domínio puro).
 *
 * Implementa a regra de **limitação de reenvios** do e-mail de validação de
 * cadastro: no máximo **5 reenvios por janela de 24 horas** (Req. 1.6). A
 * decisão é modelada de forma **pura e total**: nenhuma referência a relógio
 * global ou estado interno é mantida. O histórico de reenvios e o instante
 * atual são injetados pelo chamador (fronteira/serviço de verificação,
 * tarefa 5.7), que reutiliza estas funções sobre os timestamps persistidos.
 *
 * A janela é **deslizante (trailing window)**: apenas os reenvios ocorridos no
 * intervalo `(now - 24h, now]` contam para o limite. Reenvios anteriores à
 * janela são ignorados (podados), de modo que o usuário recupera capacidade de
 * reenvio à medida que registros antigos saem da janela.
 *
 * Referências: design.md, "Property 3: Limite de reenvio de e-mail de
 * validação" e "Serviço de Autenticação" (`resendVerification`, máx. 5/24h).
 */

import { type Result, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Número máximo de reenvios aceitos dentro de uma única janela de 24h (Req. 1.6). */
export const MAX_RESENDS_PER_WINDOW = 5;

/** Duração da janela deslizante de limitação de reenvios: 24 horas, em milissegundos. */
export const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Mensagem exibida quando o limite de reenvios na janela de 24h é excedido (Req. 1.6). */
export const RESEND_RATE_LIMITED_MESSAGE =
  "Limite de reenvios do e-mail de validação atingido (máximo de 5 por período de 24 horas). Tente novamente mais tarde.";

// ---------------------------------------------------------------------------
// Janela deslizante
// ---------------------------------------------------------------------------

/**
 * Retorna apenas os reenvios que pertencem à janela de 24h que termina em
 * `now`, isto é, com timestamp no intervalo `(now - 24h, now]`.
 *
 * Registros com data inválida, no futuro (após `now`) ou anteriores ao início
 * da janela são descartados. A ordenação da entrada é irrelevante para a
 * contagem; o resultado é retornado em ordem cronológica crescente para tornar
 * o histórico estável e previsível.
 *
 * @param previousResendTimestamps Histórico de instantes de reenvios anteriores.
 * @param now Instante atual (fim da janela).
 */
export function resendsWithinWindow(
  previousResendTimestamps: readonly Date[],
  now: Date,
): Date[] {
  const nowMs = now.getTime();
  const windowStartMs = nowMs - RESEND_WINDOW_MS;

  return previousResendTimestamps
    .filter((timestamp) => {
      const ms = timestamp.getTime();
      // Descarta datas inválidas, futuras ou fora da janela deslizante.
      return !Number.isNaN(ms) && ms > windowStartMs && ms <= nowMs;
    })
    .map((timestamp) => new Date(timestamp.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}

// ---------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------

/**
 * Verdadeiro **se e somente se** um novo reenvio puder ser aceito em `now`, ou
 * seja, quando a quantidade de reenvios dentro da janela de 24h for menor que
 * {@link MAX_RESENDS_PER_WINDOW} (Req. 1.6).
 *
 * Função pura e total: não lança e não depende de estado externo. `now`
 * inválido resulta em `false` (decisão conservadora: não autoriza o reenvio).
 *
 * @param previousResendTimestamps Histórico de instantes de reenvios anteriores.
 * @param now Instante atual da solicitação de reenvio.
 */
export function canResend(
  previousResendTimestamps: readonly Date[],
  now: Date,
): boolean {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return false;
  }
  return resendsWithinWindow(previousResendTimestamps, now).length <
    MAX_RESENDS_PER_WINDOW;
}

/**
 * Registra uma nova solicitação de reenvio em `now`, aplicando o limite de
 * 5 reenvios por janela de 24h (Req. 1.6).
 *
 * Retorna:
 * - `ok` com a lista de timestamps **podada à janela** acrescida de `now`,
 *   **se e somente se** {@link canResend} for verdadeiro;
 * - `err` `RATE_LIMITED` quando o limite da janela já foi atingido;
 * - `err` `VALIDATION` quando `now` é uma data inválida.
 *
 * A função é pura: não muta a entrada (`previousResendTimestamps`) nem mantém
 * estado interno; o resultado de sucesso é uma nova lista pronta para ser
 * persistida pela fronteira.
 *
 * @param previousResendTimestamps Histórico de instantes de reenvios anteriores.
 * @param now Instante atual da solicitação de reenvio.
 */
export function registerResend(
  previousResendTimestamps: readonly Date[],
  now: Date,
): Result<Date[]> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return err("VALIDATION", "Instante da solicitação de reenvio inválido.");
  }

  const withinWindow = resendsWithinWindow(previousResendTimestamps, now);
  if (withinWindow.length >= MAX_RESENDS_PER_WINDOW) {
    return err("RATE_LIMITED", RESEND_RATE_LIMITED_MESSAGE, "email");
  }

  return ok([...withinWindow, new Date(now.getTime())]);
}
