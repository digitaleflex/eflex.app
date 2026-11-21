import { describe, expect, it } from 'vitest'
import { detectCatalogId, projectServiceName, projectServicePrefix } from '@/lib/project-coolify-services'

describe('detectCatalogId : propriété d’un service par projet', () => {
  it('reconnaît un service créé pour ce projet, avec ou sans suffixe tronqué', () => {
    const prefix = projectServicePrefix('boutique')
    expect(detectCatalogId(projectServiceName('boutique', 'minio'), prefix)).toBe('minio')
    expect(detectCatalogId(`${prefix}minio`, prefix)).toBe('minio')
    expect(detectCatalogId(`${prefix}minio-a1`, prefix)).toBe('minio')
  })

  it('ne confond pas deux projets dont l’un a un slug qui prolonge l’autre avec « -svc- »', () => {
    // Victime : projet « shop-svc-grafana » ; attaquant : projet « shop » (préfixe eflex-shop-svc-).
    const victimService = projectServiceName('shop-svc-grafana', 'minio')
    expect(victimService.startsWith(projectServicePrefix('shop'))).toBe(true) // le préfixe seul ne suffit pas
    expect(detectCatalogId(victimService, projectServicePrefix('shop'))).toBeNull()
  })

  it('ne reconnaît pas un nom inconnu ou un catalogue suivi de texte libre', () => {
    const prefix = projectServicePrefix('boutique')
    expect(detectCatalogId('autre-service', prefix)).toBeNull()
    expect(detectCatalogId(`${prefix}inconnu-ab12`, prefix)).toBeNull()
    expect(detectCatalogId(`${prefix}minio-ab12-extra`, prefix)).toBeNull()
    expect(detectCatalogId(`${prefix}minio-svc-grafana-ab12`, prefix)).toBeNull()
  })
})
