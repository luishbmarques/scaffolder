import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryDto,
  CreateCategoryDto,
  DEFAULT_CATEGORY_COLOR,
  ListCategoriesQueryDto,
  PaginatedCategoriesResponseDto,
  UpdateCategoryDto,
} from './category.dto';

interface UserContext {
  id: string;
  role: string;
}

// Conta apenas tarefas ativas (não removidas logicamente) em cada categoria
const activeTaskCount = {
  _count: {
    select: {
      tasks: { where: { deletedAt: null } },
    },
  },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    const name = dto.name.trim();
    await this.assertUniqueName(ownerId, name);

    const created = await this.prisma.category.create({
      data: {
        name,
        color: dto.color?.toUpperCase() || DEFAULT_CATEGORY_COLOR,
        ownerId,
      },
      include: activeTaskCount,
    });

    return this.serializeCategory(created);
  }

  /**
   * Categorias são uma organização pessoal: a listagem sempre retorna apenas as
   * categorias do usuário autenticado (inclusive para ADMIN), para que os
   * seletores do formulário de tarefas mostrem somente categorias atribuíveis.
   */
  async findAll(user: UserContext, query: ListCategoriesQueryDto): Promise<PaginatedCategoriesResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      ownerId: user.id,
      deletedAt: null,
    };

    if (query.search) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const sortBy = query.sortBy === 'createdAt' ? 'createdAt' : 'name';
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, items] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: activeTaskCount,
      }),
    ]);

    return {
      data: items.map((item) => this.serializeCategory(item)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async findById(user: UserContext, id: string): Promise<CategoryDto> {
    const category = await this.getAccessibleCategory(user, id, 'acessar');
    return this.serializeCategory(category);
  }

  async update(user: UserContext, id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const existing = await this.getAccessibleCategory(user, id, 'modificar');

    const name = dto.name?.trim();
    if (name !== undefined && name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(existing.ownerId, name, id);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}),
      },
      include: activeTaskCount,
    });

    return this.serializeCategory(updated);
  }

  /**
   * Remoção lógica da categoria. As tarefas vinculadas não são removidas:
   * elas apenas ficam "Sem categoria". As duas escritas ocorrem na mesma transação.
   */
  async remove(user: UserContext, id: string): Promise<void> {
    await this.getAccessibleCategory(user, id, 'excluir');

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  /**
   * Regra usada pelo módulo Tasks: uma tarefa só pode ser vinculada a uma
   * categoria ativa que pertença ao mesmo dono da tarefa.
   */
  async assertAssignable(taskOwnerId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true, ownerId: true },
    });

    if (!category || category.ownerId !== taskOwnerId) {
      throw new BadRequestException('Categoria inválida: ela não existe ou não pertence ao dono da tarefa.');
    }
  }

  private async getAccessibleCategory(user: UserContext, id: string, action: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: activeTaskCount,
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    if (user.role !== 'ADMIN' && category.ownerId !== user.id) {
      throw new ForbiddenException(`Você não tem permissão para ${action} esta categoria.`);
    }

    return category;
  }

  private async assertUniqueName(ownerId: string, name: string, ignoreId?: string): Promise<void> {
    const duplicate = await this.prisma.category.findFirst({
      where: {
        ownerId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(`Você já possui uma categoria chamada "${name}".`);
    }
  }

  private serializeCategory(category: any): CategoryDto {
    return {
      id: category.id,
      name: category.name,
      color: category.color,
      ownerId: category.ownerId,
      taskCount: category._count?.tasks ?? 0,
      createdAt: new Date(category.createdAt).toISOString(),
      updatedAt: new Date(category.updatedAt).toISOString(),
    };
  }
}
