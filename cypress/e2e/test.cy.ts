describe('RoadTrip shell', () => {
  it('opens the ride home and navigates to history', () => {
    cy.visit('/');

    cy.contains('ion-title', 'RoadTrip').should('be.visible');
    cy.contains('Start ride').should('be.visible');
    cy.contains('button', 'Rides').click();

    cy.url().should('include', '/ride-history');
    cy.contains('ion-title', 'Ride History').should('be.visible');
  });

  it('persists the selected appearance', () => {
    cy.visit('/home');
    cy.contains('button', 'Profile').click();
    cy.contains('button', 'Light').click();
    cy.get('html').should('have.attr', 'data-theme', 'light');
    cy.get('html').should('have.attr', 'data-theme-preference', 'light');

    cy.reload();

    cy.contains('button', 'Light').should('have.attr', 'aria-pressed', 'true');
    cy.contains('button', 'System').click();
    cy.get('html').should('have.attr', 'data-theme-preference', 'system');
  });
});
