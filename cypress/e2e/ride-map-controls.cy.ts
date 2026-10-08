describe('ride map controls', () => {
  it('keeps ride actions reachable and sheet actions visible on a short phone viewport', () => {
    cy.viewport(360, 460);
    cy.visit('/ride-map/solo-map-controls-check');

    cy.get('.map-container').should('exist');
    cy.get('[aria-label="Zoom in"]').should('be.visible').click();
    cy.get('[aria-label="Zoom out"]').should('be.visible').click();
    cy.get('.bottom-sheet').should('have.class', 'is-collapsed');
    cy.get('.sheet-details').should('not.be.visible');
    cy.get('.sheet-handle').click();
    cy.get('.bottom-sheet').should('have.class', 'is-expanded');
    cy.contains('Quick Message').should('be.visible');
    cy.contains('button', 'End Ride').should('be.visible');

    cy.get('[aria-label="Change map style and details"]').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('.map-style-sheet-actions ion-button').should('be.visible').then(($button) => {
      const buttonBounds = $button[0].getBoundingClientRect();
      cy.window().then((appWindow) => {
        expect(buttonBounds.bottom).to.be.lessThan(appWindow.innerHeight);
      });
    });
    cy.contains('Map Type').should('be.visible');
    cy.get('[aria-label="Use location dot marker"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[aria-label="Use motorcycle marker"]').click().should('have.attr', 'aria-pressed', 'true');
    cy.window().its('localStorage.rt_map_marker_style').should('equal', 'motorcycle');
    cy.get('.map-style-sheet-actions ion-button').click();
    cy.get('[role="dialog"]').should('not.exist');

    cy.reload();
    cy.get('[aria-label="Change map style and details"]').click();
    cy.get('[aria-label="Use motorcycle marker"]').should('have.attr', 'aria-pressed', 'true');
  });
});
