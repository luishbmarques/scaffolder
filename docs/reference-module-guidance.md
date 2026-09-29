# Guia do Módulo de Referência (Tasks) e Criação de Novos Módulos

Este documento explica como o módulo de referência pedagógica `tasks` está estruturado e fornece instruções detalhadas sobre como **estudar**, **renomear**, **remover** ou **criar novos módulos** sobre o template AppStart.

---

## 🏛️ Arquitetura do Módulo de Referência

O módulo `tasks` implementa um ciclo CRUD completo ponta a ponta com padrões de produção:

1. **Persistência (Prisma ORM & PostgreSQL):**
   - Entidade `Task` com chaves estrangeiras, índices e tipos enumerados (`TaskStatus`, `TaskPriority`).
   - Suporte a **Remoção Lógica (*Soft Delete*)** através do campo `deletedAt`.
   - Relação de propriedade com o perfil do usuário (`UserProfile`).

2. **Regras de Negócio e Autorização:**
   - **Controle de Propriedade (*Ownership*):** Usuários comuns (`USER`) só podem consultar, editar e excluir suas próprias tarefas. Usuários administradores (`ADMIN`) possuem visão global.
   - **Validação de Prazos:** A data limite (`dueDate`) não pode ser definida no passado na criação ou alteração.
   - **Transição de Estados:** Tarefas com status `COMPLETED` não podem ter títulos ou descrições alteradas sem antes serem reabertas (`PENDING` ou `IN_PROGRESS`).

3. **Contrato OpenAPI & Cliente Tipado:**
   - DTOs anotados com `@ApiProperty()` e `class-validator` em `apps/api/src/tasks/task.dto.ts`.
   - Geração automática de endpoints no cliente frontend via `pnpm api:generate` (Orval).

4. **Interface Web (React + TanStack Query):**
   - Listagem paginada com busca por texto, filtros de status/prioridade e ordenação sincronizados na URL.
   - Formulários com validação rigorosa usando **React Hook Form** e **Zod**.
   - Estados visuais completos: Carregamento (*Loading*), Vazio (*Empty*), Erro (*Error*) e Sucesso (*ActionFeedback*).

---

## 🏷️ Extensão: Categorias de Tarefas (`categories`)

O módulo `categories` é um exemplo de **relacionamento 1:N entre dois módulos** construído sobre o módulo de referência, seguindo as 5 etapas do [guia de desenvolvimento](feature-development-guide.md):

| Etapa | Onde | O que foi feito |
| :--- | :--- | :--- |
| 1. Dados | `apps/api/prisma/schema.prisma`, `migrations/20260928_task_categories` | Modelo `Category` (nome, cor, `ownerId`, `deletedAt`) e coluna opcional `tasks.categoryId` com FK `ON DELETE SET NULL` |
| 2. Backend | `apps/api/src/categories/` | DTOs, `CategoriesService`, `CategoriesController`, `CategoriesModule` e testes; `TasksModule` importa `CategoriesModule` |
| 3. Contrato | `openapi.json`, `apps/web/src/lib/api-client/` | Rotas `/api/v1/categories` e campos `categoryId`/`category` em `TaskDto` gerados pelo Orval |
| 4. Interface | `pages/categories-page.tsx`, `pages/tasks-page.tsx`, `components/ui/category-badge.tsx` | Tela de categorias (CRUD com cor), filtro por categoria na URL, seletor nos formulários e badge colorida nos cards |
| 5. Validação | `*.spec.ts(x)` | Testes de service (API) e de página (Web) |

**Regras de negócio:**
- Categorias são **pessoais**: `GET /categories` sempre lista apenas as do usuário autenticado (inclusive para `ADMIN`), e o nome é único por usuário, sem diferenciar maiúsculas/minúsculas (`409 Conflict`).
- Uma tarefa só pode ser vinculada a uma categoria **ativa do mesmo dono da tarefa** (`400 Bad Request` caso contrário), inclusive quando um `ADMIN` edita a tarefa de outro usuário.
- Enviar `categoryId: null` no `PUT /tasks/:id` remove a categoria da tarefa.
- Trocar a categoria de uma tarefa `COMPLETED` conta como alteração de detalhe e exige reabrir a tarefa.
- Excluir uma categoria é remoção lógica: na mesma transação, as tarefas vinculadas ficam "Sem categoria" (nenhuma tarefa é apagada).

**Decisão de design:** `TasksService` recebe `CategoriesService` por injeção de dependência e chama `assertAssignable()`, em vez de consultar a tabela `categories` diretamente. A regra "categoria atribuível" fica em um único lugar, e a dependência entre módulos fica explícita no `imports` do `TasksModule`.

---

## 🔄 Como Renomear o Módulo

Caso deseje transformar o módulo `tasks` em outro domínio (ex.: `projects`, `products`, `orders`):

1. **Renomear Entidade no Prisma:**
   - No arquivo `apps/api/prisma/schema.prisma`, renomeie o modelo `model Task` para `model Project`.
   - Crie uma migration versionada e aplique com `pnpm db:migrate`.
   - Execute `pnpm --dir apps/api exec prisma generate --schema prisma/schema.prisma`.

2. **Renomear Módulo no Backend:**
   - Renomeie o diretório `apps/api/src/tasks/` para `apps/api/src/projects/`.
   - Atualize os nomes das classes (`ProjectsModule`, `ProjectsController`, `ProjectsService`, `CreateProjectDto`).
   - Atualize a importação em `apps/api/src/app.module.ts`.

3. **Regenerar Contrato e Cliente:**
   - Execute `pnpm api:generate`.

4. **Renomear Página no Frontend:**
   - Renomeie `apps/web/src/pages/tasks-page.tsx` para `apps/web/src/pages/projects-page.tsx`.
   - Atualize as rotas em `apps/web/src/App.tsx` e o menu em `apps/web/src/components/layout/auth-layout.tsx`.

---

## 🗑️ Como Remover o Módulo Limpamente

Se você preferir iniciar sua aplicação a partir de uma base totalmente limpa:

1. **Remover no Backend:**
   - Exclua os diretórios `apps/api/src/tasks/` e `apps/api/src/categories/` (categorias dependem de tarefas).
   - Em `apps/api/src/app.module.ts`, remova a importação e os módulos `TasksModule` e `CategoriesModule` do array `imports`.
   - No `apps/api/prisma/schema.prisma`, remova os modelos `Task` e `Category`, os enums `TaskStatus`/`TaskPriority` e os campos `tasks Task[]` e `categories Category[]` em `UserProfile`.
   - Crie uma migration de exclusão ou reset com `pnpm db:migrate`.

2. **Remover no Frontend:**
   - Exclua `apps/web/src/pages/tasks-page.tsx`, `categories-page.tsx`, seus arquivos `.spec.tsx` e `apps/web/src/components/ui/category-badge.tsx`.
   - Remova as rotas `/tasks` e `/categories` em `apps/web/src/App.tsx`.
   - Remova os links de Tarefas e Categorias em `apps/web/src/components/layout/auth-layout.tsx`.

3. **Regenerar e Validar:**
   - Execute `pnpm api:generate`.
   - Execute `pnpm --dir apps/api test && pnpm --dir apps/web test && pnpm --dir apps/web build && pnpm api:check`.
