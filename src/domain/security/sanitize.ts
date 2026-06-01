/**
 * Sanitização de entrada contra XSS (Cross-Site Scripting) — Req. 16.2.
 *
 * `sanitizeUserInput` é uma função **pura, total e idempotente** que neutraliza
 * ou remove o conteúdo de script presente em entradas de texto livre
 * (descrições, nomes, etc.), de modo que scripts injetados não sejam executados
 * ao serem armazenados ou exibidos (design.md, "Camada de Segurança
 * Transversal"; requirements.md, critério 16.2).
 *
 * Esta é uma camada de **defesa em profundidade**: a saída do React já escapa
 * HTML por padrão; ainda assim, neutralizamos a entrada na escrita para que o
 * dado persistido seja inerte, independentemente de onde venha a ser exibido.
 *
 * ## Estratégia de idempotência
 *
 * A **Property 40** exige idempotência:
 * `sanitizeUserInput(sanitizeUserInput(x)) === sanitizeUserInput(x)` para toda
 * string `x`. Para garanti-la, o pipeline foi desenhado de modo que sua saída
 * seja um **ponto fixo** (estável sob reaplicação):
 *
 * 1. **Escape final de `<` e `>`** (`<` → `&lt;`, `>` → `&gt;`) é a peça
 *    central. Após o escape, a saída **não contém nenhum `<` nem `>`**. Logo,
 *    todas as etapas que dependem desses caracteres (remoção de `<script>`,
 *    `<style>` e de tags em geral) tornam-se *no-ops* numa segunda aplicação.
 * 2. **Não escapamos `&`** deliberadamente. Escapar `&` para `&amp;` seria
 *    instável (`&` → `&amp;` → `&amp;amp;` → ...). Como `<`/`>` viram entidades
 *    que não contêm `<`/`>`, reaplicar o escape não encontra nada a escapar — o
 *    resultado é estável. Um `&` isolado não é, por si só, um vetor de XSS num
 *    contexto de texto.
 * 3. **Neutralização de protocolos** (`javascript:`, `vbscript:`) e de
 *    **manipuladores de evento** (`onerror=`, `onclick=`, ...) substitui o
 *    gatilho (`:` ou `=`, mais espaços ao redor) por um único **hífen**,
 *    preservando o nome. O hífen é um caractere **não-palavra** e **não é
 *    espaço em branco**, então:
 *      - o `:`/`=` deixa de existir no token neutralizado, e a regex (que exige
 *        o `:`/`=`) não volta a casar nele;
 *      - um eventual `:`/`=` remanescente (ex.: em `javascript::` ou `onx==`)
 *        fica separado do nome pelo hífen, e nem `\s*` nem `\w+` conseguem
 *        "transpor" o hífen para recompor o padrão.
 *    Assim, uma única passagem leva a um ponto fixo (ver os testes de
 *    idempotência em `sanitize.test.ts`).
 * 4. **Ordem das etapas**: remoções/neutralizações ocorrem **antes** do escape.
 *    Mesmo que a remoção de um bloco `<script>` reconstrua, por sobreposição,
 *    um novo `<script>` (ex.: `<scr<script>x</script>ipt>`), o escape final o
 *    converte em texto inerte (`&lt;script&gt;`) — nunca executável — e a saída
 *    permanece sem `<`/`>`, preservando a idempotência.
 *
 * Nota de escopo: a heurística de manipuladores de evento (`\bon\w+\s*=`) pode,
 * em raros casos, neutralizar texto benigno semelhante (ex.: `one=1` →
 * `one-1`). Como o escape de `<`/`>` já impede a formação de qualquer tag — e,
 * portanto, a execução de manipuladores —, esta etapa é defesa adicional; a
 * pequena agressividade é um custo aceitável diante da garantia de segurança.
 */

// ---------------------------------------------------------------------------
// Padrões perigosos (removidos ou neutralizados antes do escape final)
// ---------------------------------------------------------------------------

/** Blocos `<script>...</script>` completos (com o conteúdo). Remoção total. */
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\s*>/gi;

