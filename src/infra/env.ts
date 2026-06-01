import "server-only";

/**
 * Acesso seguro e tipado a variáveis de ambiente do servidor.
 *
 * - O import `server-only` garante, em tempo de build, que segredos nunca sejam
 *   incluídos em bundles enviados ao cliente.
 * - Apenas variáveis sem o prefixo `NEXT_PUBLIC_` devem conter segredos; estas
 *   permanecem exclusivas do servidor (Req. 16 - variáveis de ambiente seguras).
 * - A validação acontece na primeira leitura, evitando que a aplicação suba com
 *   configuração incompleta.
 */

type EnvKey =
  | "DATABASE_URL"
  | "AUTH_SECRET"
  | "NEXTAUTH_URL"
  | "EMAIL_SERVER_HOST"
  | "EMAIL_SERVER_PORT"
  | "EMAIL_SERVER_USER"
  | "EMAIL_SERVER_PASSWORD"
  | "EMAIL_FROM";

/** Variáveis obrigatórias para a aplicação iniciar corretamente. */
const REQUIRED_KEYS: readonly EnvKey[] = ["DATABASE_URL", "AUTH_SECRET", "NEXTAUTH_URL"];

function readEnv(key: EnvKey): string | undefined {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value;
}

/**
 * Recupera uma variável obrigatória. Lança erro descritivo se ausente,
 * sem expor o valor de outros segredos.
 */
export function requireEnv(key: EnvKey): string {
  const value = readEnv(key);
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

/** Recupera uma variável opcional, retornando `undefined` quando não definida. */
export function optionalEnv(key: EnvKey): string | undefined {
  return readEnv(key);
}

/**
 * Valida que todas as variáveis obrigatórias estão presentes.
 * Deve ser chamada na inicialização do servidor. Retorna a lista de chaves
 * faltantes (vazia quando a configuração está completa).
 */
export function validateEnv(): EnvKey[] {
  return REQUIRED_KEYS.filter((key) => readEnv(key) === undefined);
}
