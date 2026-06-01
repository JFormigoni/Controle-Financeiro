# Implementation Plan: Plataforma de Gestão Financeira

## Overview

O plano converte o design em passos incrementais de implementação em **TypeScript** sobre Next.js (App Router), React, Tailwind CSS, PostgreSQL e Prisma. A estratégia segue a separação de camadas do design: primeiro a base do projeto e o modelo de dados, depois as **funções puras de domínio** (validações, cálculos financeiros, segurança), seus testes baseados em propriedades (`fast-check` + `Vitest`), em seguida a camada de serviços/I-O (Prisma, Auth.js, e-mail, exportação), as server actions de fronteira e, por fim, a UI responsiva e a landing page. Cada tarefa constrói sobre as anteriores e termina integrando o código, sem deixar trechos órfãos.

Cada propriedade de corretude do design é implementada como um único teste de propriedade, anotado com seu número e os requisitos que valida. Sub-tarefas de teste são marcadas com `*` (opcionais para um MVP rápido, mas recomendadas).

## Tasks

- [x] 1. Configurar a base do projeto e a infraestrutura de testes
  - [x] 1.1 Inicializar o projeto Next.js + TypeScript + Tailwind CSS
    - Criar a estrutura de diretórios (`src/app`, `src/domain`, `src/infra`, `src/components`)
    - Configurar `tsconfig.json` (strict), Tailwind com breakpoints `md` (768px) e `lg` (1024px) e variáveis de ambiente seguras
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 1.2 Definir o schema Prisma e os modelos de dados
    - Modelar `User`, `Category`, `Transaction`, `Goal`, `Session`, `AccessLog`, `ConsentRecord`, `VerificationToken` conforme o ERD, com `amount`/`targetAmount` como `Decimal`
    - Gerar o client Prisma e a migração inicial
    - _Requirements: 1.1, 6.1, 7.1, 8.1, 9.1, 15.1, 16.9_

  - [x] 1.3 Configurar Vitest, fast-check e React Testing Library
    - Configurar `vitest.config.ts`, `numRuns: 100` global para `fast-check` e RTL para testes de UI
    - _Requirements: (infraestrutura de testes)_

- [x] 2. Implementar primitivos de domínio compartilhados
  - [x] 2.1 Implementar o tipo `Result<T>`, `AppError`, `ErrorCode` e os tipos de domínio
    - Criar `src/domain/types.ts` e `src/domain/result.ts` com os enums e interfaces (`Transaction`, `Category`, `Goal`, `Period`, etc.)
    - _Requirements: 5.7, 6.4, 6.7_

  - [x] 2.2 Implementar utilitários de `Money` (centavos inteiros)
    - Criar `src/domain/money.ts` com conversão Decimal↔centavos, soma, subtração e comparação exatas
    - _Requirements: 5.1, 6.1, 7.1_

  - [x] 2.3 Escrever testes unitários para os utilitários de `Money`
    - Cobrir limites 0,01 e 999.999.999,99 e arredondamento determinístico
    - _Requirements: 6.4, 7.4_

- [x] 3. Implementar funções de segurança transversal (domínio puro)
  - [x] 3.1 Implementar hash de senha com salt único (`src/domain/security/password-hash.ts`)
    - Encapsular `bcrypt` para gerar hash com salt embutido e verificar senha
    - _Requirements: 16.1_

  - [x] 3.2 Escrever teste de propriedade para armazenamento seguro de senha
    - **Property 39: Armazenamento seguro de senha com salt único**
    - **Validates: Requirements 16.1**

  - [x] 3.3 Implementar sanitização de entrada contra XSS (`src/domain/security/sanitize.ts`)
    - Neutralizar/remover conteúdo de script de entradas de texto livre
    - _Requirements: 16.2_

  - [x] 3.4 Escrever teste de propriedade para sanitização XSS
    - **Property 40: Sanitização de entrada contra XSS (idempotência)**
    - **Validates: Requirements 16.2**

  - [x] 3.5 Implementar geração e validação de token anti-CSRF (`src/domain/security/csrf.ts`)
    - Vincular token à sessão; rejeitar token ausente, inválido ou expirado
    - _Requirements: 16.3, 16.4_

  - [x] 3.6 Escrever teste de propriedade para validação anti-CSRF
    - **Property 41: Validação de token anti-CSRF**
    - **Validates: Requirements 16.3, 16.4**

  - [x] 3.7 Implementar registro de consentimento LGPD e bloqueio de cadastro (`src/domain/security/consent.ts`)
    - Registrar consentimento com data, hora e versão do termo; bloquear conclusão sem consentimento
    - _Requirements: 16.9, 16.10_

  - [x] 3.8 Escrever teste de propriedade para consentimento obrigatório
    - **Property 42: Consentimento obrigatório no cadastro**
    - **Validates: Requirements 16.10**

