import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { tasksControllerCreate, tasksControllerFindAll } from '../lib/api-client';
import { TasksPage } from './tasks-page';

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER' },
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

vi.mock('../lib/api-client', () => ({
  tasksControllerFindAll: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'task-1',
          title: 'Configurar CI/CD',
          description: 'Definir pipeline no GitHub Actions',
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: '2026-12-31T00:00:00.000Z',
          ownerId: 'usr-1',
          categoryId: 'cat-1',
          category: { id: 'cat-1', name: 'Faculdade', color: '#10B981' },
          createdAt: '2026-08-31T10:00:00.000Z',
          updatedAt: '2026-08-31T10:00:00.000Z',
        },
      ],
      meta: {
        page: 1,
        pageSize: 8,
        total: 1,
        totalPages: 1,
      },
    },
    status: 200,
    headers: new Headers(),
  }),
  tasksControllerCreate: vi.fn().mockResolvedValue({ data: {}, status: 201, headers: new Headers() }),
  tasksControllerUpdate: vi.fn(),
  tasksControllerRemove: vi.fn(),
  categoriesControllerFindAll: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'cat-1',
          name: 'Faculdade',
          color: '#10B981',
          ownerId: 'usr-1',
          taskCount: 1,
          createdAt: '2026-08-31T10:00:00.000Z',
          updatedAt: '2026-08-31T10:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    },
    status: 200,
    headers: new Headers(),
  }),
}));

function renderPage(initialEntry = '/tasks') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <TasksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TasksPage', () => {
  it('renders tasks page with loaded tasks', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Módulo de Referência: Tarefas')).toBeInTheDocument();
    expect(await screen.findByText('Configurar CI/CD')).toBeInTheDocument();
    expect(screen.getByText('Definir pipeline no GitHub Actions')).toBeInTheDocument();
    expect(screen.getAllByText('Alta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pendente').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the task category and filters by category from the URL', async () => {
    renderPage('/tasks?categoryId=cat-1');

    expect(await screen.findByTitle('Categoria: Faculdade')).toBeInTheDocument();
    expect(tasksControllerFindAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: 'cat-1' }),
    );

    const categoryFilter = screen.getByLabelText('Filtrar por categoria') as HTMLSelectElement;
    await waitFor(() => expect(categoryFilter.value).toBe('cat-1'));
  });

  it('sends the selected category when creating a task', async () => {
    renderPage();
    await screen.findByText('Configurar CI/CD');

    fireEvent.click(screen.getByRole('button', { name: /Nova Tarefa/ }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Lista de exercícios' } });
    const categorySelect = screen.getByLabelText('Categoria') as HTMLSelectElement;
    expect(within(categorySelect).getByRole('option', { name: 'Faculdade' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar Tarefa' }));

    await waitFor(() =>
      expect(tasksControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lista de exercícios', categoryId: 'cat-1' }),
      ),
    );
  });
});
