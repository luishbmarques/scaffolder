import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { categoriesControllerCreate } from '../lib/api-client';
import { CategoriesPage } from './categories-page';

vi.mock('../lib/api-client', () => ({
  categoriesControllerFindAll: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'cat-1',
          name: 'Faculdade',
          color: '#10B981',
          ownerId: 'usr-1',
          taskCount: 3,
          createdAt: '2026-08-31T10:00:00.000Z',
          updatedAt: '2026-08-31T10:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    },
    status: 200,
    headers: new Headers(),
  }),
  categoriesControllerCreate: vi.fn().mockResolvedValue({
    data: {
      id: 'cat-2',
      name: 'Trabalho',
      color: '#F59E0B',
      ownerId: 'usr-1',
      taskCount: 0,
      createdAt: '2026-08-31T10:00:00.000Z',
      updatedAt: '2026-08-31T10:00:00.000Z',
    },
    status: 201,
    headers: new Headers(),
  }),
  categoriesControllerUpdate: vi.fn(),
  categoriesControllerRemove: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CategoriesPage', () => {
  it('lists categories with their task count and a link to the filtered tasks', async () => {
    renderPage();

    expect(screen.getByText('Categorias de Tarefas')).toBeInTheDocument();
    expect(await screen.findByText('Faculdade')).toBeInTheDocument();
    expect(screen.getByText('3 tarefas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver tarefas/ })).toHaveAttribute('href', '/tasks?categoryId=cat-1');
  });

  it('validates the name before creating a category', async () => {
    renderPage();
    await screen.findByText('Faculdade');

    fireEvent.click(screen.getByRole('button', { name: /Nova Categoria/ }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar Categoria' }));

    expect(await screen.findByText('O nome deve ter no mínimo 2 caracteres.')).toBeInTheDocument();
    expect(categoriesControllerCreate).not.toHaveBeenCalled();
  });

  it('creates a category with the chosen color', async () => {
    renderPage();
    await screen.findByText('Faculdade');

    fireEvent.click(screen.getByRole('button', { name: /Nova Categoria/ }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Trabalho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Âmbar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar Categoria' }));

    await waitFor(() =>
      expect(categoriesControllerCreate).toHaveBeenCalledWith({ name: 'Trabalho', color: '#F59E0B' }),
    );
    expect(await screen.findByText('Categoria "Trabalho" criada com sucesso!')).toBeInTheDocument();
  });
});
