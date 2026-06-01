# Requirements Document

## Introduction

A Plataforma Web de Gestão Financeira e Controle de Gastos é uma aplicação web responsiva voltada para gestão financeira pessoal e empresarial. A plataforma permite que usuários registrem e acompanhem receitas, despesas, categorias, metas financeiras e gerem relatórios para monitorar a saúde financeira. O produto inclui um sistema de autenticação seguro, um dashboard financeiro com indicadores e gráficos, exportação de dados em múltiplos formatos, um painel administrativo para gestão e monitoramento de usuários, além de uma landing page moderna com foco em UI/UX e conversão.

A entrega é dividida em duas fases:
- **MVP**: cadastro e login, dashboard financeiro, gestão de receitas, gestão de despesas, categorias e relatórios básicos.
- **Versão Completa**: metas financeiras, relatórios avançados, exportação de dados, painel administrativo e otimizações de desempenho.

A stack tecnológica recomendada é Next.js, React, TypeScript, Tailwind CSS, PostgreSQL e Prisma ORM, com hospedagem na Vercel (deploy automático via GitHub, Serverless Functions, variáveis de ambiente seguras, Vercel Analytics, Speed Insights e CI/CD nativo).

## Glossary

- **Plataforma**: O sistema web completo de gestão financeira, incluindo frontend, backend e banco de dados.
- **Usuário**: Pessoa física ou representante de empresa que possui uma conta cadastrada na Plataforma.
- **Administrador**: Usuário com privilégios elevados que acessa o Painel_Administrativo.
- **Serviço_de_Autenticacao**: Componente responsável por cadastro, login, encerramento de sessão, alteração e recuperação de senha.
- **Serviço_de_Perfil**: Componente responsável pela edição de dados pessoais e configurações da conta.
- **Dashboard**: Componente que apresenta saldo atual, totais de receitas e despesas, resultado mensal, gráficos e indicadores.
- **Lançamento**: Registro financeiro individual que pode ser uma Receita ou uma Despesa.
- **Receita**: Lançamento que representa entrada de valor financeiro.
- **Despesa**: Lançamento que representa saída de valor financeiro.
- **Serviço_de_Receitas**: Componente responsável pelo cadastro, edição, exclusão e histórico de Receitas.
- **Serviço_de_Despesas**: Componente responsável pelo cadastro, edição, exclusão e histórico de Despesas.
- **Categoria**: Rótulo que classifica um Lançamento, separado entre tipo Receita e tipo Despesa.
- **Serviço_de_Categorias**: Componente responsável pelo gerenciamento de Categorias.
- **Lançamento_Recorrente**: Lançamento que se repete automaticamente em uma frequência definida.
- **Meta_Financeira**: Objetivo financeiro com valor-alvo, prazo e acompanhamento de progresso.
- **Serviço_de_Metas**: Componente responsável pelo gerenciamento de Metas_Financeiras.
- **Serviço_de_Relatorios**: Componente responsável pela geração e exportação de relatórios financeiros.
- **Serviço_de_Filtros**: Componente responsável por filtrar e pesquisar Lançamentos.
- **Painel_Administrativo**: Interface que permite a Administradores gerenciar e monitorar Usuários.
- **Serviço_de_Monitoramento**: Componente responsável pelo registro de logs de acesso e estatísticas de uso.
- **Landing_Page**: Página pública de apresentação da Plataforma com foco em conversão.
- **Saldo_Atual**: Diferença entre o total de Receitas e o total de Despesas de um Usuário.
- **Resultado_Mensal**: Diferença entre Receitas e Despesas de um Usuário dentro de um mês civil.
- **LGPD**: Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).
- **Sessão**: Período autenticado de uso da Plataforma por um Usuário.

## Requirements

### Requirement 1: Cadastro de Usuários

**User Story:** Como visitante, quero criar uma conta na Plataforma, para que eu possa acessar as funcionalidades de gestão financeira.

#### Acceptance Criteria

