/**
 * Validade e expiração de Sessão por inatividade (domínio puro).
 *
 * Implementa a decisão de acesso a recursos protegidos com base na **janela de
 * inatividade deslizante** de 30 minutos (sliding `maxAge`):
 *
 * - Req. 2.5 — quando uma Sessão permanece inativa, sem requisições do Usuário,
 *   por 30 minutos consecutivos, a Sessão expira e o status de autenticação é
 *   limpo.
 * - Req. 2.7 — ao tentar acessar um recurso protegido com uma Sessão expirada
 *   ou inválida, o acesso é negado e nova autenticação é exigida.
 *
 * ## Representação canônica: `lastActivityAt`
 *
 * A Sessão é modelada, para fins de decisão, pelo instante da **última
 * requisição autenticada** (`lastActivityAt`). A "inatividade" no instante
 * `now` é exatamente `now - lastActivityAt`. A Sessão está ativa enquanto essa
 * inatividade for **estritamente menor** que {@link SESSION_INACTIVITY_MS}.
 *
 * O campo persistido no banco (`Session.expires`, ver `prisma/schema.prisma`)
 * é a forma **derivada** dessa representação: `expires = lastActivityAt + 30min`
 * (ver {@link computeSessionExpiry}). A cada requisição autenticada a fronteira
 * (middleware / repositório de sessão) renova a janela — conceitualmente
 * `lastActivityAt = now`, equivalentemente `expires = now + 30min` — produzindo
 * o comportamento deslizante descrito no design.md ("Estratégia de Sessão e
 * Expiração"). A condição `now - lastActivityAt < 30min` é equivalente a
 * `now < expires`.
 *
 * ## Fronteira de igualdade (estrita)
 *
 * A desigualdade é **estrita**: uma inatividade de **exatamente** 30 minutos
 * (`now - lastActivityAt === SESSION_INACTIVITY_MS`, equivalentemente
 * `now === expires`) já é considerada **expirada** e o acesso é negado. Isso
 * cumpre "por 30 minutos consecutivos" como o limite a partir do qual a Sessão
 * deixa de ser válida.
 *
 * ## Pureza e totalidade
 *
 * Todas as funções são **puras, totais e determinísticas**: dadas as mesmas
 * entradas sempre produzem o mesmo resultado, nunca acessam I/O e **nunca
 * mutam** a Sessão recebida ({@link renewSession} retorna uma cópia). Sessões
 * `null`/`undefined` (inexistentes) e datas inválidas resultam em acesso negado.
 *
 * Referência: design.md, "Estratégia de Sessão e Expiração"; Property 7.
 */

import { type Result, err, isOk, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Janela de inatividade de Sessão, em milissegundos (30 minutos).
 *
 * Uma Sessão é considerada ativa enquanto a inatividade desde a última
 * requisição for **estritamente menor** que este valor (Req. 2.5).
 */
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;

/**
 * Mensagem exibida ao negar acesso a um recurso protegido por Sessão expirada
 * ou inexistente/ inválida (Req. 2.7). Não revela detalhes sensíveis.
 */
export const SESSION_EXPIRED_MESSAGE =
  "Sessão expirada ou inválida. Faça login novamente.";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Forma mínima de Sessão usada na decisão de acesso: o instante da última
 * requisição autenticada. É a representação canônica deste módulo; o
 * `Session.expires` persistido é derivado via {@link computeSessionExpiry}.
 */
export interface SessionActivity {
  /** Instante da última requisição autenticada do Usuário. */
  lastActivityAt: Date;
}

/** Sessão possivelmente ausente (inexistente/ não autenticada). */
type MaybeSession = SessionActivity | null | undefined;

// ---------------------------------------------------------------------------
// Auxiliares internos
// ---------------------------------------------------------------------------

/** Verdadeiro quando `value` é um `Date` com instante válido (não `NaN`). */
function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

// ---------------------------------------------------------------------------
// Cálculo de expiração (janela deslizante)
// ---------------------------------------------------------------------------

/**
 * Calcula o instante de expiração de uma Sessão renovada em `now`:
 * `now + 30min` ({@link SESSION_INACTIVITY_MS}).
 *
 * É o valor a ser persistido em `Session.expires` a cada requisição
 * autenticada, materializando a janela deslizante (Req. 2.5). Retorna um novo
 * `Date`; não muta `now`.
 *
 * @param now Instante da requisição autenticada atual.
 * @returns Novo `Date` em `now + SESSION_INACTIVITY_MS`.
 */
export function computeSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_INACTIVITY_MS);
}

