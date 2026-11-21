import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from './layout/Sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Sidebar user card', () => {
  it('does not render the user card as an interactive button', () => {
    render(<Sidebar />);

    const userCard = screen.getByTestId('sidebar-user-card');

    expect(userCard.tagName).not.toBe('BUTTON');
    expect(userCard).not.toHaveAttribute('role', 'button');
    expect(userCard).not.toHaveAttribute('tabindex');
  });

  it('does not present misleading pointer or hover affordances', () => {
    render(<Sidebar />);

    const userCard = screen.getByTestId('sidebar-user-card');

    expect(userCard.className).not.toMatch(/cursor-pointer/);
    expect(userCard.className).not.toMatch(/hover:bg-/);
  });
});
