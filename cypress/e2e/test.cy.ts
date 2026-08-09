describe('RoadTrip shell', () => {
  it('opens the ride home and navigates to history', () => {
    cy.visit('/');

    cy.contains('ion-title', 'RoadTrip').should('be.visible');
    cy.contains('Start ride').should('be.visible');
    cy.contains('button', 'View ride history').click();

    cy.url().should('include', '/ride-history');
    cy.contains('ion-title', 'Ride History').should('be.visible');
  });
});