- [x] 4. Implementar a lógica de domínio de autenticação (funções puras)
  - [x] 4.1 Implementar validação de comprimento de senha (`src/domain/auth/password-validation.ts`)
    - Cadastro: 8..64 caracteres; alteração/redefinição: mínimo 8
    - _Requirements: 1.5, 3.2, 3.4, 3.7_

  - [x] 4.2 Escrever teste de propriedade para validação de senha
    - **Property 1: Validação de comprimento de senha**
    - **Validates: Requirements 1.5, 3.2, 3.4, 3.7**

  - [x] 4.3 Implementar validade de token de uso único (`src/domain/auth/token.ts`)
    - Válido sse não usado e antes da expiração (24h verificação, 1h redefinição); marcar como usado após sucesso
    - _Requirements: 1.3, 1.4, 1.6, 3.1, 3.2, 3.3_

  - [x] 4.4 Escrever teste de propriedade para validade de token
    - **Property 2: Validade de token de uso único**
    - **Validates: Requirements 1.3, 1.4, 1.6, 3.1, 3.2, 3.3**

  - [x] 4.5 Implementar limite de reenvio de e-mail de validação (`src/domain/auth/resend-limit.ts`)
    - Máximo de 5 reenvios por janela de 24h
    - _Requirements: 1.6_

  - [x] 4.6 Escrever teste de propriedade para limite de reenvio
    - **Property 3: Limite de reenvio de e-mail de validação**
    - **Validates: Requirements 1.6**

  - [x] 4.7 Implementar a máquina de estado de tentativas de login (`src/domain/auth/login-attempts.ts`)
    - Incrementar em 1 por falha; bloquear 15min após 5 falhas consecutivas; zerar em sucesso
    - _Requirements: 2.2, 2.6, 2.8, 2.9_

  - [x] 4.8 Escrever teste de propriedade para tentativas de login
    - **Property 6: Máquina de estado de tentativas de login**
    - **Validates: Requirements 2.2, 2.6, 2.8, 2.9**

  - [x] 4.9 Implementar a decisão de autenticação (`src/domain/auth/auth-decision.ts`)
    - Autenticar sse senha confere, e-mail verificado, conta ativa e e-mail não bloqueado
    - _Requirements: 2.1, 2.3, 14.5_

  - [x] 4.10 Escrever teste de propriedade para a decisão de autenticação
    - **Property 5: Decisão de autenticação**
    - **Validates: Requirements 2.1, 2.3, 14.5**

  - [x] 4.11 Implementar validade/expiração de sessão por inatividade (`src/domain/auth/session.ts`)
    - Acesso concedido sse sessão existe e inatividade < 30min (maxAge deslizante)
    - _Requirements: 2.5, 2.7_

  - [x] 4.12 Escrever teste de propriedade para validade de sessão
    - **Property 7: Validade e expiração de sessão por inatividade**
    - **Validates: Requirements 2.5, 2.7**

  - [x] 4.13 Implementar invalidação de sessões por evento de segurança (`src/domain/auth/session-invalidation.ts`)
    - Esvaziar o conjunto de sessões ativas após troca/redefinição de senha ou desativação de conta
    - _Requirements: 3.6, 14.3_

  - [x] 4.14 Escrever teste de propriedade para invalidação de sessões
    - **Property 8: Invalidação de sessões por evento de segurança**
    - **Validates: Requirements 3.6, 14.3**