// ---------------------------------------------------------------------------
// Renovação (sliding renewal)
// ---------------------------------------------------------------------------

/**
 * Renova a janela de inatividade de uma Sessão, retornando uma **cópia** com
 * `lastActivityAt = now` (renovação deslizante). Preserva quaisquer outros
 * campos da Sessão (`id`, `userId`, `sessionToken`, etc.) sem mutar a entrada.
 *
 * O `expires` correspondente a esta renovação é {@link computeSessionExpiry}
 * aplicado ao mesmo `now`.
 *
 * @param session Sessão a renovar (a referência original não é alterada).
 * @param now Instante da requisição autenticada atual.
 * @returns Nova Sessão com `lastActivityAt` igual a uma cópia de `now`.
 */
export function renewSession<T extends SessionActivity>(
  session: T,
  now: Date,
): T {
  return { ...session, lastActivityAt: new Date(now.getTime()) };
}

// ---------------------------------------------------------------------------
// Predicado de atividade
// ---------------------------------------------------------------------------

/**
 * Indica se a Sessão está **ativa** no instante `now`.
 *
 * Verdadeiro **se e somente se** (Property 7 / Req. 2.5):
 * 1. a Sessão existe (`session` não é `null`/`undefined`); e
 * 2. a inatividade desde a última requisição é estritamente menor que
 *    {@link SESSION_INACTIVITY_MS}, isto é `now - lastActivityAt < 30min`.
 *
 * Inatividade de **exatamente** 30 minutos resulta em `false` (expirada — ver
 * "Fronteira de igualdade"). Sessões inexistentes ou com datas inválidas
 * (`now` ou `lastActivityAt`) também resultam em `false`. Pura e total.
 *
 * @param session Sessão a avaliar, ou `null`/`undefined` se inexistente.
 * @param now Instante atual da tentativa de acesso.
 */
export function isSessionActive(session: MaybeSession, now: Date): boolean {
  if (session === null || session === undefined) {
    return false;
  }
  if (!isValidDate(session.lastActivityAt) || !isValidDate(now)) {
    return false;
  }
  const inactivityMs = now.getTime() - session.lastActivityAt.getTime();
  return inactivityMs < SESSION_INACTIVITY_MS;
}

// ---------------------------------------------------------------------------
// Decisão de acesso
// ---------------------------------------------------------------------------

/**
 * Decide o acesso a um recurso protegido a partir do estado da Sessão.
 *
 * Retorna sucesso (`ok`) **se e somente se** {@link isSessionActive} for
 * verdadeiro para a Sessão e o instante `now`. Caso contrário — Sessão
 * inexistente, inválida ou expirada por inatividade — retorna falha
 * `UNAUTHORIZED`, sinalizando à fronteira que o acesso deve ser **negado** e
 * **nova autenticação** exigida (Req. 2.7).
 *
 * Pura e total; espelha exatamente o predicado de {@link isSessionActive}.
 *
 * @param session Sessão atual do Usuário, ou `null`/`undefined` se inexistente.
 * @param now Instante atual da tentativa de acesso.
 */
export function decideSessionAccess(
  session: MaybeSession,
  now: Date,
): Result<void> {
  if (!isSessionActive(session, now)) {
    return err("UNAUTHORIZED", SESSION_EXPIRED_MESSAGE);
  }
  return ok(undefined);
}

/**
 * Conveniência booleana para {@link decideSessionAccess}: `true` se e somente
 * se o acesso for concedido. Pura e determinística.
 */
export function isSessionAccessGranted(
  session: MaybeSession,
  now: Date,
): boolean {
  return isOk(decideSessionAccess(session, now));
}
