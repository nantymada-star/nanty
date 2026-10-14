import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { PageHeader, StatusBadge } from '../components/ui'

export default function Privacy() {
  const { t, lang } = useT()
  const mg = lang === 'mg'
  const items: [string, string][] = mg
    ? [
        ['shield', 'Fifandraisana voaaro (HTTPS) amin\'ny loharano rehetra.'],
        ['user', "Tsy misy kaonty na angona manokana alefa any amin'ny mpizara: ato amin'ny findainao ihany no voatahiry ny anaranao, ny ankafizinao ary ny kajinao."],
        ['gps', "Ny toerana misy anao dia ampiasaina rehefa manaiky ianao ihany, ary tsy alefa raha tsy hikajiana lalana (OSRM) na hitadiavana fivarotana (OpenStreetMap)."],
        ['download', 'Azonao haondrana na fafana amin\'ny fotoana rehetra ny angonao (Mombamomba).'],
        ['x', 'Tsy misy angona amidy, tsy misy dokam-barotra, tsy misy fanaraha-maso.'],
      ]
    : [
        ['shield', 'Connexions chiffrées (HTTPS) vers toutes les sources.'],
        ['user', 'Aucun compte ni donnée personnelle envoyés à un serveur : nom, favoris et simulations restent sur votre téléphone.'],
        ['gps', 'Votre position n’est utilisée qu’avec votre accord, et n’est transmise que pour calculer un itinéraire (OSRM) ou chercher des commerces (OpenStreetMap).'],
        ['download', 'Vous pouvez exporter ou effacer vos données à tout moment (Profil).'],
        ['x', 'Aucune donnée vendue, aucune publicité, aucun traceur.'],
      ]
  return (
    <div className="stack">
      <PageHeader title={`${t('privacy')} · ${t('help')}`} />
      <div className="card">
        <ul className="list">
          {items.map(([ic, txt]) => <li key={txt} className="row" style={{ alignItems: 'flex-start' }}><span style={{ color: 'var(--green2)' }}><Icon name={ic} /></span><span>{txt}</span></li>)}
        </ul>
      </div>
      <div className="card stack">
        <h2>{mg ? 'Ny dikan\'ny marika' : 'Légende des statuts'}</h2>
        {([['verified', 'stVerifiedHelp'], ['declared', 'stDeclaredHelp'], ['pending', 'stDeclaredHelp'], ['stale', 'stStaleHelp'], ['estimated', 'stEstimatedHelp']] as const).map(([k, h]) => (
          <div key={k} className="row"><StatusBadge status={k} /> <small>{t(h)}</small></div>
        ))}
      </div>
      <div className="card stack">
        <h2>{t('sources')}</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><a href="https://data.humdata.org/dataset/wfp-food-prices-for-madagascar" target="_blank" rel="noreferrer">WFP — Madagascar Food Prices (HDX)</a> · <a href="https://hapi.humdata.org/docs" target="_blank" rel="noreferrer">HDX HAPI</a></li>
          <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a> — {mg ? 'sarintany, fivarotana, toerana' : 'carte, commerces, lieux'}</li>
          <li><a href="https://project-osrm.org" target="_blank" rel="noreferrer">OSRM</a> — {mg ? 'lalana (serveur fanandramana, tsy misy antoka)' : 'itinéraires (serveur de démonstration, sans garantie)'}</li>
          <li><a href="https://fews.net/southern-africa/madagascar" target="_blank" rel="noreferrer">FEWS NET</a>, <a href="https://www.fao.org/giews/countrybrief/country.jsp?code=MDG" target="_blank" rel="noreferrer">FAO GIEWS</a> — {mg ? 'tetiandron\'ny fambolena' : 'calendrier agricole'}</li>
        </ul>
        <small>{t('demoNone')}</small>
      </div>
      <div className="card stack">
        <h2>{t('help')}</h2>
        <p style={{ margin: 0 }}>
          {mg
            ? "Isam-bolana no mamoaka vidiny ny WFP ho an'ny tsena maromaro eto Madagasikara. Manamarina ho azy ny loharano ny MadaPrice rehefa misokatra ny app, ary mampiseho ny vidiny vaovao avy hatrany tsy mila mamerina ny pejy. Raha tsy misy vidiny ho an'ny toerana iray dia tsy mamorona vidiny izahay: andramo ny tsena akaiky indrindra na antsoy ny fivarotana."
            : "Le WFP publie des prix (généralement mensuels) pour de nombreux marchés de Madagascar. MadaPrice vérifie automatiquement la source quand l'app est ouverte et affiche les nouveaux prix sans recharger la page. Sans prix pour un lieu, nous n'inventons rien : consultez le marché le plus proche ou appelez le commerce."}
        </p>
      </div>
    </div>
  )
}
