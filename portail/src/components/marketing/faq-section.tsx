import Link from 'next/link'

type FaqItem = {
  question: string
  answer: string
}

function buildFaqs(): FaqItem[] {
  return [
    {
      question: 'Quels frameworks et langages sont compatibles ?',
      answer:
        'EFLEX prend en charge notamment Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node.js, PHP, Python et les sites HTML statiques. Laravel est reconnu. Un Dockerfile ou un fichier docker-compose.yml existant peut aussi être utilisé tel quel.',
    },
    {
      question: 'Dois-je posséder un serveur ?',
      answer:
        'Non. EFLEX construit et met en ligne votre application sur son infrastructure. Vous n’avez pas besoin d’administrer un serveur pour déployer un projet compatible.',
    },
    {
      question: 'Comment fonctionne le déploiement depuis GitHub ?',
      answer:
        'Vous connectez votre compte GitHub, sélectionnez un dépôt et lancez un déploiement. EFLEX analyse le projet, propose une configuration, construit l’application puis la met en ligne. Les déploiements suivants peuvent être relancés depuis la console.',
    },
    {
      question: 'Puis-je connecter mon propre domaine ?',
      answer:
        'Oui, selon la configuration de votre projet. Vous pouvez ajouter un domaine personnalisé depuis les paramètres du projet, puis vérifier la configuration DNS demandée par EFLEX. Les certificats HTTPS sont gérés automatiquement pour les domaines pris en charge.',
    },
    {
      question: 'Que se passe-t-il lorsqu’un déploiement échoue ?',
      answer:
        'Le déploiement est marqué comme échoué et vous pouvez consulter les journaux pour identifier la cause. L’application déjà en ligne reste disponible tant qu’un nouveau déploiement réussi ne la remplace pas.',
    },
    {
      question: 'Les sauvegardes de bases de données sont-elles automatiques ?',
      answer:
        'Les sauvegardes automatiques concernent uniquement les bases PostgreSQL gérées, lorsqu’elles sont planifiées. Coolify ne sauvegarde pas Redis. Une copie hors serveur dépend de la configuration de stockage S3 disponible. La restauration doit toujours être vérifiée avant d’être considérée comme fiable.',
    },
    {
      question: 'Un volume Docker remplace-t-il une sauvegarde ?',
      answer:
        'Non. Un volume conserve des données sur le disque, mais ce n’est pas une sauvegarde. Pour protéger des données importantes, il faut une sauvegarde distincte, idéalement copiée hors du serveur.',
    },
    {
      question: 'Puis-je déployer une application multi-services ?',
      answer:
        'Oui, si votre dépôt fournit un fichier docker-compose.yml ou compose.yml compatible. En revanche, un plan généré par EFLEX qui demanderait plusieurs services sans compose fourni dans le dépôt est refusé avec un message explicite.',
    },
  ]
}

export function FaqSection({ contactEmail }: { contactEmail: string }) {
  const faqs = buildFaqs()

  return (
    <section
      id="questions"
      aria-labelledby="questions-titre"
      className="scroll-mt-20 border-t border-border bg-muted/25 py-16 md:py-24"
    >
      <div className="container">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          <div className="space-y-6">
            <div className="max-w-3xl space-y-4">
              <h2 id="questions-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Des questions avant de commencer ?
              </h2>
              <p className="max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                Retrouvez les réponses aux questions fréquentes sur le déploiement, les domaines, les sauvegardes et les limites importantes à connaître.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold text-foreground">Besoin d’une réponse précise ?</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Consultez la documentation ou contactez l’équipe EFLEX pour une question liée à votre projet.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/docs"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors duration-200 ease-out-expo hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Voir la documentation
                </Link>
                <a
                  href={`mailto:${contactEmail}?subject=Question%20sur%20EFLEX`}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary transition-colors duration-200 ease-out-expo hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Contacter le support
                </a>
              </div>
            </div>
          </div>

          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {faqs.map((item) => (
              <details key={item.question} className="group px-5 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-left text-base font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-balance">{item.question}</span>
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform duration-200 ease-out-expo group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-muted-foreground sm:text-base">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
