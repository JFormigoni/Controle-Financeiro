/**
 * Tipos de domínio compartilhados da Plataforma de Gestão Financeira.
 *
 * Tipos e interfaces puros (sem I/O) reutilizados por toda a camada de domínio:
 * enums espelhando o schema Prisma, o tipo monetário `Money` (centavos
 * inteiros), as entidades principais (`Transaction`, `Category`, `Goal`) e os
 * tipos de período/intervalo usados pelos cálculos de dashboard, relatórios e
 * filtros.
 *
 * Referência: design.md, seções "Tipos de Domínio (TypeScript)" e
 * "Components and Interfaces". Os valores dos enums correspondem exatamente aos
 * enums definidos em `prisma/schema.prisma`.
 */

// ---------------------------------------------------------------------------
// Enums de domínio (espelham `prisma/schema.prisma`)
// ---------------------------------------------------------------------------

/** Tipo de lançamento financeiro (Req. 6, 7, 8). */
export type TransactionType = "INCOME" | "EXPENSE";

/** Papel do usuário na plataforma (Req. 14, 15). */
export type UserRole = "USER" | "ADMIN";

/** Estado da conta; contas inativas não autenticam (Req. 14.3, 14.5). */
export type AccountStatus = "ACTIVE" | "INACTIVE";

/** Frequência de recorrência de lançamentos (Req. 6.5, 7.5). */
export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Finalidade de um token de uso único (Req. 1.3, 3.1, 4.4). */
export type TokenPurpose =
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RESET"
  | "EMAIL_CHANGE";

/** Ação registrada no log de acesso (Req. 15.1). */
export type AccessAction = "LOGIN" | "LOGOUT" | "SESSION_EXPIRED";

// ---------------------------------------------------------------------------
// Valor monetário
// ---------------------------------------------------------------------------

/**
 * Valor monetário representado como inteiro de **centavos**, para evitar erros
 * de ponto flutuante em cálculos financeiros. A conversão de/para `Decimal`
 * ocorre nas bordas da aplicação.
 *
 * Faixa válida de um valor de lançamento/meta: 1 .. 99_999_999_999 centavos
 * (equivalente a R$ 0,01 .. R$ 999.999.999,99).
 */
export type Money = number;

// ---------------------------------------------------------------------------
// Tipos auxiliares de data/período
// ---------------------------------------------------------------------------

/**
 * Mês civil, independente de fuso. `month` é 1..12 (janeiro = 1).
 * Usado por cálculos de dashboard mensais (resultado mensal, indicadores).
 */
export interface Month {
  /** Ano civil (ex.: 2026). */
  year: number;
  /** Mês civil de 1 (janeiro) a 12 (dezembro). */
  month: number;
}

/**
 * Intervalo de datas fechado e inclusivo: `[start, end]`.
 * Resultado válido somente quando `start <= end`.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Período selecionável no dashboard e em relatórios.
 *
 * União discriminada pelo campo `kind`:
 * - `CURRENT_MONTH`  — mês civil corrente.
 * - `PREVIOUS_MONTH` — mês civil anterior.
 * - `CURRENT_YEAR`   — ano civil corrente.
 * - `CUSTOM`         — intervalo personalizado `[start, end]`.
 */
export type Period =
  | { kind: "CURRENT_MONTH" }
  | { kind: "PREVIOUS_MONTH" }
  | { kind: "CURRENT_YEAR" }
  | { kind: "CUSTOM"; start: Date; end: Date };

// ---------------------------------------------------------------------------
// Entidades de domínio
// ---------------------------------------------------------------------------

/**
 * Lançamento financeiro (receita ou despesa), discriminado por `type`.
 * `amount` é um inteiro de centavos (1 .. 99_999_999_999).
 */
export interface Transaction {
  id: string;
  userId: string;
  categoryId: string;
  type: TransactionType;
  /** Descrição livre de 1 a 200 caracteres. */
  description: string;
  /** Valor em centavos (1 .. 99_999_999_999). */
  amount: Money;
  date: Date;
  /** Identificador compartilhado por ocorrências de um lançamento recorrente. */
  recurrenceId: string | null;
  createdAt: Date;
}

/**
 * Categoria que classifica lançamentos, exclusivamente Receita ou Despesa,
 * única por conta + tipo (Req. 8.1, 8.2, 8.6).
 */
export interface Category {
  id: string;
  userId: string;
  /** Nome de 1 a 60 caracteres. */
  name: string;
  type: TransactionType;
  createdAt: Date;
}

/**
 * Meta financeira do usuário. Progresso e conclusão são derivados na camada de
 * domínio a partir de `accumulatedAmount` e `targetAmount` (Req. 9.1–9.4).
 */
export interface Goal {
  id: string;
  userId: string;
  /** Descrição de 1 a 100 caracteres. */
  description: string;
  /** Valor-alvo em centavos (> 0). */
  targetAmount: Money;
  /** Valor acumulado em centavos. */
  accumulatedAmount: Money;
  /** Prazo da meta; deve ser posterior ao instante atual no cadastro. */
  deadline: Date;
  completed: boolean;
  createdAt: Date;
}
