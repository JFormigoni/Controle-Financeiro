/**
 * Invalidação de sessões por **evento de segurança** — domínio puro de
 * autenticação.
 *
 * Modela, como função pura e total, o efeito que certos eventos sensíveis têm
 * sobre o conjunto de Sessões ativas de um Usuário: quando a senha é **alterada
 * ou redefinida** (Req. 3.6) ou quando a conta é **desativada** (Req. 14.3),
 * **todas** as Sessões ativas desse Usuário devem ser invalidadas. Após o
 * evento, o conjunto de Sessões pertencentes ao Usuário fica **vazio**.
 *
 * Este módulo é **puro**: não acessa banco de dados, rede nem relógio. A
 * remoção efetiva no banco ocorre na camada de serviço (tarefas 5.4/5.5/17.4),
 * que chama `session.deleteMany({ where: { userId } })`. A função aqui modela o
 * **estado resultante** dessa operação, permitindo o teste baseado em
 * propriedades (Property 8) sem mocks nem I/O.
 *
 * Referência: design.md, "Estratégia de Sessão e Expiração"; requirements.md,
 * critérios 3.6 e 14.3.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Sessão persistida, espelhando o modelo `Session` do Prisma
 * (`prisma/schema.prisma`). Mantida como interface local até a introdução de um
 * tipo de Sessão compartilhado pela camada de domínio.
 */
export interface Session {
  /** Identificador da Sessão. */
  id: string;
  /** Identificador do Usuário dono da Sessão. */
  userId: string;
  /** Token único de Sessão (estratégia de database sessions do Auth.js v5). */
  sessionToken: string;
  /** Instante de expiração por inatividade da Sessão. */
  expires: Date;
}

/**
 * Eventos de segurança que **invalidam todas as Sessões** ativas do Usuário
 * afetado:
 *
 * - `PASSWORD_CHANGED`     — senha alterada pelo próprio Usuário (Req. 3.4/3.6).
 * - `PASSWORD_RESET`       — senha redefinida via link de recuperação (Req. 3.2/3.6).
 * - `ACCOUNT_DEACTIVATED`  — conta marcada como inativa (Req. 14.2/14.3).
 */
export type SecurityEvent =
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "ACCOUNT_DEACTIVATED";

// ---------------------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------------------

/**
 * Indica se um {@link SecurityEvent} deve invalidar **todas** as Sessões ativas
 * do Usuário. Documenta a intenção: os três eventos de segurança modelados
 * disparam a invalidação total, logo o retorno é sempre `true`.
 *
 * A função é mantida exaustiva sobre `SecurityEvent` para que a adição futura de
 * um evento que **não** invalide sessões seja uma decisão explícita.
 *
 * @param event Evento de segurança ocorrido.
 * @returns `true` quando o evento invalida todas as Sessões do Usuário.
 */
export function shouldInvalidateAllSessions(event: SecurityEvent): boolean {
  switch (event) {
    case "PASSWORD_CHANGED":
    case "PASSWORD_RESET":
    case "ACCOUNT_DEACTIVATED":
      return true;
    default: {
      // Exaustividade: qualquer novo evento deve ser tratado explicitamente.
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Invalida todas as Sessões ativas de um Usuário em resposta a um evento de
 * segurança (Req. 3.6, 14.3).
 *
 * Retorna um **novo** array contendo as Sessões remanescentes após remover
 * **todas** as Sessões cujo `userId` seja igual a `userId`. Após a chamada, o
 * resultado **não contém nenhuma Sessão** do Usuário afetado (conjunto vazio
 * para esse Usuário), enquanto as Sessões dos demais Usuários são **preservadas
 * intactas e na ordem original**.
 *
 * É **pura e total**: não muta o array de entrada e não realiza I/O. Para os
 * eventos modelados em {@link SecurityEvent}, a invalidação é sempre total
 * (ver {@link shouldInvalidateAllSessions}).
 *
 * @param sessions Conjunto atual de Sessões (de quaisquer Usuários).
 * @param userId Identificador do Usuário cujas Sessões devem ser invalidadas.
 * @param event Evento de segurança que disparou a invalidação.
 * @returns Novo array com as Sessões remanescentes (sem nenhuma do Usuário).
 */
export function invalidateUserSessions(
  sessions: Session[],
  userId: string,
  event: SecurityEvent,
): Session[] {
  if (!shouldInvalidateAllSessions(event)) {
    // Defensivo: eventos que não invalidam mantêm o conjunto inalterado.
    return sessions.slice();
  }
  return sessions.filter((session) => session.userId !== userId);
}
