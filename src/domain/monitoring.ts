/**
 * Monitoramento administrativo — domínio puro (Req. 15.2, 15.3, 15.4, 15.5).
 *
 * Implementa, como funções **puras, totais e determinísticas** (sem I/O), a
 * lógica do Serviço_de_Monitoramento exibida no Painel_Administrativo:
 *
 * - **Ordenação de logs** ({@link sortAccessLogs}): apresenta os logs de acesso
 *   ordenados de forma **decrescente por data e hora** do evento (Req. 15.2).
 * - **Período padrão** ({@link defaultMonitoringPeriod}): quando nenhum período
 *   é informado, adota os **últimos 30 dias** como recorte das estatísticas
 *   (Req. 15.4).
 * - **Estatísticas de uso** ({@link computeUsageStats}): número de Usuários
 *   ativos (distintos que iniciaram pelo menos uma Sessão no período) e volume
 *   total de Lançamentos no período (Req. 15.3). Quando não há logs no período,
 *   o número de Usuários ativos é `0` (lista vazia — Req. 15.5).
 *
 * ## Convenção de limites inclusivos
 *
 * O recorte de período usa o contrato de {@link DateRange}: intervalo
 * **fechado e inclusivo** `[start, end]`. Tanto os logs (`occurredAt`) quanto
 * os Lançamentos (`date`) pertencem ao período quando seu instante está em
 * `start <= t <= end`, comparado por `getTime()` (relação numérica total e
 * determinística) — a mesma convenção dos relatórios por intervalo
 * (`@/domain/reports/range-report`).
 *
 * ## Quais logs contam como Usuário ativo
 *
 * Um Usuário é considerado **ativo** no período quando possui **pelo menos um**
 * log de ação `"LOGIN"` (início de Sessão) cujo `occurredAt` pertence ao
 * período. Logs de `"LOGOUT"` e `"SESSION_EXPIRED"` **não** contam como início
 * de Sessão e, portanto, não tornam um Usuário ativo por si só (Req. 15.3,
 * espelhando a Property 38).
 *
 * ## Totalidade
 *
 * As funções não realizam I/O, não mutam as entradas e não lançam. Logs ou
 * Lançamentos com instante inválido (`NaN`) simplesmente não pertencem a
 * nenhum período (comparações com `NaN` resultam em `false`), sendo excluídos
 * de forma segura das estatísticas. A ordenação opera sobre uma cópia rasa,
 * retornando uma **permutação** da entrada.
 *
 * Referência: design.md, "Painel Administrativo (Req. 14) e Monitoramento
 * (Req. 15)"; "Property 37: Ordenação de logs de acesso"; "Property 38:
 * Estatísticas de uso por período".
 */

import type { AccessAction, DateRange, Transaction } from "@/domain/types";

// ---------------------------------------------------------------------------
// Tipos de domínio
// ---------------------------------------------------------------------------

/**
 * Log de acesso registrado para monitoramento administrativo (Req. 15.1).
 *
 * Espelha o modelo Prisma `AccessLog { id, userId, action, occurredAt }`. O
 * campo `id` é opcional na camada de domínio, pois logs ainda não persistidos
 * (recém-construídos) podem não possuir identificador.
 */
export interface AccessLog {
  /** Identificador do log; ausente quando o log ainda não foi persistido. */
  id?: string;
  /** Identificador do Usuário que gerou o evento. */
  userId: string;
  /** Tipo da ação registrada (`LOGIN`, `LOGOUT`, `SESSION_EXPIRED`). */
  action: AccessAction;
  /** Data e hora do evento. */
  occurredAt: Date;
}

/**
 * Estatísticas de uso da Plataforma referentes a um período (Req. 15.3).
 */