/** Blocos `<style>...</style>` completos (com o conteúdo). Remoção total. */
const STYLE_BLOCK = /<style\b[\s\S]*?<\/style\s*>/gi;

/**
 * `<script`/`<style` sem fechamento correspondente: remove do início da tag
 * até o fim da string. Aplicado após a remoção dos blocos fechados, captura
 * resíduos truncados ou maliciosos (ex.: `texto <script>alert(1)`).
 */
const DANGLING_SCRIPT = /<script\b[\s\S]*$/i;
const DANGLING_STYLE = /<style\b[\s\S]*$/i;

/**
 * Protocolos perigosos em URIs (`javascript:`, `vbscript:`), tolerando espaços
 * antes do `:`. Neutralizados substituindo o `:` (e espaços) por um hífen, o
 * que impede a formação do esquema e não reintroduz o padrão (ver "Estratégia
 * de idempotência").
 */
const DANGEROUS_PROTOCOL = /(javascript|vbscript)\s*:/gi;

/**
 * Manipuladores de evento inline (`onerror=`, `onclick=`, `onload=`, ...).
 * Exige ao menos um caractere de palavra após `on` (não casa um isolado `on=`).
 * Neutralizado substituindo o `=` (e espaços ao redor) por um hífen, mantendo o
 * nome (`onerror=` → `onerror-`). Como o hífen não é `\s` nem `\w`, o padrão
 * não volta a casar numa segunda passagem (idempotência).
 */
const EVENT_HANDLER = /\b(on\w+)\s*=/gi;

/** Substituição comum de gatilho perigoso: preserva o nome e insere um hífen. */
const NEUTRALIZED = "$1-";

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Neutraliza o conteúdo de script de uma entrada de texto livre, de forma pura,
 * total e **idempotente** (`sanitizeUserInput(sanitizeUserInput(x)) ===
 * sanitizeUserInput(x)` para toda string `x`).
 *
 * Etapas (nesta ordem):
 * 1. Remove blocos `<script>`/`<style>` e seu conteúdo.
 * 2. Remove resíduos de `<script`/`<style` sem fechamento (até o fim).
 * 3. Neutraliza protocolos `javascript:`/`vbscript:` (substitui o `:` por `-`).
 * 4. Neutraliza manipuladores de evento inline `on...=` (substitui o `=` por `-`).
 * 5. Escapa `<` → `&lt;` e `>` → `&gt;`, neutralizando quaisquer tags
 *    remanescentes e fixando o resultado.
 *
 * A validação de tamanho de campos é responsabilidade das funções de validação
 * específicas; aqui apenas neutralizamos conteúdo de script.
 *
 * @param input Texto livre fornecido pelo usuário.
 * @returns O texto com conteúdo de script neutralizado/removido.
 */
export function sanitizeUserInput(input: string): string {
  return input
    .replace(SCRIPT_BLOCK, "")
    .replace(STYLE_BLOCK, "")
    .replace(DANGLING_SCRIPT, "")
    .replace(DANGLING_STYLE, "")
    .replace(DANGEROUS_PROTOCOL, NEUTRALIZED)
    .replace(EVENT_HANDLER, NEUTRALIZED)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Helper de conveniência
// ---------------------------------------------------------------------------

/**
 * Retorna uma cópia rasa de `obj` com os campos informados sanitizados via
 * {@link sanitizeUserInput}. Apenas campos cujo valor atual seja `string` são
 * processados; demais valores (incluindo `null`/`undefined`/números) são
 * preservados como estão. Útil na fronteira (server actions) para sanitizar
 * campos de texto livre antes de delegar ao domínio (Req. 16.2).
 *
 * Não muta `obj`; herda a idempotência de {@link sanitizeUserInput} para os
 * campos selecionados.
 *
 * @param obj Objeto de entrada.
 * @param fields Chaves dos campos de texto livre a sanitizar.
 * @returns Nova instância de `obj` com os campos sanitizados.
 */
export function sanitizeStringFields<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly (keyof T)[],
): T {
  const result: T = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string") {
      // Cast seguro: substituímos um valor string por outro string na mesma chave.
      result[field] = sanitizeUserInput(value) as T[keyof T];
    }
  }
  return result;
}
