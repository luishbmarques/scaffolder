import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskPriorityEnum, TaskStatusEnum } from './task.dto';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: any;

  const mockUser = {
    id: 'user-uuid-1',
    role: 'USER',
  };

  const mockOtherUser = {
    id: 'user-uuid-2',
    role: 'USER',
  };

  const mockAdmin = {
    id: 'admin-uuid-1',
    role: 'ADMIN',
  };

  const mockTask = {
    id: 'task-uuid-1',
    title: 'Estudar Arquitetura BFF',
    description: 'Aprender sobre sessões opacas e Keycloak',
    status: TaskStatusEnum.PENDING,
    priority: TaskPriorityEnum.HIGH,
    dueDate: new Date(Date.now() + 86400000),
    ownerId: 'user-uuid-1',
    categoryId: null as string | null,
    category: null as { id: string; name: string; color: string } | null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: {
      id: 'user-uuid-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    },
  };

  const mockCategory = {
    id: 'category-uuid-1',
    name: 'Faculdade',
    color: '#10B981',
    ownerId: 'user-uuid-1',
  };

  beforeEach(() => {
    prisma = {
      task: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      category: {
        findFirst: vi.fn(),
      },
    };
    const prismaService = prisma as unknown as PrismaService;
    service = new TasksService(prismaService, new CategoriesService(prismaService));
  });

  describe('create', () => {
    it('creates task for authenticated user', async () => {
      prisma.task.create.mockResolvedValue(mockTask);

      const result = await service.create(mockUser.id, {
        title: 'Estudar Arquitetura BFF',
        description: 'Aprender sobre sessões opacas e Keycloak',
        priority: TaskPriorityEnum.HIGH,
        dueDate: mockTask.dueDate.toISOString(),
      });

      expect(result.id).toBe(mockTask.id);
      expect(result.ownerId).toBe(mockUser.id);
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('rejects due date set in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      await expect(
        service.create(mockUser.id, {
          title: 'Tarefa no passado',
          dueDate: pastDate,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('restricts query to own tasks for regular users', async () => {
      prisma.task.count.mockResolvedValue(1);
      prisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findAll(mockUser, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            ownerId: mockUser.id,
          }),
        }),
      );
    });

    it('allows admin to query tasks from all users', async () => {
      prisma.task.count.mockResolvedValue(1);
      prisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findAll(mockAdmin, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
      expect(prisma.task.findMany.mock.calls[0][0].where.ownerId).toBeUndefined();
    });
  });

  describe('findById and Ownership', () => {
    it('returns task when user is the owner', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);

      const result = await service.findById(mockUser, mockTask.id);
      expect(result.id).toBe(mockTask.id);
    });

    it('allows admin to view task owned by another user', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);

      const result = await service.findById(mockAdmin, mockTask.id);
      expect(result.id).toBe(mockTask.id);
    });

    it('throws ForbiddenException when another regular user tries to access task', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);

      await expect(service.findById(mockOtherUser, mockTask.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when task does not exist or is deleted', async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.findById(mockUser, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update and Business Rules', () => {
    it('updates task when valid', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);
      prisma.task.update.mockResolvedValue({
        ...mockTask,
        title: 'Título Atualizado',
      });

      const result = await service.update(mockUser, mockTask.id, {
        title: 'Título Atualizado',
      });

      expect(result.title).toBe('Título Atualizado');
    });

    it('rejects editing field details of a COMPLETED task without reopening it first', async () => {
      const completedTask = {
        ...mockTask,
        status: TaskStatusEnum.COMPLETED,
      };
      prisma.task.findFirst.mockResolvedValue(completedTask);

      await expect(
        service.update(mockUser, mockTask.id, {
          title: 'Novo Título Proibido',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows editing if status is reopened to PENDING', async () => {
      const completedTask = {
        ...mockTask,
        status: TaskStatusEnum.COMPLETED,
      };
      prisma.task.findFirst.mockResolvedValue(completedTask);
      prisma.task.update.mockResolvedValue({
        ...mockTask,
        status: TaskStatusEnum.PENDING,
        title: 'Título Reaberto',
      });

      const result = await service.update(mockUser, mockTask.id, {
        status: TaskStatusEnum.PENDING,
        title: 'Título Reaberto',
      });

      expect(result.status).toBe(TaskStatusEnum.PENDING);
    });
  });

  describe('remove (Soft Delete)', () => {
    it('sets deletedAt on remove', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);
      prisma.task.update.mockResolvedValue({
        ...mockTask,
        deletedAt: new Date(),
      });

      await service.remove(mockUser, mockTask.id);

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTask.id },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('prevents non-owner regular user from deleting task', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);

      await expect(service.remove(mockOtherUser, mockTask.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('categories', () => {
    it('creates task linked to a category owned by the user', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: mockCategory.id, ownerId: mockUser.id });
      prisma.task.create.mockResolvedValue({
        ...mockTask,
        categoryId: mockCategory.id,
        category: { id: mockCategory.id, name: mockCategory.name, color: mockCategory.color },
      });

      const result = await service.create(mockUser.id, {
        title: 'Lista de exercícios',
        categoryId: mockCategory.id,
      });

      expect(result.categoryId).toBe(mockCategory.id);
      expect(result.category).toEqual({ id: mockCategory.id, name: 'Faculdade', color: '#10B981' });
      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: mockCategory.id }),
        }),
      );
    });

    it('serializes tasks without category as null', async () => {
      prisma.task.create.mockResolvedValue(mockTask);

      const result = await service.create(mockUser.id, { title: 'Sem categoria' });

      expect(result.categoryId).toBeNull();
      expect(result.category).toBeNull();
      expect(prisma.category.findFirst).not.toHaveBeenCalled();
    });

    it('rejects creating a task with a category owned by another user', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: mockCategory.id, ownerId: mockOtherUser.id });

      await expect(
        service.create(mockUser.id, { title: 'Tarefa', categoryId: mockCategory.id }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rejects creating a task with a deleted or missing category', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create(mockUser.id, { title: 'Tarefa', categoryId: 'missing-category' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('filters the list by category', async () => {
      prisma.task.count.mockResolvedValue(0);
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll(mockUser, { page: 1, pageSize: 10, categoryId: mockCategory.id });

      expect(prisma.task.findMany.mock.calls[0][0].where.categoryId).toBe(mockCategory.id);
    });

    it('removes the category from a task when categoryId is null', async () => {
      prisma.task.findFirst.mockResolvedValue({ ...mockTask, categoryId: mockCategory.id });
      prisma.task.update.mockResolvedValue(mockTask);

      await service.update(mockUser, mockTask.id, { categoryId: null });

      expect(prisma.category.findFirst).not.toHaveBeenCalled();
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: null }),
        }),
      );
    });

    it('validates the category against the task owner when an admin edits it', async () => {
      prisma.task.findFirst.mockResolvedValue(mockTask);
      prisma.category.findFirst.mockResolvedValue({ id: 'admin-category', ownerId: mockAdmin.id });

      await expect(
        service.update(mockAdmin, mockTask.id, { categoryId: 'admin-category' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('treats changing the category of a COMPLETED task as a detail change', async () => {
      prisma.task.findFirst.mockResolvedValue({ ...mockTask, status: TaskStatusEnum.COMPLETED });

      await expect(
        service.update(mockUser, mockTask.id, { categoryId: mockCategory.id }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
