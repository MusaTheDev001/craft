import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SignUpForm from './SignUpForm';

describe('SignUpForm', () => {
  it('renders the sign-up form fields', () => {
    render(<SignUpForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('exposes a keyboard-focusable password visibility toggle with aria-pressed', () => {
    render(<SignUpForm onSubmit={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /show password/i });

    expect(toggle).not.toHaveAttribute('tabindex', '-1');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    toggle.focus();
    expect(toggle).toHaveFocus();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'text');
  });
});
