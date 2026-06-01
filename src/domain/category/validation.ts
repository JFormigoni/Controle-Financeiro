/**
 * Validação de **categorias** — domínio puro do Serviço de Categorias.
 *
 * Implementa, como funções puras, totais e determinísticas (sem qualquer I/O),
 * as regras de negócio de categoria que não dependem de persistência:
 *
 * 1. **Validação de nome** ({@link validateCategoryName}): o nome deve ter de
 *    {@link CATEGORY_NAME_MIN_LENGTH} a {@link CATEGORY_NAME_MAX_LENGTH}
 *    caracteres, inclusive (1 a 60). Nome vazio ou só com espaços é rejeitado
 *    (Req. 8.1, 8.3, 8.8).
 * 2. **Detecção de duplicidade** ({@link isDuplicateCategory}): identifica
 *    nomes duplicados dentro da mesma conta e do mesmo tipo (Req. 8.6).
 * 3. **Categorias disponíveis por tipo** ({@link availableCategoriesForType}):
 *    filtra as categorias cujo tipo corresponde ao tipo do lançamento
 *    (Req. 8.7, 8.8).
 *
 * A persistência e as verificações de autorização/propriedade ocorrem na
 * fronteira (serviço de categoria, tarefa 8.4), que reutiliza estas funções.
 *
 * ## Política de normalização
 *
 * - **Comprimento** (`validateCategoryName`): o nome é primeiro **aparado**
 *   (`trim`) para remover espaços nas bordas; o comprimento é medido sobre o
 *   nome aparado, em **unidades de código UTF-16** (`String.prototype.length`),
 *   a mesma métrica usada na validação de senha e na fronteira (Zod), o que
 *   mantém as decisões consistentes em toda a pilha. Assim, um nome contendo
 *   apenas espaços é considerado vazio e, portanto, rejeitado (Req. 8.8). O
 *   valor normalizado retornado no sucesso é o nome aparado, que é o que deve
 *   ser persistido.
 * - **Duplicidade** (`isDuplicateCategory`): a comparação é **aparada e
 *   insensível a maiúsculas/minúsculas** (`trim` + `toLocaleLowerCase`),
 *   consistente com a normalização de comprimento (mesmo `trim`), porém também
 *   ignorando diferença de caixa — de modo que "Salário" e "salário " são
 *   tratados como o mesmo nome. A unicidade é por conta + tipo: o chamador
 *   passa apenas as categorias do próprio usuário, e aqui a comparação
 *   adicional é feita por `type` + nome normalizado.
 *
 * Referências: design.md, "Serviço de Categorias (Req. 8)"; requirements.md,
 * critérios 8.1, 8.3, 8.6, 8.7, 8.8.
 */