1. WHEN um visitante submete o formulário de cadastro com nome contendo de 1 a 100 caracteres, e-mail em formato válido e senha que atenda aos critérios de tamanho, THE Serviço_de_Autenticacao SHALL criar uma nova conta de Usuário com o e-mail no estado não verificado e armazenar a senha de forma criptografada.
2. IF o e-mail informado no cadastro já estiver associado a uma conta existente, THEN THE Serviço_de_Autenticacao SHALL rejeitar o cadastro, não criar nova conta e informar que o e-mail já está em uso.
3. WHEN uma conta de Usuário é criada, THE Serviço_de_Autenticacao SHALL enviar um e-mail de validação contendo um link de confirmação de uso único com expiração de 24 horas.
4. WHEN o Usuário aciona o link de validação dentro do prazo de 24 horas, THE Serviço_de_Autenticacao SHALL marcar o e-mail como verificado.
5. IF a senha informada no cadastro contiver menos de 8 caracteres ou mais de 64 caracteres, THEN THE Serviço_de_Autenticacao SHALL rejeitar o cadastro e informar o critério de tamanho de senha.
6. IF o link de validação de e-mail for acionado após o prazo de 24 horas, THEN THE Serviço_de_Autenticacao SHALL rejeitar a validação e oferecer o reenvio do e-mail de validação, limitado a 5 reenvios por período de 24 horas.
7. IF o e-mail informado no cadastro estiver em formato inválido, THEN THE Serviço_de_Autenticacao SHALL rejeitar o cadastro e indicar que o e-mail deve estar em formato válido.
8. IF o envio do e-mail de validação falhar, THEN THE Serviço_de_Autenticacao SHALL preservar a conta criada no estado não verificado e disponibilizar o reenvio do e-mail de validação.

### Requirement 2: Login e Sessão

**User Story:** Como Usuário cadastrado, quero efetuar login de forma segura, para que eu possa acessar meus dados financeiros.

#### Acceptance Criteria

1. WHEN um Usuário submete e-mail e senha corretos de uma conta verificada e ativa, THE Serviço_de_Autenticacao SHALL autenticar o Usuário e iniciar uma Sessão.
2. IF as credenciais informadas no login forem inválidas, THEN THE Serviço_de_Autenticacao SHALL rejeitar a autenticação, incrementar em 1 o contador de tentativas de login mal-sucedidas associado ao e-mail informado e retornar uma mensagem genérica de credenciais inválidas que não revele se o e-mail ou a senha está incorreto.
3. IF o Usuário tentar efetuar login com um e-mail ainda não verificado, THEN THE Serviço_de_Autenticacao SHALL rejeitar a autenticação e informar a necessidade de validação do e-mail.
4. WHEN um Usuário autenticado solicita o encerramento de sessão, THE Serviço_de_Autenticacao SHALL invalidar a Sessão atual.
5. WHEN uma Sessão permanecer inativa, sem requisições do Usuário, por 30 minutos consecutivos, THE Serviço_de_Autenticacao SHALL expirar a Sessão e limpar o status de autenticação do Usuário.
6. IF forem registradas 5 tentativas consecutivas de login mal-sucedidas para o mesmo e-mail, sem nenhuma autenticação bem-sucedida entre elas, THEN THE Serviço_de_Autenticacao SHALL bloquear novas tentativas de login para esse e-mail por 15 minutos.
7. IF um Usuário tentar acessar um recurso protegido com uma Sessão expirada ou inválida, THEN THE Serviço_de_Autenticacao SHALL negar o acesso e exigir nova autenticação.
8. WHILE um e-mail estiver bloqueado por excesso de tentativas de login mal-sucedidas, THE Serviço_de_Autenticacao SHALL rejeitar toda tentativa de login para esse e-mail, mesmo quando as credenciais estiverem corretas, e informar que o acesso está temporariamente bloqueado.
9. WHEN um Usuário autentica com sucesso, THE Serviço_de_Autenticacao SHALL reiniciar para zero o contador de tentativas de login mal-sucedidas associado ao seu e-mail.

### Requirement 3: Recuperação e Alteração de Senha

**User Story:** Como Usuário, quero recuperar e alterar minha senha, para que eu mantenha o acesso seguro à minha conta.

#### Acceptance Criteria

1. WHEN um Usuário solicita recuperação de senha informando um e-mail cadastrado, THE Serviço_de_Autenticacao SHALL enviar um e-mail com um link de redefinição de uso único com expiração de 1 hora.
2. WHEN um Usuário define uma nova senha com no mínimo 8 caracteres por meio do link de redefinição válido e dentro do prazo, THE Serviço_de_Autenticacao SHALL atualizar a senha de forma criptografada e invalidar o link utilizado.
3. IF o link de redefinição de senha for utilizado após o prazo de expiração de 1 hora ou após já ter sido utilizado, THEN THE Serviço_de_Autenticacao SHALL rejeitar a redefinição, manter a senha vigente inalterada e oferecer o reenvio do link.
4. WHEN um Usuário autenticado solicita alteração de senha informando a senha atual correta e uma nova senha com no mínimo 8 caracteres, THE Serviço_de_Autenticacao SHALL atualizar a senha de forma criptografada.
5. IF a senha atual informada na alteração de senha estiver incorreta, THEN THE Serviço_de_Autenticacao SHALL rejeitar a alteração, manter a senha vigente inalterada e indicar que a senha atual está incorreta.
6. WHEN a senha de um Usuário é alterada ou redefinida, THE Serviço_de_Autenticacao SHALL invalidar todas as Sessões ativas desse Usuário.
7. IF a nova senha informada na redefinição ou na alteração contiver menos de 8 caracteres, THEN THE Serviço_de_Autenticacao SHALL rejeitar a operação, manter a senha vigente inalterada e informar o critério mínimo de senha.
8. IF a solicitação de recuperação de senha informar um e-mail não cadastrado, THEN THE Serviço_de_Autenticacao SHALL apresentar a mesma confirmação genérica de envio, sem revelar se o e-mail está cadastrado.

