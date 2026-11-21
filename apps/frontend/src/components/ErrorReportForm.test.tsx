import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorReportForm from './ErrorReportForm';

describe('ErrorReportForm', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
  });

  it('renders the form', () => {
    render(<ErrorReportForm onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked while idle and empty', () => {
    render(<ErrorReportForm onClose={onClose} />);
    fireEvent.click(screen.getByTestId('error-report-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores backdrop clicks while submitting', async () => {
    const submit = vi.fn(() => new Promise<void>(() => {}));
    render(<ErrorReportForm onClose={onClose} onSubmit={submit} />);

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Something broke' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('error-report-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('requires a second backdrop click when the description is non-empty', () => {
    render(<ErrorReportForm onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Unsent text' },
    });

    fireEvent.click(screen.getByTestId('error-report-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('error-report-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
