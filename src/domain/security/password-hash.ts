/**
 * Hash de senha com salt único por usuário (Req. 16.1).
 *
 * Este módulo é o **helper de fronteira de segurança** para o armazenamento de
 * senhas. Ele encapsula a biblioteca `bcrypt`, que gera e **embute um salt
 * aleatório distinto a cada hash**, satisfazendo o requisito de salt único por
 * usuário sem a necessidade de gerenciar o salt separadamente (design.md,
 * "Premissas Tecnológicas" e "Camada de Segurança Transversal").
 *
 * Diferentemente do restante da camada de domínio, estas funções **não são
 * puras**: o hash é não determinístico (depende de um salt aleatório) e as
 * operações são assíncronas e computacionalmente custosas por design (fator de
 * custo do bcrypt). O módulo é mantido pequeno e focado: apenas envolve o
 * `bcrypt` para gerar e verificar hashes.
 *
 * ## Garantias de segurança (Req. 16.1)
 *
 * - **Salt único por hash**: cada chamada de {@link hashPassword} produz um
 *   hash diferente, mesmo para a mesma senha em texto puro, pois o salt é
 *   gerado aleatoriamente e embutido no resultado.
 * - **Sem texto puro**: o módulo nunca armazena, registra (`console`/log) nem
 *   retorna a senha em texto puro. A entrada `plain` é usada apenas em memória
 *   para o cálculo do hash/verificação e descartada em seguida.
 *
 * A verificação ({@link verifyPassword}) extrai o salt embutido no hash
 * armazenado e o reaplica à senha candidata, comparando os resultados em tempo
 * constante (fornecido pelo `bcrypt`).
 */

import bcrypt from "bcrypt";

/**
 * Fator de custo (rounds) do bcrypt: 2^12 iterações de derivação.
 *
 * O valor 12 equilibra resistência a força bruta e latência de login aceitável
 * em hardware atual, dentro da faixa recomendada (10–12). Aumentá-lo eleva
 * exponencialmente o custo de verificação.
 */
const SALT_ROUNDS = 12;

/**
 * Gera o hash bcrypt de uma senha em texto puro, com um salt aleatório único
 * embutido no resultado.
 *
 * Cada invocação produz um hash distinto, ainda que a `plain` seja idêntica,
 * pois o salt é gerado a cada chamada (Req. 16.1 — salt único por usuário). O
 * salt e os parâmetros de custo ficam embutidos na string retornada, no formato
 * modular do bcrypt (ex.: `$2b$12$...`), dispensando armazenamento separado.
 *
 * @param plain Senha em texto puro a ser protegida. Nunca é armazenada nem
 *   registrada; é usada apenas em memória para o cálculo do hash.
 * @returns O hash bcrypt da senha, pronto para persistência em `User.passwordHash`.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verifica se uma senha em texto puro corresponde a um hash bcrypt armazenado.
 *
 * Reaplica o salt embutido em `hash` à senha candidata e compara os resultados
 * em tempo constante. Retorna `false` (em vez de lançar) quando o `hash` não
 * está em um formato bcrypt reconhecível, de modo que credenciais inválidas ou
 * dados corrompidos nunca concedam acesso.
 *
 * @param plain Senha em texto puro informada para verificação.
 * @param hash Hash bcrypt previamente gerado por {@link hashPassword}.
 * @returns `true` se a senha corresponder ao hash; `false` caso contrário.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // Hash malformado/irreconhecível nunca deve autenticar.
    return false;
  }
}