### Requirement 4: Gerenciamento de Perfil

**User Story:** Como Usuário, quero editar meus dados pessoais e configurações da conta, para que minhas informações estejam atualizadas.

#### Acceptance Criteria

1. WHEN um Usuário autenticado submete alterações em seus dados pessoais com o campo nome preenchido contendo entre 1 e 100 caracteres, THE Serviço_de_Perfil SHALL persistir as alterações na conta do Usuário e apresentar confirmação da atualização.
2. WHEN um Usuário autenticado altera as configurações da conta com valores válidos, THE Serviço_de_Perfil SHALL persistir as configurações atualizadas e apresentar confirmação da atualização.
3. IF um campo obrigatório do perfil for submetido vazio ou exceder 100 caracteres, THEN THE Serviço_de_Perfil SHALL rejeitar a alteração, manter os dados atuais inalterados e indicar o campo e o critério violado.
4. WHEN um Usuário autenticado solicita a alteração do e-mail da conta para um e-mail em formato válido e não associado a outra conta, THE Serviço_de_Perfil SHALL enviar um e-mail de verificação ao novo endereço com link de confirmação com expiração de 24 horas e manter o e-mail principal atual até a confirmação.
5. WHEN o Usuário acessa o link de verificação do novo e-mail dentro do prazo de expiração, THE Serviço_de_Perfil SHALL tornar o novo e-mail o e-mail principal da conta.
6. IF o novo e-mail informado na alteração de perfil estiver em formato inválido ou já associado a outra conta, THEN THE Serviço_de_Perfil SHALL rejeitar a alteração, manter o e-mail principal atual e indicar o motivo da rejeição.

### Requirement 5: Dashboard Financeiro

**User Story:** Como Usuário, quero visualizar um dashboard financeiro, para que eu acompanhe minha saúde financeira de forma consolidada.

#### Acceptance Criteria

1. WHEN um Usuário autenticado acessa o Dashboard, THE Dashboard SHALL exibir o Saldo_Atual como valor monetário, calculado como a diferença entre o somatório de todas as Receitas e o somatório de todas as Despesas do Usuário registradas até a data corrente, independentemente do período selecionado.
2. WHEN um Usuário autenticado acessa o Dashboard, THE Dashboard SHALL exibir o total de Receitas e o total de Despesas, como valores monetários, referentes ao período selecionado entre as opções de mês civil corrente, mês civil anterior, ano civil corrente e intervalo de datas personalizado, adotando o mês civil corrente como período padrão quando nenhum período for selecionado.
3. WHEN um Usuário autenticado acessa o Dashboard, THE Dashboard SHALL exibir o Resultado_Mensal do mês civil corrente.
4. WHEN um Usuário autenticado acessa o Dashboard, THE Dashboard SHALL exibir um gráfico da distribuição de Receitas por Categoria e um gráfico da distribuição de Despesas por Categoria, apresentando o valor e o percentual de cada Categoria em relação ao respectivo total do período selecionado.
5. WHEN um Usuário autenticado acessa o Dashboard, THE Dashboard SHALL exibir os seguintes indicadores de desempenho financeiro do mês civil corrente: a taxa de economia, calculada como a razão percentual entre o Resultado_Mensal e o total de Receitas do mês civil corrente; a variação percentual do total de Despesas do mês civil corrente em relação ao mês civil anterior; e a Categoria de Despesa com maior valor acumulado no mês civil corrente.
6. WHERE o Usuário não possui Lançamentos registrados, THE Dashboard SHALL exibir o Saldo_Atual, o total de Receitas, o total de Despesas e o Resultado_Mensal com valor zero e apresentar uma orientação para registrar o primeiro Lançamento.
7. IF a recuperação dos dados financeiros do Usuário falhar durante o carregamento do Dashboard, THEN THE Dashboard SHALL exibir uma mensagem indicando a indisponibilidade temporária dos dados, preservar os Lançamentos existentes e disponibilizar a opção de recarregar.
8. IF o total de Receitas do mês civil corrente for igual a zero, THEN THE Dashboard SHALL exibir a taxa de economia como indisponível.

### Requirement 6: Gestão de Receitas

