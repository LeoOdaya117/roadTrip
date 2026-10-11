describe('TKT-0005 route loading and back transitions', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
  });

  it('keeps the shell mounted and registers only the loaded route page', () => {
    cy.intercept('GET', '**/src/pages/AccountPage.tsx*', (request) => {
      request.continue((response) => response.setDelay(700));
    }).as('accountPageChunk');

    cy.visit('/home');
    cy.get('.crew-create-card').should('be.visible');
    cy.get('.route-navigation-item').contains('Profile').click();

    cy.get('.route-loading-state').should('be.visible').and('contain.text', 'Loading page');
    cy.get('.route-loading-overlay.ion-page').should('not.exist');
    cy.get('.route-navigation').should('be.visible');
    cy.wait('@accountPageChunk');
    cy.location('pathname').should('eq', '/account');
    cy.contains('.account-intro h1', 'Your profile').should('be.visible');
    cy.get('.route-navigation').should('be.visible');
    cy.get('@accountPageChunk.all').should('have.length', 1);
    cy.get('ion-router-outlet .ion-page:visible').should('have.length', 1);
  });

  it('returns to visible Home content after Account and Ride History back actions', () => {
    cy.visit('/home');
    cy.get('.crew-create-card').should('be.visible');

    cy.get('.route-navigation-item').contains('Profile').click();
    cy.location('pathname').should('eq', '/account');
    cy.contains('.account-intro h1', 'Your profile').should('be.visible');
    cy.get('ion-header.rt-app-header:visible ion-back-button').should('have.length', 1).click();
    cy.location('pathname').should('eq', '/home');
    cy.get('.crew-create-card').should('be.visible');

    cy.get('.route-navigation-item').contains('Rides').click();
    cy.location('pathname').should('eq', '/ride-history');
    cy.contains('.history-intro h1', 'Your rides').should('be.visible');
    cy.get('ion-header.rt-app-header:visible ion-back-button').should('have.length', 1).click();
    cy.location('pathname').should('eq', '/home');
    cy.get('.crew-create-card').should('be.visible');
  });

  it('does not leave a duplicate active-route entry for browser Back', () => {
    cy.visit('/home');
    cy.get('.route-navigation-item').contains('Profile').click();
    cy.location('pathname').should('eq', '/account');
    cy.contains('.account-intro h1', 'Your profile').should('be.visible');

    cy.get('.route-navigation-item-active').contains('Profile').click();
    cy.go('back');

    cy.location('pathname').should('eq', '/home');
    cy.get('.crew-create-card').should('be.visible');
  });

  it('keeps browser Back and Forward stable across the top-level tabs', () => {
    cy.visit('/home');
    cy.get('.crew-create-card').should('be.visible');

    cy.get('.route-navigation-item').contains('Profile').click();
    cy.location('pathname').should('eq', '/account');
    cy.contains('.account-intro h1', 'Your profile').should('be.visible');
    cy.get('.route-navigation-item').contains('Rides').click();
    cy.location('pathname').should('eq', '/ride-history');
    cy.contains('.history-intro h1', 'Your rides').should('be.visible');

    cy.go('back');
    cy.location('pathname').should('eq', '/account');
    cy.contains('.account-intro h1', 'Your profile').should('be.visible');
    cy.go('back');
    cy.location('pathname').should('eq', '/home');
    cy.get('.crew-create-card').should('be.visible');

    cy.go('forward');
    cy.location('pathname').should('eq', '/account');
    cy.contains('.account-intro h1', 'Your profile').should('be.visible');
    cy.go('forward');
    cy.location('pathname').should('eq', '/ride-history');
    cy.contains('.history-intro h1', 'Your rides').should('be.visible');
    cy.get('ion-router-outlet .ion-page:visible').should('have.length', 1);
  });

  it('returns to the current page when Back is pressed during a delayed route load', () => {
    cy.intercept('GET', '**/src/pages/AccountPage.tsx*', (request) => {
      request.continue((response) => response.setDelay(700));
    }).as('accountPageChunk');

    cy.visit('/home');
    cy.get('.crew-create-card').should('be.visible');
    cy.get('.route-navigation-item').contains('Profile').click();
    cy.get('.route-loading-state').should('be.visible');
    cy.go('back');
    cy.location('pathname').should('eq', '/home');
    cy.get('.crew-create-card').should('be.visible');
    cy.get('.route-loading-state').should('not.exist');
    cy.wait('@accountPageChunk');
    cy.location('pathname').should('eq', '/home');
    cy.get('ion-router-outlet .ion-page:visible').should('have.length', 1);
  });
});
