describe('step-by-step ride setup', () => {
  it('lets a solo rider search for a destination before starting', () => {
    cy.intercept('GET', 'https://photon.komoot.io/api/**', {
      statusCode: 200,
      body: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [120.9, 14.1] },
          properties: { name: 'Tagaytay', city: 'Cavite', state: 'Calabarzon', country: 'Philippines' },
        }],
      },
    }).as('destinationSearch');

    cy.visit('/home', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition(success: (position: GeolocationPosition) => void) {
              success({
                coords: { latitude: 14.6, longitude: 121, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
                timestamp: Date.now(),
              } as GeolocationPosition);
            },
            watchPosition() { return 1; },
            clearWatch() {},
          },
        });
        Object.defineProperty(win.navigator, 'permissions', {
          configurable: true,
          value: { query: () => Promise.resolve({ state: 'granted' }) },
        });
      },
    });

    cy.contains('button', 'Solo ride').click();
    cy.contains('button', 'Plan solo ride').click();
    cy.get('#ride-destination-search').type('Tagaytay');
    cy.wait('@destinationSearch');
    cy.get('[role="option"]').contains('Tagaytay').click();
    cy.contains('Choose your route').should('be.visible');
    cy.contains('Route comparison and turn-by-turn guidance are available in the Android app').should('be.visible');
    cy.contains('button', 'Start without route preview').click();
    cy.url().should('match', /\/ride-map\/solo-/);
    cy.get('.map-title').should('contain.text', 'Solo ride');
  });
});
