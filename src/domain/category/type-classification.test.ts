import { describe, it, expect } from "vitest";
import { availableCategoriesForType } from "@/domain/category/validation";
import { type Category, type TransactionType } from "@/domain/types";

/**
 * Teste unitário da **classificação exclusiva de tipo de categoria** (Req. 8.2).
 *
 * O critério 8.2 determina que o Serviço_de_Categorias classifique cada
 * Categoria **exclusivamente** como tipo Receita (`INCOME`) **ou** tipo Despesa
 * (`EXPENSE`) — nunca ambos, nunca nenhum. O sistema de tipos
 * ({@link TransactionType} = "INCOME" | "EXPENSE") e o enum do Prisma já
 * impõem essa restrição estaticamente; aqui exercitamos a exclusividade através
 * do comportamento observável de {@link availableCategoriesForType}, que filtra
 * estritamente por tipo.
 *
 * Estes são testes baseados em exemplos concretos.
 *
 * _Requirements: 8.2_
 */

// ---------------------------------------------------------------------------
// Fixtures: uma mistura concreta de categorias INCOME e EXPENSE
// ---------------------------------------------------------------------------

function makeCategory(
  id: string,
  name: string,
  type: TransactionType,
): Category {
  return { id, userId: "user-1", name, type, createdAt: new Date(0) };
}

const salario = makeCategory("cat-1", "Salário", "INCOME");
const investimentos = makeCategory("cat-2", "Investimentos", "INCOME");
const freelance = makeCategory("cat-3", "Freelance", "INCOME");
const alimentacao = makeCategory("cat-4", "Alimentação", "EXPENSE");
const transporte = makeCategory("cat-5", "Transporte", "EXPENSE");

const incomeCategories: Category[] = [salario, investimentos, freelance];

const expenseCategories: Category[] = [alimentacao, transporte];

// Lista misturada (ordem intercalada) com receitas e despesas.
const mixedCategories: Category[] = [
  salario,
  alimentacao,
  investimentos,
  transporte,
  freelance,
];

const ids = (categories: Category[]): string[] =>
  categories.map((category) => category.id).sort();

describe("Classificação exclusiva de tipo de categoria (Req. 8.2)", () => {
  it("availableCategoriesForType('INCOME') retorna exatamente as categorias INCOME e exclui todas as EXPENSE", () => {
    const result = availableCategoriesForType(mixedCategories, "INCOME");

    expect(ids(result)).toEqual(ids(incomeCategories));
    expect(result.every((category) => category.type === "INCOME")).toBe(true);
    expect(result.some((category) => category.type === "EXPENSE")).toBe(false);
  });

  it("availableCategoriesForType('EXPENSE') retorna exatamente as categorias EXPENSE e exclui todas as INCOME", () => {
    const result = availableCategoriesForType(mixedCategories, "EXPENSE");

    expect(ids(result)).toEqual(ids(expenseCategories));
    expect(result.every((category) => category.type === "EXPENSE")).toBe(true);
    expect(result.some((category) => category.type === "INCOME")).toBe(false);
  });

  it("a união dos dois baldes de tipo é igual à entrada e a interseção é vazia (cada categoria em exatamente um tipo)", () => {
    const incomeBucket = availableCategoriesForType(mixedCategories, "INCOME");
    const expenseBucket = availableCategoriesForType(mixedCategories, "EXPENSE");

    // União: toda categoria de entrada está em exatamente um dos baldes.
    const unionIds = ids([...incomeBucket, ...expenseBucket]);
    expect(unionIds).toEqual(ids(mixedCategories));

    // Interseção vazia: nenhuma categoria aparece nos dois baldes (exclusividade).
    const incomeIds = new Set(incomeBucket.map((category) => category.id));
    const intersection = expenseBucket.filter((category) =>
      incomeIds.has(category.id),
    );
    expect(intersection).toEqual([]);

    // O tamanho total é preservado, sem perdas nem duplicações.
    expect(incomeBucket.length + expenseBucket.length).toBe(
      mixedCategories.length,
    );
  });

  it("toda categoria tem tipo exatamente 'INCOME' ou 'EXPENSE' (mutuamente exclusivo, nunca ambos/nenhum)", () => {
    for (const category of mixedCategories) {
      const isIncome = category.type === "INCOME";
      const isExpense = category.type === "EXPENSE";

      // Exatamente um dos dois é verdadeiro (XOR): nunca ambos, nunca nenhum.
      expect(isIncome || isExpense).toBe(true);
      expect(isIncome && isExpense).toBe(false);
    }
  });

  it("filtra estritamente: numa lista só de receitas, o balde de despesas é vazio, e vice-versa", () => {
    expect(availableCategoriesForType(incomeCategories, "EXPENSE")).toEqual([]);
    expect(ids(availableCategoriesForType(incomeCategories, "INCOME"))).toEqual(
      ids(incomeCategories),
    );

    expect(availableCategoriesForType(expenseCategories, "INCOME")).toEqual([]);
    expect(
      ids(availableCategoriesForType(expenseCategories, "EXPENSE")),
    ).toEqual(ids(expenseCategories));
  });

  it("lista vazia produz baldes vazios para ambos os tipos", () => {
    expect(availableCategoriesForType([], "INCOME")).toEqual([]);
    expect(availableCategoriesForType([], "EXPENSE")).toEqual([]);
  });
});
