"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/AuthProvider";
import { getAuthToken } from "../../../lib/httpClient";
import {
  fetchArtists,
  fetchMyArtistProfile,
  createArtistProfile,
  type ArtistSummary,
} from "../../../lib/artists";
import { uploadImageToBucket, describeRejection } from "../../../lib/avatarUpload";
import {
  AUDIO_ACCEPT,
  IMAGE_ACCEPT,
  withKnownType,
  describeAudioRejection,
  describeCoverRejection,
} from "../../../lib/fileTypes";
import { uploadTrack, UPLOAD_STEPS, type UploadStep } from "../../../lib/uploadPipeline";
import { fetchGenreCatalog, type GenreOption } from "../../../lib/genres";

/**
 * Subir una canción desde la web.
 *
 * Mismo flujo que la app y el panel: crear borrador, audio, portada,
 * análisis y envío a revisión. Termina en PENDING_REVIEW — nunca se
 * publica sola — y aparece en el panel para que un administrador la
 * apruebe.
 *
 * Antes esta pantalla ofrecía un desplegable con TODOS los artistas del
 * catálogo. Dos problemas: quien se registraba desde el navegador no tenía
 * forma de crear su propio perfil (la app sí la tenía y la web no), y
 * elegir un artista ajeno sin dueño se lo apropiaba en silencio. Cerrado lo
 * segundo en el backend, aquí se arregla lo primero: un creador sube a SU
 * perfil, y si no lo tiene lo crea en el momento.
 *
 * El desplegable sigue existiendo sólo para administradores, que sí pueden
 * publicar en nombre de cualquiera desde el panel.
 */

type Vista = "cargando" | "sin-perfil" | "listo";

/**
 * El archivo elegido en un `<input type="file">`, ya etiquetado.
 *
 * En Windows el navegador saca `file.type` del registro del sistema, que a
 * menudo no tiene entrada para .mp3 o .m4a. Sin esto, el servidor rechaza
 * un archivo correcto porque llega sin tipo o como octet-stream.
 */
function elegido(files: FileList | null): File | null {
  const file = files?.[0];
  return file ? withKnownType(file) : null;
}

/**
 * Comprueba el archivo al elegirlo y lo guarda sólo si vale.
 *
 * Lo que se rechaza aquí es lo mismo que rechazaría el servidor, pero al
 * instante y sin haber subido nada.
 */
function usarArchivo(
  files: FileList | null,
  validar: (file: File) => string | null,
  guardar: (file: File | null) => void,
  avisar: (mensaje: string | null) => void,
) {
  const file = elegido(files);
  if (!file) {
    guardar(null);
    return;
  }
  const rechazo = validar(file);
  if (rechazo) {
    avisar(rechazo);
    guardar(null);
    return;
  }
  avisar(null);
  guardar(file);
}