- [ ] 5. Implementar a camada de serviços de autenticação (fronteira I/O)
  - [x] 5.1 Implementar repositórios Prisma (usuário, sessão, token) com consultas parametrizadas
    - Criar `src/infra/repositories/*` encapsulando o acesso a dados
    - _Requirements: 16.5_

  - [~] 5.2 Implementar o serviço de cadastro com unicidade de e-mail e consentimento (`src/infra/services/register.ts`)
    - Criar conta não verificada, senha com hash, e-mail de validação 24h; bloquear sem consentimento
    - _Requirements: 1.1, 1.2, 1.3, 16.10_

  - [~] 5.3 Escrever teste de propriedade para unicidade de e-mail no cadastro
    - **Property 4: Unicidade de e-mail no cadastro**
    - **Validates: Requirements 1.1, 1.2**

  - [~] 5.4 Implementar serviços de login/logout com rastreio de tentativas e mensagens genéricas (`src/infra/services/login.ts`)
    - Iniciar sessão em sucesso; mensagem genérica de credenciais; bloqueio/conta inativa
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 14.5_

  - [~] 5.5 Implementar serviços de recuperação/redefinição/alteração de senha (`src/infra/services/password-recovery.ts`)
    - Link de redefinição 1h de uso único; invalidar sessões após troca; preservar senha em falha
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [~] 5.6 Escrever teste de propriedade para resposta genérica de recuperação
    - **Property 9: Resposta genérica de recuperação de senha**
    - **Validates: Requirements 3.8**

  - [~] 5.7 Implementar serviços de verificação e reenvio de e-mail (`src/infra/services/verification.ts`)
    - Marcar e-mail como verificado dentro do prazo; ofertar reenvio (máx. 5/24h); preservar conta em falha de envio
    - _Requirements: 1.4, 1.6, 1.8_

  - [~] 5.8 Configurar Auth.js v5 com adapter Prisma e middleware de proteção de rotas
    - `auth.config.ts` (edge) + `auth.ts` (adapter); sessões em banco; middleware nega rotas protegidas/admin sem sessão válida
    - _Requirements: 2.7, 14.6, 15.6_

  - [~] 5.9 Escrever testes de integração da fronteira de autenticação
    - Falha de envio de e-mail preserva conta não verificada (Req 1.8); login de conta inativa rejeitado (Req 14.5)
    - _Requirements: 1.8, 14.4, 14.5_

- [~] 6. Checkpoint - Garantir que todos os testes de autenticação e segurança passem
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implementar o Serviço de Perfil
  - [x] 7.1 Implementar validação de perfil (`src/domain/profile/validation.ts`)
    - Nome obrigatório de 1 a 100 caracteres; rejeitar vazio ou >100 preservando dados atuais
    - _Requirements: 4.1, 4.3_

  - [x] 7.2 Escrever teste de propriedade para validação de nome de perfil
    - **Property 11: Validação de nome de perfil**
    - **Validates: Requirements 4.1, 4.3**

  - [~] 7.3 Implementar serviços de atualização de perfil e configurações (`src/infra/services/profile.ts`)
    - Persistir dados/configurações válidos e retornar confirmação
    - _Requirements: 4.1, 4.2_

  - [~] 7.4 Implementar o fluxo de alteração de e-mail (`src/infra/services/email-change.ts`)
    - Verificação 24h ao novo e-mail; manter e-mail atual até confirmação; promover novo e-mail após confirmar
    - _Requirements: 4.4, 4.5, 4.6_

  - [~] 7.5 Escrever teste de propriedade para o fluxo de alteração de e-mail
    - **Property 10: Validação e fluxo de alteração de e-mail de perfil**
    - **Validates: Requirements 4.4, 4.5**

- [ ] 8. Implementar o Serviço de Categorias
  - [x] 8.1 Implementar validação, detecção de duplicidade e filtro por tipo (`src/domain/category/validation.ts`)
    - Nome 1..60; duplicidade por conta+tipo; categorias disponíveis correspondentes ao tipo do lançamento
    - _Requirements: 8.1, 8.3, 8.6, 8.7, 8.8_

  - [x] 8.2 Escrever teste de propriedade para validação de nome de categoria
    - **Property 22: Validação de nome de categoria**
    - **Validates: Requirements 8.1, 8.3, 8.8**

  - [x] 8.3 Escrever teste de propriedade para unicidade de categoria
    - **Property 23: Unicidade de categoria por conta e tipo**
    - **Validates: Requirements 8.6**

  - [~] 8.4 Implementar os serviços CRUD de categoria com guarda de exclusão e autorização (`src/infra/services/category.ts`)
    - Bloquear exclusão com lançamentos vinculados; rejeitar operações sobre categoria de outro usuário
    - _Requirements: 8.2, 8.4, 8.5, 8.9_

  - [~] 8.5 Escrever teste de propriedade para exclusão condicionada de categoria
    - **Property 24: Exclusão de categoria condicionada a lançamentos**
    - **Validates: Requirements 8.4, 8.5**

  - [x] 8.6 Escrever teste unitário para classificação exclusiva de tipo de categoria
    - Cada categoria é exclusivamente Receita ou Despesa
    - _Requirements: 8.2_

