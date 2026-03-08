describe('Trading Bot E2E Tests', () => {
  beforeEach(() => {
    cy.visit('/')
  })
  
  it('should load the dashboard', () => {
    cy.contains('Polymarket LLM Bot').should('be.visible')
    cy.contains('WALLET STATUS').should('be.visible')
    cy.contains('TRADING STATUS').should('be.visible')
  })
  
  it('should connect wallet', () => {
    cy.get('[data-testid="connect-wallet"]').click()
    cy.get('[data-testid="seed-phrase-input"]').type(Cypress.env('TEST_SEED_PHRASE'))
    cy.get('[data-testid="connect-button"]').click()
    cy.contains('Connected').should('be.visible')
  })
  
  it('should start trading', () => {
    cy.get('[data-testid="start-trading"]').click()
    cy.contains('ACTIVE').should('be.visible')
  })
  
  it('should display positions', () => {
    cy.get('[data-testid="positions-table"]').should('be.visible')
  })
  
  it('should show activity feed', () => {
    cy.get('[data-testid="activity-feed"]').should('be.visible')
  })
  
  it('should update settings', () => {
    cy.get('[data-testid="settings-button"]').click()
    cy.get('[data-testid="max-bet-input"]').clear().type('3')
    cy.get('[data-testid="save-settings"]').click()
    cy.contains('Settings saved').should('be.visible')
  })
})