import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Edit2, Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  CATEGORY_COLOR_OPTIONS,
  CategoryBadge,
  DEFAULT_CATEGORY_COLOR,
} from '../components/ui/category-badge';
import { ActionFeedback, EmptyState, ErrorState, LoadingState } from '../components/ui/state-feedback';
import {
  categoriesControllerCreate,
  categoriesControllerFindAll,
  categoriesControllerRemove,
  categoriesControllerUpdate,
} from '../lib/api-client';
import type { CategoryDto, PaginatedCategoriesResponseDto } from '../lib/api-client/models';

const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(50, 'O nome deve ter no máximo 50 caracteres.'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Escolha uma cor válida.'),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function getErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { detail?: string })?.detail ||
    (err as { message?: string })?.message ||
    fallback
  );
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: response, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories', { search }],
    queryFn: async () => {
      const res = await categoriesControllerFindAll({
        page: 1,
        pageSize: 100,
        ...(search ? { search } : {}),
      });
      return res.data;
    },
  });

  const paginated =
    response && 'data' in (response as PaginatedCategoriesResponseDto)
      ? (response as PaginatedCategoriesResponseDto)
      : null;
  const categories: CategoryDto[] = paginated?.data || [];

  // Categorias aparecem nos cards de tarefa, então as duas listas são invalidadas juntas
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      const res = await categoriesControllerCreate({ name: data.name, color: data.color });
      return res.data;
    },
    onSuccess: (data) => {
      const created = data && 'name' in (data as CategoryDto) ? (data as CategoryDto) : null;
      setFeedback({
        type: 'success',
        message: created ? `Categoria "${created.name}" criada com sucesso!` : 'Categoria criada com sucesso!',
      });
      setIsCreateOpen(false);
      invalidateAll();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Não foi possível criar a categoria.') });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormValues }) => {
      const res = await categoriesControllerUpdate(id, data);
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Categoria atualizada com sucesso!' });
      setEditingCategory(null);
      invalidateAll();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Falha ao atualizar a categoria.') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await categoriesControllerRemove(id);
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Categoria removida. As tarefas vinculadas ficaram sem categoria.' });
      invalidateAll();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Falha ao excluir a categoria.') });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Tags className="h-6 w-6 text-blue-600" />
            Categorias de Tarefas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize suas tarefas em categorias pessoais. Cada nome é único por usuário.
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      {feedback && (
        <ActionFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
      )}

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              aria-label="Buscar categoria"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState message="Carregando categorias..." />
      ) : isError ? (
        <ErrorState
          title="Erro ao buscar categorias"
          message="Não foi possível carregar as categorias no momento."
          onRetry={() => refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria encontrada"
          description={
            search
              ? 'Nenhuma categoria corresponde à busca.'
              : 'Crie categorias como "Faculdade", "Trabalho" ou "Pessoal" para organizar suas tarefas.'
          }
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                Limpar busca
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                Criar primeira categoria
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <Card key={category.id} className="overflow-hidden shadow-sm">
              <div className="h-1.5" style={{ backgroundColor: category.color }} />
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <CategoryBadge name={category.name} color={category.color} className="text-sm" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                    {category.taskCount === 1 ? '1 tarefa' : `${category.taskCount} tarefas`}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <Link
                    to={`/tasks?categoryId=${category.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Ver tarefas
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Editar Categoria"
                      onClick={() => setEditingCategory(category)}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Excluir Categoria (Remoção Lógica)"
                      isLoading={deleteMutation.isPending && deleteMutation.variables === category.id}
                      onClick={() => {
                        const detail =
                          category.taskCount > 0
                            ? ` As ${category.taskCount} tarefa(s) vinculada(s) ficarão sem categoria.`
                            : '';
                        if (confirm(`Deseja realmente remover a categoria "${category.name}"?${detail}`)) {
                          deleteMutation.mutate(category.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isCreateOpen && (
        <CategoryFormModal
          title="Nova Categoria"
          submitLabel="Criar Categoria"
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => {
            setFeedback(null);
            createMutation.mutate(data);
          }}
          isLoading={createMutation.isPending}
        />
      )}

      {editingCategory && (
        <CategoryFormModal
          title="Editar Categoria"
          submitLabel="Salvar Alterações"
          initialValues={{ name: editingCategory.name, color: editingCategory.color }}
          onClose={() => setEditingCategory(null)}
          onSubmit={(data) => {
            setFeedback(null);
            updateMutation.mutate({ id: editingCategory.id, data });
          }}
          isLoading={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function CategoryFormModal({
  title,
  submitLabel,
  initialValues,
  onClose,
  onSubmit,
  isLoading,
}: {
  title: string;
  submitLabel: string;
  initialValues?: CategoryFormValues;
  onClose: () => void;
  onSubmit: (data: CategoryFormValues) => void;
  isLoading: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: initialValues ?? { name: '', color: DEFAULT_CATEGORY_COLOR },
  });

  const selectedColor = watch('color')?.toUpperCase();
  const previewName = watch('name')?.trim() || 'Pré-visualização';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 relative">
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{title}</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nome" placeholder="Ex.: Faculdade" {...register('name')} error={errors.name?.message} />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cor</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLOR_OPTIONS.map((option) => {
                const isSelected = selectedColor === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={isSelected}
                    title={option.label}
                    onClick={() => setValue('color', option.value, { shouldValidate: true })}
                    className="h-8 w-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-white dark:ring-offset-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{
                      backgroundColor: option.value,
                      boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${option.value}` : undefined,
                    }}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
            </div>
            {errors.color?.message && <span className="text-xs text-red-500">{errors.color.message}</span>}
          </fieldset>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Como vai aparecer:</span>
            <CategoryBadge name={previewName} color={selectedColor} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" isLoading={isLoading}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
