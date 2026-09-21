import { AppShell } from "../../components/AppShell";

/**
 * Layout del grupo de rutas autenticadas. Es un route group `(app)`: los
 * paréntesis hacen que NO aparezca en la URL, así `/dashboard`, `/search`,
 * `/library`, `/artists/:id` y `/playlists/:id` siguen igual que antes pero
 * comparten un único shell en vez de repetir el header en cada página.
 */
export default function AppGroupLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
