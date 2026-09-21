import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { http } from '../services/httpClient';
import { useToastStore } from '../store';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../theme';

/**
 * Denunciar una canción desde la app.
 *
 * Los motivos se repiten aquí y en el backend: el backend es quien valida
 * (nunca se confía en el cliente) y esta lista es sólo la etiqueta visible.
 * Hay un endpoint que los sirve, pero pedirlos para abrir una hoja añadiría
 * una espera a cambio de nada — son siete valores que casi nunca cambian.
 */

const REASONS = [
  { value: 'PLAGIARISM', label: 'Plagio de otra obra', needsDetails: true },
  { value: 'COPYRIGHT', label: 'Soy el titular de los derechos', needsDetails: true },
  { value: 'EXPLICIT_CONTENT', label: 'Contenido explícito sin marcar', needsDetails: false },
  { value: 'HATE_SPEECH', label: 'Incitación al odio', needsDetails: false },
  { value: 'MISLEADING_METADATA', label: 'Título, artista o portada falsos', needsDetails: false },
  { value: 'LOW_QUALITY', label: 'El audio está roto', needsDetails: false },
  { value: 'OTHER', label: 'Otro motivo', needsDetails: true },
] as const;

const MIN_DETAILS = 10;

interface ReportTrackSheetProps {
  trackId: string;
  trackTitle: string;
  visible: boolean;
  onClose: () => void;
}

export function ReportTrackSheet({ trackId, trackTitle, visible, onClose }: ReportTrackSheetProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const showToast = useToastStore((s) => s.show);

  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('PLAGIARISM');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selected = REASONS.find((r) => r.value === reason)!;
  const detailsTooShort = selected.needsDetails && details.trim().length < MIN_DETAILS;

  const submit = async () => {
    setSubmitting(true);
    try {
      await http.post('/reports', { trackId, reason, details: details.trim() || undefined });
      showToast('Denuncia enviada. Un moderador la va a revisar.', 'success');
      setDetails('');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo enviar la denuncia.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Denunciar canción</Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {trackTitle}
      </Text>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {REASONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => setReason(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === option.value }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Ionicons
              name={reason === option.value ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={reason === option.value ? colors.brand[500] : colors.text.secondary}
            />
            <Text style={styles.rowLabel}>{option.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.fieldLabel}>
        Explicación {selected.needsDetails ? '(obligatoria)' : '(opcional)'}
      </Text>
      <TextInput
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={1500}
        placeholder={
          selected.needsDetails
            ? 'Decinos de qué obra se trata. Sin esto no se puede revisar.'
            : 'Cualquier detalle que ayude'
        }
        placeholderTextColor={colors.text.secondary}
        style={styles.input}
      />

      <View style={styles.actions}>
        <Pressable onPress={onClose} style={styles.cancelButton} accessibilityRole="button">
          <Text style={styles.cancelLabel}>Cancelar</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={submitting || detailsTooShort}
          accessibilityRole="button"
          style={[styles.submitButton, (submitting || detailsTooShort) && styles.submitDisabled]}
        >
          <Text style={styles.submitLabel}>{submitting ? 'Enviando…' : 'Enviar'}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 260,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowLabel: {
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    flex: 1,
  },
  fieldLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    backgroundColor: colors.surface[200],
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 72,
    textAlignVertical: 'top' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.surface[300],
  },
  cancelLabel: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  submitButton: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.error,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitLabel: {
    color: '#fff',
    fontFamily: typography.family.bold,
    fontSize: typography.size.base,
  },
});
