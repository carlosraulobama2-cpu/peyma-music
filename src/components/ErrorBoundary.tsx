/**
 * Peyma Music — Boundary de errores
 *
 * Sin esto, cualquier excepción en el árbol de React tumba la app entera
 * (pantalla en blanco/roja) sin forma de recuperarse. Se monta una vez en la
 * raíz: si una pantalla revienta, el resto de la app sigue viva y el usuario
 * puede reintentar sin forzar el cierre de la app.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles, spacing, typography, type Theme } from '../theme';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // En producción esto es el punto donde engancharías Sentry/Bugsnag.
    console.error('[ErrorBoundary] Excepción no controlada:', error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <Ionicons name="warning-outline" size={48} color={colors.semantic.error} />
      <Text style={styles.title}>Algo salió mal</Text>
      <Text style={styles.description}>
        Tuvimos un problema inesperado. Puedes intentarlo de nuevo.
      </Text>
      <Button title="Reintentar" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing['3xl'],
    backgroundColor: colors.surface[50],
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: 'center' as const,
  },
  button: {
    marginTop: spacing.xl,
  },
});
