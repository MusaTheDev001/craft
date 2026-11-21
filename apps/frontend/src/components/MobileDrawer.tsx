import { useEffect } from 'react';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function MobileDrawer({ isOpen, onClose, onSignOut, children }: MobileDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSignOut = () => {
    onSignOut();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0 invisible'
      }`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <nav
        className={`absolute left-0 top-0 h-full w-72 max-w-[80%] bg-white shadow-xl flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <span className="text-lg font-semibold">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        <div className="border-t p-4">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-md px-4 py-2 text-left text-red-600 hover:bg-red-50"
          >
            Log Out
          </button>
        </div>
      </nav>
    </div>
  );
}
