// Cypress E2E Support File
// Load type definitions
/// <reference types="cypress" />

// Custom commands
Cypress.Commands.add('login', (seedPhrase: string) => {
  cy.visit('/')
  cy.get('[data-testid="connect-wallet"]').click()
  cy.get('[data-testid="seed-phrase-input"]').type(seedPhrase)
  cy.get('[data-testid="connect-button"]').click()
  cy.contains('Connected').should('be.visible')
})

Cypress.Commands.add('startTrading', () => {
  cy.get('[data-testid="start-trading"]').click()
  cy.contains('ACTIVE').should('be.visible')
})

Cypress.Commands.add('stopTrading', () => {
  cy.get('[data-testid="stop-trading"]').click()
  cy.contains('STOPPED').should('be.visible')
})

declare global {
  namespace Cypress {
    interface Chainable {
      login(seedPhrase: string): Chainable<void>
      startTrading(): Chainable<void>
      stopTrading(): Chainable<void>
    }
  }
}

export {}