**User Story:** Como Usuário, quero cadastrar, editar e excluir receitas, para que eu controle minhas entradas financeiras.

#### Acceptance Criteria

1. WHEN um Usuário autenticado submete uma Receita com descrição contendo de 1 a 200 caracteres, valor numérico entre 0,01 e 999.999.999,99, data em formato de calendário válido e Categoria existente do tipo Receita pertencente ao Usuário, THE Serviço_de_Receitas SHALL registrar a Receita associada ao Usuário e apresentar confirmação do registro.
2. WHEN um Usuário autenticado edita uma Receita existente alterando descrição, valor, data ou Categoria para valores que atendam às mesmas regras de validação do registro, THE Serviço_de_Receitas SHALL persistir as alterações da Receita e apresentar confirmação da atualização.
3. WHEN um Usuário autenticado exclui uma Receita existente, THE Serviço_de_Receitas SHALL remover a Receita da conta do Usuário e apresentar confirmação da exclusão.
4. IF o valor informado em uma Receita, no registro ou na edição, for menor ou igual a zero, não numérico ou superior a 999.999.999,99, THEN THE Serviço_de_Receitas SHALL rejeitar a operação, informar que o valor deve estar entre 0,01 e 999.999.999,99 e preservar os dados não persistidos.
5. WHERE uma Receita for marcada como Lançamento_Recorrente com frequência diária, semanal, mensal ou anual, THE Serviço_de_Receitas SHALL gerar automaticamente uma nova ocorrência da Receita a cada intervalo da frequência definida até a data de término informada ou, na ausência de data de término, para os 12 meses seguintes à data inicial.
6. WHEN um Usuário autenticado consulta o histórico de Receitas, THE Serviço_de_Receitas SHALL retornar a lista de Receitas do Usuário ordenada por data de forma decrescente e, em caso de datas iguais, pela data de criação de forma decrescente.
7. IF um Usuário tentar editar ou excluir uma Receita que não pertence à sua conta, THEN THE Serviço_de_Receitas SHALL rejeitar a operação, preservar a Receita inalterada e retornar erro de autorização.
8. IF um Usuário autenticado submeter uma Receita com descrição vazia, valor ausente, data ausente ou Categoria não informada, THEN THE Serviço_de_Receitas SHALL rejeitar o registro, indicar o campo obrigatório faltante e preservar os dados já informados.
9. IF a Categoria informada para uma Receita não for do tipo Receita ou não pertencer ao Usuário, THEN THE Serviço_de_Receitas SHALL rejeitar a operação e informar que a Categoria selecionada deve ser do tipo Receita e pertencer ao Usuário.

### Requirement 7: Gestão de Despesas

**User Story:** Como Usuário, quero cadastrar, editar e excluir despesas, para que eu controle minhas saídas financeiras.

#### Acceptance Criteria

1. WHEN um Usuário autenticado submete uma Despesa com descrição contendo de 1 a 200 caracteres, valor numérico entre 0,01 e 999.999.999,99, data em formato de calendário válido e Categoria existente do tipo Despesa pertencente ao Usuário, THE Serviço_de_Despesas SHALL registrar a Despesa associada ao Usuário e apresentar confirmação do registro.
2. WHEN um Usuário autenticado edita uma Despesa existente alterando descrição, valor, data ou Categoria para valores que atendam às mesmas regras de validação do registro, THE Serviço_de_Despesas SHALL persistir as alterações da Despesa e apresentar confirmação da atualização.
3. WHEN um Usuário autenticado exclui uma Despesa existente, THE Serviço_de_Despesas SHALL remover a Despesa da conta do Usuário e apresentar confirmação da exclusão.
4. IF o valor informado em uma Despesa, no registro ou na edição, for menor ou igual a zero, não numérico ou superior a 999.999.999,99, THEN THE Serviço_de_Despesas SHALL rejeitar a operação, informar que o valor deve estar entre 0,01 e 999.999.999,99 e preservar os dados não persistidos.
5. WHERE uma Despesa for marcada como Lançamento_Recorrente com frequência diária, semanal, mensal ou anual, THE Serviço_de_Despesas SHALL gerar automaticamente uma nova ocorrência da Despesa a cada intervalo da frequência definida até a data de término informada ou, na ausência de data de término, para os 12 meses seguintes à data inicial.
6. WHEN um Usuário autenticado consulta o histórico de Despesas, THE Serviço_de_Despesas SHALL retornar a lista de Despesas do Usuário ordenada por data de forma decrescente e, em caso de datas iguais, pela data de criação de forma decrescente.
7. IF um Usuário tentar editar ou excluir uma Despesa que não pertence à sua conta, THEN THE Serviço_de_Despesas SHALL rejeitar a operação, preservar a Despesa inalterada e retornar erro de autorização.
8. IF um Usuário autenticado submeter uma Despesa com descrição vazia, valor ausente, data ausente ou Categoria não informada, THEN THE Serviço_de_Despesas SHALL rejeitar o registro, indicar o campo obrigatório faltante e preservar os dados já informados.
9. IF a Categoria informada para uma Despesa não for do tipo Despesa ou não pertencer ao Usuário, THEN THE Serviço_de_Despesas SHALL rejeitar a operação e informar que a Categoria selecionada deve ser do tipo Despesa e pertencer ao Usuário.

