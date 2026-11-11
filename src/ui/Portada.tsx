import { t } from './textos'

export function Portada({ version }: { version: string }) {
  return (
    <>
      <main class="portada">
        <hgroup>
          <h1>{t('titulo')}</h1>
          <p>{t('lema')}</p>
        </hgroup>
        <button class="boton" type="button" disabled title={t('proximamente')}>
          {t('nuevaPartida')}
        </button>
      </main>
      <span class="version">v{version}</span>
    </>
  )
}
