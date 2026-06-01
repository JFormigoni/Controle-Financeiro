/**
 * Máquina de estado de tentativas de login (domínio puro).
 *
 * Modela o controle de tentativas de login mal-sucedidas e o bloqueio temporário
 * de uma conta/e-mail, conforme o Serviço_de_Autenticacao:
 *
 * - Req. 2.2 — credenciais inválidas **incrementam em 1** o contador de
 *   tentativas mal-sucedidas associado ao e-mail.
 * - Req. 2.6 — **5 tentativas consecutivas** mal-sucedidas, sem nenhuma
 *   autenticação bem-sucedida entre elas, **bloqueiam** novas tentativas por
 *   **15 minutos**.
 * - Req. 2.8 — enquanto bloqueado, **toda** tentativa é rejeitada, mesmo com
 *   credenciais corretas.
 * - Req. 2.9 — uma autenticação bem-sucedida **zera** o contador.
 *
 * Este módulo é **puro** (sem I/O) e **total** (nunca lança): recebe o estado
 * atual e o instante corrente e devolve um booleano ou um **novo** objeto de
 * estado, sem nunca mutar a entrada. A persistência do estado
 * (`User.failedLoginAttempts` e `User.lockedUntil`) e a rejeição efetiva da
 * tentativa ocorrem na fronteira (serviço de login, tarefa 5.4), que reutiliza
 * {@link isAccountLocked} e {@link nextLoginAttemptState}.
 *
 * ## Suposição de ordenação (Req. 2.8)
 *
 * A rejeição durante o bloqueio é responsabilidade da decisão de autenticação
 * (`auth-decision`, tarefa 4.9): {@link isAccountLocked} é verificado **antes**
 * da verificação de credenciais. Como consequência, enquanto a conta está
 * bloqueada nenhuma verificação de credencial é realizada e, portanto, **um
 * sucesso (`success === true`) nunca ocorre durante a janela de bloqueio**.
 * Mesmo assim, este módulo trata defensivamente as transições durante o
 * bloqueio (ver {@link nextLoginAttemptState}) para permanecer total.
 *
 * Referência: design.md, "Serviço de Autenticação" — "Contador de tentativas:
 * incrementa em credenciais inválidas (Req. 2.2), bloqueia por 15min após 5
 * falhas consecutivas (Req. 2.6, 2.8), zera em sucesso (Req. 2.9)".
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Número de falhas **consecutivas** que aciona o bloqueio temporário
 * (Req. 2.6). O bloqueio é iniciado quando o contador incrementado alcança
 * este limite.
 */
export const MAX_FAILED_ATTEMPTS = 5;

/** Duração do bloqueio temporário: 15 minutos em milissegundos (Req. 2.6). */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Estado de tentativas de login de uma conta/e-mail.
 *
 * Espelha os campos `failedLoginAttempts` (inteiro) e `lockedUntil`
 * (`DateTime?`) do modelo Prisma `User`.
 */
export interface LoginAttemptState {
  /** Quantidade de tentativas mal-sucedidas consecutivas (>= 0). */
  failedLoginAttempts: number;
  /**
   * Instante até o qual a conta permanece bloqueada, ou `null` quando não há
   * bloqueio vigente. A conta está bloqueada enquanto `now < lockedUntil`.
   */
  lockedUntil: Date | null;
}

// ---------------------------------------------------------------------------
// Predicado de bloqueio
// ---------------------------------------------------------------------------

/**
 * Verdadeiro se e somente se a conta está bloqueada no instante `now`, isto é,
 * quando há um `lockedUntil` definido e `now` é **anterior** a ele
 * (`lockedUntil != null && now < lockedUntil`) — Req. 2.8.
 *
 * Quando `lockedUntil` é `null` ou já passou (`now >= lockedUntil`), a conta
 * não está bloqueada. Pura e total: não muta a entrada e nunca lança.
 *
 * @param state Estado atual de tentativas de login.
 * @param now   Instante corrente.
 */
export function isAccountLocked(state: LoginAttemptState, now: Date): boolean {
  return state.lockedUntil !== null && now.getTime() < state.lockedUntil.getTime();
}

// ---------------------------------------------------------------------------
// Transição de estado
// ---------------------------------------------------------------------------

/**
 * Calcula o **próximo** estado de tentativas de login a partir do resultado de
 * uma tentativa. Função pura e total: **nunca** muta `state`; sempre retorna um
 * novo objeto.
 *
 * Regras:
 * - **Sucesso** (`success === true`): zera o contador e remove o bloqueio,
 *   retornando `{ failedLoginAttempts: 0, lockedUntil: null }` (Req. 2.9).
 *   Pela suposição de ordenação (ver documentação do módulo), um sucesso não
 *   ocorre enquanto bloqueado; ainda assim, o sucesso sempre reinicia o estado.
 * - **Falha enquanto já bloqueado** (`isAccountLocked(state, now)`): preserva o
 *   bloqueio vigente **sem estendê-lo** e **sem incrementar** o contador
 *   indefinidamente. Na prática, a fronteira rejeita a tentativa via
 *   {@link isAccountLocked} antes de chegar aqui; este ramo é defensivo para
 *   manter a função total.
 * - **Falha sem bloqueio vigente**: incrementa o contador em **exatamente 1**
 *   (Req. 2.2). Quando o valor incrementado **alcança** {@link MAX_FAILED_ATTEMPTS}
 *   (5), inicia um bloqueio de {@link LOCK_DURATION_MS} a partir de `now`
 *   (Req. 2.6, 2.8); caso contrário, permanece sem bloqueio.
 *
 * @param state   Estado atual de tentativas de login.
 * @param success `true` se a tentativa autenticou com sucesso; `false` caso
 *                as credenciais sejam inválidas.
 * @param now     Instante corrente, usado como base do bloqueio.
 */
export function nextLoginAttemptState(
  state: LoginAttemptState,
  success: boolean,
  now: Date,
): LoginAttemptState {
  // Sucesso: zera o contador e remove o bloqueio (Req. 2.9).
  if (success) {
    return { failedLoginAttempts: 0, lockedUntil: null };
  }

  // Falha durante o bloqueio: mantém o bloqueio vigente sem estendê-lo nem
  // incrementar o contador (ramo defensivo; ver suposição de ordenação).
  if (isAccountLocked(state, now)) {
    return {
      failedLoginAttempts: state.failedLoginAttempts,
      // Cópia defensiva do `Date` para não expor a referência da entrada.
      lockedUntil:
        state.lockedUntil === null ? null : new Date(state.lockedUntil.getTime()),
    };
  }

  // Falha sem bloqueio vigente: incrementa em exatamente 1 (Req. 2.2).
  const failedLoginAttempts = state.failedLoginAttempts + 1;

  // Ao alcançar o limite, inicia o bloqueio de 15 minutos (Req. 2.6, 2.8).
  if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginAttempts,
      lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
    };
  }

  return { failedLoginAttempts, lockedUntil: null };
}