### Requirement 8: Categorias Financeiras

**User Story:** Como Usuário, quero gerenciar categorias personalizadas, para que eu organize meus lançamentos por tipo.

#### Acceptance Criteria

1. WHEN um Usuário autenticado cria uma Categoria com nome não vazio contendo entre 1 e 60 caracteres e tipo igual a Receita ou Despesa, THE Serviço_de_Categorias SHALL registrar a Categoria associada ao Usuário.
2. THE Serviço_de_Categorias SHALL classificar cada Categoria exclusivamente como tipo Receita ou tipo Despesa.
3. WHEN um Usuário autenticado edita uma Categoria de sua propriedade informando nome não vazio contendo entre 1 e 60 caracteres, THE Serviço_de_Categorias SHALL persistir as alterações da Categoria.
4. WHEN um Usuário autenticado exclui uma Categoria de sua propriedade sem Lançamentos associados, THE Serviço_de_Categorias SHALL remover a Categoria.
5. IF um Usuário tentar excluir uma Categoria com um ou mais Lançamentos associados, THEN THE Serviço_de_Categorias SHALL rejeitar a exclusão, preservar a Categoria e informar a existência de Lançamentos vinculados.
6. IF um Usuário tentar criar ou editar uma Categoria com nome duplicado dentro de sua própria conta e do mesmo tipo, THEN THE Serviço_de_Categorias SHALL rejeitar a operação e informar a duplicidade.
7. WHEN um Usuário registra um Lançamento, THE Serviço_de_Categorias SHALL disponibilizar apenas Categorias do próprio Usuário cujo tipo corresponda ao tipo do Lançamento.
8. IF um Usuário tentar criar ou editar uma Categoria com nome vazio ou com mais de 60 caracteres, THEN THE Serviço_de_Categorias SHALL rejeitar a operação e informar o critério de comprimento do nome.
9. IF um Usuário tentar editar ou excluir uma Categoria que não pertence à sua conta, THEN THE Serviço_de_Categorias SHALL rejeitar a operação e retornar erro de autorização.

### Requirement 9: Metas Financeiras

**User Story:** Como Usuário, quero cadastrar metas financeiras com valor-alvo e prazo, para que eu acompanhe meu progresso em direção aos objetivos.

#### Acceptance Criteria

1. WHEN um Usuário autenticado cadastra uma Meta_Financeira com descrição de 1 a 100 caracteres, valor-alvo entre 0,01 e 999.999.999,99 e prazo posterior à data atual, THE Serviço_de_Metas SHALL registrar a Meta_Financeira associada ao Usuário com progresso inicial de 0%.
2. WHEN um Usuário autenticado consulta uma Meta_Financeira, THE Serviço_de_Metas SHALL exibir o progresso como o percentual resultante da razão entre o valor acumulado e o valor-alvo, limitado a um máximo de 100%.
3. THE Serviço_de_Metas SHALL exibir um indicador visual de conclusão cujo preenchimento corresponde ao percentual de progresso da Meta_Financeira, variando de 0% a 100%.
4. WHEN o valor acumulado de uma Meta_Financeira atinge ou ultrapassa o valor-alvo, THE Serviço_de_Metas SHALL marcar a Meta_Financeira como concluída.
5. IF a data de prazo informada para uma Meta_Financeira for igual ou anterior à data atual, THEN THE Serviço_de_Metas SHALL rejeitar o cadastro, preservar o estado anterior e informar que o prazo deve ser posterior à data atual.
6. IF o valor-alvo informado para uma Meta_Financeira for menor ou igual a zero, THEN THE Serviço_de_Metas SHALL rejeitar o cadastro, preservar o estado anterior e informar que o valor-alvo deve ser positivo.
7. WHEN um Usuário autenticado edita uma Meta_Financeira existente de sua conta com dados válidos, THE Serviço_de_Metas SHALL persistir as alterações da Meta_Financeira.
8. WHEN um Usuário autenticado exclui uma Meta_Financeira existente de sua conta, THE Serviço_de_Metas SHALL remover a Meta_Financeira da conta do Usuário.
9. IF um Usuário tentar editar ou excluir uma Meta_Financeira que não pertence à sua conta, THEN THE Serviço_de_Metas SHALL rejeitar a operação e retornar erro de autorização.

