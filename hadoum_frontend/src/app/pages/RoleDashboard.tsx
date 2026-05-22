import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { DirectorDashboard } from './DirectorDashboard';
import { EducatorDashboard } from './EducatorDashboard';
import { SupervisorDashboard } from './SupervisorDashboard';
import { BoardDashboard } from './BoardDashboard';

export function RoleDashboard() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  switch (user.role) {
    case 'director':
      return <DirectorDashboard />;
    case 'educator':
      return <EducatorDashboard />;
    case 'supervisor':
      return <SupervisorDashboard />;
    case 'board':
      return <BoardDashboard />;
    default:
      return <Navigate to="/login" replace />;
  }
}
