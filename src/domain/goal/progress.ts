/**
 * Progresso e conclusão de Metas Financeiras (domínio puro).
 *
 * Deriva, de forma **pura e total**, o progresso percentual e o estado de
 * conclusão de uma `Meta_Financeira` a partir do valor acumulado e do
 * valor-alvo (ambos inteiros de **centavos**, ver {@link Money}). Estas funções
 * não realizam I/O, não mantêm estado e não lançam exceções; são reutilizadas
 * pela fronteira/serviço de metas (Serviço_de_Metas) para exibir o indicador de
 * progresso e marcar a meta como concluída.
 *
 * Regras (Req. 9.2, 9.3, 9.4):
 * - **Progresso** = `min(100, 100 × acumulado ÷ alvo)`, expresso como
 *   percentual no intervalo de 0% a 100% (limitado a 100%).
 * - **Conclusão**: a meta está concluída **se e somente se** o acumulado for
 *   maior ou igual ao valor-alvo.
 *
 * Referências: design.md, "Serviço de Metas (Req. 9)" e "Property 26: Progresso
 * e conclusão de meta".
 */

import { type Money } from "@/domain/types";

// ---------------------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------------------

/**
 * Calcula o progresso percentual de uma meta como
 * `min(100, 100 × acumulado ÷ alvo)`.
 *
 * O resultado é um **número contínuo (não arredondado)** no intervalo de 0 a
 * 100, preservando a igualdade exata com `min(100, 100 × acumulado ÷ alvo)`
 * (Property 26). Eventual arredondamento para apresentação é responsabilidade
 * da camada de UI, não deste cálculo de domínio.
 *
 * Para metas válidas, o `target` é sempre positivo (Req. 9.6) e o `accumulated`
 * é não negativo, de modo que o valor retornado situa-se naturalmente em
 * 0..100. Como guarda defensiva, um `target` menor ou igual a zero — que não
 * deve ocorrer para metas válidas — retorna `0` (progresso indefinido tratado
 * de forma conservadora, evitando divisão por zero ou `Infinity`/`NaN`).
 *
 * Função pura e total: não lança e não depende de estado externo.
 *
 * @param accumulated Valor acumulado em centavos (não negativo para metas válidas).
 * @param target Valor-alvo em centavos (positivo para metas válidas).
 * @returns Percentual de progresso no intervalo 0..100.
 */
export function computeGoalProgress(accumulated: Money, target: Money): number {
  // Guarda defensiva: alvo não positivo não ocorre em metas válidas (Req. 9.6);
  // tratamos como progresso 0 para evitar divisão por zero / NaN / Infinity.
  if (target <= 0) {
    return 0;
  }
  return Math.min(100, (100 * accumulated) / target);
}

// ---------------------------------------------------------------------------
// Conclusão
// ---------------------------------------------------------------------------

/**
 * Verdadeiro **se e somente se** a meta está concluída, isto é, quando o valor
 * acumulado atinge ou ultrapassa o valor-alvo (`acumulado ≥ alvo`) — Req. 9.4.
 *
 * Função pura e total: não lança e não depende de estado externo.
 *
 * @param accumulated Valor acumulado em centavos.
 * @param target Valor-alvo em centavos.
 */
export function isGoalComplete(accumulated: Money, target: Money): boolean {
  return accumulated >= target;
}
