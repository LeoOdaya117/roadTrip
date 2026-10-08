describe('RoadTrip shell', () => {
  it('opens the ride home and navigates to history', () => {
    cy.visit('/');

    cy.contains('ion-title', 'RoadTrip').should('be.visible');
    cy.contains('Create group ride').should('be.visible');
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

  it('keeps web rides in tracking-only mode without native turn-by-turn controls', () => {
    cy.visit('/ride-map/solo-web-navigation-check', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition(success: (position: GeolocationPosition) => void) {
              success({
                coords: {
                  latitude: 14.6,
                  longitude: 121,
                  accuracy: 5,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: 5,
                },
                timestamp: Date.now(),
              } as GeolocationPosition);
            },
            watchPosition(success: (position: GeolocationPosition) => void) {
              success({
                coords: {
                  latitude: 14.6,
                  longitude: 121,
                  accuracy: 5,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: 5,
                },
                timestamp: Date.now(),
              } as GeolocationPosition);
              return 1;
            },
            clearWatch() {},
          },
        });
        Object.defineProperty(win.navigator, 'permissions', {
          configurable: true,
          value: { query: () => Promise.resolve({ state: 'granted' }) },
        });
      },
    });

    cy.get('.map-container').should('exist');
    cy.get('.navigation-panel').should('not.exist');
    cy.get('.map-title').should('contain.text', 'Solo ride');
  });
});