### Requirement 10: Relatórios Financeiros

**User Story:** Como Usuário, quero gerar relatórios financeiros por período, para que eu analise minha movimentação e o fluxo de caixa.

#### Acceptance Criteria

1. WHEN um Usuário autenticado solicita um relatório de Receitas informando data inicial e data final, THE Serviço_de_Relatorios SHALL gerar o relatório contendo as Receitas do próprio Usuário cuja data esteja contida no intervalo fechado entre a data inicial e a data final, inclusive.
2. WHEN um Usuário autenticado solicita um relatório de Despesas informando data inicial e data final, THE Serviço_de_Relatorios SHALL gerar o relatório contendo as Despesas do próprio Usuário cuja data esteja contida no intervalo fechado entre a data inicial e a data final, inclusive.
3. WHEN um Usuário autenticado solicita um comparativo mensal informando um intervalo, THE Serviço_de_Relatorios SHALL gerar o relatório apresentando, para cada mês civil do intervalo, o total de Receitas e o total de Despesas do próprio Usuário.
4. WHEN um Usuário autenticado solicita um comparativo anual informando um intervalo, THE Serviço_de_Relatorios SHALL gerar o relatório apresentando, para cada ano civil do intervalo, o total de Receitas e o total de Despesas do próprio Usuário.
5. WHEN um Usuário autenticado solicita um relatório de fluxo de caixa informando data inicial e data final, THE Serviço_de_Relatorios SHALL gerar o relatório apresentando as entradas, as saídas e o Saldo_Atual acumulado do próprio Usuário ao longo do intervalo informado.
6. IF a data inicial ou a data final do período não for informada, THEN THE Serviço_de_Relatorios SHALL rejeitar a solicitação e informar que o período deve conter data inicial e data final.
7. IF a data inicial do período informado for posterior à data final, THEN THE Serviço_de_Relatorios SHALL rejeitar a solicitação, não gerar o relatório e informar a inconsistência do período.
8. WHERE não houver Lançamentos do próprio Usuário no período informado, THE Serviço_de_Relatorios SHALL gerar o relatório com totais zerados e indicar a ausência de dados no período.

### Requirement 11: Exportação de Relatórios

**User Story:** Como Usuário, quero exportar relatórios em diferentes formatos, para que eu compartilhe e arquive minhas informações financeiras.

#### Acceptance Criteria

1. WHEN um Usuário autenticado solicita a exportação de um relatório em PDF, THE Serviço_de_Relatorios SHALL gerar, em até 30 segundos, um arquivo PDF contendo o mesmo conteúdo do relatório solicitado e disponibilizá-lo para download.
2. WHEN um Usuário autenticado solicita a exportação de um relatório em Excel, THE Serviço_de_Relatorios SHALL gerar, em até 30 segundos, um arquivo no formato .xlsx contendo o mesmo conteúdo do relatório solicitado e disponibilizá-lo para download.
3. WHEN um Usuário autenticado solicita a exportação de um relatório em CSV, THE Serviço_de_Relatorios SHALL gerar, em até 30 segundos, um arquivo CSV contendo o mesmo conteúdo do relatório solicitado e disponibilizá-lo para download.
4. IF o relatório solicitado não possui dados no período informado, THEN THE Serviço_de_Relatorios SHALL gerar o arquivo de exportação no formato solicitado contendo apenas os cabeçalhos do relatório e nenhuma linha de dados.
5. WHEN um Usuário autenticado solicita a exportação de um relatório em múltiplos formatos simultaneamente, THE Serviço_de_Relatorios SHALL gerar cada formato de forma independente e informar individualmente, para cada formato, o sucesso com arquivo disponível para download ou a falha da exportação.
6. IF a geração de um arquivo de exportação falhar, THEN THE Serviço_de_Relatorios SHALL interromper a geração desse formato, não disponibilizar arquivo parcial para download e retornar uma mensagem de erro indicando a falha na exportação, preservando os dados de origem do relatório.

### Requirement 12: Filtros e Pesquisas

**User Story:** Como Usuário, quero filtrar e pesquisar lançamentos, para que eu localize rapidamente registros específicos.

#### Acceptance Criteria

