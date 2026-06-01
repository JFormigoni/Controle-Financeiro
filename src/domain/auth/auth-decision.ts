/**
 * Decisão de **autenticação** — domínio puro de autenticação.
 *
 * Implementa a regra central de aceitação/rejeição de um login como uma função
 * pura, total e determinística, sem qualquer I/O (design.md, "Serviço de
 * Autenticação"; requirements.md, critérios 2.1, 2.2, 2.3, 2.8, 14.5).
 *
 * ## Propriedade central (Property 5 — design.md)
 *
 * Para qualquer estado de usuário e par de credenciais, a autenticação é
 * bem-sucedida **se e somente se**:
 *
 * 1. a senha conferir com o hash armazenado (`passwordMatches`), **e**
 * 2. o e-mail estiver verificado (`emailVerified`), **e**
 * 3. a conta estiver ativa (`status === 'ACTIVE'`), **e**
 * 4. o e-mail **não** estiver bloqueado por excesso de tentativas (`!locked`).
 *
 * Em qualquer outro caso a autenticação é rejeitada e nenhuma sessão é
 * iniciada. O sucesso é exatamente a conjunção das quatro condições.
 *
 * ## Fronteira pura: por que `passwordMatches` é um booleano
 *
 * A **verificação** da senha em si (`bcrypt.compare`) é assíncrona e impura, e
 * portanto vive na camada de serviço (`src/infra/services/login.ts`). Esta
 * função recebe o resultado já computado dessa comparação como o booleano
 * `passwordMatches`, mantendo a decisão de domínio totalmente pura e
 * testável por propriedades sem mocks de I/O.
 *
 * Da mesma forma, o estado de bloqueio do e-mail é computado em
 * `src/domain/auth/login-attempts.ts` por `isAccountLocked(state, now)` e
 * chega aqui já reduzido ao booleano `locked`. Mantemos esta função
 * desacoplada desse módulo para que a decisão de autenticação dependa apenas
 * de dados, não de outras funções de domínio.
 *
 * ## Ordem de precedência das rejeições
 *
 * A propriedade só observa a decisão aceitar/rejeitar; a ordem dos erros não a
 * afeta. Ainda assim, a ordem abaixo foi escolhida por segurança e aderência
 * aos requisitos:
 *
 * 1. **Bloqueado** → `LOCKED` ("acesso temporariamente bloqueado"). É a maior
 *    precedência: enquanto o e-mail estiver bloqueado, toda tentativa é
 *    rejeitada, **mesmo com credenciais corretas** (Req. 2.8).
 * 2. **Senha não confere** → mensagem **genérica** de credenciais inválidas
 *    que não revela se o e-mail ou a senha está incorreto, nem se a conta
 *    existe (Req. 2.2). Verificada antes de revelar e-mail não verificado ou
 *    conta inativa, evitando enumeração de contas por quem não possui a senha.
 * 3. **E-mail não verificado** → `FORBIDDEN`, informando a necessidade de
 *    validar o e-mail (Req. 2.3). Só é alcançado quando a senha confere.
 * 4. **Conta inativa** → `LOCKED`, informando que a conta está inativa
 *    (Req. 14.5).
 */

import { type Result, err, ok } from "@/domain/result";
import { type AccountStatus } from "@/domain/types";

// ---------------------------------------------------------------------------
// Entrada da decisão
// ---------------------------------------------------------------------------

/**
 * Estado relevante de usuário/conta para a decisão de autenticação.
 *
 * Todos os campos são valores já computados na camada de serviço, mantendo a
 * decisão pura:
 *
 * - `passwordMatches`: resultado de `bcrypt.compare(senha, hash)`. A
 *   verificação assíncrona/impura ocorre fora desta função (ver doc do módulo).
 * - `emailVerified`: indica se o e-mail da conta já foi confirmado (Req. 2.3).
 * - `status`: estado da conta; apenas `ACTIVE` autentica (Req. 14.5).
 * - `locked`: estado de bloqueio do e-mail por excesso de tentativas de login,
 *   tipicamente obtido de `isAccountLocked(state, now)` em
 *   `src/domain/auth/login-attempts.ts` (Req. 2.8).
 */
export interface AuthDecisionInput {
  /** Resultado de `bcrypt.compare`: `true` se a senha confere com o hash. */
  passwordMatches: boolean;
  /** `true` se o e-mail da conta já foi verificado. */
  emailVerified: boolean;
  /** Estado da conta; somente `'ACTIVE'` pode autenticar. */
  status: AccountStatus;
  /** `true` se o e-mail está temporariamente bloqueado por tentativas. */
  locked: boolean;
}

// ---------------------------------------------------------------------------
// Mensagens (seguras para exibição)
// ---------------------------------------------------------------------------

/** Mensagem de acesso temporariamente bloqueado (Req. 2.8). */
export const MESSAGE_LOCKED =
  "Acesso temporariamente bloqueado. Tente novamente mais tarde.";

/**
 * Mensagem **genérica** de credenciais inválidas (Req. 2.2). Não revela se o
 * problema está no e-mail ou na senha, nem se a conta existe.
 */
export const MESSAGE_INVALID_CREDENTIALS = "E-mail ou senha inválidos.";

/** Mensagem de e-mail não verificado (Req. 2.3). */
export const MESSAGE_EMAIL_NOT_VERIFIED =
  "É necessário validar seu e-mail antes de efetuar login.";

/** Mensagem de conta inativa (Req. 14.5). */
export const MESSAGE_INACTIVE_ACCOUNT = "Esta conta está inativa.";

// ---------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------

/**
 * Decide se um login deve ser aceito a partir do estado de conta e do
 * resultado da verificação de senha (Property 5; Req. 2.1, 2.2, 2.3, 2.8, 14.5).
 *
 * Retorna `ok(undefined)` **se e somente se**
 * `passwordMatches && emailVerified && status === 'ACTIVE' && !locked`.
 * Caso contrário, retorna um `err(...)` com o código e a mensagem apropriados,
 * seguindo a ordem de precedência documentada no cabeçalho do módulo. Quando a
 * decisão é de rejeição, nenhuma sessão deve ser iniciada pela camada de
 * serviço.
 *
 * A função é pura e total: para a mesma entrada, sempre produz o mesmo
 * resultado e nunca lança.
 *
 * @param input Estado de conta e resultado da verificação de senha.
 * @returns `ok(undefined)` quando a autenticação é permitida; caso contrário,
 *   `err(...)` com o motivo da rejeição.
 */
export function decideAuthentication(input: AuthDecisionInput): Result<void> {
  // 1. Bloqueio tem precedência máxima: rejeita mesmo com credenciais corretas.
  if (input.locked) {
    return err("LOCKED", MESSAGE_LOCKED);
  }

  // 2. Senha incorreta: mensagem genérica, sem revelar e-mail/senha/existência.
  if (!input.passwordMatches) {
    return err("UNAUTHORIZED", MESSAGE_INVALID_CREDENTIALS);
  }

  // 3. E-mail ainda não verificado (somente alcançável com senha correta).
  if (!input.emailVerified) {
    return err("FORBIDDEN", MESSAGE_EMAIL_NOT_VERIFIED);
  }

  // 4. Conta inativa não autentica.
  if (input.status !== "ACTIVE") {
    return err("LOCKED", MESSAGE_INACTIVE_ACCOUNT);
  }

  // Conjunção satisfeita: autenticação permitida.
  return ok(undefined);
}
