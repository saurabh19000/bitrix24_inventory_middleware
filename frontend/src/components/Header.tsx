import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch {
      toast.error('Logout failed');
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-lg font-medium text-gray-900">Bitrix24 Inventory Middleware</h1>
      <div className="flex items-center gap-4">
        <div className="text-sm text-gray-700">
          <span className="font-medium">{user?.email}</span>
          <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {user?.role}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
