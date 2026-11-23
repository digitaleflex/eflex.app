import { describe, expect, it } from 'vitest'
import { dnsInstruction, isLikelyApexDomain } from './custom-domain'

describe('consigne DNS adaptée au nom', () => {
  it('reconnaît les domaines racines et les sous-domaines', () => {
    for (const apex of ['exemple.com', 'exemple.fr', 'exemple.co.uk', 'exemple.com.bj', 'EXEMPLE.COM.']) {
      expect(isLikelyApexDomain(apex), apex).toBe(true)
    }
    for (const sub of ['app.exemple.com', 'www.exemple.fr', 'a.b.exemple.com', 'shop.exemple.co.uk']) {
      expect(isLikelyApexDomain(sub), sub).toBe(false)
    }
  })

  it('sous-domaine : CNAME recommandé, A en repli, avertissement Cloudflare', () => {
    const text = dnsInstruction('app.exemple.com', 'eflex.app')
    expect(text).toContain('CNAME « app.exemple.com » vers « eflex.app »')
    expect(text).toContain('enregistrement A')
    expect(text).toContain('Cloudflare')
  })

  it('racine : enregistrement A avec les adresses, AAAA seulement si indiquée, CNAME aplati en option', () => {
    const text = dnsInstruction('exemple.com', 'eflex.app', ['203.0.113.10'])
    expect(text).toContain('domaine racine')
    expect(text).toContain('enregistrement A vers 203.0.113.10')
    expect(text).toContain('AAAA seulement si')
    expect(text).toContain('CNAME aplati')
    expect(text).toContain('Cloudflare')
  })

  it('racine sans adresse connue : renvoie vers l’assistant DNS sans inventer d’adresse', () => {
    expect(dnsInstruction('exemple.com', 'eflex.app')).toContain('affichée dans l’assistant DNS')
  })
})
