import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorReportForm from './ErrorReportForm';

describe('ErrorReportForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the form fields', () => {
    render(<ErrorReportForm />);
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('hides the success emoji from screen readers', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    render(<ErrorReportForm />);
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Something broke' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const emoji = await screen.findByText('✅');
    expect(emoji).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides the close glyph from screen readers while keeping the button label', () => {
    render(<ErrorReportForm />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toHaveAttribute('aria-label');

    const glyph = closeButton.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveTextContent('✕');
  });
});