import { type Category, type TransactionType } from "@/domain/types";
import { type ValidationResult, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes de comprimento
// ---------------------------------------------------------------------------

/** Comprimento mínimo do nome de uma categoria, em unidades de código UTF-16 (Req. 8.1, 8.8). */
export const CATEGORY_NAME_MIN_LENGTH = 1;

/** Comprimento máximo do nome de uma categoria, em unidades de código UTF-16 (Req. 8.1, 8.8). */
export const CATEGORY_NAME_MAX_LENGTH = 60;

/** Mensagem do critério de comprimento do nome (faixa fechada [1, 60]). */
const CATEGORY_NAME_LENGTH_MESSAGE = `O nome da categoria deve ter entre ${CATEGORY_NAME_MIN_LENGTH} e ${CATEGORY_NAME_MAX_LENGTH} caracteres.`;

/** Mensagem exibida quando há duplicidade de categoria por conta + tipo (Req. 8.6). */
export const CATEGORY_DUPLICATE_MESSAGE =
  "Já existe uma categoria com esse nome para este tipo de lançamento.";

// ---------------------------------------------------------------------------
// Normalização interna
// ---------------------------------------------------------------------------

/**
 * Normaliza um nome para **comparação de duplicidade**: apara as bordas e
 * converte para minúsculas (insensível a caixa). Mantém o mesmo `trim` usado
 * em {@link validateCategoryName}, garantindo consistência entre validação e
 * detecção de duplicidade.
 */
function normalizeNameForComparison(name: string): string {
  return name.trim().toLocaleLowerCase();
}

// ---------------------------------------------------------------------------
// Validação de nome
// ---------------------------------------------------------------------------

/**
 * Valida o **nome de uma categoria** (Req. 8.1, 8.3, 8.8).
 *
 * Retorna sucesso com o nome **aparado** (normalizado) se e somente se, após o
 * `trim`, o comprimento estiver na faixa fechada [{@link CATEGORY_NAME_MIN_LENGTH},
 * {@link CATEGORY_NAME_MAX_LENGTH}] (1 a 60 unidades de código UTF-16). Um nome
 * vazio ou contendo apenas espaços torna-se vazio após o `trim` e é, portanto,
 * rejeitado (Req. 8.8). Caso contrário, retorna um erro `VALIDATION` no campo
 * `name` informando o critério de comprimento.
 *
 * A função é pura, total e determinística e não muta a entrada.
 *
 * @param name Nome informado para a categoria.
 * @returns `ok(nomeAparado)` quando válido; `err(VALIDATION, ...)` caso contrário.
 */
export function validateCategoryName(name: string): ValidationResult<string> {
  const trimmed = name.trim();
  if (
    trimmed.length < CATEGORY_NAME_MIN_LENGTH ||
    trimmed.length > CATEGORY_NAME_MAX_LENGTH
  ) {
    return err("VALIDATION", CATEGORY_NAME_LENGTH_MESSAGE, "name");
  }
  return ok(trimmed);
}

// ---------------------------------------------------------------------------
// Detecção de duplicidade
// ---------------------------------------------------------------------------

/**
 * Verdadeiro se e somente se já existir, dentre as categorias informadas, uma
 * categoria do **mesmo tipo** e com o **mesmo nome** (comparação aparada e
 * insensível a maiúsculas/minúsculas) do nome candidato (Req. 8.6).
 *
 * A unicidade é por conta + tipo: o chamador deve passar em `existing` apenas
 * as categorias do próprio usuário; esta função adiciona a comparação por
 * `type` + nome normalizado. A comparação de nome usa a mesma política de
 * `trim` de {@link validateCategoryName}, acrescida de insensibilidade a caixa.
 *
 * A função é pura, total e determinística e não muta a entrada.
 *
 * @param existing Categorias do usuário a comparar (somente da própria conta).
 * @param name     Nome candidato (será aparado e comparado sem diferenciar caixa).
 * @param type     Tipo do lançamento da categoria candidata.
 * @returns `true` quando há duplicidade por conta + tipo; `false` caso contrário.
 */
export function isDuplicateCategory(
  existing: Category[],
  name: string,
  type: TransactionType,
): boolean {
  const normalizedCandidate = normalizeNameForComparison(name);
  return existing.some(
    (category) =>
      category.type === type &&
      normalizeNameForComparison(category.name) === normalizedCandidate,
  );
}

// ---------------------------------------------------------------------------
// Categorias disponíveis por tipo
// ---------------------------------------------------------------------------

/**
 * Retorna apenas as categorias cujo `type` é igual ao tipo informado
 * (Req. 8.7, 8.8) — as categorias disponíveis para um lançamento daquele tipo.
 *
 * O chamador deve passar em `categories` somente as categorias do próprio
 * usuário; esta função apenas aplica o filtro por tipo. Retorna sempre um novo
 * array (não muta a entrada) preservando a ordem relativa de `categories`.
 *
 * @param categories Categorias do usuário a filtrar.
 * @param type       Tipo do lançamento (Receita ou Despesa).
 * @returns Novo array contendo apenas as categorias do tipo informado.
 */
export function availableCategoriesForType(
  categories: Category[],
  type: TransactionType,
): Category[] {
  return categories.filter((category) => category.type === type);
}
