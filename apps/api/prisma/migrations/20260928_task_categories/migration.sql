-- Migration: 20260928_task_categories
-- Description: Categorias de tarefas por usuário (ownership + soft delete) e vínculo opcional Task -> Category

-- Consulta 001: Criação da tabela categories
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "ownerId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- Consulta 002: Índices para consultas por dono e soft delete
CREATE INDEX "categories_ownerId_idx" ON "categories"("ownerId");
CREATE INDEX "categories_deletedAt_idx" ON "categories"("deletedAt");

-- Consulta 003: Foreign key relacionando a categoria ao perfil do usuário
ALTER TABLE "categories" ADD CONSTRAINT "categories_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Consulta 004: Coluna opcional de categoria na tabela tasks
ALTER TABLE "tasks" ADD COLUMN "categoryId" UUID;

-- Consulta 005: Índice para filtro de tarefas por categoria
CREATE INDEX "tasks_categoryId_idx" ON "tasks"("categoryId");

-- Consulta 006: Foreign key Task -> Category (remover a categoria desvincula as tarefas)
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
