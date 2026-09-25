import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { RequireAdminRoute } from './routes/RequireAdminRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ModerationDashboardPage } from './pages/ModerationDashboardPage';
import { ArtistsPage } from './pages/ArtistsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';
import { UploadPage } from './pages/UploadPage';
import { JobsPage } from './pages/JobsPage';
import { EditorialPage } from './pages/EditorialPage';
import { UsersPage } from './pages/UsersPage';
import { TrendingPage } from './pages/TrendingPage';
import { AudiencePage } from './pages/AudiencePage';
import { PlaylistsPage } from './pages/PlaylistsPage';
import { PlaylistDetailPage } from './pages/PlaylistDetailPage';
import { GenresPage } from './pages/GenresPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { VerificationPage } from './pages/VerificationPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { ExportPage } from './pages/ExportPage';

/**
 * Las secciones del panel están declaradas en `lib/navigation.ts`
 * (`NAV_SECTIONS`), no acá — `AdminShell` sólo las importa, igual que este
 * archivo. Al añadir una sección hay que tocar los dos sitios: esa lista de
 * navegación y esta tabla de rutas.
 */
const PROTECTED_ROUTES = [
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/moderation', element: <ModerationDashboardPage /> },
  { path: '/reports', element: <ReportsPage /> },
  { path: '/artists', element: <ArtistsPage /> },
  // Ficha individual. No va en NAV_SECTIONS: se llega pulsando un artista,
  // no desde el menú.
  { path: '/artists/:id', element: <ArtistDetailPage /> },
  { path: '/verification', element: <VerificationPage /> },
  { path: '/trending', element: <TrendingPage /> },
  { path: '/audience', element: <AudiencePage /> },
  { path: '/editorial', element: <EditorialPage /> },
  { path: '/playlists', element: <PlaylistsPage /> },
  { path: '/playlists/:id', element: <PlaylistDetailPage /> },
  { path: '/genres', element: <GenresPage /> },
  { path: '/users', element: <UsersPage /> },
  { path: '/upload', element: <UploadPage /> },
  { path: '/jobs', element: <JobsPage /> },
  { path: '/system', element: <SystemStatusPage /> },
  { path: '/audit', element: <AuditLogPage /> },
  { path: '/export', element: <ExportPage /> },
  { path: '/settings', element: <SettingsPage /> },
] as const;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {PROTECTED_ROUTES.map(({ path, element }) => (
            <Route key={path} path={path} element={<RequireAdminRoute>{element}</RequireAdminRoute>} />
          ))}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