- [x] 9. Implementar o domínio de Lançamentos (Receitas/Despesas) e recorrência
  - [x] 9.1 Implementar validação de lançamento e de valor (`src/domain/transaction/validation.ts`)
    - Descrição 1..200, valor 0,01..999.999.999,99, data válida, categoria informada; preservar dados em erro
    - _Requirements: 6.1, 6.2, 6.4, 6.8, 7.1, 7.2, 7.4, 7.8_

  - [x] 9.2 Escrever teste de propriedade para validação de lançamento
    - **Property 16: Validação de valor e campos de lançamento**
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.8, 7.1, 7.2, 7.4, 7.8**

  - [x] 9.3 Implementar correspondência de categoria por tipo e dono (`src/domain/transaction/category-match.ts`)
    - Aceitar sse categoria pertence ao usuário e tipo corresponde
    - _Requirements: 6.9, 7.9, 8.7_

  - [x] 9.4 Escrever teste de propriedade para correspondência de categoria
    - **Property 17: Categoria deve corresponder ao tipo e ao dono**
    - **Validates: Requirements 6.9, 7.9, 8.7**

  - [x] 9.5 Implementar a ordenação do histórico de lançamentos (`src/domain/transaction/history-sort.ts`)
    - Data desc; em empate, `createdAt` desc
    - _Requirements: 6.6, 7.6_

  - [x] 9.6 Escrever teste de propriedade para ordenação de histórico
    - **Property 18: Ordenação de histórico de lançamentos**
    - **Validates: Requirements 6.6, 7.6**

  - [x] 9.7 Implementar o motor de recorrência (`src/domain/recurrence.ts`)
    - Gerar ocorrências por frequência (diária/semanal/mensal/anual) até a data de término ou por 12 meses
    - _Requirements: 6.5, 7.5_

  - [x] 9.8 Escrever teste de propriedade para geração de ocorrências recorrentes
    - **Property 21: Geração de ocorrências recorrentes**
    - **Validates: Requirements 6.5, 7.5**

- [ ] 10. Implementar os serviços de Lançamentos (fronteira I/O)
  - [~] 10.1 Implementar repositório e serviços CRUD de lançamento com checagem de dono e tipo (`src/infra/services/transaction.ts`)
    - Registrar/editar/excluir com confirmação; verificar propriedade e correspondência de categoria antes de persistir
    - _Requirements: 6.1, 6.2, 6.3, 6.7, 7.1, 7.2, 7.3, 7.7_

  - [~] 10.2 Escrever teste de propriedade para autorização por proprietário
    - **Property 19: Autorização por proprietário**
    - **Validates: Requirements 6.7, 7.7, 8.9, 9.9**

  - [~] 10.3 Escrever teste de propriedade para round-trip de exclusão
    - **Property 20: Round-trip de exclusão de lançamento**
    - **Validates: Requirements 6.3, 7.3**

- [~] 11. Checkpoint - Garantir que todos os testes de lançamentos e categorias passem
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implementar os cálculos do Dashboard (funções puras)
  - [x] 12.1 Implementar saldo atual, totais por período e resultado mensal (`src/domain/dashboard/balance.ts`)
    - Saldo independe do período; totais filtram por período; resultado mensal = receitas − despesas do mês
    - _Requirements: 5.1, 5.2, 5.3_

  - [-] 12.2 Escrever teste de propriedade para saldo atual independente do período
    - **Property 12: Saldo atual independe do período**
    - **Validates: Requirements 5.1**

  - [x] 12.3 Escrever teste de propriedade para totais e resultado mensal
    - **Property 13: Totais e resultado mensal por período**
    - **Validates: Requirements 5.2, 5.3**

  - [x] 12.4 Implementar a distribuição por categoria (`src/domain/dashboard/distribution.ts`)
    - Valor e percentual por categoria; soma dos percentuais = 100%
    - _Requirements: 5.4_

  - [x] 12.5 Escrever teste de propriedade para distribuição por categoria
    - **Property 14: Distribuição por categoria**
    - **Validates: Requirements 5.4**

  - [x] 12.6 Implementar os indicadores financeiros do mês (`src/domain/dashboard/indicators.ts`)
    - Taxa de economia (indisponível se receita=0), variação de despesas, categoria de maior despesa
    - _Requirements: 5.5, 5.8_

  - [-] 12.7 Escrever teste de propriedade para indicadores financeiros
    - **Property 15: Indicadores financeiros do mês**
    - **Validates: Requirements 5.5, 5.8**

  - [-] 12.8 Escrever teste unitário para o estado vazio do dashboard
    - Zeros e orientação para registrar o primeiro lançamento
    - _Requirements: 5.6_

