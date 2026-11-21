import { useState } from 'react';

interface ErrorReportFormProps {
  onSubmit?: (message: string) => Promise<void> | void;
}

export function ErrorReportForm({ onSubmit }: ErrorReportFormProps) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;

    setStatus('submitting');
    try {
      await onSubmit?.(message);
      setStatus('success');
      setMessage('');
    } catch {
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Error report form">
      <label htmlFor="error-report-message">Describe the error</label>
      <textarea
        id="error-report-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
      />
      <button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Send report'}
      </button>
      {status === 'success' && (
        <p role="status">
          <span aria-hidden="true">✅</span> Report sent successfully.
        </p>
      )}
      {status === 'error' && (
        <p role="alert">
          <span aria-hidden="true">✕</span> Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}
