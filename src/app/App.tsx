import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors />
      </AppDataProvider>
    </AuthProvider>
  );
}