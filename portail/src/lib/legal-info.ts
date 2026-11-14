/**
 * Informations d'éditeur réutilisées pour les mentions légales et la facturation.
 * Source : variables d'environnement (mêmes que `lib/invoices.ts`) — aucune valeur inventée.
 */
export function getLegalCompanyInfo() {
  return {
    name: process.env.INVOICE_COMPANY_NAME?.trim() || 'EFLEX',
    address: process.env.INVOICE_COMPANY_ADDRESS?.trim() || '',
    email: process.env.INVOICE_COMPANY_EMAIL?.trim() || 'admin@eflex.app',
    taxId: process.env.INVOICE_TAX_ID?.trim() || '',
  }
}