- [ ] 13. Implementar o Serviço de Metas
  - [x] 13.1 Implementar validação de meta (`src/domain/goal/validation.ts`)
    - Descrição 1..100, valor-alvo 0,01..999.999.999,99, prazo > agora; progresso inicial 0%
    - _Requirements: 9.1, 9.5, 9.6, 9.7_

  - [-] 13.2 Escrever teste de propriedade para validação de meta
    - **Property 25: Validação de meta financeira**
    - **Validates: Requirements 9.1, 9.5, 9.6, 9.7**

  - [x] 13.3 Implementar progresso e conclusão de meta (`src/domain/goal/progress.ts`)
    - Progresso = min(100, 100 × acumulado ÷ alvo); concluída sse acumulado ≥ alvo
    - _Requirements: 9.2, 9.3, 9.4_

  - [-] 13.4 Escrever teste de propriedade para progresso e conclusão de meta
    - **Property 26: Progresso e conclusão de meta**
    - **Validates: Requirements 9.2, 9.4**

  - [~] 13.5 Implementar os serviços CRUD de meta com autorização (`src/infra/services/goal.ts`)
    - Criar/editar/excluir; rejeitar operações sobre meta de outro usuário
    - _Requirements: 9.7, 9.8, 9.9_

- [ ] 14. Implementar Relatórios e Exportação
  - [x] 14.1 Implementar validação de período de relatório (`src/domain/reports/period-validation.ts`)
    - Ambas as datas presentes e início ≤ fim
    - _Requirements: 10.6, 10.7_

  - [-] 14.2 Escrever teste de propriedade para validação de período
    - **Property 30: Validação de período de relatório**
    - **Validates: Requirements 10.6, 10.7**

  - [x] 14.3 Implementar relatórios de receitas/despesas por intervalo (`src/domain/reports/range-report.ts`)
    - Filtrar por dono, tipo e intervalo fechado [início, fim]; estado vazio com totais zerados
    - _Requirements: 10.1, 10.2, 10.8_

  - [-] 14.4 Escrever teste de propriedade para relatório por intervalo
    - **Property 27: Relatório por intervalo de datas**
    - **Validates: Requirements 10.1, 10.2**

  - [x] 14.5 Implementar comparativos mensal e anual (`src/domain/reports/comparison.ts`)
    - Um agrupamento por mês/ano civil do intervalo, com totais de receitas e despesas
    - _Requirements: 10.3, 10.4_

  - [-] 14.6 Escrever teste de propriedade para conservação de soma nos comparativos
    - **Property 28: Conservação de soma nos comparativos**
    - **Validates: Requirements 10.3, 10.4**

  - [x] 14.7 Implementar o relatório de fluxo de caixa (`src/domain/reports/cashflow.ts`)
    - Saldo acumulado = entradas − saídas até cada ponto
    - _Requirements: 10.5_

  - [~] 14.8 Escrever teste de propriedade para saldo acumulado de fluxo de caixa
    - **Property 29: Saldo acumulado no fluxo de caixa**
    - **Validates: Requirements 10.5**

  - [x] 14.9 Implementar a serialização CSV (`src/domain/export/csv.ts`)
    - Cabeçalhos + linhas; relatório vazio gera apenas cabeçalhos
    - _Requirements: 11.3, 11.4_

  - [~] 14.10 Escrever teste de propriedade para round-trip de CSV
    - **Property 31: Round-trip de serialização CSV**
    - **Validates: Requirements 11.3, 11.4**

  - [x] 14.11 Implementar a orquestração de exportação e os geradores XLSX/PDF (`src/infra/export/index.ts`, `xlsx.ts`, `pdf.ts`)
    - Cada formato gerado de forma independente, reportando sucesso/falha por formato; sem arquivo parcial em falha
    - _Requirements: 11.1, 11.2, 11.5, 11.6_

  - [~] 14.12 Escrever teste de propriedade para independência entre formatos
    - **Property 32: Independência entre formatos de exportação**
    - **Validates: Requirements 11.5, 11.6**

  - [~] 14.13 Escrever teste de integração para geração de PDF e XLSX
    - Conteúdo correto e geração dentro de 30s (1–2 exemplos representativos)
    - _Requirements: 11.1, 11.2_