export interface UsageStats {
  /**
   * Quantidade de Usuários **distintos** que iniciaram pelo menos uma Sessão
   * (log de ação `"LOGIN"`) dentro do período.
   */
  activeUsers: number;
  /** Quantidade total de Lançamentos cuja data pertence ao período. */
  transactionVolume: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Duração, em dias, do período padrão de monitoramento (Req. 15.4). */
export const DEFAULT_MONITORING_PERIOD_DAYS = 30;

/** Milissegundos em um dia (24 h), usado no cálculo do período padrão. */
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Ordenação de logs (Req. 15.2)
// ---------------------------------------------------------------------------

/**
 * Comparador total entre dois logs de acesso para a ordem do monitoramento.
 *
 * Ordena de forma **decrescente por `occurredAt`** (evento mais recente
 * primeiro). Quando os instantes coincidem, retorna `0` (empate), preservando
 * a estabilidade da ordenação. A comparação usa `getTime()` (milissegundos
 * desde a época), garantindo uma relação numérica total e determinística.
 */
function compareByOccurredAtDesc(a: AccessLog, b: AccessLog): number {
  return b.occurredAt.getTime() - a.occurredAt.getTime();
}

/**
 * Ordena os logs de acesso para exibição no monitoramento (Req. 15.2).
 *
 * Retorna um **novo** array contendo exatamente os mesmos elementos de `logs`
 * (uma permutação da entrada), ordenado de forma **decrescente por data e
 * hora** do evento (`occurredAt`).
 *
 * É **pura e total**: não muta o array de entrada — a ordenação é aplicada
 * sobre uma cópia rasa — e não realiza I/O.
 *
 * @param logs Lista de logs de acesso a ordenar.
 * @returns Novo array ordenado do evento mais recente para o mais antigo.
 */
export function sortAccessLogs(logs: AccessLog[]): AccessLog[] {
  return logs.slice().sort(compareByOccurredAtDesc);
}

// ---------------------------------------------------------------------------
// Período padrão (Req. 15.4)
// ---------------------------------------------------------------------------

/**
 * Produz o período padrão das estatísticas de monitoramento: os **últimos 30
 * dias** terminando no instante de referência `now` (Req. 15.4).
 *
 * Retorna o intervalo **fechado e inclusivo** `[now - 30 dias, now]`, onde
 * `start` é exatamente o instante `now` deslocado em
 * {@link DEFAULT_MONITORING_PERIOD_DAYS} dias (30 × 24 h) para trás e `end` é o
 * próprio `now`. Ambas as extremidades são inclusivas: um log ou Lançamento
 * cujo instante coincida com `start` ou com `end` é considerado dentro do
 * período por {@link computeUsageStats}.
 *
 * É **pura e determinística**: depende apenas de `now`, sem ler o relógio do
 * sistema. As datas retornadas são **cópias** independentes, de modo que mutar
 * a entrada ou o resultado não afeta o outro.
 *
 * @param now Instante de referência (fim do período).
 * @returns Intervalo `[now - 30 dias, now]` inclusivo.
 */
export function defaultMonitoringPeriod(now: Date): DateRange {
  const end = new Date(now.getTime());
  const start = new Date(now.getTime() - DEFAULT_MONITORING_PERIOD_DAYS * MILLIS_PER_DAY);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Estatísticas de uso (Req. 15.3, 15.5)
// ---------------------------------------------------------------------------

/**
 * Verdadeiro quando o instante `instant` pertence ao intervalo fechado
 * `[start, end]` (ambas as extremidades inclusive). Compara por `getTime()`,
 * relação numérica total e determinística; instantes inválidos (`NaN`) nunca
 * pertencem ao intervalo.
 */
function isWithinClosedRange(instant: Date, range: DateRange): boolean {
  const t = instant.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/**
 * Calcula as estatísticas de uso da Plataforma no período (Req. 15.3, 15.5).
 *
 * - `activeUsers`: número de Usuários **distintos** (por `userId`) que possuem
 *   **pelo menos um** log de ação `"LOGIN"` cujo `occurredAt` pertence ao
 *   período `[start, end]` inclusive — ou seja, que iniciaram pelo menos uma
 *   Sessão no período. Sem logs de login no período, o valor é `0` (Req. 15.5).
 * - `transactionVolume`: quantidade de Lançamentos de `txs` cuja `date`
 *   pertence ao período `[start, end]` inclusive.
 *
 * Os limites do período são **inclusivos** em ambas as extremidades. Apenas
 * logs `"LOGIN"` contam para Usuários ativos; `"LOGOUT"` e `"SESSION_EXPIRED"`
 * são ignorados nessa contagem.
 *
 * É **pura e total**: não realiza I/O, não muta as entradas e não lança.
 *
 * @param logs Logs de acesso a considerar.
 * @param txs Lançamentos a considerar.
 * @param period Intervalo `[start, end]` inclusivo (ex.: de
 *   {@link defaultMonitoringPeriod}).
 * @returns Estatísticas de uso do período.
 */
export function computeUsageStats(
  logs: AccessLog[],
  txs: Transaction[],
  period: DateRange,
): UsageStats {
  const activeUserIds = new Set<string>();
  for (const log of logs) {
    if (log.action === "LOGIN" && isWithinClosedRange(log.occurredAt, period)) {
      activeUserIds.add(log.userId);
    }
  }

  let transactionVolume = 0;
  for (const tx of txs) {
    if (isWithinClosedRange(tx.date, period)) {
      transactionVolume += 1;
    }
  }

  return { activeUsers: activeUserIds.size, transactionVolume };
}
