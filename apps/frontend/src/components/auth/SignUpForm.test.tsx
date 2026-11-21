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

  it('associates server errors with the inputs via aria-describedby and aria-invalid', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      status: 'error',
      message: 'Passwords do not match',
    });

    render(<SignUpForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'different123' },
    });

    fireEvent.submit(screen.getByRole('form'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/passwords do not match/i);
    expect(alert).toHaveAttribute('id');

    const errorId = alert.getAttribute('id');
    const password = screen.getByLabelText(/^password$/i);
    const confirmPassword = screen.getByLabelText(/confirm password/i);

    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-describedby', errorId);
    expect(confirmPassword).toHaveAttribute('aria-invalid', 'true');
    expect(confirmPassword).toHaveAttribute('aria-describedby', errorId);
  });
});
