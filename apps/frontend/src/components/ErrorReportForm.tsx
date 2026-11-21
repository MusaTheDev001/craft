import { useState, useRef, useEffect, useCallback } from 'react';
import { X, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { useErrorReport } from '../hooks/useErrorReport';
import type { ErrorReportContext } from '../types/errorReport';

interface ErrorReportFormProps {
  isOpen: boolean;
  onClose: () => void;
  context?: ErrorReportContext;
}

export function ErrorReportForm({ isOpen, onClose, context }: ErrorReportFormProps) {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const { submitReport } = useErrorReport();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setStatus('idle');
      setErrorMessage(null);
      setConfirmClose(false);
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== backdropRef.current) return;
      if (status === 'submitting') return;
      if (description.trim().length > 0 && !confirmClose) {
        setConfirmClose(true);
        return;
      }
      onClose();
    },
    [status, description, confirmClose, onClose],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage(null);
    try {
      await submitReport({ description, context });
      setStatus('success');
      onClose();
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit error report');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 id="error-report-title" className="text-lg font-semibold text-gray-900">
              Report an Error
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'submitting'}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="error-description" className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="error-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setConfirmClose(false);
              }}
              disabled={status === 'submitting'}
              rows={5}
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="Describe what went wrong..."
            />
          </div>

          {confirmClose && (
            <p className="text-sm text-amber-600">
              You have unsent text. Click the backdrop again to discard it.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'submitting'}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === 'submitting' || description.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
