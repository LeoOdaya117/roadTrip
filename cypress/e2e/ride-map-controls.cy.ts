describe('ride map controls', () => {
  it('keeps the live-map rail, metrics, and ride actions visible across sizes and themes', () => {
    const viewportCases = [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1280, height: 800 },
    ];
    const themes = ['system', 'light', 'dark'];

    themes.forEach((theme) => viewportCases.forEach(({ width, height }) => {
      cy.viewport(width, height);
      cy.visit('/ride-map/solo-map-controls-matrix', {
        onBeforeLoad: (win) => win.localStorage.setItem('roadtrip:theme-preference', theme),
      });
      cy.get('html').should('have.attr', 'data-theme-preference', theme);
      cy.get('.bottom-sheet').should('have.class', 'is-collapsed');
      cy.get('.bottom-sheet .s-label').should('have.length', 4).each(($label) => {
        expect(Number.parseFloat(getComputedStyle($label[0]).fontSize)).to.be.at.least(11);
      });

      ['[data-ride-action="pause-resume"]', '[data-ride-action="end"]'].forEach((selector) => {
        cy.get(selector).should('be.visible').then(($button) => {
          const bounds = $button[0].getBoundingClientRect();
          expect(bounds.top).to.be.at.least(0);
          expect(bounds.bottom).to.be.at.most(height);
          cy.window().then((win) => {
            const hit = win.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            expect(hit === $button[0] || $button[0].contains(hit)).to.equal(true);
          });
        });
      });
      cy.get('.map-fabs').should('be.visible').then(($rail) => {
        const bounds = $rail[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(width);
        expect(bounds.top).to.be.at.least(0);
        expect(bounds.bottom).to.be.at.most(height);
      });
    }));
  });

  it('keeps ride actions reachable and sheet actions visible on a short phone viewport', () => {
    cy.viewport(360, 460);
    cy.visit('/ride-map/solo-map-controls-check');

    cy.get('.map-container').should('exist');
    cy.get('[aria-label="Zoom in"]').should('be.visible').click();
    cy.get('[aria-label="Zoom out"]').should('be.visible').click();
    cy.get('.bottom-sheet').should('have.class', 'is-collapsed');
    cy.get('.sheet-details').should('not.be.visible');
    cy.get('[data-ride-actions="persistent"]').should('be.visible');
    cy.get('[data-ride-action="pause-resume"]').should('be.visible').and('have.attr', 'aria-label');
    cy.get('[data-ride-action="end"]').should('be.visible').then(($button) => {
      const bounds = $button[0].getBoundingClientRect();
      cy.window().then((appWindow) => {
        expect(bounds.top).to.be.at.least(0);
        expect(bounds.bottom).to.be.lessThan(appWindow.innerHeight);
        const hit = appWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        expect(hit === $button[0] || $button[0].contains(hit)).to.equal(true);
      });
    });
    cy.get('[data-ride-action="end"]').click();
    cy.get('[role="alertdialog"]').should('be.visible');
    cy.get('#root').should('have.attr', 'inert');
    cy.get('[data-ride-end-confirmation-backdrop]').should('be.visible');
    cy.get('[aria-label="Zoom in"]').then(($button) => {
      const bounds = $button[0].getBoundingClientRect();
      cy.window().then((appWindow) => {
        const hit = appWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        expect(Boolean(hit?.classList.contains('ride-end-confirmation-backdrop'))).to.equal(true);
      });
    });
    cy.get('[data-ride-end-cancel]').click();
    cy.get('[role="alertdialog"]').should('not.exist');
    cy.get('#root').should('not.have.attr', 'inert');
    cy.location('pathname').should('include', '/ride-map/solo-map-controls-check');

    cy.get('.sheet-handle').click();
    cy.get('.bottom-sheet').should('have.class', 'is-expanded');
    cy.contains('Quick Message').should('be.visible');
    cy.get('[data-ride-actions="persistent"]').should('be.visible');

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

  it('keeps the compact ride actions inside a short landscape viewport', () => {
    cy.viewport(844, 390);
    cy.visit('/ride-map/solo-map-controls-landscape');
    cy.get('.bottom-sheet').should('have.class', 'is-collapsed');
    cy.get('[data-ride-actions="persistent"]').should('be.visible');
    cy.get('[data-ride-action="pause-resume"]').should('be.visible');
    cy.get('[data-ride-action="end"]').should('be.visible').then(($button) => {
      const bounds = $button[0].getBoundingClientRect();
      cy.window().then((appWindow) => expect(bounds.bottom).to.be.lessThan(appWindow.innerHeight));
    });
  });
});
