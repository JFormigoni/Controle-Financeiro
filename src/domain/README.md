# Camada de Domínio (`src/domain`)

Funções puras e tipos de domínio em TypeScript que implementam toda a lógica de
negócio: cálculos financeiros, validações, geração de relatórios, filtros, regras
de recorrência e metas.

Esta camada **não acessa I/O** (banco de dados, e-mail, sessão). Recebe dados já
carregados e retorna resultados ou erros. É o foco principal dos testes baseados
em propriedades (`fast-check` + `Vitest`), por ser composta majoritariamente de
funções puras.
