/**
 * Autorização do Painel Administrativo (domínio puro).
 *
 * Implementa as regras de **autorização por papel** e a **guarda de
 * autodesativação** do Painel Administrativo, conforme:
 *
 * - Req. 14.6 — usuário sem privilégios de Administrador que tentar acessar o
 *   Painel_Administrativo tem o acesso negado, sem exposição de dados.
 * - Req. 15.6 — usuário sem privilégios de Administrador que tentar acessar o
 *   monitoramento tem o acesso negado, mantendo logs e estatísticas
 *   inalterados.
 * - Req. 14.7 — Administrador que tentar desativar a própria conta tem a
 *   operação rejeitada, informando que não pode desativar a própria conta.
 *
 * Este módulo é **puro e total** (sem I/O, determinístico): recebe os dados já
 * carregados do ator/alvo e retorna um `boolean` (predicado) ou um
 * {@link Result} (variante para a fronteira). A persistência e a invalidação de
 * sessões ocorrem na camada de serviço (tarefa 17.4), que reutiliza estas
 * funções como guarda.
 *
 * Ordem de precedência (importante): a autorização por papel é verificada
 * **primeiro** (deve ser Administrador) e, somente então, aplica-se a guarda de
 * **autodesativação**. Assim, um usuário não-Administrador recebe sempre
 * `FORBIDDEN` por papel, independentemente de o alvo ser ele mesmo.
 *
 * Referências: design.md, "Painel Administrativo (Req. 14) e Monitoramento
 * (Req. 15)"; Propriedades 35 e 36.
 */

import { type Result, err, ok } from "@/domain/result";
import type { UserRole } from "@/domain/types";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Ator de uma ação administrativa, reduzido ao papel necessário para a
 * autorização por papel (Req. 14.6, 15.6).
 */
export interface RoleBearer {
  /** Papel do usuário; o acesso é concedido sse for `"ADMIN"`. */
  role: UserRole;
}

/**
 * Ator de uma desativação de conta: além do papel, precisa do identificador
 * para a guarda de autodesativação (Req. 14.7).
 */
export interface ActorIdentity {
  /** Identificador do ator. */
  id: string;
  /** Papel do ator; deve ser `"ADMIN"` para desativar contas. */
  role: UserRole;
}

/** Alvo de uma desativação de conta, reduzido ao identificador. */
export interface TargetIdentity {
  /** Identificador da conta alvo da desativação. */
  id: string;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/**
 * Mensagem de erro de autorização exibida quando um usuário sem privilégios de
 * Administrador tenta acessar áreas administrativas (Req. 14.6, 15.6).
 */
export const ADMIN_ACCESS_DENIED_MESSAGE =
  "Acesso negado: é necessário ter privilégios de Administrador.";

/**
 * Mensagem exibida quando um Administrador tenta desativar a própria conta
 * (Req. 14.7).
 */
export const CANNOT_DEACTIVATE_SELF_MESSAGE =
  "Um Administrador não pode desativar a própria conta.";

// ---------------------------------------------------------------------------
// Autorização por papel (Req. 14.6, 15.6)
// ---------------------------------------------------------------------------

/**
 * Verdadeiro **se e somente se** o ator tiver papel de Administrador
 * (`role === "ADMIN"`). Predicado total usado como guarda de acesso ao
 * Painel_Administrativo e ao monitoramento (Req. 14.6, 15.6).
 *
 * @param actor Ator portador do papel.
 */
export function canAccessAdmin(actor: RoleBearer): boolean {
  return actor.role === "ADMIN";
}

/**
 * Variante {@link Result} de {@link canAccessAdmin} para uso na fronteira.
 *
 * Retorna `ok(undefined)` quando o ator é Administrador; caso contrário,
 * retorna `FORBIDDEN` com {@link ADMIN_ACCESS_DENIED_MESSAGE} — sem expor dados
 * (Req. 14.6, 15.6).
 *
 * @param actor Ator portador do papel.
 */
export function ensureAdmin(actor: RoleBearer): Result<void> {
  if (!canAccessAdmin(actor)) {
    return err("FORBIDDEN", ADMIN_ACCESS_DENIED_MESSAGE);
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Desativação de conta (Req. 14.7)
// ---------------------------------------------------------------------------

/**
 * Verdadeiro **se e somente se** o ator for Administrador **e** o alvo não for
 * a própria conta do ator (`actor.id !== target.id`).
 *
 * Precedência: a autorização por papel é avaliada primeiro; a guarda de
 * autodesativação só importa quando o ator já é Administrador. Logo, um ator
 * não-Administrador resulta sempre em `false`, mesmo que `actor.id` coincida
 * com `target.id` (Req. 14.6 prevalece sobre 14.7).
 *
 * @param actor  Ator que solicita a desativação (identificador e papel).
 * @param target Conta alvo da desativação (identificador).
 */
export function canDeactivate(
  actor: ActorIdentity,
  target: TargetIdentity,
): boolean {
  return canAccessAdmin(actor) && actor.id !== target.id;
}

/**
 * Variante {@link Result} de {@link canDeactivate} para uso na fronteira.
 *
 * Aplica a precedência explícita:
 * - ator não-Administrador → `FORBIDDEN` com {@link ADMIN_ACCESS_DENIED_MESSAGE}
 *   (Req. 14.6);
 * - Administrador desativando a própria conta → `FORBIDDEN` com
 *   {@link CANNOT_DEACTIVATE_SELF_MESSAGE} (Req. 14.7);
 * - caso contrário → `ok(undefined)`.
 *
 * @param actor  Ator que solicita a desativação (identificador e papel).
 * @param target Conta alvo da desativação (identificador).
 */
export function ensureCanDeactivate(
  actor: ActorIdentity,
  target: TargetIdentity,
): Result<void> {
  // 1) Autorização por papel primeiro (Req. 14.6).
  if (!canAccessAdmin(actor)) {
    return err("FORBIDDEN", ADMIN_ACCESS_DENIED_MESSAGE);
  }
  // 2) Guarda de autodesativação (Req. 14.7).
  if (actor.id === target.id) {
    return err("FORBIDDEN", CANNOT_DEACTIVATE_SELF_MESSAGE);
  }
  return ok(undefined);
}