1. WHEN um Usuário autenticado aplica um filtro por descrição com um termo de 1 a 100 caracteres, THE Serviço_de_Filtros SHALL retornar, dentre os Lançamentos pertencentes ao próprio Usuário, aqueles cuja descrição contenha o termo informado em correspondência parcial e sem diferenciação entre maiúsculas e minúsculas.
2. WHEN um Usuário autenticado aplica um filtro por Categoria, THE Serviço_de_Filtros SHALL retornar, dentre os Lançamentos pertencentes ao próprio Usuário, aqueles associados à Categoria selecionada.
3. WHEN um Usuário autenticado aplica um filtro por período, THE Serviço_de_Filtros SHALL retornar, dentre os Lançamentos pertencentes ao próprio Usuário, aqueles cuja data esteja contida no intervalo informado, incluindo as datas inicial e final.
4. WHEN um Usuário autenticado aplica um filtro por tipo de Lançamento, THE Serviço_de_Filtros SHALL retornar, dentre os Lançamentos pertencentes ao próprio Usuário, apenas os Lançamentos do tipo Receita ou do tipo Despesa selecionado.
5. WHEN um Usuário autenticado aplica múltiplos filtros simultaneamente, THE Serviço_de_Filtros SHALL retornar, dentre os Lançamentos pertencentes ao próprio Usuário, aqueles que satisfaçam de forma conjunta todos os filtros aplicados.
6. IF nenhum Lançamento do próprio Usuário satisfizer os filtros aplicados, THEN THE Serviço_de_Filtros SHALL retornar uma lista vazia e apresentar uma indicação de ausência de resultados.
7. IF, em um filtro por período, a data inicial informada for posterior à data final, THEN THE Serviço_de_Filtros SHALL rejeitar a solicitação e informar a inconsistência do período.
8. THE Serviço_de_Filtros SHALL retornar os Lançamentos filtrados ordenados por data de forma decrescente.

### Requirement 13: Responsividade

**User Story:** Como Usuário, quero acessar a Plataforma em diferentes dispositivos, para que eu gerencie minhas finanças em qualquer lugar.

#### Acceptance Criteria

1. WHERE a Plataforma é acessada em uma tela com largura igual ou superior a 1024 pixels, THE Plataforma SHALL apresentar o layout de desktop, exibindo todo o conteúdo sem rolagem horizontal e com a navegação principal permanentemente visível.
2. WHERE a Plataforma é acessada em uma tela com largura entre 768 e 1023 pixels, inclusive, THE Plataforma SHALL apresentar o layout de tablet, exibindo todo o conteúdo sem rolagem horizontal.
3. WHERE a Plataforma é acessada em uma tela com largura inferior a 768 pixels, THE Plataforma SHALL apresentar o layout de smartphone, exibindo todo o conteúdo sem rolagem horizontal e com elementos interativos com área de toque de no mínimo 44 x 44 pixels.
4. THE Plataforma SHALL disponibilizar todas as funcionalidades de gestão financeira de forma operável em qualquer largura de tela igual ou superior a 320 pixels, sem ocultar ou desabilitar nenhuma funcionalidade em função do dispositivo utilizado.
5. WHEN a largura ou a orientação da janela de visualização for alterada, THE Plataforma SHALL aplicar o layout correspondente à nova largura em até 1 segundo, preservando o estado e os dados já exibidos.

### Requirement 14: Painel Administrativo - Gestão de Usuários

**User Story:** Como Administrador, quero gerenciar os usuários cadastrados, para que eu controle o acesso à Plataforma.

#### Acceptance Criteria

1. WHEN um Administrador autenticado acessa o Painel_Administrativo, THE Painel_Administrativo SHALL exibir a lista de Usuários cadastrados, apresentando para cada Usuário o identificador, o e-mail e o status da conta (ativa ou inativa).
2. WHEN um Administrador desativa a conta de um Usuário com status ativo, THE Painel_Administrativo SHALL marcar a conta do Usuário como inativa.
3. WHEN a conta de um Usuário passa para o status inativo, THE Painel_Administrativo SHALL invalidar todas as Sessões ativas desse Usuário.
4. WHEN um Administrador ativa a conta de um Usuário previamente desativada, THE Painel_Administrativo SHALL marcar a conta como ativa e permitir nova autenticação do Usuário.
5. IF um Usuário com conta inativa tentar efetuar login, THEN THE Serviço_de_Autenticacao SHALL rejeitar a autenticação, manter a conta inativa, não iniciar Sessão e informar que a conta está inativa.
6. IF um Usuário sem privilégios de Administrador tentar acessar o Painel_Administrativo, THEN THE Painel_Administrativo SHALL negar o acesso, não exibir dados de Usuários e retornar erro de autorização.
7. IF um Administrador tentar desativar a própria conta, THEN THE Painel_Administrativo SHALL rejeitar a operação e informar que o Administrador não pode desativar a própria conta.

### Requirement 15: Painel Administrativo - Monitoramento

**User Story:** Como Administrador, quero monitorar logs de acesso e estatísticas de uso, para que eu acompanhe a operação da Plataforma.

#### Acceptance Criteria