export default function UploadPage() {
  const router = useRouter();
  const { user, isLoading, refresh } = useAuth();
  const esAdmin = user?.role === "ADMIN";

  /**
   * La vista de un administrador es SIEMPRE "listo", así que se deriva en
   * vez de guardarse. Antes se ponía con un `setVista("listo")` dentro del
   * efecto, que además de disparar un render en cascada (lo avisa el
   * linter) obligaba a mantener sincronizado un estado que nunca tuvo más
   * de un valor posible para ese caso.
   */
  const [vistaCreador, setVistaCreador] = useState<Vista>("cargando");
  const vista: Vista = esAdmin ? "listo" : vistaCreador;
  const [miArtista, setMiArtista] = useState<ArtistSummary | null>(null);
  const [artistas, setArtistas] = useState<ArtistSummary[]>([]);
  const [artistId, setArtistId] = useState("");

  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [genreId, setGenreId] = useState("");
  const [generos, setGeneros] = useState<GenreOption[]>([]);
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /**
   * Vacía los dos campos de archivo tras publicar.
   *
   * Un `<input type="file">` no es controlado: poner el estado a null no
   * borra lo que el navegador enseña, así que al terminar seguía leyéndose
   * "cancion.mp3" junto a un botón desactivado, como si la subida no
   * hubiera ido. Cambiar la `key` los reemplaza por campos nuevos.
   */
  const [tandaArchivos, setTandaArchivos] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  /**
   * Cadena de promesas en vez de `async/await`.
   *
   * El estado se toca dentro de los callbacks de `.then`/`.catch`, que es
   * la forma que `react-hooks/set-state-in-effect` considera correcta:
   * reaccionar a un sistema externo cuando responde. Con `await`, el
   * linter ve una función que llama a `setState` invocada directamente en
   * el efecto y la marca como render en cascada.
   *
   * Devuelve la promesa para que quien la llame pueda esperarla (lo hace
   * `onCreado`, que recarga el perfil recién creado).
   */
  const cargarPerfil = useCallback(
    () =>
      fetchMyArtistProfile()
        .then((propio) => {
          setMiArtista(propio);
          if (propio) setArtistId(propio.id);
          setVistaCreador(propio ? "listo" : "sin-perfil");
        })
        .catch(() => {
          setError("No se pudo comprobar tu perfil de artista.");
          setVistaCreador("sin-perfil");
        }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    // Un administrador publica en nombre de cualquiera, así que necesita la
    // lista; un creador normal no la ve nunca.
    if (esAdmin) {
      fetchArtists()
        .then(setArtistas)
        .catch(() => setError("No se pudieron cargar los artistas."));
      return;
    }
    void cargarPerfil();
  }, [user, esAdmin, cargarPerfil]);

  useEffect(() => {
    // Un fallo aquí no bloquea la subida: el ritmo es opcional, así que el
    // desplegable se queda sólo con "Sin especificar" en vez de plantarle un
    // error a alguien que venía a publicar una canción.
    fetchGenreCatalog()
      .then(setGeneros)
      .catch(() => setGeneros([]));
  }, []);

  const busy = step !== null;
  const canSubmit = Boolean(artistId && title.trim() && audio && cover) && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !audio || !cover) return;

    setError(null);
    setDone(null);
    try {
      const track = await uploadTrack({
        artistId,
        title: title.trim(),
        audio,
        cover,
        lyrics,
        genreId: genreId || null,
        token: getAuthToken(),
        onStep: setStep,
      });
      setDone(track.title);
      setTitle("");
      setLyrics("");
      setGenreId("");
      setAudio(null);
      setCover(null);
      setTandaArchivos((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la canción.");
    } finally {
      setStep(null);
    }
  };

  if (isLoading || !user || vista === "cargando") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  if (vista === "sin-perfil") {
    return (
      <CrearPerfilArtista
        onCreado={async () => {
          // El backend promovió la cuenta a ARTIST en la misma operación:
          // sin refrescar la sesión, la interfaz seguiría tratándola como
          // oyente hasta recargar la página a mano.
          await refresh();
          await cargarPerfil();
        }}
      />
    );
  }

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Subir una canción</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Tu canción pasa por el análisis de audio y queda esperando la aprobación de un moderador. No se publica sola.
      </p>

      <form onSubmit={submit} className="mt-8 flex max-w-xl flex-col gap-5">
        {esAdmin ? (
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Artista
            <select
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
              required
              className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
            >
              <option value="">Elegí un artista…</option>
              {artistas.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted">
              Como administrador podés publicar en nombre de cualquiera. No te apropia el perfil.
            </span>
          </label>
        ) : (
          // Sin desplegable: el artista es el suyo y no hay nada que elegir.
          // Se muestra igualmente para que quede claro a nombre de quién sale.
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-extrabold text-brand">
              {miArtista?.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">Publicás como</p>
              <p className="truncate text-sm font-bold">{miArtista?.name}</p>
            </div>
          </div>
        )}

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Título
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Nombre de la canción"
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>

        {/*
          El género lo elige quien sube, y puede dejarlo en blanco.

          Antes no se preguntaba: lo ponía el "analizador" cogiendo uno de
          ocho al azar, así que un tema de trap podía publicarse como lofi.
          Ahora la lista sale de la tabla que se cura desde Ritmos en el
          panel, o sea que añadir Afrobeat o Rap es un alta ahí y aparece
          aquí sola, sin tocar código ni migrar la base.
        */}
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Ritmo <span className="font-normal opacity-60">(opcional)</span>
          <select
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          >
            <option value="">Sin especificar</option>
            {generos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {/*
          Opcional a propósito: obligar a pegar la letra aquí frenaría la
          subida de instrumentales y de todo lo que no la tiene. El límite de
          20.000 caracteres es el mismo que valida el servidor, así que quien
          se pase se entera escribiendo y no al enviar.
        */}
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Letra <span className="font-normal opacity-60">(opcional)</span>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={8}
            maxLength={20000}
            placeholder="Pega aquí la letra, un verso por línea."
            className="resize-y rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
          <span className="text-xs font-normal opacity-60">
            {lyrics.trim() ? `${lyrics.length} de 20.000 caracteres` : "Se puede añadir más tarde."}
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Audio (.mp3, .wav, .m4a, .ogg, .flac)
          <input
            key={`audio-${tandaArchivos}`}
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={(e) => usarArchivo(e.target.files, describeAudioRejection, setAudio, setError)}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Portada (.jpg, .png, .webp)
          <input
            key={`portada-${tandaArchivos}`}
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(e) => usarArchivo(e.target.files, describeCoverRejection, setCover, setError)}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {busy && (
          <ol className="flex flex-col gap-1.5 rounded-lg bg-surface p-4 text-sm">
            {UPLOAD_STEPS.map((label, index) => (
              <li
                key={label}
                className={index < step! ? "text-brand" : index === step ? "font-semibold" : "text-muted"}
              >
                {index < step! ? "✓" : index === step ? "→" : "·"} {label}
              </li>
            ))}
          </ol>
        )}

        {done && (
          <div className="rounded-lg bg-brand/10 px-4 py-3 text-sm ring-1 ring-inset ring-brand/30">
            <p className="font-semibold text-brand">&ldquo;{done}&rdquo; se envió a revisión</p>
            <p className="mt-1 text-muted">
              Un moderador la va a escuchar y aprobar. Te avisamos cuando esté publicada.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy ? "Subiendo…" : "Enviar a revisión"}
        </button>
      </form>
    </main>
  );
}

/**
 * Alta del perfil de artista, dentro de la propia pantalla de subida.
 *
 * En su sitio y no en una página aparte porque el único momento en que
 * hace falta es justo este: alguien que quiere publicar y todavía no tiene
 * perfil. Mandarlo a otra ruta y hacerlo volver añade dos pasos a un
 * trámite que se resuelve con un nombre.
 */
function CrearPerfilArtista({ onCreado }: { onCreado: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegirFoto = (file: File | null) => {
    setError(null);
    if (!file) {
      setFoto(null);
      setVistaPrevia(null);
      return;
    }
    // Se valida antes de subir nada: decirle a alguien que su foto de 12 MB
    // no vale después de esperar la subida es la peor versión de este flujo.
    const rechazo = describeRejection(file);
    if (rechazo) {
      setError(rechazo);
      return;
    }
    setFoto(file);
    setVistaPrevia(URL.createObjectURL(file));
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 1 || !foto) return;

    setEnviando(true);
    setError(null);
    try {
      // La imagen va primero: el backend exige `imageUrl` al crear, así que
      // si la subida falla no llega a crearse un perfil a medias.
      const imageUrl = await uploadImageToBucket(foto);
      await createArtistProfile({
        name: name.trim(),
        imageUrl,
        ...(bio.trim() ? { bio: bio.trim() } : {}),
      });
      await onCreado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear tu perfil de artista.");
      setEnviando(false);
    }
  };

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Creá tu perfil de artista</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Antes de publicar necesitás un perfil a tu nombre. Es el que verá la gente junto a tus canciones, y podés
        cambiarlo después.
      </p>

      <form onSubmit={enviar} className="mt-8 flex max-w-xl flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Nombre artístico
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="Cómo querés que te vean"
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Foto del artista (.jpg, .png, .webp)
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(e) => elegirFoto(elegido(e.target.files))}
            required
            className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
          <span className="text-xs font-normal text-muted">
            Es la foto del artista, no la de tu cuenta: podés llamarte de una forma y tu proyecto de otra.
          </span>
        </label>

        {vistaPrevia && (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por el optimizador */}
            <img src={vistaPrevia} alt="Vista previa de la foto" className="size-20 rounded-full object-cover" />
            <p className="text-sm font-bold">{name.trim() || "Tu nombre artístico"}</p>
          </div>
        )}

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Bio <span className="font-normal text-muted">(opcional)</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="De dónde sos, qué hacés, con quién tocás…"
            className="resize-y rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none focus:border-brand"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || name.trim().length === 0 || !foto}
          className="mt-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {enviando ? "Creando tu perfil…" : "Crear perfil y seguir"}
        </button>

        <p className="text-xs leading-relaxed text-muted">
          ¿Ya existe tu artista en el catálogo porque alguien importó tu música? No lo reclames creando uno nuevo:
          escribinos y un administrador te asigna el perfil original con todas tus reproducciones.
        </p>
      </form>
    </main>
  );
}
