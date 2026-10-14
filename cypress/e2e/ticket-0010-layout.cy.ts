const sizes = [{ width: 360, height: 640 }, { width: 844, height: 390 }];

describe('TKT-0010 destination hint and footer clearance', () => {
  for (const { width, height } of sizes) {
    it(`keeps the whole hint above attribution and actions at ${width}x${height}`, () => {
      cy.viewport(width, height);
      cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
      cy.intercept('GET', 'https://photon.komoot.io/api/**', {
        body: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [121, 14.6] }, properties: {
          name: 'A very long destination name beside the lakeside visitor center and mountain road junction',
          city: 'Santa Rosa', country: 'Philippines',
        } }] },
      }).as('places');
      cy.visit('/home', { onBeforeLoad(win) {
        win.localStorage.setItem('roadtrip:theme-preference', 'light');
        Object.defineProperty(win.navigator, 'geolocation', { configurable: true, value: {
          getCurrentPosition(success: PositionCallback) {
            success({ coords: { latitude: 14.6, longitude: 121, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition);
          }, watchPosition() { return 1; }, clearWatch() {},
        } });
        Object.defineProperty(win.navigator, 'permissions', { configurable: true, value: {
          query: () => Promise.resolve({ state: 'granted' }),
        } });
      } });
      cy.contains('button', 'Start a ride').click();
      cy.get('.ride-setup-mode-options input[value="solo"]').check({ force: true });
      cy.contains('.ride-setup-actions button', 'Choose destination').click();

      const assertClearance = () => cy.get('.ride-setup-map-hint').should('exist').should(($hint) => {
        const hint = $hint[0];
        const hintBox = hint.getBoundingClientRect();
        // The informational hint lets map taps pass through; Cypress hit testing treats that as coverage.
        expect(getComputedStyle(hint).visibility).to.equal('visible');
        expect(getComputedStyle(hint).display).not.to.equal('none');
        const wizard = hint.closest('.ride-setup-destination-map');
        const map = wizard?.querySelector('.ride-setup-full-map')?.getBoundingClientRect();
        const footer = wizard?.querySelector('.ride-setup-actions')?.getBoundingClientRect();
        const attribution = wizard?.querySelector('.leaflet-control-attribution')?.getBoundingClientRect();
        expect(map, 'map exists').not.to.equal(undefined);
        expect(footer, 'footer exists').not.to.equal(undefined);
        if (!map || !footer) throw new Error('Destination map and footer must exist');
        expect(hintBox.left).to.be.at.least(map.left);
        expect(hintBox.top).to.be.at.least(map.top);
        expect(hintBox.right).to.be.at.most(map.right);
        expect(hintBox.bottom).to.be.lessThan(footer.top);
        if (attribution) expect(hintBox.bottom).to.be.at.most(attribution.top);
        expect(hint.clientHeight).to.be.at.least(hint.scrollHeight);
        expect(footer.bottom).to.be.at.most(height);
      });
      assertClearance();
      cy.get('#ride-destination-search').type('Long destination');
      cy.wait('@places');
      cy.get('.ride-setup-results button').first().click();
      cy.get('.ride-setup-map-hint').should('contain.text', 'Selected');
      assertClearance();
      cy.contains('.ride-setup-actions button', 'Use destination').should('be.visible').click();
      cy.get('.ride-setup-review-map').should('be.visible');
      cy.contains('.ride-setup-actions button', 'Start solo ride').should('be.visible');
    });
  }
});
