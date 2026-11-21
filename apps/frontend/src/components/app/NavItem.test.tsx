import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavItem } from './NavItem';

describe('NavItem', () => {
  const mockIcon = <svg data-testid="test-icon" />;

  it('renders label and icon', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
      />
    );
    
    expect(screen.getByText('Templates')).toBeDefined();
    expect(screen.getByTestId('test-icon')).toBeDefined();
  });

  it('applies active state correctly', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        active={true}
      />
    );
    
    const link = screen.getByRole('link');
    expect(link.className).toContain('bg-secondary-container');
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('uses a valid border width class for the active indicator', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        active={true}
      />
    );

    const link = screen.getByRole('link');
    expect(link.className).toContain('border-l-4');
    expect(link.className).not.toContain('border-l-3');
  });

  it('shows badge when provided', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        badge={5}
      />
    );
    
    expect(screen.getByText('5')).toBeDefined();
  });

  it('shows 99+ for badges over 99', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        badge={150}
      />
    );
    
    expect(screen.getByText('99+')).toBeDefined();
  });

  it('disables interaction when disabled', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        disabled={true}
      />
    );
    
    const element = screen.getByText('Templates').closest('div');
    expect(element?.className).toContain('opacity-40');
    expect(element?.className).toContain('cursor-not-allowed');
  });

  it('exposes the disabled state to assistive technology', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        disabled={true}
      />
    );

    const element = screen.getByRole('link');
    expect(element.getAttribute('aria-disabled')).toBe('true');
    expect(element.getAttribute('tabindex')).toBe('-1');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        onClick={handleClick}
      />
    );
    
    fireEvent.click(screen.getByRole('link'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not render as link when disabled', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        disabled={true}
      />
    );
    
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders the disabled variant as a non-focusable link role', () => {
    render(
      <NavItem
        label="Templates"
        icon={mockIcon}
        path="/app/templates"
        disabled={true}
      />
    );

    const element = screen.getByText('Templates').closest('div');
    expect(element?.getAttribute('role')).toBe('link');
    expect(element?.getAttribute('aria-disabled')).toBe('true');
    expect(element?.getAttribute('tabindex')).toBe('-1');
  });
});
