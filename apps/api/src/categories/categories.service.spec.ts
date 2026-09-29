import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;

  const mockUser = { id: 'user-uuid-1', role: 'USER' };
  const mockOtherUser = { id: 'user-uuid-2', role: 'USER' };
  const mockAdmin = { id: 'admin-uuid-1', role: 'ADMIN' };

  const mockCategory = {
    id: 'category-uuid-1',
    name: 'Faculdade',
    color: '#10B981',
    ownerId: 'user-uuid-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { tasks: 3 },
  };

  beforeEach(() => {
    prisma = {
      category: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      task: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a category for the authenticated user with trimmed name and normalized color', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({ ...mockCategory, _count: { tasks: 0 } });

      const result = await service.create(mockUser.id, { name: '  Faculdade  ', color: '#10b981' });

      expect(result.id).toBe(mockCategory.id);
      expect(result.taskCount).toBe(0);
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Faculdade', color: '#10B981', ownerId: mockUser.id },
        }),
      );
    });

    it('uses the default color when none is provided', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);

      await service.create(mockUser.id, { name: 'Pessoal' });

      expect(prisma.category.create.mock.calls[0][0].data.color).toBe('#3B82F6');
    });

    it('rejects a duplicated name for the same user (case-insensitive)', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(mockUser.id, { name: 'faculdade' })).rejects.toThrow(ConflictException);
      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: mockUser.id,
            deletedAt: null,
            name: { equals: 'faculdade', mode: 'insensitive' },
          }),
        }),
      );
      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('always scopes the listing to the current user, even for ADMIN', async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.category.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAll(mockAdmin, { page: 1, pageSize: 10 });

      expect(result.data[0].taskCount).toBe(3);
      expect(prisma.category.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ ownerId: mockAdmin.id, deletedAt: null }),
      );
    });

    it('orders by name ascending by default', async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.category.findMany.mockResolvedValue([]);

      await service.findAll(mockUser, {});

      expect(prisma.category.findMany.mock.calls[0][0].orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('ownership', () => {
    it('forbids another regular user from reading the category', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(service.findById(mockOtherUser, mockCategory.id)).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to read any category', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      const result = await service.findById(mockAdmin, mockCategory.id);
      expect(result.id).toBe(mockCategory.id);
    });

    it('returns 404 for missing or deleted categories', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.findById(mockUser, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('renames the category when the new name is free', async () => {
      prisma.category.findFirst
        .mockResolvedValueOnce(mockCategory) // categoria acessível
        .mockResolvedValueOnce(null); // nenhum nome duplicado
      prisma.category.update.mockResolvedValue({ ...mockCategory, name: 'Estágio' });

      const result = await service.update(mockUser, mockCategory.id, { name: 'Estágio' });

      expect(result.name).toBe('Estágio');
      expect(prisma.category.findFirst.mock.calls[1][0].where).toEqual(
        expect.objectContaining({ NOT: { id: mockCategory.id } }),
      );
    });

    it('allows changing only the letter case of the current name', async () => {
      prisma.category.findFirst.mockResolvedValueOnce(mockCategory);
      prisma.category.update.mockResolvedValue({ ...mockCategory, name: 'FACULDADE' });

      await service.update(mockUser, mockCategory.id, { name: 'FACULDADE' });

      expect(prisma.category.findFirst).toHaveBeenCalledTimes(1);
    });

    it('rejects renaming to a name already in use', async () => {
      prisma.category.findFirst
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce({ id: 'other-category' });

      await expect(service.update(mockUser, mockCategory.id, { name: 'Trabalho' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove (Soft Delete)', () => {
    it('soft deletes the category and unlinks its tasks in a single transaction', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await service.remove(mockUser, mockCategory.id);

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { categoryId: mockCategory.id },
        data: { categoryId: null },
      });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('prevents a non-owner regular user from deleting', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(service.remove(mockOtherUser, mockCategory.id)).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('assertAssignable', () => {
    it('accepts an active category owned by the task owner', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: mockCategory.id, ownerId: mockUser.id });

      await expect(service.assertAssignable(mockUser.id, mockCategory.id)).resolves.toBeUndefined();
    });

    it('rejects a category owned by someone else', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: mockCategory.id, ownerId: mockOtherUser.id });

      await expect(service.assertAssignable(mockUser.id, mockCategory.id)).rejects.toThrow(BadRequestException);
    });
  });
});
