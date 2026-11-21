import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Projects', to: '/app/projects' },
  { label: 'Settings', to: '/app/settings' },
];

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-4">
        <span className="text-lg font-semibold">Craft</span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-700">
              {user.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {user.name}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