- [ ] 15. Implementar Filtros e Pesquisas
  - [x] 15.1 Implementar `applyFilters` (`src/domain/filters.ts`)
    - Combinação AND de descrição (parcial, case-insensitive), categoria, período inclusivo e tipo; ordenar por data desc; rejeitar período inconsistente
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [~] 15.2 Escrever teste de propriedade para aplicação conjunta de filtros
    - **Property 33: Aplicação conjunta de filtros**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**

  - [~] 15.3 Escrever teste de propriedade para ordenação dos resultados de filtro
    - **Property 34: Ordenação dos resultados de filtro**
    - **Validates: Requirements 12.8**

- [~] 16. Checkpoint - Garantir que dashboard, metas, relatórios e filtros passem
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implementar o Painel Administrativo e o Monitoramento
  - [x] 17.1 Implementar autorização por papel e `canDeactivate` (`src/domain/admin/authorization.ts`)
    - Acesso concedido sse papel = Administrador; admin não desativa a própria conta
    - _Requirements: 14.6, 14.7, 15.6_

  - [~] 17.2 Escrever teste de propriedade para autorização por papel
    - **Property 35: Autorização de acesso por papel de administrador**
    - **Validates: Requirements 14.6, 15.6**

  - [~] 17.3 Escrever teste de propriedade para administrador não desativar a si mesmo
    - **Property 36: Administrador não desativa a própria conta**
    - **Validates: Requirements 14.7**

  - [~] 17.4 Implementar serviços de gestão de usuários (`src/infra/services/admin-users.ts`)
    - Listar usuários; ativar/desativar; invalidar todas as sessões ao desativar
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 17.5 Implementar ordenação de logs, estatísticas de uso e período padrão (`src/domain/monitoring.ts`)
    - Logs por data/hora desc; usuários ativos + volume de lançamentos no período; padrão de 30 dias
    - _Requirements: 15.2, 15.3, 15.4, 15.5_

  - [~] 17.6 Escrever teste de propriedade para ordenação de logs de acesso
    - **Property 37: Ordenação de logs de acesso**
    - **Validates: Requirements 15.2**

  - [~] 17.7 Escrever teste de propriedade para estatísticas de uso por período
    - **Property 38: Estatísticas de uso por período**
    - **Validates: Requirements 15.3**

  - [~] 17.8 Implementar o registro de logs de acesso em login/logout/expiração (`src/infra/services/access-log.ts`)
    - Registrar identificador do usuário, tipo de ação e data/hora do evento
    - _Requirements: 15.1_

- [ ] 18. Implementar as server actions de fronteira e a validação Zod
  - [~] 18.1 Implementar schemas Zod e server actions integrando todos os serviços (`src/app/actions/*`)
    - Validar entrada, verificar autenticação/autorização e token anti-CSRF, sanitizar entrada e delegar ao domínio
    - _Requirements: 16.2, 16.3, 16.4_

  - [~] 18.2 Escrever testes de integração da fronteira de server actions
    - Rejeição por CSRF/autorização sem alteração de estado; sanitização aplicada
    - _Requirements: 16.4, 16.2_

