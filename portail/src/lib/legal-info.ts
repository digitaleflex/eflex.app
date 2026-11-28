/**
 * Informations légales de l'éditeur EFLEX.
 * Valeurs fournies par l'exploitant ; les champs entre crochets restent à compléter.
 * Les variables d'environnement permettent de surcharger certaines valeurs (facturation).
 */
export function getLegalCompanyInfo() {
  return {
    name: process.env.INVOICE_COMPANY_NAME?.trim() || 'EFLEX',
    legalForm: 'Entreprise individuelle',
    publisher: "M. Eurin d'ALMEIDA",
    publicationDirector: "M. Eurin d'ALMEIDA",
    rccm: 'RB/ABC/24 A 100826 (Tribunal de commerce de Cotonou, 17/01/2024)',
    ifu: '0202374050989',
    address:
      process.env.INVOICE_COMPANY_ADDRESS?.trim() ||
      'Îlot 12, parcelle b, Ayimevo, Godomey, Abomey-Calavi, Bénin',
    phone: '',
    email: process.env.INVOICE_COMPANY_EMAIL?.trim() || 'admin@eflex.app',
    taxId: process.env.INVOICE_TAX_ID?.trim() || '0202374050989',
    jurisdiction: 'tribunaux compétents de Cotonou',
    applicableLaw: 'droit béninois',
    dataProtectionLaw: 'loi n° 2017-20 portant Code du numérique',
    dataAuthority: 'APDP (Bénin)',
  }
}
