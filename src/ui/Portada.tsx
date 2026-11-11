import { t } from './textos'

export function Portada({ version, alJugar }: { version: string; alJugar: () => void }) {
  return (
    <>
      <main class="portada">
        <hgroup>
          <h1>{t('titulo')}</h1>
          <p>{t('lema')}</p>
        </hgroup>
        <button class="boton" type="button" onClick={alJugar}>
          {t('nuevaPartida')}
        </button>
      </main>
      <span class="version">v{version}</span>
    </>
  )
}
