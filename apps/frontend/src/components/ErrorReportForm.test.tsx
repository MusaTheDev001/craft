import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorReportForm from './ErrorReportForm';

describe('ErrorReportForm', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    vi.restoreAllMocks();
  });

  it('renders the form', () => {
    render(<ErrorReportForm onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the form fields', () => {
    render(<ErrorReportForm onClose={onClose} />);
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
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

  it('hides the success emoji from screen readers', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    render(<ErrorReportForm onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Something broke' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const emoji = await screen.findByText('✅');
    expect(emoji).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides the close glyph from screen readers while keeping the button label', () => {
    render(<ErrorReportForm onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toHaveAttribute('aria-label');

    const glyph = closeButton.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveTextContent('✕');
  });
});