1. WHEN um Usuário efetua login, encerra a Sessão ou tem a Sessão expirada por inatividade, THE Serviço_de_Monitoramento SHALL registrar um log de acesso contendo o identificador do Usuário, o tipo de ação e a data e hora do evento.
2. WHEN um Administrador acessa o monitoramento, THE Serviço_de_Monitoramento SHALL exibir os logs de acesso registrados ordenados por data e hora de forma decrescente.
3. WHEN um Administrador acessa o monitoramento informando um período, THE Serviço_de_Monitoramento SHALL exibir as estatísticas de uso da Plataforma referentes ao período, incluindo o número de Usuários ativos (Usuários que iniciaram pelo menos uma Sessão no período) e o volume total de Lançamentos no período.
4. WHERE nenhum período for informado no monitoramento, THE Serviço_de_Monitoramento SHALL adotar os últimos 30 dias como período padrão das estatísticas.
5. WHERE não houver logs de acesso no período consultado, THE Serviço_de_Monitoramento SHALL exibir uma lista vazia e indicar a ausência de registros no período.
6. IF um Usuário sem privilégios de Administrador tentar acessar o monitoramento, THEN THE Serviço_de_Monitoramento SHALL negar o acesso, manter os logs e as estatísticas inalterados e retornar erro de autorização.

### Requirement 16: Segurança e Conformidade

**User Story:** Como Usuário, quero que meus dados estejam protegidos e em conformidade com a legislação, para que eu confie na Plataforma.

#### Acceptance Criteria

1. THE Serviço_de_Autenticacao SHALL armazenar as senhas dos Usuários utilizando algoritmo de hash com salt único por Usuário, e SHALL não armazenar nem registrar as senhas em texto puro.
2. WHEN a Plataforma recebe entradas de Usuários, THE Plataforma SHALL neutralizar ou remover o conteúdo de script presente nas entradas, de modo que scripts injetados não sejam executados ao serem armazenados ou exibidos, prevenindo ataques de Cross-Site Scripting (XSS).
3. WHEN a Plataforma processa uma requisição que altera estado, THE Plataforma SHALL validar a presença e a autenticidade de um token anti-CSRF vinculado à Sessão do Usuário antes de executar a operação.
4. IF uma requisição que altera estado for recebida com token anti-CSRF ausente, inválido ou expirado, THEN THE Plataforma SHALL rejeitar a requisição, não alterar o estado e retornar erro de autorização.
5. WHEN a Plataforma acessa o banco de dados, THE Plataforma SHALL utilizar consultas parametrizadas para prevenir injeção de SQL.
6. WHEN um Usuário solicita a exclusão de seus dados pessoais, THE Plataforma SHALL remover ou anonimizar de forma irreversível os dados pessoais do Usuário em até 15 dias, em conformidade com a LGPD, ressalvados os dados cuja retenção seja exigida por obrigação legal.
7. THE Plataforma SHALL realizar backup do banco de dados em intervalos não superiores a 24 horas e SHALL manter os backups disponíveis para restauração por no mínimo 30 dias.
8. IF a rotina de backup do banco de dados falhar, THEN THE Plataforma SHALL registrar a falha, notificar o Administrador e preservar o último backup íntegro.
9. WHEN um Usuário se cadastra, THE Plataforma SHALL apresentar o termo de tratamento de dados pessoais e registrar o consentimento do Usuário com data, hora e versão do termo, conforme a LGPD.
10. IF um Usuário não fornecer o consentimento ao tratamento de dados pessoais durante o cadastro, THEN THE Plataforma SHALL bloquear a conclusão do cadastro e informar que o consentimento é obrigatório.

### Requirement 17: Landing Page

**User Story:** Como visitante, quero acessar uma landing page moderna, para que eu conheça a Plataforma e seja incentivado a me cadastrar.

#### Acceptance Criteria

1. WHEN um visitante acessa a Landing_Page, THE Landing_Page SHALL apresentar a proposta de valor da Plataforma e, no mínimo, 3 das suas principais funcionalidades.
2. WHEN um visitante aciona um elemento de chamada para ação de cadastro, THE Landing_Page SHALL redirecionar o visitante para o formulário de cadastro.
3. WHERE a Landing_Page é acessada em uma tela com largura igual ou superior a 1024 pixels, THE Landing_Page SHALL apresentar o layout otimizado para desktop.
4. WHERE a Landing_Page é acessada em uma tela com largura entre 768 e 1023 pixels, inclusive, THE Landing_Page SHALL apresentar o layout otimizado para tablet.
5. WHERE a Landing_Page é acessada em uma tela com largura inferior a 768 pixels, THE Landing_Page SHALL apresentar o layout otimizado para smartphone.
