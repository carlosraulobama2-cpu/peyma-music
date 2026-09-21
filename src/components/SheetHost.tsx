import { TrackOptionsSheet } from './TrackOptionsSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';

/** Monta los sheets globales de la app una sola vez, junto a `ToastHost`. */
export function SheetHost() {
  return (
    <>
      <TrackOptionsSheet />
      <AddToPlaylistSheet />
    </>
  );
}