- [ ] 19. Implementar a UI responsiva e a landing page
  - [~] 19.1 Implementar o shell de layout responsivo e a navegação (`src/components/layout/*`)
    - Layouts desktop (≥1024px), tablet (768–1023px) e smartphone (<768px); toque mínimo 44×44px; operável a partir de 320px
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [~] 19.2 Implementar as páginas de autenticação (cadastro com consentimento, login, recuperação, verificação)
    - Conectar às server actions de autenticação; exibir termo LGPD no cadastro
    - _Requirements: 1.1, 2.1, 3.1, 16.9_

  - [~] 19.3 Implementar a UI do Dashboard com gráficos (Recharts)
    - Saldo, totais, resultado mensal, indicadores, distribuição por categoria e estado vazio
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [~] 19.4 Implementar as UIs de lançamentos, categorias, metas, relatórios e filtros
    - Formulários e listagens conectados às server actions; indicador visual de progresso de meta
    - _Requirements: 6.1, 7.1, 8.1, 9.3, 10.1, 11.1, 12.1_

  - [~] 19.5 Implementar a UI do Painel Administrativo
    - Lista de usuários, ativar/desativar, logs de acesso e estatísticas
    - _Requirements: 14.1, 14.2, 15.2, 15.3_

  - [~] 19.6 Implementar a Landing Page
    - Proposta de valor + ≥3 funcionalidades; CTA redireciona ao cadastro; layouts responsivos
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [~] 19.7 Escrever testes de snapshot/responsividade
    - Viewports desktop/tablet/smartphone, toque mínimo 44×44px, operabilidade a 320px e indicador de progresso de meta
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 9.3, 17.3, 17.4, 17.5_

- [ ] 20. Implementar conformidade LGPD e backups
  - [~] 20.1 Implementar o serviço de exclusão/anonimização de dados pessoais (`src/infra/services/data-deletion.ts`)
    - Remover/anonimizar dados pessoais de forma irreversível em até 15 dias, ressalvada retenção legal
    - _Requirements: 16.6_

  - [~] 20.2 Implementar agendamento de backup e notificação de falha (`src/infra/backup/*`)
    - Backup ≤ 24h, retenção ≥ 30 dias; registrar falha, notificar administrador e preservar último backup íntegro
    - _Requirements: 16.7, 16.8_

  - [~] 20.3 Escrever testes de smoke/integração para backup e consultas parametrizadas
    - Agendamento ≤24h e retenção ≥30 dias; uso de consultas parametrizadas via Prisma; anonimização sem PII recuperável
    - _Requirements: 16.5, 16.6, 16.7_

- [~] 21. Checkpoint final - Garantir que toda a suíte de testes passe
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido; testes de propriedade, contudo, são a principal garantia de corretude da camada de domínio.
- Cada tarefa referencia requisitos específicos para rastreabilidade.
- Os checkpoints garantem validação incremental ao longo da implementação.
- Testes de propriedade validam as propriedades universais de corretude (Properties 1–42); testes unitários e de integração cobrem exemplos concretos, edge cases e comportamentos de I/O.
- Cada teste de propriedade deve rodar no mínimo 100 iterações e ser anotado com `Feature: financial-management-platform, Property {número}: {texto}`.
- A entrega segue o faseamento do design: o MVP corresponde às tarefas de autenticação, perfil, dashboard, lançamentos, categorias, relatórios básicos, responsividade, segurança base e landing page; a versão completa adiciona metas, relatórios avançados/exportação, filtros, painel administrativo e LGPD/backups.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3", "5.1", "3.1", "3.3", "3.5", "3.7", "4.1", "4.3", "4.5", "4.7", "4.9", "4.11", "4.13", "7.1", "8.1", "9.1", "9.3", "9.5", "9.7", "12.1", "12.4", "12.6", "13.1", "13.3", "14.1", "14.3", "14.5", "14.7", "14.9", "14.11", "15.1", "17.1", "17.5"] },
    { "id": 5, "tasks": ["3.2", "3.4", "3.6", "3.8", "4.2", "4.4", "4.6", "4.8", "4.10", "4.12", "4.14", "7.2", "8.2", "8.3", "8.6", "9.2", "9.4", "9.6", "9.8", "12.2", "12.3", "12.5", "12.7", "12.8", "13.2", "13.4", "14.2", "14.4", "14.6", "14.8", "14.10", "14.12", "14.13", "15.2", "15.3", "17.2", "17.3", "17.6", "17.7"] },
    { "id": 6, "tasks": ["5.2", "5.4", "5.5", "5.7", "5.8", "7.3", "7.4", "8.4", "10.1", "13.5", "17.4", "17.8", "20.1", "20.2"] },
    { "id": 7, "tasks": ["5.3", "5.6", "5.9", "7.5", "8.5", "10.2", "10.3", "20.3"] },
    { "id": 8, "tasks": ["18.1", "19.1"] },
    { "id": 9, "tasks": ["18.2", "19.2", "19.3", "19.4", "19.5", "19.6"] },
    { "id": 10, "tasks": ["19.7"] }
  ]
}
```
